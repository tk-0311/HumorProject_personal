alter table public.profiles
  add column if not exists f_name text,
  add column if not exists l_name text,
  add column if not exists address text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'first_name'
  ) then
    execute 'update public.profiles set f_name = coalesce(f_name, first_name) where f_name is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_name'
  ) then
    execute 'update public.profiles set l_name = coalesce(l_name, last_name) where l_name is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'dorm'
  ) then
    execute 'update public.profiles set address = coalesce(address, dorm) where address is null';
  end if;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text := coalesce(new.email, '');
  full_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    ''
  );
begin
  insert into public.profiles (
    user_id, username, profile_image, bio, website, f_name, l_name, address
  )
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(full_name, ''),
      nullif(split_part(user_email, '@', 1), ''),
      'User'
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    ),
    nullif(new.raw_user_meta_data ->> 'bio', ''),
    nullif(new.raw_user_meta_data ->> 'website', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'f_name', ''),
      nullif(new.raw_user_meta_data ->> 'first_name', ''),
      nullif(split_part(full_name, ' ', 1), '')
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'l_name', ''),
      nullif(new.raw_user_meta_data ->> 'last_name', ''),
      nullif(regexp_replace(full_name, '^[^[:space:]]+[[:space:]]*', ''), '')
    ),
    nullif(new.raw_user_meta_data ->> 'address', '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles (user_id, username, profile_image, f_name, l_name, address)
select
  auth_user.id,
  coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'username', ''),
    nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
    nullif(auth_user.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
    'User'
  ),
  coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(auth_user.raw_user_meta_data ->> 'picture', '')
  ),
  coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'f_name', ''),
    nullif(auth_user.raw_user_meta_data ->> 'first_name', ''),
    nullif(split_part(coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name', ''), ' ', 1), '')
  ),
  coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'l_name', ''),
    nullif(auth_user.raw_user_meta_data ->> 'last_name', ''),
    nullif(regexp_replace(coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name', ''), '^[^[:space:]]+[[:space:]]*', ''), '')
  ),
  nullif(auth_user.raw_user_meta_data ->> 'address', '')
from auth.users as auth_user
on conflict (user_id) do nothing;
