-- Requires existing admin/user profiles, a published caption image, and a
-- separate private caption image. Uses current files read-only; all public
-- record changes and grants below are rolled back. No Storage SQL writes.
begin;
select set_config('picker.admin',(select user_id::text from public.profiles where role='admin' limit 1),true);
select set_config('picker.user',(select p.user_id::text from public.profiles p where p.role='user'
  order by (select count(*) from public.caption_drafts d where d.user_id=p.user_id and d.created_at>=date_trunc('day',now())) limit 1),true);
select set_config('picker.target',(select o.id::text from storage.objects o where o.bucket_id='caption-images'
  and exists(select 1 from public.ai_generations g where g.image_path=o.name) order by o.created_at limit 1),true);
select set_config('picker.source',(select o.id::text from storage.objects o where o.bucket_id='caption-images'
  and (storage.foldername(o.name))[1]<>current_setting('picker.user')
  and not exists(select 1 from public.ai_generations g where g.image_path=o.name) order by o.created_at limit 1),true);
select set_config('picker.target_path',(select name from storage.objects where id=nullif(current_setting('picker.target'),'')::uuid),true);
select set_config('picker.source_path',(select name from storage.objects where id=nullif(current_setting('picker.source'),'')::uuid),true);
do $$ begin
  if nullif(current_setting('picker.admin'),'') is null or nullif(current_setting('picker.user'),'') is null
    or nullif(current_setting('picker.target'),'') is null or nullif(current_setting('picker.source'),'') is null then
    raise exception 'Need existing admin/user profiles, a published image, and a separate private image.';
  end if;
end; $$;
-- Exercise legacy URL references and profile-photo links as well as captions.
update public.profiles set profile_image='https://example.invalid/storage/v1/object/sign/caption-images/' || current_setting('picker.target_path') || '?token=test'
where user_id=current_setting('picker.admin')::uuid;
insert into public.posts(user_id,content,image_src)
values(current_setting('picker.admin')::uuid,'Saved-image replacement check',current_setting('picker.target_path'));

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('picker.user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare first_page jsonb; next_page jsonb; draft uuid; published uuid; begin
  first_page := public.list_saved_images(); next_page := public.list_saved_images('caption-images',10);
  if jsonb_array_length(first_page->'images')>10 or jsonb_array_length(next_page->'images')>10 then raise exception 'Picker exceeded ten images.'; end if;
  if exists(select 1 from jsonb_array_elements(first_page->'images') a join jsonb_array_elements(next_page->'images') b on a->>'id'=b->>'id') then raise exception 'Picker pages overlap.'; end if;
  if public.get_saved_image(current_setting('picker.source')::uuid) is not null then raise exception 'Private image leaked to another user.'; end if;
  if public.get_saved_image(current_setting('picker.target')::uuid) is null then raise exception 'Published image could not be selected.'; end if;
  begin perform public.list_saved_images('caption-images',-1); raise exception 'Negative offset accepted.'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_relink_saved_image(current_setting('picker.target')::uuid,current_setting('picker.source')::uuid);
    raise exception 'Ordinary user could replace other users images.'; exception when insufficient_privilege then null; end;
  begin insert into private.saved_image_grants(image_id,user_id) values(current_setting('picker.source')::uuid,auth.uid());
    raise exception 'Ordinary user could grant private-image access.'; exception when insufficient_privilege then null; end;
  begin insert into public.caption_drafts(user_id,image_path,prompt,model,style,captions)
    values(auth.uid(),current_setting('picker.source_path'),'Picker check','database-check','dry',array['Private option 1','Private option 2','Private option 3']);
    raise exception 'Private image was accepted for another users draft.'; exception when insufficient_privilege then null; end;
  insert into public.caption_drafts(user_id,image_path,prompt,model,style,captions)
  values(auth.uid(),current_setting('picker.target_path'),'Picker check','database-check','mixed',
    array['Picker option 1','Picker option 2','Picker option 3','Picker option 4','Picker option 5','Picker option 6','Picker option 7','Picker option 8','Picker option 9']) returning id into draft;
  perform set_config('picker.draft',draft::text,true);
  published := public.publish_caption_choice(draft,0);
  if public.publish_caption_choice(draft,0)<>published then raise exception 'Publication lost idempotence.'; end if;
end; $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('picker.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare before_count bigint; old_source_count bigint; result jsonb; source jsonb; begin
  before_count := (public.admin_get_storage_image(current_setting('picker.target')::uuid)->>'references')::bigint;
  old_source_count := (public.admin_get_storage_image(current_setting('picker.source')::uuid)->>'references')::bigint;
  if jsonb_array_length(public.list_saved_images()->'images')>10 then raise exception 'Admin picker exceeded ten images.'; end if;
  if exists(select 1 from jsonb_array_elements(public.list_saved_images('caption-images',0,current_setting('picker.target')::uuid)->'images') item
    where item->>'id'=current_setting('picker.target')) then raise exception 'Replacement picker did not exclude its target.'; end if;
  result := public.admin_relink_saved_image(current_setting('picker.target')::uuid,current_setting('picker.source')::uuid);
  if (result->>'updated')::bigint<>before_count then raise exception 'Not all linked records switched images.'; end if;
  if (public.admin_get_storage_image(current_setting('picker.target')::uuid)->>'references')::bigint<>0 then raise exception 'Old image still has references.'; end if;
  source := public.admin_get_storage_image(current_setting('picker.source')::uuid);
  if (source->>'references')::bigint<>old_source_count+before_count then raise exception 'Replacement reference count mismatch.'; end if;
  if (public.admin_get_image_linked_records(current_setting('picker.source')::uuid)->>'total')::bigint<>(source->>'references')::bigint then raise exception 'Linked records did not follow replacement.'; end if;
  if private.saved_image_is_unused(current_setting('picker.source')::uuid) then raise exception 'Referenced replacement could be deleted.'; end if;
  if (public.admin_relink_saved_image(current_setting('picker.source')::uuid,current_setting('picker.source')::uuid)->>'updated')::integer<>0 then raise exception 'Same-image replacement was not a no-op.'; end if;
end; $$;
reset role;
-- Even if published posts stop using the new asset, another user's saved
-- draft must retain access to it and protect it from owner cleanup.
update public.ai_generations set image_path=current_setting('picker.target_path') where image_path=current_setting('picker.source_path');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('picker.user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if public.get_saved_image(current_setting('picker.source')::uuid) is null then raise exception 'Own draft lost access after published link removal.'; end if;
  if private.saved_image_is_unused(current_setting('picker.source')::uuid) then raise exception 'Shared draft image is not protected.'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  if public.get_saved_image(current_setting('picker.source')::uuid) is not null then raise exception 'Private draft image leaked anonymously.'; end if;
  if public.get_saved_image(current_setting('picker.target')::uuid) is null then raise exception 'Public image preview stopped working.'; end if;
  begin perform public.list_saved_images(); raise exception 'Anonymous picker listing was accepted.'; exception when insufficient_privilege then null; end;
  begin perform public.admin_relink_saved_image(current_setting('picker.target')::uuid,current_setting('picker.source')::uuid);
    raise exception 'Anonymous replacement was accepted.'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'Saved-image pagination, private access, draft publication, atomic relinking, and reference checks passed; file bytes unchanged.' as result;
rollback;
