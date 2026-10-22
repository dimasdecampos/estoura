-- Estoura: eventos reais, quem vai e chat de grupo do evento
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0003).

-- ============ EVENTOS ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  interest_id text not null references public.interests (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  place text not null check (char_length(place) between 1 and 80),
  city text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index events_starts_idx on public.events (starts_at);

create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_attendees_user_idx on public.event_attendees (user_id);

alter table public.events enable row level security;
alter table public.event_attendees enable row level security;

-- eventos são públicos para quem está logado; só o criador cria/apaga os seus
create policy "events: ler" on public.events for select to authenticated using (true);
create policy "events: criar" on public.events for insert to authenticated with check (created_by = (select auth.uid()));
create policy "events: apagar o meu" on public.events for delete to authenticated using (created_by = (select auth.uid()));

-- presença: cada pessoa só enxerga e mexe na própria linha (a lista de quem vai sai por upcoming_events())
create policy "attendees: ler a minha" on public.event_attendees for select to authenticated using (user_id = (select auth.uid()));
create policy "attendees: eu vou" on public.event_attendees for insert to authenticated with check (user_id = (select auth.uid()));
create policy "attendees: eu nao vou" on public.event_attendees for delete to authenticated using (user_id = (select auth.uid()));

-- quem cria o evento já vai
create or replace function public.add_creator_as_attendee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_attendees (event_id, user_id) values (new.id, new.created_by) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.add_creator_as_attendee() from public, anon, authenticated;
create trigger events_creator_goes
  after insert on public.events
  for each row execute function public.add_creator_as_attendee();

-- Próximos eventos com quem vai (nome e foto) e se EU vou.
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
           select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'photo', p.avatar_url) order by t.created_at)
           from (select * from public.event_attendees where event_id = e.id order by created_at limit 30) t
           join public.profiles p on p.id = t.user_id
         ), '[]'::jsonb)
  from public.events e
  where e.starts_at >= now() - interval '6 hours'
  order by e.starts_at;
$$;
revoke all on function public.upcoming_events() from public, anon;
grant execute on function public.upcoming_events() to authenticated;

-- ============ CHAT DO EVENTO (só quem vai) ============
create table public.event_messages (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index event_messages_idx on public.event_messages (event_id, id);
alter table public.event_messages enable row level security;

create policy "event_messages: ler se eu vou" on public.event_messages for select to authenticated
  using (exists (select 1 from public.event_attendees a where a.event_id = event_messages.event_id and a.user_id = (select auth.uid())));
create policy "event_messages: enviar se eu vou" on public.event_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.event_attendees a where a.event_id = event_messages.event_id and a.user_id = (select auth.uid()))
  );

-- ============ TEMPO REAL ============
alter publication supabase_realtime add table public.event_messages;

-- eventos novos e mudanças de presença também disparam o "pulso" (0003) para atualizar as telas abertas
drop trigger if exists events_pulse on public.events;
create trigger events_pulse after insert or delete on public.events for each statement execute function public.pulse();
drop trigger if exists event_attendees_pulse on public.event_attendees;
create trigger event_attendees_pulse after insert or delete on public.event_attendees for each statement execute function public.pulse();
