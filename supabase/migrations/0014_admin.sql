-- Estoura: painel de administração (papéis: user, admin, super_admin)
-- Cole no Supabase > SQL Editor e clique em Run (depois do 0013). Pode rodar mais de uma vez.
--
-- user         pessoa comum
-- admin        vê todos os usuários e exclui usuários comuns
-- super_admin  tudo isso + promove/rebaixa admins + exclui admins. Ninguém altera nem exclui um super_admin.
-- O papel só muda pelas funções abaixo (a própria pessoa não consegue se promover editando o perfil).

begin;

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin', 'super_admin'));

-- trava: a coluna role só muda quando uma função administrativa liga a chave estoura.role_change
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and coalesce(current_setting('estoura.role_change', true), '') <> 'on' then
    raise exception 'sem permissao para mudar o papel' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- quem entrar com o e-mail do dono já nasce super_admin
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    case when lower(new.email) = 'dimasrafting@gmail.com' then 'super_admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- e quem já tem conta com esse e-mail vira super_admin agora
select set_config('estoura.role_change', 'on', true);
update public.profiles p set role = 'super_admin'
  from auth.users u where u.id = p.id and lower(u.email) = 'dimasrafting@gmail.com' and p.role <> 'super_admin';
select set_config('estoura.role_change', 'off', true);

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role from public.profiles where id = (select auth.uid())), 'user');
$$;

-- lista de usuários (só admin e super_admin)
create or replace function public.admin_list_users()
returns table (id uuid, display_name text, avatar_url text, city text, role text, email text,
               created_at timestamptz, last_sign_in_at timestamptz, bubbles integer)
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
    select p.id, p.display_name, p.avatar_url, p.city, p.role, u.email::text, p.created_at, u.last_sign_in_at,
           (select count(*)::integer from public.user_interests ui where ui.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc
    limit 1000;
end;
$$;

-- muda o papel (só super_admin; só entre user e admin; nunca o próprio nem outro super_admin)
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target text;
begin
  if public.my_role() <> 'super_admin' then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if p_role not in ('user', 'admin') then
    raise exception 'papel invalido' using errcode = '22023';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'voce nao pode mudar o proprio papel' using errcode = '42501';
  end if;
  select role into target from public.profiles where id = p_user;
  if target is null then raise exception 'usuario nao existe' using errcode = 'P0002'; end if;
  if target = 'super_admin' then
    raise exception 'o super admin nao pode ser alterado' using errcode = '42501';
  end if;
  perform set_config('estoura.role_change', 'on', true);
  update public.profiles set role = p_role where id = p_user;
  perform set_config('estoura.role_change', 'off', true);
end;
$$;

-- exclui a conta inteira (bolhas, conversas, eventos, tudo em cascata)
-- admin exclui só usuários comuns; super_admin exclui também admins; super_admin nunca é excluído
create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare me text := public.my_role(); target text;
begin
  if me not in ('admin', 'super_admin') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'voce nao pode excluir a propria conta aqui' using errcode = '42501';
  end if;
  select role into target from public.profiles where id = p_user;
  if target is null then raise exception 'usuario nao existe' using errcode = 'P0002'; end if;
  if target = 'super_admin' or (target = 'admin' and me <> 'super_admin') then
    raise exception 'sem permissao para excluir este usuario' using errcode = '42501';
  end if;
  delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.my_role() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

commit;
