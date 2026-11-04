create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text := coalesce(new.email, '');
begin
  insert into public.profiles (
    user_id,
    username,
    profile_image,
    bio,
    website
  )
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(user_email, '@', 1), ''),
      'User'
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    ),
    nullif(new.raw_user_meta_data ->> 'bio', ''),
    nullif(new.raw_user_meta_data ->> 'website', '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;

grant select on public.profiles to anon, authenticated;

drop policy if exists profiles_read_public on public.profiles;
create policy profiles_read_public
on public.profiles
for select
to anon, authenticated
using (true);

insert into public.profiles (
  user_id,
  username,
  profile_image,
  bio,
  website
)
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
  nullif(auth_user.raw_user_meta_data ->> 'bio', ''),
  nullif(auth_user.raw_user_meta_data ->> 'website', '')
from auth.users as auth_user
on conflict (user_id) do nothing;
