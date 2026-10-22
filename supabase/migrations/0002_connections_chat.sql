-- Estoura: convites, conexões, chat 1:1 e redes sociais protegidas
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0001_init.sql).

-- ============ REDES SOCIAIS NO PERFIL ============
-- Só a própria pessoa lê/edita a linha em profiles (RLS do 0001).
-- Os outros só veem as redes por connection_people(), e apenas se a conexão foi aceita.
alter table public.profiles
  add column if not exists socials jsonb not null default '{}'::jsonb;
alter table public.profiles
  drop constraint if exists profiles_socials_size;
alter table public.profiles
  add constraint profiles_socials_size check (pg_column_size(socials) < 2000);

-- ============ CONEXÕES (convites) ============
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- um par de pessoas tem no máximo uma conexão, em qualquer direção (evita convite repetido)
create unique index connections_pair_idx
  on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee_idx on public.connections (addressee_id);
create index connections_requester_idx on public.connections (requester_id);

alter table public.connections enable row level security;

create policy "connections: ler as minhas" on public.connections for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
-- só dá para convidar em seu próprio nome, e sempre como "pending"
create policy "connections: convidar" on public.connections for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
-- sem policy de update: quem responde usa respond_connection() abaixo

create or replace function public.respond_connection(p_id uuid, p_accept boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.connections
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_id
     and addressee_id = (select auth.uid())
     and status = 'pending';
$$;

-- Minhas conexões, com os dados da outra pessoa.
-- As redes sociais só vêm preenchidas quando a conexão está aceita.
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
         p.display_name, p.avatar_url, p.city,
         case when c.status = 'accepted' then p.socials else '{}'::jsonb end,
         c.created_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.requester_id = (select auth.uid()) then c.addressee_id else c.requester_id end
  where (select auth.uid()) in (c.requester_id, c.addressee_id)
  order by c.created_at desc;
$$;

-- ============ MENSAGENS (chat 1:1) ============
create table public.messages (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.connections (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conn_idx on public.messages (connection_id, id);

alter table public.messages enable row level security;

-- só os dois participantes, e só depois de aceitar o convite
create policy "messages: ler da minha conexao" on public.messages for select to authenticated
  using (exists (
    select 1 from public.connections c
    where c.id = connection_id and c.status = 'accepted'
      and (select auth.uid()) in (c.requester_id, c.addressee_id)
  ));
create policy "messages: enviar na minha conexao" on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.connections c
      where c.id = connection_id and c.status = 'accepted'
        and (select auth.uid()) in (c.requester_id, c.addressee_id)
    )
  );

-- ============ PERMISSÕES ============
revoke all on function public.respond_connection(uuid, boolean) from public, anon;
revoke all on function public.connection_people() from public, anon;
grant execute on function public.respond_connection(uuid, boolean) to authenticated;
grant execute on function public.connection_people() to authenticated;

-- ============ TEMPO REAL (convites e mensagens chegam sem recarregar) ============
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.connections;
