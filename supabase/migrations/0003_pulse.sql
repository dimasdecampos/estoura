-- Estoura: atualização ao vivo de bolhas, contagens e matches
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0002).
--
-- Cada vez que alguém estoura/tira/cria uma bolha, o banco manda um "pulso" vazio
-- (sem nenhum dado de ninguém) por um canal público. Os apps abertos recebem o pulso
-- e rebuscam as bolhas e os matches (que continuam protegidos pelo RLS).

create or replace function public.pulse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send('{}'::jsonb, 'pulse', 'estoura-pulse', false);
  return null;
end;
$$;

revoke all on function public.pulse() from public, anon, authenticated;

drop trigger if exists user_interests_pulse on public.user_interests;
create trigger user_interests_pulse
  after insert or update or delete on public.user_interests
  for each statement execute function public.pulse();

drop trigger if exists interests_pulse on public.interests;
create trigger interests_pulse
  after insert on public.interests
  for each statement execute function public.pulse();
