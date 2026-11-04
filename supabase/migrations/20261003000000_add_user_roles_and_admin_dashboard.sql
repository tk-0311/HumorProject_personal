begin;

alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

revoke update (role) on public.profiles from anon, authenticated;
grant select (role) on public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.get_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dashboard jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  with vote_counts as (
    select
      generation_id,
      count(*) filter (where value = 1) as likes,
      count(*) filter (where value = -1) as dislikes
    from public.caption_votes
    group by generation_id
  ),
  generations as (
    select
      generation.id,
      generation.caption,
      generation.situation,
      generation.style,
      generation.model,
      generation.user_id,
      generation.created_at,
      coalesce(votes.likes, 0) as likes,
      coalesce(votes.dislikes, 0) as dislikes,
      coalesce(
        nullif(concat_ws(' ', nullif(profile.f_name, ''), nullif(profile.l_name, '')), ''),
        nullif(profile.username, ''),
        profile.email,
        'Creator'
      ) as creator
    from public.ai_generations as generation
    left join public.profiles as profile on profile.user_id = generation.user_id
    left join vote_counts as votes on votes.generation_id = generation.id
  ),
  recent_generations as (
    select *
    from generations
    order by created_at desc
    limit 500
  ),
  recent_users as (
    select
      profile.user_id as id,
      coalesce(
        nullif(concat_ws(' ', nullif(profile.f_name, ''), nullif(profile.l_name, '')), ''),
        nullif(profile.username, ''),
        profile.email,
        'Creator'
      ) as name,
      profile.email,
      profile.created_at as joined_at,
      profile.role,
      count(generation.id) as generations_count,
      coalesce(sum(votes.likes), 0) as likes
    from public.profiles as profile
    left join public.ai_generations as generation on generation.user_id = profile.user_id
    left join vote_counts as votes on votes.generation_id = generation.id
    group by
      profile.user_id,
      profile.f_name,
      profile.l_name,
      profile.username,
      profile.email,
      profile.created_at,
      profile.role
    order by profile.created_at desc
    limit 1000
  ),
  recent_ratings as (
    select
      vote.user_id::text || ':' || vote.generation_id::text as id,
      vote.value,
      vote.created_at,
      coalesce(
        nullif(concat_ws(' ', nullif(voter.f_name, ''), nullif(voter.l_name, '')), ''),
        nullif(voter.username, ''),
        voter.email,
        'Community member'
      ) as voter,
      generation.caption
    from public.caption_votes as vote
    join public.ai_generations as generation on generation.id = vote.generation_id
    left join public.profiles as voter on voter.user_id = vote.user_id
    order by vote.created_at desc
    limit 500
  ),
  daily_counts as (
    select
      day::date as day,
      count(generation.id) as count
    from generate_series(
      (((now() at time zone 'UTC')::date - 6)::timestamp),
      ((now() at time zone 'UTC')::date)::timestamp,
      interval '1 day'
    ) as days(day)
    left join public.ai_generations as generation
      on generation.created_at >= day at time zone 'UTC'
      and generation.created_at < (day + interval '1 day') at time zone 'UTC'
    group by day
    order by day
  ),
  style_counts as (
    select style, count(*) as count
    from public.ai_generations
    group by style
  )
  select jsonb_build_object(
    'users',
    coalesce((
      select jsonb_agg(to_jsonb(recent_users) order by joined_at desc)
      from recent_users
    ), '[]'::jsonb),
    'media',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'title', caption,
          'prompt', situation,
          'creatorId', user_id,
          'creator', creator,
          'createdAt', created_at,
          'model', model,
          'type', style,
          'status', 'Published',
          'likes', likes,
          'dislikes', dislikes,
          'rating', case
            when likes + dislikes = 0 then 0
            else round(likes::numeric * 5 / (likes + dislikes), 1)
          end
        )
        order by created_at desc
      )
      from recent_generations
    ), '[]'::jsonb),
    'ratings',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'value', value,
          'score', value,
          'createdAt', created_at,
          'user', voter,
          'media', caption
        )
        order by created_at desc
      )
      from recent_ratings
    ), '[]'::jsonb),
    'analytics',
    jsonb_build_object(
      'daily_counts',
      coalesce((
        select jsonb_agg(jsonb_build_object('day', day, 'count', count) order by day)
        from daily_counts
      ), '[]'::jsonb),
      'formats',
      coalesce((
        select jsonb_object_agg(style, count)
        from style_counts
      ), '{}'::jsonb),
      'media_count', (select count(*) from public.ai_generations),
      'generations_this_week', (
        select count(*)
        from public.ai_generations
        where created_at >= (((now() at time zone 'UTC')::date - 6)::timestamp at time zone 'UTC')
      ),
      'like_rate', coalesce((
        select round(
          100.0 * count(*) filter (where value = 1) / nullif(count(*), 0)
        )
        from public.caption_votes
      ), 0),
      'ratings_count', (select count(*) from public.caption_votes),
      'active_creators', (select count(*) from public.profiles),
      'new_creators_this_week', (
        select count(*)
        from public.profiles
        where created_at >= (((now() at time zone 'UTC')::date - 6)::timestamp at time zone 'UTC')
      ),
      'average_rating', coalesce((
        select round(
          5.0 * count(*) filter (where value = 1) / nullif(count(*), 0),
          1
        )
        from public.caption_votes
      ), 0)
    )
  )
  into dashboard;

  return dashboard;
end;
$$;

revoke all on function public.get_admin_dashboard() from public, anon;
grant execute on function public.get_admin_dashboard() to authenticated;

create or replace function public.admin_save_generation(
  p_id uuid,
  p_user_id uuid,
  p_caption text,
  p_situation text,
  p_style text,
  p_model text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_user_id is null
    or p_caption is null
    or char_length(btrim(p_caption)) not between 1 and 280
    or p_situation is null
    or char_length(btrim(p_situation)) not between 1 and 500
    or p_style is null
    or p_style not in ('dry', 'absurd', 'wholesome')
    or p_model is null
    or char_length(btrim(p_model)) not between 1 and 100
    or not exists (
      select 1 from public.profiles where user_id = p_user_id
    )
  then
    raise exception 'Invalid generation details' using errcode = '22023';
  end if;

  if p_id is null then
    if char_length(btrim(p_situation)) < 10 then
      raise exception 'Situation must be at least 10 characters' using errcode = '22023';
    end if;

    insert into public.ai_generations (
      user_id, situation, prompt, caption, style, model
    )
    values (
      p_user_id,
      btrim(p_situation),
      'Created by an admin in the dashboard.',
      btrim(p_caption),
      p_style,
      btrim(p_model)
    )
    returning id into saved_id;
  else
    update public.ai_generations
    set
      user_id = p_user_id,
      situation = btrim(p_situation),
      caption = btrim(p_caption),
      style = p_style,
      model = btrim(p_model)
    where id = p_id
      and (char_length(btrim(p_situation)) >= 10 or image_path is not null)
    returning id into saved_id;
  end if;

  return saved_id;
end;
$$;

revoke all on function public.admin_save_generation(uuid, uuid, text, text, text, text)
  from public, anon;
grant execute on function public.admin_save_generation(uuid, uuid, text, text, text, text)
  to authenticated;

create or replace function public.admin_delete_generation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  delete from public.ai_generations
  where id = p_id
  returning true into deleted;

  return coalesce(deleted, false);
end;
$$;

revoke all on function public.admin_delete_generation(uuid) from public, anon;
grant execute on function public.admin_delete_generation(uuid) to authenticated;

commit;
