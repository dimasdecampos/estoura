-- Estoura: quem criou o evento pode editar (nome, bolha, data, lugar e cidade)
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0012). Pode rodar mais de uma vez.

begin;

drop policy if exists "events: editar o meu" on public.events;
create policy "events: editar o meu" on public.events for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

-- mudar um evento também dispara o "pulso" para atualizar as telas abertas
drop trigger if exists events_pulse on public.events;
create trigger events_pulse after insert or update or delete on public.events for each statement execute function public.pulse();

commit;
