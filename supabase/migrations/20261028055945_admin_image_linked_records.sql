create function private.admin_image_linked_records(p_image_id uuid, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare image jsonb; bucket text; object_name text; suffix text; encoded_suffix text; result jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_image_id is null or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Invalid image reference page' using errcode = '22023';
  end if;
  image := private.admin_storage_images('caption-images', '', 0, p_image_id);
  if image is null then return null; end if;
  bucket := image->>'bucket'; object_name := image->>'name';
  suffix := '/' || bucket || '/' || object_name;
  encoded_suffix := '/' || replace(bucket || '/' || object_name, ' ', '%20');
  -- Match the same four reference sources and URL forms as the deletion guard.
  with records as (
    select 'caption'::text as kind, g.id, coalesce(nullif(btrim(p.username), ''), 'Unknown creator') as creator,
      g.created_at, 'Published'::text as status, g.caption as content, g.style,
      null::jsonb as captions, g.id as published_id, false as truncated
    from public.ai_generations g left join public.profiles p on p.user_id = g.user_id
    where bucket = 'caption-images' and g.image_path = object_name
    union all
    select 'draft', d.id, coalesce(nullif(btrim(p.username), ''), 'Unknown creator'), d.created_at,
      case when d.published_generation_id is null then 'Unpublished draft' else 'Published draft' end,
      null, d.style, to_jsonb(d.captions), d.published_generation_id, false
    from public.caption_drafts d left join public.profiles p on p.user_id = d.user_id
    where bucket = 'caption-images' and d.image_path = object_name
    union all
    select 'profile', p.user_id, coalesce(nullif(btrim(p.username), ''), 'Unknown creator'), p.created_at,
      'Profile photo', coalesce(nullif(btrim(p.username), ''), 'Unknown creator'), null, null, null, false
    from public.profiles p where p.profile_image = object_name
      or right(split_part(p.profile_image, '?', 1), char_length(suffix)) = suffix
      or right(split_part(p.profile_image, '?', 1), char_length(encoded_suffix)) = encoded_suffix
    union all
    select 'post', post.id, coalesce(nullif(btrim(p.username), ''), 'Unknown creator'), post.created_at,
      'Published', left(coalesce(post.content, ''), 10000), null, null, null, coalesce(char_length(post.content) > 10000, false)
    from public.posts post left join public.profiles p on p.user_id = post.user_id
    where post.image_src = object_name
      or right(split_part(post.image_src, '?', 1), char_length(suffix)) = suffix
      or right(split_part(post.image_src, '?', 1), char_length(encoded_suffix)) = encoded_suffix
  )
  select jsonb_build_object('imageId', p_image_id, 'total', (select count(*) from records),
    'offset', p_offset, 'limit', 20, 'records', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'creator', creator, 'createdAt', created_at,
        'status', status, 'content', content, 'style', style, 'captions', captions,
        'publishedId', published_id, 'truncated', truncated) order by created_at desc nulls last, kind, id)
      from (select * from records order by created_at desc nulls last, kind, id limit 20 offset p_offset) page
    ), '[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function private.admin_image_linked_records(uuid,integer) from public, anon;
grant execute on function private.admin_image_linked_records(uuid,integer) to authenticated;

create function public.admin_get_image_linked_records(p_image_id uuid, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.admin_image_linked_records(p_image_id, p_offset);
$$;
revoke all on function public.admin_get_image_linked_records(uuid,integer) from public, anon;
grant execute on function public.admin_get_image_linked_records(uuid,integer) to authenticated;
