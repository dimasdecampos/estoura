-- Estoura: lembra quais bolhas-mãe foram marcadas só por causa de uma sub-bolha
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0009). Pode rodar mais de uma vez.
--
-- Curtir uma sub-bolha marca a bolha-mãe junto. Quando a última sub-bolha marcada sai, a mãe sai também,
-- mas o app só sabia disso até recarregar a página. Agora fica salvo (coluna auto).
--
-- Na primeira vez, a bolha-mãe (nível "curto", que a pessoa não criou) com sub-bolhas marcadas passa a ser
-- "automática". Nada é desmarcado: até 22/10 tocar numa bolha-mãe curtia ela mesma, então não dá pra saber
-- se uma mãe sem sub-bolhas marcadas ficou presa ou foi curtida de propósito.

begin;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'user_interests' and column_name = 'auto') then
    return;
  end if;

  alter table public.user_interests add column auto boolean not null default false;

  -- cada bolha de cada pessoa e tudo o que ela guardou dentro (path impede volta infinita)
  create temporary table _desc on commit drop as
  with recursive tree (user_id, top, node, path) as (
    select ui.user_id, ui.interest_id, ui.interest_id, array[ui.interest_id]
    from public.user_interests ui
    union all
    select t.user_id, t.top, ui.interest_id, t.path || ui.interest_id
    from tree t
    join public.user_interests ui on ui.user_id = t.user_id and ui.parent_id = t.node
    where not (ui.interest_id = any (t.path))
  )
  select distinct user_id, top from tree where node <> top;

  update public.user_interests ui set auto = true
  from public.interests i
  where i.id = ui.interest_id
    and ui.level = 1
    and i.created_by is distinct from ui.user_id
    and exists (select 1 from _desc d where d.user_id = ui.user_id and d.top = ui.interest_id);
end $$;

commit;
