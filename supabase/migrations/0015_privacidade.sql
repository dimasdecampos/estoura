-- Estoura: quem ainda não aceitou conversar só vê o primeiro nome (resto em asteriscos) e uma foto embaçada.
-- Antes o app escondia isso só na tela; agora o banco nem entrega o nome completo e a foto original.
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0014). Pode rodar mais de uma vez.
begin;

-- Foto embaçada: uma miniatura minúscula (data:image/...) que o próprio app de cada pessoa gera e salva.
-- Quem não está conectado recebe só ela, nunca o endereço da foto original.
alter table public.profiles add column if not exists avatar_blur text;
alter table public.profiles drop constraint if exists profiles_avatar_blur_check;
alter table public.profiles add constraint profiles_avatar_blur_check
  check (avatar_blur is null or (avatar_blur like 'data:image/%' and char_length(avatar_blur) < 4000));

-- "Maria Clara Souza" -> "Maria ***** *****"
create or replace function public.masked_name(n text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(array_to_string(array(
    select case when t.o = 1 then t.w else repeat('*', char_length(t.w)) end
    from unnest(regexp_split_to_array(btrim(coalesce(n, '')), '\s+')) with ordinality as t(w, o)
    order by t.o), ' '), ''), 'Alguém');
$$;

-- Eu e essa pessoa aceitamos conversar? (eu mesmo também conta)
create or replace function public.is_linked(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_other = (select auth.uid()) or exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and least(c.requester_id, c.addressee_id) = least(p_other, (select auth.uid()))
      and greatest(c.requester_id, c.addressee_id) = greatest(p_other, (select auth.uid())));
$$;
revoke all on function public.is_linked(uuid) from public, anon, authenticated;

create or replace function public.my_matches()
returns table (user_id uuid, display_name text, avatar_url text, city text, interest_id text, level smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with others as (
    select distinct ui.user_id
    from public.user_interests ui
    join public.user_interests mine on mine.interest_id = ui.interest_id and mine.user_id = (select auth.uid())
    where ui.user_id <> (select auth.uid())
  ), people as (
    select p.id, p.display_name, p.avatar_url, p.avatar_blur, p.city, public.is_linked(p.id) as linked
    from others o join public.profiles p on p.id = o.user_id
  )
  select p.id,
         case when p.linked then p.display_name else public.masked_name(p.display_name) end,
         case when p.linked then p.avatar_url else p.avatar_blur end,
         p.city, ui.interest_id, ui.level
  from people p
  join public.user_interests ui on ui.user_id = p.id;
$$;

create or replace function public.connection_people()
returns table (
  connection_id uuid, status text, i_am_requester boolean, other_id uuid,
  display_name text, avatar_url text, city text, socials jsonb, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.status, c.requester_id = (select auth.uid()), p.id,
         case when c.status = 'accepted' then p.display_name else public.masked_name(p.display_name) end,
         case when c.status = 'accepted' then p.avatar_url else p.avatar_blur end,
         p.city,
         case when c.status = 'accepted' then p.socials else '{}'::jsonb end,
         c.created_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.requester_id = (select auth.uid()) then c.addressee_id else c.requester_id end
  where (select auth.uid()) in (c.requester_id, c.addressee_id)
  order by c.created_at desc;
$$;

create or replace function public.upcoming_events()
returns table (
  id uuid, created_by uuid, interest_id text, title text, place text, city text,
  lat double precision, lng double precision, starts_at timestamptz, i_go boolean, attendees jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.created_by, e.interest_id, e.title, e.place, e.city, e.lat, e.lng, e.starts_at,
         exists (select 1 from public.event_attendees a where a.event_id = e.id and a.user_id = (select auth.uid())),
         coalesce((
           select jsonb_agg(jsonb_build_object('id', p.id,
                    'name', case when public.is_linked(p.id) then p.display_name else public.masked_name(p.display_name) end,
                    'photo', case when public.is_linked(p.id) then p.avatar_url else p.avatar_blur end) order by t.created_at)
           from (select * from public.event_attendees where event_id = e.id order by created_at limit 30) t
           join public.profiles p on p.id = t.user_id
         ), '[]'::jsonb)
  from public.events e
  where e.starts_at >= now() - interval '6 hours'
  order by e.starts_at;
$$;

-- aviso de convite: quem recebe ainda não aceitou, então vê só o primeiro nome
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
    v_title := 'Novo convite'; v_body := public.masked_name(v_name) || ' convidou você pra conversar'; v_tag := 'i:' || p_ref; v_url := '/?tab=matches';
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

revoke all on function public.my_matches() from public, anon;
revoke all on function public.connection_people() from public, anon;
revoke all on function public.upcoming_events() from public, anon;
revoke all on function public.push_targets(text, text) from public, anon;
grant execute on function public.my_matches() to authenticated;
grant execute on function public.connection_people() to authenticated;
grant execute on function public.upcoming_events() to authenticated;
grant execute on function public.push_targets(text, text) to authenticated;

commit;
