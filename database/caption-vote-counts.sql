begin;
-- Expose aggregate totals only, never individual voters.
create or replace function public.caption_vote_counts(generation_ids uuid[])
returns table(generation_id uuid, likes bigint, dislikes bigint)
language sql stable security definer set search_path='' as $$
 select g.id,
  count(v.user_id) filter (where v.value = 1),
  count(v.user_id) filter (where v.value = -1)
 from public.ai_generations g
 left join public.caption_votes v on v.generation_id = g.id
 where g.id in (select unnest(generation_ids) limit 100)
 group by g.id;
$$;
revoke all on function public.caption_vote_counts(uuid[]) from public;
grant execute on function public.caption_vote_counts(uuid[]) to anon,authenticated;
commit;
