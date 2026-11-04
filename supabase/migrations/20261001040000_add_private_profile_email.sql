alter table public.profiles
  add column if not exists email text;

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where profile.user_id = auth_user.id
  and profile.email is null;

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
    user_id, username, profile_image, bio, website, f_name, l_name, address, email
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
    nullif(new.raw_user_meta_data ->> 'address', ''),
    nullif(user_email, '')
  )
  on conflict (user_id) do update set
    email = coalesce(public.profiles.email, excluded.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.get_my_profile_details()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'f_name', profile.f_name,
    'l_name', profile.l_name,
    'address', profile.address,
    'email', profile.email
  )
  from public.profiles as profile
  where profile.user_id = (select auth.uid())
$$;

revoke all on function public.get_my_profile_details() from public, anon;
grant execute on function public.get_my_profile_details() to authenticated;

revoke select on public.profiles from anon, authenticated;
grant select (user_id, username, profile_image, bio, website, created_at, updated_at)
  on public.profiles to anon, authenticated;
revoke insert, update on public.profiles from authenticated;
grant insert (user_id, f_name, l_name, address, email, updated_at)
  on public.profiles to authenticated;
grant update (f_name, l_name, address, email, updated_at)
  on public.profiles to authenticated;
