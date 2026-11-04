begin;

create table public.caption_comment_likes (
  comment_id uuid not null references public.caption_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.caption_comment_likes enable row level security;
revoke all on public.caption_comment_likes from public, anon, authenticated;
grant select (comment_id) on public.caption_comment_likes to authenticated;
grant insert (comment_id, user_id) on public.caption_comment_likes to authenticated;
grant delete on public.caption_comment_likes to authenticated;

create policy caption_comment_likes_read_self
  on public.caption_comment_likes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy caption_comment_likes_insert_self
  on public.caption_comment_likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy caption_comment_likes_delete_self
  on public.caption_comment_likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.caption_comment_like_counts(comment_ids uuid[])
returns table(comment_id uuid, likes bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, count(l.user_id)
  from public.caption_comments c
  left join public.caption_comment_likes l on l.comment_id = c.id
  where cardinality(comment_ids) <= 100 and c.id = any(comment_ids)
  group by c.id;
$$;

revoke all on function public.caption_comment_like_counts(uuid[]) from public;
grant execute on function public.caption_comment_like_counts(uuid[]) to anon, authenticated;

commit;
