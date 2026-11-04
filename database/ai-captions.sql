begin;
create table public.ai_generations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 situation text not null check (char_length(btrim(situation)) between 10 and 500),
 prompt text not null check (char_length(prompt) between 1 and 3000),
 caption text not null check (char_length(btrim(caption)) between 1 and 280),
 style text not null check (style in ('dry','absurd','wholesome')),
 model text not null check (char_length(model) between 1 and 100),
 created_at timestamptz not null default now()
);
create index ai_generations_created_at_idx on public.ai_generations(created_at desc, id);
create index ai_generations_user_id_idx on public.ai_generations(user_id);
create table public.caption_votes (
 user_id uuid not null references auth.users(id) on delete cascade,
 generation_id uuid not null references public.ai_generations(id) on delete cascade,
 value smallint not null check (value in (-1,1)),
 created_at timestamptz not null default now(),
 primary key (user_id,generation_id)
);
create index caption_votes_generation_id_idx on public.caption_votes(generation_id);
create table public.ai_generation_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index ai_generation_attempts_user_date_idx on public.ai_generation_attempts(user_id,created_at);
alter table public.ai_generations enable row level security;
alter table public.caption_votes enable row level security;
alter table public.ai_generation_attempts enable row level security;
revoke all on public.ai_generations,public.caption_votes,public.ai_generation_attempts from anon,authenticated;
-- Caption text is public; full provider prompts and creator IDs are not exposed.
grant select(id,situation,caption,style,created_at) on public.ai_generations to anon,authenticated;
grant insert(user_id,situation,prompt,caption,style,model) on public.ai_generations to authenticated;
create policy ai_generations_read on public.ai_generations for select to anon,authenticated using(true);
create policy ai_generations_insert_self on public.ai_generations for insert to authenticated with check ((select auth.uid())=user_id);
grant select,insert,delete on public.caption_votes to authenticated;
grant update(user_id,generation_id,value) on public.caption_votes to authenticated;
create policy caption_votes_read_self on public.caption_votes for select to authenticated using((select auth.uid())=user_id);
create policy caption_votes_insert_self on public.caption_votes for insert to authenticated with check((select auth.uid())=user_id);
create policy caption_votes_update_self on public.caption_votes for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy caption_votes_delete_self on public.caption_votes for delete to authenticated using((select auth.uid())=user_id);
-- No direct attempts-table writes. Only the bounded reservation function can insert.
grant select on public.ai_generation_attempts to authenticated;
create policy caption_attempts_read_self on public.ai_generation_attempts for select to authenticated using((select auth.uid())=user_id);
create function public.claim_caption_attempt() returns boolean language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); used bigint;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
 select count(*) into used from public.ai_generation_attempts where user_id=caller and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if used >= 10 then return false; end if;
 insert into public.ai_generation_attempts(user_id) values(caller);
 return true;
end $$;
revoke all on function public.claim_caption_attempt() from public,anon;
grant execute on function public.claim_caption_attempt() to authenticated;
-- Deliberate aggregate-only privilege boundary: votes remain private under RLS.
create function public.caption_scores(generation_ids uuid[]) returns table(generation_id uuid,score bigint)
language sql stable security definer set search_path='' as $$
 select g.id,coalesce(sum(v.value),0)::bigint
 from public.ai_generations g left join public.caption_votes v on v.generation_id=g.id
 where cardinality(generation_ids)<=100 and g.id=any(generation_ids)
 group by g.id
$$;
revoke all on function public.caption_scores(uuid[]) from public;
grant execute on function public.caption_scores(uuid[]) to anon,authenticated;

-- Existing app tables: preserve profile column grants/private-details RPC.
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
drop policy if exists "Enable insert for authenticated users only" on public.profiles;
drop policy if exists profiles_read_public on public.profiles;
create policy profiles_read_authenticated on public.profiles for select to authenticated using(true);
revoke all on public.profiles from anon;
drop policy if exists "Enable read access for all users" on public.posts;
create policy posts_read_authenticated on public.posts for select to authenticated using(true);
revoke all on public.posts from anon,authenticated;
grant select on public.posts to authenticated;
-- These are legacy anonymous write policies; the app uses profile-photos with owner paths.
drop policy if exists "Give anon users access to JPG images in folder qzf2z0_1" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder qzf2z0_2" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder qzf2z0_3" on storage.objects;
-- Trigger function is not an authenticated RPC. PostgreSQL triggers can still invoke it.
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
commit;
