-- Apply after the caption-drafts migration. Existing failed attempts no longer count.
begin;
create or replace function public.claim_caption_attempt() returns boolean
language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); used bigint;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select count(*) into used from public.caption_drafts
 where user_id=caller and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 return used < 10;
end $$;
revoke all on function public.claim_caption_attempt() from public,anon;
grant execute on function public.claim_caption_attempt() to authenticated;

-- Serialize successful saves so concurrent requests cannot exceed the daily limit.
create or replace function public.enforce_successful_caption_quota() returns trigger
language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); used bigint;
begin
 if caller is null or new.user_id <> caller then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
 select count(*) into used from public.caption_drafts
 where user_id=caller and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if used >= 10 then raise exception 'Daily caption limit reached' using errcode='P0001'; end if;
 return new;
end $$;
revoke all on function public.enforce_successful_caption_quota() from public,anon,authenticated;
drop trigger if exists successful_caption_quota on public.caption_drafts;
create trigger successful_caption_quota before insert on public.caption_drafts
for each row execute function public.enforce_successful_caption_quota();
commit;
