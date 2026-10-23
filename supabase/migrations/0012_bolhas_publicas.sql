-- Estoura: quem ainda não entrou vê as bolhas reais, com quantidade de pessoas
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0011). Pode rodar mais de uma vez.
--
-- public_interest_stats() devolve o mesmo mapa de bolhas do interest_stats(), mas pode ser chamada sem login.
-- Só tem números por bolha (quantas pessoas, quantas na semana): nenhum nome, foto ou dado de pessoa,
-- e ninguém sabe quem curtiu o quê. Bolha criada por alguém que ninguém mais tem não aparece (não há "quem criou" sem login).

begin;

create or replace function public.public_interest_stats()
returns table (id text, name text, parent_id text, hue smallint, week_count integer, people integer, total integer,
               custom boolean, places jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.parent_id, s.hue, s.week_count, s.people, s.total, s.custom, s.places
  from public.interest_stats() s;
$$;

revoke all on function public.public_interest_stats() from public;
grant execute on function public.public_interest_stats() to anon, authenticated;

commit;
