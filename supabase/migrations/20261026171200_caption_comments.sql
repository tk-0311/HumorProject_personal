begin;

create table public.caption_comments (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.ai_generations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index caption_comments_generation_created_idx
  on public.caption_comments(generation_id, created_at desc, id desc);

alter table public.caption_comments enable row level security;
revoke all on public.caption_comments from public, anon, authenticated;
grant select (id, generation_id, content, created_at)
  on public.caption_comments to anon, authenticated;
grant insert (generation_id, user_id, content)
  on public.caption_comments to authenticated;

create policy caption_comments_read_all
  on public.caption_comments for select
  to anon, authenticated
  using (true);

create policy caption_comments_insert_self
  on public.caption_comments for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

commit;
