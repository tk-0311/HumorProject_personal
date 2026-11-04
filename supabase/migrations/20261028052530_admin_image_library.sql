-- Storage file bytes are always changed through the Storage API, never SQL.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.admin_image_reference_count(p_bucket text, p_name text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return
    (select count(*) from public.ai_generations where p_bucket = 'caption-images' and image_path = p_name)
    + (select count(*) from public.caption_drafts where p_bucket = 'caption-images' and image_path = p_name)
    + (select count(*) from public.profiles where profile_image = p_name
       or ends_with(split_part(profile_image, '?', 1), '/' || p_bucket || '/' || p_name)
       or ends_with(split_part(profile_image, '?', 1), '/' || replace(p_bucket || '/' || p_name, ' ', '%20')))
    + (select count(*) from public.posts where image_src = p_name
       or ends_with(split_part(image_src, '?', 1), '/' || p_bucket || '/' || p_name)
       or ends_with(split_part(image_src, '?', 1), '/' || replace(p_bucket || '/' || p_name, ' ', '%20')));
end;
$$;

create function private.admin_storage_location_unchanged(p_id uuid, p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(), false) then return false; end if;
  return exists(select 1 from storage.objects o where o.id = p_id and
    (o.bucket_id not in ('caption-images', 'profile-photos', 'profile pictures')
      or (o.bucket_id = p_bucket and o.name = p_name)));
end;
$$;

create function private.admin_storage_images(p_bucket text, p_search text, p_offset integer, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; total bigint;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_bucket is null or p_bucket not in ('caption-images', 'profile-photos', 'profile pictures')
     or p_search is null or char_length(p_search) > 200
     or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Invalid image filters' using errcode = '22023';
  end if;
  if p_id is not null then
    select jsonb_build_object('id', o.id, 'bucket', o.bucket_id, 'name', o.name,
      'size', o.metadata->'size', 'mime', o.metadata->>'mimetype',
      'createdAt', o.created_at, 'updatedAt', o.updated_at,
      'references', private.admin_image_reference_count(o.bucket_id, o.name)) into result
    from storage.objects o where o.id = p_id
      and o.bucket_id in ('caption-images', 'profile-photos', 'profile pictures')
      and (o.metadata->>'mimetype' like 'image/%' or storage.extension(o.name) in ('jpg','jpeg','png','webp','gif'));
    return result;
  end if;
  select count(*) into total from storage.objects o where o.bucket_id = p_bucket
    and (o.metadata->>'mimetype' like 'image/%' or storage.extension(o.name) in ('jpg','jpeg','png','webp','gif'))
    and strpos(lower(o.name), lower(p_search)) > 0;
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'bucket', o.bucket_id, 'name', o.name,
    'size', o.metadata->'size', 'mime', o.metadata->>'mimetype',
    'createdAt', o.created_at, 'updatedAt', o.updated_at,
    'references', private.admin_image_reference_count(o.bucket_id, o.name)) order by o.created_at desc, o.id), '[]'::jsonb)
    into result from (select * from storage.objects o where o.bucket_id = p_bucket
      and (o.metadata->>'mimetype' like 'image/%' or storage.extension(o.name) in ('jpg','jpeg','png','webp','gif'))
      and strpos(lower(o.name), lower(p_search)) > 0
      order by o.created_at desc, o.id limit 24 offset p_offset) o;
  return jsonb_build_object('images', result, 'total', total, 'offset', p_offset, 'limit', 24);
end;
$$;

revoke all on function private.admin_image_reference_count(text,text),
  private.admin_storage_location_unchanged(uuid,text,text), private.admin_storage_images(text,text,integer,uuid) from public, anon;
grant execute on function private.admin_image_reference_count(text,text),
  private.admin_storage_location_unchanged(uuid,text,text), private.admin_storage_images(text,text,integer,uuid) to authenticated;

create function public.admin_list_storage_images(p_bucket text default 'caption-images', p_search text default '', p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.admin_storage_images(p_bucket, p_search, p_offset, null);
$$;
create function public.admin_get_storage_image(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.admin_storage_images('caption-images', '', 0, p_id);
$$;
revoke all on function public.admin_list_storage_images(text,text,integer), public.admin_get_storage_image(uuid) from public, anon;
grant execute on function public.admin_list_storage_images(text,text,integer), public.admin_get_storage_image(uuid) to authenticated;

create policy admin_images_read on storage.objects for select to authenticated
using (bucket_id in ('caption-images','profile-photos','profile pictures') and (select public.is_admin()));
create policy admin_images_insert on storage.objects for insert to authenticated
with check (bucket_id in ('caption-images','profile-photos','profile pictures') and (select public.is_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1 and storage.extension(name) in ('jpg','png','webp'));
create policy admin_images_update on storage.objects for update to authenticated
using (bucket_id in ('caption-images','profile-photos','profile pictures') and (select public.is_admin()))
with check (bucket_id in ('caption-images','profile-photos','profile pictures') and (select public.is_admin()));
-- Replacing bytes preserves the path used by existing captions and profile photos.
create policy admin_images_preserve_location on storage.objects as restrictive for update to authenticated
with check (not (select public.is_admin()) or private.admin_storage_location_unchanged(id, bucket_id, name));
create policy admin_images_delete on storage.objects for delete to authenticated
using (bucket_id in ('caption-images','profile-photos','profile pictures') and (select public.is_admin()));
-- A restrictive policy also covers an admin's pre-existing owner-delete permissions.
create policy admin_images_protect_references on storage.objects as restrictive for delete to authenticated
using (not (select public.is_admin()) or bucket_id not in ('caption-images','profile-photos','profile pictures')
  or private.admin_image_reference_count(bucket_id, name) = 0);
