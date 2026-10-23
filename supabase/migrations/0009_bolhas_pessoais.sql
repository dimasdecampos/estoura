-- Estoura: cada pessoa organiza as próprias bolhas; o mapa de todo mundo sai do que as pessoas fizeram
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0008). Pode rodar mais de uma vez.
--
-- Como fica:
-- * interests = a coisa em si ("Surf"). Existe uma vez só: nomes iguais, mesmo com acento ou maiúscula
--   diferente, viram uma bolha só (coluna slug, única).
-- * user_interests.parent_id = onde VOCÊ guardou a bolha. Mover e remover mexe só na sua árvore.
-- * interest_stats() devolve cada bolha no lugar onde a maioria guardou. interests.parent_id passa a ser
--   só o lugar inicial (vale 2 votos, pra uma pessoa sozinha não mudar o mapa de todo mundo).
-- * o match continua pela bolha em si: quem guardou "Surf" em Esportes dá match com quem guardou em Praia.
-- * bolha criada por alguém que ninguém mais tem some do mapa dos outros (quem criou ainda vê).
-- * ninguém mexe no mapa de todo mundo pelo app: as funções antigas de mover e excluir para todos são apagadas.
--
-- Para fundir duas bolhas que são a mesma coisa (rode aqui no SQL Editor; a primeira some e vira apelido da segunda):
--   select public._merge_interests('id-da-que-some', 'id-da-que-fica');

begin;

