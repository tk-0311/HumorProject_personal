-- Applied to the shared project as 20261028034832_allowed_signup_domains.
create table public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (
    domain = lower(btrim(domain)) and char_length(domain) between 3 and 253
    and domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and char_length(split_part(domain, '.', -1)) >= 2 and split_part(domain, '.', -1) !~ '^[0-9]+$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table public.signup_domain_settings (
  singleton boolean primary key default true check (singleton),
  restrict_signup boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.signup_domain_settings(singleton, restrict_signup) values(true, false);

alter table public.allowed_signup_domains enable row level security;
alter table public.signup_domain_settings enable row level security;
revoke all on public.allowed_signup_domains from public, anon, authenticated;
revoke all on public.signup_domain_settings from public, anon, authenticated;
grant select, delete on public.allowed_signup_domains to authenticated;
grant insert(domain), update(domain) on public.allowed_signup_domains to authenticated;
grant select on public.signup_domain_settings to authenticated;
grant update(restrict_signup) on public.signup_domain_settings to authenticated;

create policy allowed_signup_domains_admin_read on public.allowed_signup_domains for select to authenticated using ((select public.is_admin()));
create policy allowed_signup_domains_admin_insert on public.allowed_signup_domains for insert to authenticated with check ((select public.is_admin()));
create policy allowed_signup_domains_admin_update on public.allowed_signup_domains for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy allowed_signup_domains_admin_delete on public.allowed_signup_domains for delete to authenticated using ((select public.is_admin()));
create policy signup_domain_settings_admin_read on public.signup_domain_settings for select to authenticated using ((select public.is_admin()));
create policy signup_domain_settings_admin_update on public.signup_domain_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create function public.stamp_signup_domain_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.stamp_signup_domain_change() from public, anon, authenticated;
create trigger stamp_allowed_signup_domain before insert or update of domain on public.allowed_signup_domains
for each row execute function public.stamp_signup_domain_change();
create trigger stamp_signup_domain_setting before update of restrict_signup on public.signup_domain_settings
for each row execute function public.stamp_signup_domain_change();

-- Public signup callers receive only an eligibility boolean, never the private list.
create function public.is_signup_email_allowed(p_email text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare restricted boolean; email_domain text;
begin
  select restrict_signup into restricted from public.signup_domain_settings where singleton;
  if restricted is null then return false; end if;
  if not restricted then return true; end if;
  if p_email is null or char_length(btrim(p_email)) > 254 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+$' then return false; end if;
  email_domain := lower(split_part(btrim(p_email), '@', 2));
  return exists(select 1 from public.allowed_signup_domains where domain = email_domain);
end;
$$;
revoke all on function public.is_signup_email_allowed(text) from public;
grant execute on function public.is_signup_email_allowed(text) to anon, authenticated;

-- Enforce new-account eligibility inside Auth's insertion transaction.
-- This covers password signup, Google/OAuth signup and direct Auth API calls.
-- Existing users and email updates are intentionally unaffected.
create function public.enforce_signup_email_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_signup_email_allowed(new.email) then
    raise exception 'This email domain is not allowed to create an account.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_signup_email_domain() from public, anon, authenticated;
create trigger enforce_signup_email_domain before insert on auth.users
for each row execute function public.enforce_signup_email_domain();

