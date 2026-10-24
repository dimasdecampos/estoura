-- Estoura: admin corrige bolhas para todo mundo: renomear, juntar duas que são a mesma coisa e excluir de vez.
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0016). Pode rodar mais de uma vez.
-- Tudo fica registrado em interest_log (Table Editor).
begin;

alter table public.interest_log drop constraint if exists interest_log_action_check;
alter table public.interest_log add constraint interest_log_action_check
  check (action in ('move', 'delete', 'merge', 'forget', 'rename'));

-- renomear (o nome antigo vira apelido: quem digitar ele cai nesta bolha)
create or replace function public.admin_rename_interest(p_id text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.interests;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if public.my_role() not in ('admin', 'super_admin') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 24 or public.slugify(v_name) = '' then
    raise exception 'nome invalido' using errcode = '22023';
  end if;
  select * into v_old from public.interests where id = p_id;
  if not found then raise exception 'bolha nao existe' using errcode = 'P0002'; end if;
  if exists (select 1 from public.interests where slug = public.slugify(v_name) and id <> p_id) then
    raise exception 'ja existe uma bolha com esse nome' using errcode = '23505';
  end if;

  update public.interests set name = v_name where id = p_id;
  -- o novo nome não pode continuar apontando pra outra bolha; o antigo passa a apontar pra esta
  delete from public.interest_aliases where slug = public.slugify(v_name);
  if v_old.slug <> '' and v_old.slug <> public.slugify(v_name) then
    insert into public.interest_aliases (slug, interest_id) values (v_old.slug, p_id)
    on conflict (slug) do update set interest_id = excluded.interest_id;
  end if;

  insert into public.interest_log (action, interest_id, interest_name, snapshot, by_user)
  values ('rename', p_id, v_old.name, jsonb_build_object('new_name', v_name), (select auth.uid()));
end;
$$;

-- juntar: p_from some e quem tinha ela passa a ter p_into (o nome dela vira apelido de p_into)
create or replace function public.admin_merge_interest(p_from text, p_into text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_role() not in ('admin', 'super_admin') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if p_from = p_into then raise exception 'escolha outra bolha' using errcode = '22023'; end if;
  if not exists (select 1 from public.interests where id = p_from) or not exists (select 1 from public.interests where id = p_into) then
    raise exception 'bolha nao existe' using errcode = 'P0002';
  end if;
  perform public._merge_interests(p_from, p_into);
end;
$$;

-- excluir de vez: some de todo mundo. As sub-bolhas de dentro dela continuam e viram principais.
-- Com eventos marcados nela, não exclui (os eventos sumiriam junto): junte com outra bolha.
create or replace function public.admin_delete_interest(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.interests;
  v_people int;
begin
  if public.my_role() not in ('admin', 'super_admin') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  select * into v_old from public.interests where id = p_id;
  if not found then return; end if;
  if exists (select 1 from public.events where interest_id = p_id) then
    raise exception 'tem eventos nessa bolha' using errcode = '23503';
  end if;
  select count(*) into v_people from public.user_interests where interest_id = p_id;

  insert into public.interest_log (action, interest_id, interest_name, old_parent, snapshot, by_user)
  values ('delete', p_id, v_old.name, v_old.parent_id, to_jsonb(v_old) || jsonb_build_object('people', v_people), (select auth.uid()));

  delete from public.interests where id = p_id;
end;
$$;

revoke all on function public.admin_rename_interest(text, text) from public, anon;
revoke all on function public.admin_merge_interest(text, text) from public, anon;
revoke all on function public.admin_delete_interest(text) from public, anon;
grant execute on function public.admin_rename_interest(text, text) to authenticated;
grant execute on function public.admin_merge_interest(text, text) to authenticated;
grant execute on function public.admin_delete_interest(text) to authenticated;

commit;
