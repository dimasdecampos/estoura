-- Estoura: notificações push (avisos no celular/computador mesmo com o app fechado)
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0010). Pode rodar mais de uma vez.
--
-- * push_subscriptions: o aparelho de cada pessoa que ativou as notificações (só a própria pessoa grava).
-- * push_targets(): quem deve ser avisado de uma mensagem ou convite. Só quem enviou consegue pedir,
--   e cada aviso sai uma vez só (tabela push_sent).
-- O envio em si é feito pelo servidor do site (/api/push), com as chaves VAPID das variáveis de ambiente.

begin;

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security; -- sem policies: tudo pelas funções abaixo

create table if not exists public.push_sent (
  kind text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.push_sent enable row level security; -- ninguém lê pela API

-- ============ GUARDAR / TIRAR O APARELHO ============
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or coalesce(char_length(p_p256dh), 0) not between 1 and 200
     or coalesce(char_length(p_auth), 0) not between 1 and 100 then
    raise exception 'inscricao invalida';
  end if;
  -- o mesmo aparelho em outra conta passa a ser da conta atual
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- no máximo 5 aparelhos por pessoa (ficam os mais novos)
  delete from public.push_subscriptions
  where user_id = v_uid
    and id not in (select id from public.push_subscriptions where user_id = v_uid order by created_at desc, id desc limit 5);
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

-- ============ QUEM AVISAR ============
-- p_kind: 'c' mensagem do chat 1:1 (p_ref = id da mensagem)
--         'e' mensagem do chat de evento (p_ref = id da mensagem)
--         'i' convite enviado (p_ref = id da conexão)
--         'a' convite aceito (p_ref = id da conexão)
-- Devolve uma linha por aparelho que deve receber o aviso. Vazio se não for permitido ou se já foi avisado.
create or replace function public.push_targets(p_kind text, p_ref text)
returns table (endpoint text, p256dh text, auth text, title text, body text, tag text, url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_first text;
  v_title text;
  v_body text;
  v_tag text;
  v_key text;
  v_url text;
  v_to uuid[];
  v_one uuid;
  v_n int;
begin
  if v_uid is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  select coalesce(nullif(btrim(p.display_name), ''), 'Alguém') into v_name from public.profiles p where p.id = v_uid;
  v_first := split_part(coalesce(v_name, 'Alguém'), ' ', 1);

  if p_kind = 'c' then
    select case when c.requester_id = m.sender_id then c.addressee_id else c.requester_id end,
           left(m.body, 140), c.id::text
      into v_one, v_body, v_key
    from public.messages m join public.connections c on c.id = m.connection_id
    where m.id = p_ref::bigint and m.sender_id = v_uid and c.status = 'accepted';
    v_to := array[v_one]; v_title := v_name; v_key := 'c:' || v_key; v_tag := v_key || '#' || p_ref; v_url := '/?chat=' || v_key;
  elsif p_kind = 'e' then
    select array(select a.user_id from public.event_attendees a where a.event_id = m.event_id and a.user_id <> v_uid),
           v_first || ': ' || left(m.body, 130), e.title, 'e_' || e.id::text
      into v_to, v_body, v_title, v_key
    from public.event_messages m join public.events e on e.id = m.event_id
    where m.id = p_ref::bigint and m.sender_id = v_uid;
    v_tag := v_key || '#' || p_ref; v_url := '/?chat=' || v_key;
  elsif p_kind = 'i' then
    select array[c.addressee_id] into v_to
    from public.connections c where c.id = p_ref::uuid and c.requester_id = v_uid and c.status = 'pending';
    v_title := 'Novo convite'; v_body := v_name || ' convidou você pra conversar'; v_tag := 'i:' || p_ref; v_url := '/?tab=matches';
  elsif p_kind = 'a' then
    select array[c.requester_id] into v_to
    from public.connections c where c.id = p_ref::uuid and c.addressee_id = v_uid and c.status = 'accepted';
    v_title := 'Convite aceito'; v_body := v_name || ' aceitou! Redes sociais liberadas'; v_key := 'c:' || p_ref; v_tag := 'a:' || p_ref; v_url := '/?chat=' || v_key;
  else
    return;
  end if;

  if v_to is null or coalesce(array_length(v_to, 1), 0) = 0 or v_to[1] is null then return; end if;

  -- cada mensagem/convite avisa uma vez só
  insert into public.push_sent (kind, ref) values (p_kind, p_ref) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;

  return query
  select s.endpoint, s.p256dh, s.auth, v_title, v_body, v_tag, v_url
  from public.push_subscriptions s where s.user_id = any (v_to);
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
revoke all on function public.push_targets(text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.push_targets(text, text) to authenticated;

commit;
