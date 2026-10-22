-- Estoura: números 100% reais (sem contagens de exemplo)
-- Cole no Supabase > SQL Editor e clique em Run.
--
-- * zera as contagens inventadas das bolhas
-- * "people" = pessoas que realmente estouraram a bolha
-- * "week_count" = pessoas que estouraram nos últimos 7 dias (alimenta o "Em alta")
-- * "total" = quantas pessoas existem no Estoura (usado no peso da raridade nos matches)

update public.interests set base_count = 0, week_count = 0;

drop function if exists public.interest_stats();
create function public.interest_stats()
returns table (id text, name text, parent_id text, hue smallint, week_count integer, people integer, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.name, i.parent_id, i.hue,
         coalesce(w.n, 0)::integer as week_count,
         coalesce(c.n, 0)::integer as people,
         (select count(*) from public.profiles)::integer as total
  from public.interests i
  left join (select interest_id, count(*) as n from public.user_interests group by interest_id) c
    on c.interest_id = i.id
  left join (select interest_id, count(*) as n from public.user_interests
             where created_at >= now() - interval '7 days' group by interest_id) w
    on w.interest_id = i.id
  order by i.name;
$$;

revoke all on function public.interest_stats() from public, anon;
grant execute on function public.interest_stats() to authenticated;
