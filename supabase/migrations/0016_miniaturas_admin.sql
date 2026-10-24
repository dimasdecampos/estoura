-- Estoura: o administrador gera as miniaturas embaçadas de quem ainda não abriu a versão nova do app.
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0015). Pode rodar mais de uma vez.
begin;

-- quem tem foto mas ainda não tem miniatura (só admin e super_admin)
create or replace function public.admin_missing_blur()
returns table (id uuid, avatar_url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.my_role() not in ('admin', 'super_admin') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  return query
    select p.id, p.avatar_url from public.profiles p
    where p.avatar_url is not null and p.avatar_blur is null
    limit 500;
end;
$$;

-- guarda a miniatura de alguém que ainda não tem uma (nunca troca a que a própria pessoa já gerou)
create or replace function public.admin_set_blur(p_user uuid, p_blur text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_role() not in ('admin', 'super_admin') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if p_blur is null or p_blur not like 'data:image/%' or char_length(p_blur) >= 4000 then
    raise exception 'miniatura invalida' using errcode = '22023';
  end if;
  update public.profiles set avatar_blur = p_blur where id = p_user and avatar_blur is null;
end;
$$;

revoke all on function public.admin_missing_blur() from public, anon;
revoke all on function public.admin_set_blur(uuid, text) from public, anon;
grant execute on function public.admin_missing_blur() to authenticated;
grant execute on function public.admin_set_blur(uuid, text) to authenticated;

commit;
