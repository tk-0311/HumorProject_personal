-- Applied to the shared project as 20261028043743_whitelisted_signup_emails.
create table public.whitelisted_signup_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (
    email = lower(btrim(email)) and char_length(email) between 3 and 254
    and email ~ '^[^@]+@[^@]+$'
    and char_length(split_part(email, '@', 1)) between 1 and 64
    and split_part(email, '@', 1) ~ '^[a-z0-9.!#$%&''+/=?^_`{|}~-]+$'
    and split_part(email, '@', 1) !~ '(^\.|\.$|\.\.)'
    and split_part(email, '@', 2) ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and char_length(split_part(split_part(email, '@', 2), '.', -1)) >= 2
    and split_part(split_part(email, '@', 2), '.', -1) !~ '^[0-9]+$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.whitelisted_signup_emails enable row level security;
revoke all on public.whitelisted_signup_emails from public, anon, authenticated;
grant select, delete on public.whitelisted_signup_emails to authenticated;
grant insert(email), update(email) on public.whitelisted_signup_emails to authenticated;
create policy whitelisted_signup_emails_admin_read on public.whitelisted_signup_emails for select to authenticated using ((select public.is_admin()));
create policy whitelisted_signup_emails_admin_insert on public.whitelisted_signup_emails for insert to authenticated with check ((select public.is_admin()));
create policy whitelisted_signup_emails_admin_update on public.whitelisted_signup_emails for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy whitelisted_signup_emails_admin_delete on public.whitelisted_signup_emails for delete to authenticated using ((select public.is_admin()));
create trigger stamp_whitelisted_signup_email before insert or update of email on public.whitelisted_signup_emails
for each row execute function public.stamp_signup_domain_change();

-- The existing Auth insertion trigger and signup precheck share this predicate.
-- Restrictions off preserves open signup. Restrictions on uses domain OR exact email.
create or replace function public.is_signup_email_allowed(p_email text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare restricted boolean; normalized_email text; email_domain text;
begin
  select restrict_signup into restricted from public.signup_domain_settings where singleton;
  if restricted is null then return false; end if;
  if not restricted then return true; end if;
  if p_email is null or char_length(btrim(p_email)) > 254 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+$' then return false; end if;
  normalized_email := lower(btrim(p_email));
  email_domain := split_part(normalized_email, '@', 2);
  return exists(select 1 from public.whitelisted_signup_emails where email = normalized_email)
    or exists(select 1 from public.allowed_signup_domains where domain = email_domain);
end;
$$;
revoke all on function public.is_signup_email_allowed(text) from public;
grant execute on function public.is_signup_email_allowed(text) to anon, authenticated;

