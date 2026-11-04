-- Admin-only draft management; normal users retain their existing owner-only
-- reads/publication and cannot edit saved options or publication state directly.
create function private.admin_save_linked_draft(
  p_image_id uuid, p_draft_id uuid, p_captions text[], p_style text,
  p_image_path text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare original storage.objects%rowtype; replacement storage.objects%rowtype;
  draft public.caption_drafts%rowtype; saved_id uuid; caller uuid := auth.uid();
begin
  if caller is null or not coalesce(public.is_admin(),false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_captions is null or not coalesce(public.valid_caption_draft_options(p_captions),false)
    or p_style is null or not ((cardinality(p_captions)=9 and p_style='mixed')
      or (cardinality(p_captions)=3 and p_style in ('dry','wholesome','absurd')))
    or (p_image_path is not null and char_length(p_image_path) not between 1 and 200) then
    raise exception 'Invalid draft options or style' using errcode='22023';
  end if;
  perform o.id from storage.objects o where o.id=p_image_id
    or (o.bucket_id='caption-images' and o.name=p_image_path) order by o.id for share;
  select * into original from storage.objects where id=p_image_id;
  if not found then raise exception 'Image not found' using errcode='P0002'; end if;
  if original.bucket_id<>'caption-images' then raise exception 'Choose a caption image' using errcode='22023'; end if;
  if p_draft_id is not null then
    select * into draft from public.caption_drafts where id=p_draft_id and image_path=original.name for update;
    if not found then raise exception 'Draft is no longer linked to this image' using errcode='P0002'; end if;
    if cardinality(p_captions)<>cardinality(draft.captions) then
      raise exception 'Keep the existing number of draft options' using errcode='22023';
    end if;
  end if;
  if p_image_path is not null then
    select * into replacement from storage.objects where bucket_id='caption-images' and name=p_image_path;
  else replacement := original;
  end if;
  if replacement.id is null or replacement.archived_at is not null or coalesce(replacement.is_delete_marker,false)
    or coalesce(replacement.metadata->>'mimetype','') not in ('image/jpeg','image/png','image/webp')
    or coalesce((replacement.metadata->>'size')::bigint,0) not between 1 and 3145728 then
    raise exception 'Choose an available JPEG, PNG, or WebP image up to 3 MB' using errcode='22023';
  end if;
  if p_draft_id is null then
    -- The existing quota trigger applies to admin-created drafts too.
    insert into public.caption_drafts(user_id,image_path,prompt,model,style,captions)
      values(caller,replacement.name,'Created by an admin from the image library.','Admin',p_style,
        array(select btrim(option) from unnest(p_captions) with ordinality as options(option,position) order by position))
      returning id into saved_id;
  else
    update public.caption_drafts set captions=array(select btrim(option) from unnest(p_captions) with ordinality as options(option,position) order by position),
      style=p_style,image_path=replacement.name where id=p_draft_id and image_path=original.name returning id into saved_id;
    -- user_id, prompt, model, creation time, selected_index, and published post
    -- remain intact. Editing a draft never republishes or modifies its post.
  end if;
  return saved_id;
end;
$$;

create function private.admin_delete_linked_draft(p_image_id uuid,p_draft_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare original storage.objects%rowtype; deleted boolean;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  select * into original from storage.objects where id=p_image_id for share;
  if not found then raise exception 'Image not found' using errcode='P0002'; end if;
  if original.bucket_id<>'caption-images' then raise exception 'Choose a caption image' using errcode='22023'; end if;
  delete from public.caption_drafts where id=p_draft_id and image_path=original.name returning true into deleted;
  return coalesce(deleted,false);
end;
$$;
revoke all on function private.admin_save_linked_draft(uuid,uuid,text[],text,text),private.admin_delete_linked_draft(uuid,uuid) from public,anon;
grant execute on function private.admin_save_linked_draft(uuid,uuid,text[],text,text),private.admin_delete_linked_draft(uuid,uuid) to authenticated;

create function public.admin_save_linked_draft(p_image_id uuid,p_draft_id uuid,p_captions text[],p_style text,p_image_path text default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.admin_save_linked_draft(p_image_id,p_draft_id,p_captions,p_style,p_image_path);
$$;
create function public.admin_delete_linked_draft(p_image_id uuid,p_draft_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.admin_delete_linked_draft(p_image_id,p_draft_id);
$$;
revoke all on function public.admin_save_linked_draft(uuid,uuid,text[],text,text),public.admin_delete_linked_draft(uuid,uuid) from public,anon;
grant execute on function public.admin_save_linked_draft(uuid,uuid,text[],text,text),public.admin_delete_linked_draft(uuid,uuid) to authenticated;
