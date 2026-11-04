begin;
-- Return only public post fields; individual votes and provider prompts stay private.
create or replace function public.ranked_caption_feed()
returns table(id uuid, situation text, caption text, style text, created_at timestamptz, image_path text)
language sql stable security definer set search_path='' as $$
 select g.id, g.situation, g.caption, g.style, g.created_at, g.image_path
 from public.ai_generations g
 left join (
  select v.generation_id, count(*) as likes
  from public.caption_votes v
  where v.value = 1
  group by v.generation_id
 ) popularity on popularity.generation_id = g.id
 order by
  (g.created_at >= now() - interval '3 days') desc,
  case when g.created_at >= now() - interval '3 days' then coalesce(popularity.likes, 0) else 0 end desc,
  g.created_at desc,
  g.id desc
 limit 30;
$$;
revoke all on function public.ranked_caption_feed() from public;
grant execute on function public.ranked_caption_feed() to anon, authenticated;
commit;
