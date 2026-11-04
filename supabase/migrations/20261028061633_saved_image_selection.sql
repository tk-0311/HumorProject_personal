-- Reuse existing assets by ID; all file bytes remain managed by Storage's API.
create table private.saved_image_grants (
  image_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (image_id, user_id)
);
alter table private.saved_image_grants enable row level security;
revoke all on private.saved_image_grants from public, anon, authenticated;
create policy saved_image_grants_admin on private.saved_image_grants for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create function private.image_reference_matches(p_value text, p_bucket text, p_name text, p_id uuid)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_value = p_name
    or right(split_part(p_value, '?', 1), char_length('/' || p_bucket || '/' || p_name)) = '/' || p_bucket || '/' || p_name
    or right(split_part(p_value, '?', 1), char_length('/' || replace(p_bucket || '/' || p_name, ' ', '%20'))) = '/' || replace(p_bucket || '/' || p_name, ' ', '%20')
    or right(split_part(p_value, '?', 1), char_length('/api/saved-images/' || p_id::text || '/file')) = '/api/saved-images/' || p_id::text || '/file', false);
$$;
revoke all on function private.image_reference_matches(text,text,text,uuid) from public, anon, authenticated;

create function private.image_reference_total(p_bucket text, p_name text, p_id uuid)
returns bigint language sql stable set search_path = '' as $$
  select (select count(*) from public.ai_generations where p_bucket = 'caption-images' and image_path = p_name)
    + (select count(*) from public.caption_drafts where p_bucket = 'caption-images' and image_path = p_name)
    + (select count(*) from public.profiles where private.image_reference_matches(profile_image, p_bucket, p_name, p_id))
    + (select count(*) from public.posts where private.image_reference_matches(image_src, p_bucket, p_name, p_id));
$$;
revoke all on function private.image_reference_total(text,text,uuid) from public, anon, authenticated;

