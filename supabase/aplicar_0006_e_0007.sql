-- Estoura: aplica o 0006 e o 0007 de uma vez (mover/excluir bolhas, sem limite de niveis).
-- Cole tudo no Supabase > SQL Editor e clique em Run. Pode rodar mais de uma vez sem problema.

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

-- ============================================================
-- 0007: sem limite de niveis
-- ============================================================
-- Estoura: bolhas dentro de bolhas, sem limite de níveis
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0006).
--
-- * remove o limite de "bolha e sub-bolha": agora a árvore pode ter quantos níveis quiser
-- * mover uma bolha leva junto tudo o que está dentro dela
-- * impede ciclos (guardar uma bolha dentro dela mesma ou de uma sub-bolha dela)
-- * excluir apaga a bolha e todos os níveis abaixo (a cascata já existia na chave parent_id)

-- ============ MOVER (com tudo o que está dentro) ============
-- p_parent = destino (a bolha vira filha dele) ou null (volta a ser bolha principal)
create or replace function public.move_interest(p_id text, p_parent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.interests;
begin
  if not public.can_manage_interests() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  select * into v_src from public.interests where id = p_id;
  if not found then raise exception 'bolha nao existe'; end if;

  if p_parent is not null then
    if p_parent = p_id then raise exception 'destino dentro da propria bolha'; end if;
    if not exists (select 1 from public.interests where id = p_parent) then
      raise exception 'destino nao existe';
    end if;
    -- ciclo: o destino não pode estar dentro da bolha que está sendo movida
    if exists (
      with recursive sub as (
        select id from public.interests where parent_id = p_id
        union all
        select i.id from public.interests i join sub s on i.parent_id = s.id
      )
      select 1 from sub where id = p_parent
    ) then
      raise exception 'destino dentro da propria bolha';
    end if;
  end if;

  if v_src.parent_id is not distinct from p_parent then return; end if;

  update public.interests set parent_id = p_parent where id = p_id;

  -- quem curte a bolha movida (ou algo dentro dela) passa a curtir também o destino e todas as bolhas acima dele
  if p_parent is not null then
    with recursive
      sub as (
        select id from public.interests where id = p_id
        union all
        select i.id from public.interests i join sub s on i.parent_id = s.id
      ),
      up as (
        select id, parent_id from public.interests where id = p_parent
        union all
        select i.id, i.parent_id from public.interests i join up u on i.id = u.parent_id
      )
    insert into public.user_interests (user_id, interest_id, level)
    select distinct ui.user_id, up.id, 1
    from public.user_interests ui
    join sub on sub.id = ui.interest_id
    cross join up
    on conflict do nothing;
  end if;

  insert into public.interest_log (action, interest_id, interest_name, old_parent, new_parent, by_user)
  values ('move', p_id, v_src.name, v_src.parent_id, p_parent, (select auth.uid()));
end;
$$;

-- ============ EXCLUIR (todos os níveis abaixo vão junto) ============
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

  -- cópia da bolha e de tudo o que está dentro dela, para recriar na mão se for um engano
  with recursive sub as (
    select * from public.interests where id = p_id
    union all
    select i.* from public.interests i join sub s on i.parent_id = s.id
  )
  select jsonb_agg(to_jsonb(sub)) into v_snap from sub;

  insert into public.interest_log (action, interest_id, interest_name, snapshot, by_user)
  values ('delete', p_id, v_name, v_snap, (select auth.uid()));

  delete from public.interests where id = p_id; -- a chave parent_id apaga os níveis de baixo em cascata
end;
$$;

revoke all on function public.move_interest(text, text) from public, anon;
revoke all on function public.delete_interest(text) from public, anon;
grant execute on function public.move_interest(text, text) to authenticated;
grant execute on function public.delete_interest(text) to authenticated;
