-- Estoura: mover e excluir bolhas (com ponto único de permissão)
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0005).
--
-- Ninguém altera ou apaga bolhas direto pela API (a tabela interests não tem policy de update/delete).
-- Tudo passa por move_interest() e delete_interest(), que perguntam a can_manage_interests().

-- ============ QUEM PODE MEXER NAS BOLHAS ============
-- HOJE: qualquer pessoa logada.
-- DEPOIS (níveis de acesso): troque só o corpo desta função, por exemplo:
--   select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin','moderator'));
create or replace function public.can_manage_interests()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null;
$$;

-- ============ HISTÓRICO (para desfazer na mão se precisar) ============
-- Sem policies: ninguém lê pela API; consulte no Table Editor do Supabase.
create table if not exists public.interest_log (
  id bigint generated always as identity primary key,
  action text not null check (action in ('move', 'delete')),
  interest_id text not null,
  interest_name text,
  old_parent text,
  new_parent text,
  snapshot jsonb,                       -- no delete: a bolha e as sub-bolhas como estavam
  by_user uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.interest_log enable row level security;

-- ============ MOVER ============
-- p_parent = id da bolha de destino (vira sub-bolha dela) ou null (volta a ser bolha principal).
create or replace function public.move_interest(p_id text, p_parent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.interests;
  v_dst public.interests;
begin
  if not public.can_manage_interests() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  select * into v_src from public.interests where id = p_id;
  if not found then raise exception 'bolha nao existe'; end if;

  if p_parent is not null then
    if p_parent = p_id then raise exception 'destino invalido'; end if;
    select * into v_dst from public.interests where id = p_parent;
    if not found then raise exception 'destino nao existe'; end if;
    if v_dst.parent_id is not null then raise exception 'so existem dois niveis (bolha e sub-bolha)'; end if;
    if exists (select 1 from public.interests where parent_id = p_id) then
      raise exception 'a bolha tem sub-bolhas';
    end if;
  end if;

  if v_src.parent_id is not distinct from p_parent then return; end if;

  update public.interests set parent_id = p_parent where id = p_id;

  -- quem curte a sub-bolha passa a curtir também a bolha-mãe (regra do app)
  if p_parent is not null then
    insert into public.user_interests (user_id, interest_id, level)
    select user_id, p_parent, 1 from public.user_interests where interest_id = p_id
    on conflict do nothing;
  end if;

  insert into public.interest_log (action, interest_id, interest_name, old_parent, new_parent, by_user)
  values ('move', p_id, v_src.name, v_src.parent_id, p_parent, (select auth.uid()));
end;
$$;

-- ============ EXCLUIR ============
-- Apaga a bolha, as sub-bolhas, a marcação das pessoas e os eventos ligados a elas (cascata).
create or replace function public.delete_interest(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_snap jsonb;
begin
  if not public.can_manage_interests() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  select name into v_name from public.interests where id = p_id;
  if not found then return; end if;

  select jsonb_agg(to_jsonb(i)) into v_snap from public.interests i where i.id = p_id or i.parent_id = p_id;

  insert into public.interest_log (action, interest_id, interest_name, snapshot, by_user)
  values ('delete', p_id, v_name, v_snap, (select auth.uid()));

  delete from public.interests where id = p_id;
end;
$$;

-- ============ PERMISSÕES ============
revoke all on function public.can_manage_interests() from public, anon;
revoke all on function public.move_interest(text, text) from public, anon;
revoke all on function public.delete_interest(text) from public, anon;
grant execute on function public.can_manage_interests() to authenticated;
grant execute on function public.move_interest(text, text) to authenticated;
grant execute on function public.delete_interest(text) to authenticated;

-- ============ TEMPO REAL ============
-- bolhas movidas ou excluídas também disparam o "pulso" (0003) para atualizar as telas abertas
drop trigger if exists interests_pulse on public.interests;
create trigger interests_pulse
  after insert or update or delete on public.interests
  for each statement execute function public.pulse();
