-- Caption edits are scoped to one image and one published caption. Storage
-- bytes remain managed by the Storage API; drafts and other captions are intact.
create function private.admin_save_linked_caption(
  p_image_id uuid, p_caption_id uuid, p_caption text, p_style text,
  p_image_path text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare original storage.objects%rowtype; replacement storage.objects%rowtype;
  saved_id uuid; caller uuid := auth.uid();
begin
  if caller is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_caption is null or char_length(btrim(p_caption)) not between 1 and 280
    or p_style is null or p_style not in ('dry','wholesome','absurd')
    or (p_image_path is not null and char_length(p_image_path) not between 1 and 200) then
    raise exception 'Invalid caption details' using errcode = '22023';
  end if;
  -- Lock all involved objects in one order, so concurrent swaps cannot deadlock
  -- each other or race a Storage deletion.
  perform o.id from storage.objects o where o.id = p_image_id
    or (o.bucket_id = 'caption-images' and o.name = p_image_path)
    order by o.id for share;
  select * into original from storage.objects where id = p_image_id;
  if not found then raise exception 'Image not found' using errcode = 'P0002'; end if;
  if original.bucket_id <> 'caption-images' then
    raise exception 'Choose a caption image' using errcode = '22023';
  end if;
  if p_caption_id is not null then
    perform id from public.ai_generations where id = p_caption_id and image_path = original.name for update;
    if not found then raise exception 'Caption is no longer linked to this image' using errcode = 'P0002'; end if;
  end if;
  if p_image_path is not null then
    select * into replacement from storage.objects where bucket_id = 'caption-images' and name = p_image_path;
  else replacement := original;
  end if;
  if replacement.id is null or replacement.archived_at is not null or coalesce(replacement.is_delete_marker, false)
    or coalesce(replacement.metadata->>'mimetype', '') not in ('image/jpeg','image/png','image/webp')
    or coalesce((replacement.metadata->>'size')::bigint, 0) not between 1 and 3145728 then
    raise exception 'Choose an available JPEG, PNG, or WebP caption image up to 3 MB' using errcode = '22023';
  end if;
  if p_caption_id is null then
    insert into public.ai_generations(user_id,situation,prompt,caption,style,model,image_path)
      values(caller,'A photo shared for a caption.','Created by an admin from the image library.',
        btrim(p_caption),p_style,'Admin',replacement.name) returning id into saved_id;
  else
    update public.ai_generations set caption = btrim(p_caption), style = p_style, image_path = replacement.name
      where id = p_caption_id and image_path = original.name returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create function private.admin_delete_linked_caption(p_image_id uuid,p_caption_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare original storage.objects%rowtype; deleted boolean;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into original from storage.objects where id = p_image_id for share;
  if not found then raise exception 'Image not found' using errcode = 'P0002'; end if;
  if original.bucket_id <> 'caption-images' then
    raise exception 'Choose a caption image' using errcode = '22023';
  end if;
  delete from public.ai_generations where id = p_caption_id and image_path = original.name returning true into deleted;
  return coalesce(deleted,false);
end;
$$;

revoke all on function private.admin_save_linked_caption(uuid,uuid,text,text,text), private.admin_delete_linked_caption(uuid,uuid) from public, anon;
grant execute on function private.admin_save_linked_caption(uuid,uuid,text,text,text), private.admin_delete_linked_caption(uuid,uuid) to authenticated;

create function public.admin_save_linked_caption(p_image_id uuid,p_caption_id uuid,p_caption text,p_style text,p_image_path text default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.admin_save_linked_caption(p_image_id,p_caption_id,p_caption,p_style,p_image_path);
$$;
create function public.admin_delete_linked_caption(p_image_id uuid,p_caption_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.admin_delete_linked_caption(p_image_id,p_caption_id);
$$;
revoke all on function public.admin_save_linked_caption(uuid,uuid,text,text,text), public.admin_delete_linked_caption(uuid,uuid) from public, anon;
grant execute on function public.admin_save_linked_caption(uuid,uuid,text,text,text), public.admin_delete_linked_caption(uuid,uuid) to authenticated;
