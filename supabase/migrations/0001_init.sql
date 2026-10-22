-- Estoura: esquema inicial
-- Cole este arquivo no Supabase > SQL Editor e clique em Run (depois rode o seed.sql).

-- ============ TABELAS ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  city text,
  bio text,
  created_at timestamptz not null default now()
);

create table public.interests (
  id text primary key,
  name text not null check (char_length(name) between 1 and 24),
  parent_id text references public.interests (id) on delete cascade,
  hue smallint not null default 200 check (hue between 0 and 359),
  base_count integer not null default 0,   -- popularidade inicial (exemplo)
  week_count integer not null default 0,   -- novos na semana (exemplo)
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.user_interests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  interest_id text not null references public.interests (id) on delete cascade,
  level smallint not null default 1 check (level in (1, 2)),  -- 1 = curto, 2 = é minha vida
  created_at timestamptz not null default now(),
  primary key (user_id, interest_id)
);
create index user_interests_interest_idx on public.user_interests (interest_id);

-- ============ PERFIL AUTOMÁTICO NO PRIMEIRO LOGIN ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ SEGURANÇA (RLS) ============
alter table public.profiles enable row level security;
alter table public.interests enable row level security;
alter table public.user_interests enable row level security;

-- perfil: cada pessoa só lê e edita o próprio (outros perfis só via my_matches)
create policy "profiles: ler o proprio" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: editar o proprio" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- bolhas: todo mundo logado vê; cada um pode criar novas
create policy "interests: ler" on public.interests for select to authenticated using (true);
create policy "interests: criar" on public.interests for insert to authenticated with check (created_by = (select auth.uid()));

-- minhas bolhas: só eu leio e altero
create policy "user_interests: ler as minhas" on public.user_interests for select to authenticated using (user_id = (select auth.uid()));
create policy "user_interests: criar as minhas" on public.user_interests for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_interests: editar as minhas" on public.user_interests for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_interests: apagar as minhas" on public.user_interests for delete to authenticated using (user_id = (select auth.uid()));

-- ============ FUNÇÕES PÚBLICAS DO APP ============
-- Bolhas com a contagem real de pessoas (base_count + quem estourou de verdade)
create or replace function public.interest_stats()
returns table (id text, name text, parent_id text, hue smallint, week_count integer, people integer)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.name, i.parent_id, i.hue, i.week_count,
         (i.base_count + coalesce(c.n, 0))::integer as people
  from public.interests i
  left join (select interest_id, count(*) as n from public.user_interests group by interest_id) c
    on c.interest_id = i.id
  order by i.name;
$$;

-- Pessoas que estouraram ao menos uma bolha igual à minha, com todas as bolhas delas.
-- Não expõe e-mail nem redes sociais.
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
  )
  select p.id, p.display_name, p.avatar_url, p.city, ui.interest_id, ui.level
  from others o
  join public.profiles p on p.id = o.user_id
  join public.user_interests ui on ui.user_id = o.user_id;
$$;

revoke all on function public.interest_stats() from public, anon;
revoke all on function public.my_matches() from public, anon;
grant execute on function public.interest_stats() to authenticated;
grant execute on function public.my_matches() to authenticated;