-- ============ NOME NORMALIZADO ============
-- "Hip-Hop", "hip hop" e "Hiphop" viram "hiphop". O app faz a mesma conta (slugify no estoura.html).
create or replace function public.slugify(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    lower(translate(coalesce(t, ''),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy')),
    '[^a-z0-9]', '', 'g');
$$;

alter table public.interests add column if not exists slug text generated always as (public.slugify(name)) stored;

-- excluir uma bolha não leva mais junto as que estavam dentro dela no lugar inicial (elas viram principais)
alter table public.interests drop constraint if exists interests_parent_id_fkey;
alter table public.interests add constraint interests_parent_id_fkey
  foreign key (parent_id) references public.interests (id) on delete set null;

-- ============ ONDE CADA PESSOA GUARDOU ============
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_interests' and column_name = 'parent_id') then
    alter table public.user_interests add column parent_id text references public.interests (id) on delete set null;
    -- até agora todo mundo via a mesma árvore: cada pessoa começa com as bolhas onde elas estavam
    update public.user_interests ui set parent_id = i.parent_id
    from public.interests i where i.id = ui.interest_id;
  end if;
end $$;
alter table public.user_interests drop constraint if exists user_interests_parent_not_self;
alter table public.user_interests add constraint user_interests_parent_not_self check (parent_id is null or parent_id <> interest_id);

-- ============ APELIDOS ============
-- nome antigo de uma bolha fundida: quem digitar ele cai na bolha que ficou
create table if not exists public.interest_aliases (
  slug text primary key,
  interest_id text not null references public.interests (id) on delete cascade
);
alter table public.interest_aliases enable row level security; -- sem policies: só create_interest() lê
drop policy if exists "interest_aliases: ler" on public.interest_aliases;

-- ============ O QUE NÃO É MAIS USADO ============
-- mover/excluir para todos (0006/0007) e o que uma versão anterior deste arquivo criou
drop function if exists public.move_interest(text, text);
drop function if exists public.delete_interest(text);
drop function if exists public.merge_interests(text, text);
drop function if exists public.can_manage_interests();
drop table if exists public.admins;

alter table public.interest_log drop constraint if exists interest_log_action_check;
alter table public.interest_log add constraint interest_log_action_check check (action in ('move', 'delete', 'merge', 'forget'));

-- ============ FUNDIR DUAS BOLHAS ============
-- p_from some; quem tinha ela passa a ter p_into (no mesmo lugar da árvore, com o maior nível).
-- Só pelo SQL Editor (ninguém chama pela API).
create or replace function public._merge_interests(p_from text, p_into text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.interests;
  v_into public.interests;
begin
  if p_from is null or p_into is null or p_from = p_into then return; end if;
  select * into v_from from public.interests where id = p_from;
  if not found then return; end if;
  select * into v_into from public.interests where id = p_into;
  if not found then raise exception 'bolha de destino nao existe'; end if;

  insert into public.user_interests (user_id, interest_id, level, parent_id, created_at)
  select ui.user_id, p_into, ui.level, nullif(ui.parent_id, p_into), ui.created_at
  from public.user_interests ui where ui.interest_id = p_from
  on conflict (user_id, interest_id) do update set level = greatest(public.user_interests.level, excluded.level);

  update public.user_interests set parent_id = p_into where parent_id = p_from and interest_id <> p_into;
  update public.user_interests set parent_id = null where parent_id = p_from;
  delete from public.user_interests where interest_id = p_from;

  update public.interests set parent_id = p_into where parent_id = p_from and id <> p_into;
  update public.interests set parent_id = null where id = p_into and parent_id = p_from;
  update public.events set interest_id = p_into where interest_id = p_from;

  update public.interest_aliases set interest_id = p_into where interest_id = p_from;
  if v_from.slug <> '' and v_from.slug <> v_into.slug then
    insert into public.interest_aliases (slug, interest_id) values (v_from.slug, p_into)
    on conflict (slug) do update set interest_id = excluded.interest_id;
  end if;

  insert into public.interest_log (action, interest_id, interest_name, new_parent, snapshot, by_user)
  values ('merge', p_from, v_from.name, p_into, to_jsonb(v_from), (select auth.uid()));

  delete from public.interests where id = p_from;
end;
$$;

-- ============ JUNTA AS BOLHAS REPETIDAS QUE JÁ EXISTEM ============
-- Fica a original (das bolhas iniciais), senão a com mais gente, senão a mais antiga.
do $$
declare
  r record;
  k text;
begin
  for r in
    select i.slug, array_agg(i.id order by (i.created_by is null) desc, coalesce(c.n, 0) desc, i.created_at, i.id) as ids
    from public.interests i
    left join (select interest_id, count(*) as n from public.user_interests group by interest_id) c on c.interest_id = i.id
    where i.slug <> ''
    group by i.slug
    having count(*) > 1
  loop
    foreach k in array r.ids[2:] loop
      perform public._merge_interests(k, r.ids[1]);
    end loop;
  end loop;
end $$;

create unique index if not exists interests_slug_key on public.interests (slug) where slug <> '';

-- ============ CRIAR (OU REAPROVEITAR) UMA BOLHA ============
-- Se já existe uma bolha com esse nome (ou apelido), devolve o id dela em vez de criar outra.
create or replace function public.create_interest(p_id text, p_name text, p_parent text, p_hue integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_slug text := public.slugify(v_name);
  v_id text;
begin
  if (select auth.uid()) is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 24 then raise exception 'nome invalido'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_/-]{1,80}$' then raise exception 'id invalido'; end if;

  if v_slug <> '' then
    select i.id into v_id from public.interests i where i.slug = v_slug;
    if v_id is null then select a.interest_id into v_id from public.interest_aliases a where a.slug = v_slug; end if;
    if v_id is not null then return v_id; end if;
  end if;

  if p_parent is not null and not exists (select 1 from public.interests where id = p_parent) then p_parent := null; end if;

  insert into public.interests (id, name, parent_id, hue, created_by)
  values (p_id, v_name, p_parent, least(greatest(coalesce(p_hue, 200), 0), 359)::smallint, (select auth.uid()))
  on conflict do nothing
  returning id into v_id;

  if v_id is null and v_slug <> '' then -- alguém criou o mesmo nome no mesmo instante
    select i.id into v_id from public.interests i where i.slug = v_slug;
  end if;
  if v_id is null then raise exception 'id em uso'; end if;
  return v_id;
end;
$$;

-- ============ APAGAR UMA BOLHA QUE NINGUÉM TEM ============
-- Só quem criou, e só se ninguém tem a bolha nem há eventos nela. Devolve true se apagou.
create or replace function public.forget_interest(p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.interests;
begin
  delete from public.interests i
  where i.id = p_id
    and i.created_by = (select auth.uid())
    and not exists (select 1 from public.user_interests ui where ui.interest_id = i.id)
    and not exists (select 1 from public.events e where e.interest_id = i.id)
  returning * into v_row;
  if v_row.id is null then return false; end if;
  insert into public.interest_log (action, interest_id, interest_name, old_parent, snapshot, by_user)
  values ('forget', v_row.id, v_row.name, v_row.parent_id, to_jsonb(v_row), (select auth.uid()));
  return true;
end;
$$;

-- ============ O MAPA DE TODO MUNDO ============
-- parent_id = onde a maioria guardou a bolha. places = todos os lugares e quantas pessoas guardaram em cada um.
drop function if exists public.interest_stats();
create function public.interest_stats()
returns table (id text, name text, parent_id text, hue smallint, week_count integer, people integer, total integer,
               custom boolean, places jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive
  cnt as (
    select ui.interest_id as iid, count(*)::integer as n,
           (count(*) filter (where ui.created_at >= now() - interval '7 days'))::integer as w
    from public.user_interests ui
    group by ui.interest_id
  ),
  vis as ( -- bolha criada por alguém que ninguém tem: só quem criou vê
    select i.* from public.interests i
    left join cnt on cnt.iid = i.id
    where i.created_by is null
       or coalesce(cnt.n, 0) > 0
       or i.created_by = (select auth.uid())
       or exists (select 1 from public.events e where e.interest_id = i.id)
  ),
  real_votes as (
    select ui.interest_id as iid, ui.parent_id as p, count(*)::integer as n
    from public.user_interests ui
    where ui.interest_id in (select v.id from vis v)
      and (ui.parent_id is null or ui.parent_id in (select v.id from vis v))
    group by ui.interest_id, ui.parent_id
  ),
  votes as (
    select rv.iid, rv.p, rv.n, false as d from real_votes rv
    union all
    select v.id, v.parent_id, 2, true from vis v
    where v.parent_id is null or v.parent_id in (select v2.id from vis v2)
  ),
  tally as (
    select vt.iid, vt.p, sum(vt.n) as n, bool_or(vt.d) as d from votes vt group by vt.iid, vt.p
  ),
  best as ( -- mais votos; no empate, o lugar inicial
    select distinct on (v.id) v.id as iid, t.p
    from vis v left join tally t on t.iid = v.id
    order by v.id, t.n desc nulls last, t.d desc nulls last, t.p nulls first
  ),
  walk (start, cur, path) as (
    select b.iid, b.p, array[b.iid] from best b
    union all
    select w.start, b.p, w.path || b.iid
    from walk w join best b on b.iid = w.cur
    where not (b.iid = any (w.path))
  ),
  cut as ( -- ciclo (A dentro de B e B dentro de A): a de menor id do ciclo vira bolha principal
    select w.start as iid from walk w
    where w.cur = w.start and w.start = (select min(x) from unnest(w.path) as x)
  )
  select v.id, v.name,
         case when v.id in (select c2.iid from cut c2) then null else b.p end,
         v.hue,
         coalesce(c.w, 0),
         coalesce(c.n, 0),
         (select count(*) from public.profiles)::integer,
         v.created_by is not null,
         coalesce((select jsonb_agg(jsonb_build_object('p', rv.p, 'n', rv.n) order by rv.n desc)
                   from real_votes rv where rv.iid = v.id), '[]'::jsonb)
  from vis v
  join best b on b.iid = v.id
  left join cnt c on c.iid = v.id
  order by v.name;
$$;

-- ============ PERMISSÕES ============
revoke all on function public.interest_stats() from public, anon;
revoke all on function public.create_interest(text, text, text, integer) from public, anon;
revoke all on function public.forget_interest(text) from public, anon;
revoke all on function public._merge_interests(text, text) from public, anon, authenticated;
grant execute on function public.interest_stats() to authenticated;
grant execute on function public.create_interest(text, text, text, integer) to authenticated;
grant execute on function public.forget_interest(text) to authenticated;

commit;