create or replace function private.admin_image_reference_count(p_bucket text, p_name text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare object_id uuid;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode = '42501'; end if;
  select id into object_id from storage.objects where bucket_id = p_bucket and name = p_name;
  return private.image_reference_total(p_bucket, p_name, object_id);
end;
$$;

create function private.has_saved_image_grant(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from private.saved_image_grants where image_id = p_id and user_id = auth.uid());
$$;
create function private.saved_image_is_unused(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare object storage.objects%rowtype;
begin
  if auth.uid() is null then return false; end if;
  select * into object from storage.objects where id = p_id;
  return found and private.image_reference_total(object.bucket_id, object.name, object.id) = 0;
end;
$$;
revoke all on function private.has_saved_image_grant(uuid), private.saved_image_is_unused(uuid) from public, anon;
grant execute on function private.has_saved_image_grant(uuid), private.saved_image_is_unused(uuid) to authenticated;

create policy saved_images_granted_read on storage.objects for select to authenticated
using (bucket_id in ('caption-images','profile-photos','profile pictures') and private.has_saved_image_grant(id));
create policy caption_images_read_own_drafts on storage.objects for select to authenticated
using (bucket_id = 'caption-images' and exists(select 1 from public.caption_drafts d where d.user_id = (select auth.uid()) and d.image_path = objects.name));
create policy saved_images_protect_all_references on storage.objects as restrictive for delete to authenticated
using (bucket_id not in ('caption-images','profile-photos','profile pictures') or private.saved_image_is_unused(id));

create function private.can_use_caption_image(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return false; end if;
  return exists(select 1 from storage.objects o where o.bucket_id = 'caption-images' and o.name = p_name
    and coalesce(o.is_delete_marker, false) = false and o.archived_at is null
    and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
    and (o.metadata->>'size')::bigint between 1 and 3145728
    and ((storage.foldername(o.name))[1] = caller::text or public.is_admin()
      or exists(select 1 from public.ai_generations g where g.image_path = o.name)
      or exists(select 1 from public.caption_drafts d where d.user_id = caller and d.image_path = o.name)
      or exists(select 1 from private.saved_image_grants a where a.image_id = o.id and a.user_id = caller)));
end;
$$;
revoke all on function private.can_use_caption_image(text) from public, anon;
grant execute on function private.can_use_caption_image(text) to authenticated;
drop policy caption_drafts_insert_self on public.caption_drafts;
create policy caption_drafts_insert_self on public.caption_drafts for insert to authenticated
with check ((select auth.uid()) = user_id and private.can_use_caption_image(image_path));

create function public.get_saved_image(p_image_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',o.id,'bucket',o.bucket_id,'name',o.name,'size',o.metadata->'size',
    'mime',o.metadata->>'mimetype','updatedAt',o.updated_at,'owned',(storage.foldername(o.name))[1] = auth.uid()::text)
  from storage.objects o where o.id = p_image_id and o.bucket_id in ('caption-images','profile-photos','profile pictures')
    and coalesce(o.is_delete_marker,false) = false and o.archived_at is null
    and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp','image/gif');
$$;
revoke all on function public.get_saved_image(uuid) from public;
grant execute on function public.get_saved_image(uuid) to anon, authenticated;

create function public.list_saved_images(p_bucket text default 'caption-images', p_offset integer default 0, p_exclude_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  if p_bucket is null or p_bucket not in ('caption-images','profile-photos','profile pictures')
    or p_offset is null or p_offset < 0 or p_offset > 1000000 then raise exception 'Invalid image page' using errcode = '22023'; end if;
  with page as (select o.* from storage.objects o where o.bucket_id = p_bucket
    and (p_exclude_id is null or o.id <> p_exclude_id)
    and coalesce(o.is_delete_marker,false) = false and o.archived_at is null
    and o.metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
    and (o.metadata->>'size')::bigint between 1 and 3145728
    order by o.created_at desc,o.id limit 11 offset p_offset)
  select jsonb_build_object('images',coalesce((select jsonb_agg(public.get_saved_image(id) order by created_at desc,id)
      from (select * from page order by created_at desc,id limit 10) first_ten),'[]'::jsonb),
    'offset',p_offset,'limit',10,'hasMore',(select count(*) > 10 from page)) into result;
  return result;
end;
$$;
revoke all on function public.list_saved_images(text,integer,uuid) from public, anon;
grant execute on function public.list_saved_images(text,integer,uuid) to authenticated;

-- Used only inside the admin replacement transaction; no direct client grants.
create function private.saved_image_visible_to(p_id uuid, p_user uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists(select 1 from storage.objects o where o.id = p_id and (
    o.bucket_id = 'profile-photos' or (storage.foldername(o.name))[1] = p_user::text
    or (o.bucket_id = 'caption-images' and exists(select 1 from public.ai_generations g where g.image_path=o.name))
    or (o.bucket_id = 'caption-images' and exists(select 1 from public.caption_drafts d where d.image_path=o.name and d.user_id=p_user))
    or exists(select 1 from private.saved_image_grants a where a.image_id=o.id and a.user_id=p_user)));
$$;
revoke all on function private.saved_image_visible_to(uuid,uuid) from public, anon, authenticated;

create function private.admin_relink_saved_image(p_target_id uuid, p_source_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target storage.objects%rowtype; source storage.objects%rowtype; source_url text;
  caption_count integer := 0; draft_count integer := 0; profile_count integer := 0; post_count integer := 0;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Admin access required' using errcode = '42501'; end if;
  perform id from storage.objects where id in (p_target_id,p_source_id) order by id for share;
  select * into target from storage.objects where id=p_target_id;
  if not found then raise exception 'Image not found' using errcode='P0002'; end if;
  select * into source from storage.objects where id=p_source_id;
  if not found then raise exception 'Image not found' using errcode='P0002'; end if;
  if target.bucket_id not in ('caption-images','profile-photos','profile pictures') or target.bucket_id<>source.bucket_id
    or coalesce(source.metadata->>'mimetype','') not in ('image/jpeg','image/png','image/webp')
    or coalesce((source.metadata->>'size')::bigint,0) not between 1 and 3145728
    or source.archived_at is not null or coalesce(source.is_delete_marker,false) then
    raise exception 'Choose an available image from the same bucket' using errcode='22023';
  end if;
  if p_target_id=p_source_id then return jsonb_build_object('relinked',true,'updated',0); end if;
  source_url := '/api/saved-images/' || source.id::text || '/file';
  -- Grants retain legitimate private-profile access without trusting a user-
  -- editable profile URL to grant access to an arbitrary private asset.
  insert into private.saved_image_grants(image_id,user_id)
    select source.id,p.user_id from public.profiles p
      where private.image_reference_matches(p.profile_image,target.bucket_id,target.name,target.id)
        and private.saved_image_visible_to(target.id,p.user_id)
    union select source.id,p.user_id from public.posts p
      where p.user_id is not null and private.image_reference_matches(p.image_src,target.bucket_id,target.name,target.id)
        and private.saved_image_visible_to(target.id,p.user_id)
    on conflict do nothing;
  if target.bucket_id='caption-images' then
    update public.ai_generations set image_path=source.name where image_path=target.name;
    get diagnostics caption_count=row_count;
    update public.caption_drafts set image_path=source.name where image_path=target.name;
    get diagnostics draft_count=row_count;
  end if;
  update public.profiles set profile_image=source_url,updated_at=now()
    where private.image_reference_matches(profile_image,target.bucket_id,target.name,target.id);
  get diagnostics profile_count=row_count;
  update public.posts set image_src=source_url where private.image_reference_matches(image_src,target.bucket_id,target.name,target.id);
  get diagnostics post_count=row_count;
  return jsonb_build_object('relinked',true,'updated',caption_count+draft_count+profile_count+post_count,
    'captions',caption_count,'drafts',draft_count,'profiles',profile_count,'posts',post_count);
end;
$$;
revoke all on function private.admin_relink_saved_image(uuid,uuid) from public, anon;
grant execute on function private.admin_relink_saved_image(uuid,uuid) to authenticated;
create function public.admin_relink_saved_image(p_target_id uuid,p_source_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_relink_saved_image(p_target_id,p_source_id); $$;
revoke all on function public.admin_relink_saved_image(uuid,uuid) from public,anon;
grant execute on function public.admin_relink_saved_image(uuid,uuid) to authenticated;

create or replace function public.publish_caption_choice(draft_id uuid, choice_index integer)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
 caller uuid := auth.uid();
 draft public.caption_drafts%rowtype;
 published uuid;
 selected_style text;
begin
 if caller is null then
   raise exception 'Authentication required' using errcode = '42501';
 end if;
 if choice_index is null or choice_index < 0 or choice_index > 8 then
   raise exception 'Invalid caption selection' using errcode = '22023';
 end if;
 select * into draft from public.caption_drafts
 where id = draft_id and user_id = caller for update;
 if not found then
   raise exception 'Draft unavailable' using errcode = '42501';
 end if;
 if choice_index >= cardinality(draft.captions) then
   raise exception 'Invalid caption selection' using errcode = '22023';
 end if;
 if draft.published_generation_id is not null then return draft.published_generation_id; end if;
 if not private.can_use_caption_image(draft.image_path) then
   raise exception 'Invalid image owner' using errcode = '42501';
 end if;
 selected_style := case when draft.style = 'mixed'
   then (array['dry', 'wholesome', 'absurd'])[choice_index / 3 + 1]
   else draft.style end;
 insert into public.ai_generations(user_id, situation, prompt, caption, style, model, image_path)
 values(caller, 'A photo shared for a caption.', draft.prompt, draft.captions[choice_index + 1], selected_style, draft.model, draft.image_path)
 returning id into published;
 update public.caption_drafts
 set published_generation_id = published, selected_index = choice_index
 where id = draft.id;
 return published;
end
$$;
revoke all on function public.publish_caption_choice(uuid, integer) from public, anon;
grant execute on function public.publish_caption_choice(uuid, integer) to authenticated;



create or replace function public.admin_create_image_generation(
  p_user_id uuid,
  p_caption text,
  p_situation text,
  p_style text,
  p_model text,
  p_prompt text,
  p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
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
    or p_prompt is null
    or char_length(p_prompt) not between 1 and 3000
    or p_image_path is null
    or char_length(p_image_path) not between 1 and 200
    or storage.extension(p_image_path) not in ('jpg', 'png', 'webp')
    or not exists (
      select 1
      from storage.objects
      where bucket_id = 'caption-images'
        and name = p_image_path
    )
    or not exists (
      select 1 from public.profiles where user_id = p_user_id
    )
  then
    raise exception 'Invalid image caption details' using errcode = '22023';
  end if;

  insert into public.ai_generations (
    user_id, situation, prompt, caption, style, model, image_path
  )
  values (
    p_user_id,
    btrim(p_situation),
    p_prompt,
    btrim(p_caption),
    p_style,
    btrim(p_model),
    p_image_path
  )
  returning id into saved_id;

  return saved_id;
end;
$$;

revoke all on function public.admin_create_image_generation(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_create_image_generation(uuid, text, text, text, text, text, text)
  to authenticated;

create or replace function private.admin_image_linked_records(p_image_id uuid, p_offset integer)
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
    from public.profiles p where private.image_reference_matches(p.profile_image,bucket,object_name,p_image_id)
    union all
    select 'post', post.id, coalesce(nullif(btrim(p.username), ''), 'Unknown creator'), post.created_at,
      'Published', left(coalesce(post.content, ''), 10000), null, null, null, coalesce(char_length(post.content) > 10000, false)
    from public.posts post left join public.profiles p on p.user_id = post.user_id
    where private.image_reference_matches(post.image_src,bucket,object_name,p_image_id)
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
