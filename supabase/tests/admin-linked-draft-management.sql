-- Run as the project database owner. All test rows/edits are rolled back.
-- Uses existing photos without changing Storage metadata or file bytes.
begin;
select set_config('draft_test.admin',(select p.user_id::text from public.profiles p where p.role='admin'
  and (select count(*) from public.caption_drafts d where d.user_id=p.user_id and d.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')<=7 limit 1),true);
select set_config('draft_test.user',(select user_id::text from public.profiles where role='user' limit 1),true);
select set_config('draft_test.source',(select id::text from storage.objects where bucket_id='caption-images'
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 3145728
  and archived_at is null and not coalesce(is_delete_marker,false) order by id limit 1),true);
select set_config('draft_test.other',(select id::text from storage.objects where bucket_id='caption-images'
  and id::text<>current_setting('draft_test.source') and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
  and (metadata->>'size')::bigint between 1 and 3145728 and archived_at is null and not coalesce(is_delete_marker,false) order by id limit 1),true);
select set_config('draft_test.objects',(select count(*)::text from storage.objects),true);
select set_config('draft_test.options',to_json(array['Dry one','Dry two','Dry three','Warm one','Warm two','Warm three','Absurd one','Absurd two','Absurd three'])::text,true);
do $$ begin
  if nullif(current_setting('draft_test.admin'),'') is null or nullif(current_setting('draft_test.user'),'') is null
    or nullif(current_setting('draft_test.source'),'') is null or nullif(current_setting('draft_test.other'),'') is null then
    raise exception 'Requires an admin below quota, an ordinary user, and two saved caption photos.';
  end if;
  if has_function_privilege('anon','public.admin_save_linked_draft(uuid,uuid,text[],text,text)','EXECUTE')
    or has_function_privilege('anon','public.admin_delete_linked_draft(uuid,uuid)','EXECUTE') then raise exception 'Anonymous draft CRUD grant'; end if;
end; $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('draft_test.admin'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('draft_test.first',public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,
  array['Dry one','Dry two','Dry three','Warm one','Warm two','Warm three','Absurd one','Absurd two','Absurd three'],'mixed')::text,true);
select set_config('draft_test.legacy',public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,
  array['Legacy one','Legacy two','Legacy three'],'dry')::text,true);
reset role;
do $$ begin
  if not exists(select 1 from public.caption_drafts where id=current_setting('draft_test.first')::uuid
    and user_id=current_setting('draft_test.admin')::uuid and published_generation_id is null and selected_index is null) then raise exception 'Create did not produce an owner-private unpublished draft'; end if;
end; $$;
-- Test moderation of another owner's drafts without changing their attribution.
update public.caption_drafts set user_id=current_setting('draft_test.user')::uuid
  where id in (current_setting('draft_test.first')::uuid,current_setting('draft_test.legacy')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('draft_test.user'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('draft_test.published',public.publish_caption_choice(current_setting('draft_test.first')::uuid,4)::text,true);
do $$ begin
  if not exists(select 1 from public.caption_drafts where id=current_setting('draft_test.first')::uuid) then raise exception 'Draft owner lost read access'; end if;
  begin perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array['One','Two','Three'],'dry'); raise exception 'Ordinary user created an admin draft'; exception when insufficient_privilege then null; end;
  begin perform private.admin_save_linked_draft(current_setting('draft_test.source')::uuid,current_setting('draft_test.first')::uuid,array['One','Two','Three'],'dry'); raise exception 'Ordinary user edited through a private helper'; exception when insufficient_privilege then null; end;
  begin perform public.admin_delete_linked_draft(current_setting('draft_test.source')::uuid,current_setting('draft_test.first')::uuid); raise exception 'Ordinary user deleted an admin-managed draft'; exception when insufficient_privilege then null; end;
  begin update public.caption_drafts set captions=array['Tampered one','Tampered two','Tampered three'] where id=current_setting('draft_test.legacy')::uuid; raise exception 'Ordinary direct update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.caption_drafts where id=current_setting('draft_test.legacy')::uuid; raise exception 'Ordinary direct delete allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('draft_test.post_snapshot',(select to_jsonb(g)::text from public.ai_generations g where id=current_setting('draft_test.published')::uuid),true);
select set_config('draft_test.metadata',(select (to_jsonb(d)-'captions'-'style'-'image_path'-'content_key'-'edit_revision')::text from public.caption_drafts d where id=current_setting('draft_test.first')::uuid),true);

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('draft_test.admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,current_setting('draft_test.first')::uuid,
  array['New dry one','New dry two','New dry three','New warm one','New warm two','New warm three','New absurd one','New absurd two','New absurd three'],'mixed');
select public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,current_setting('draft_test.legacy')::uuid,
  array['Edited legacy one','Edited legacy two','Edited legacy three'],'absurd');
reset role;
do $$ declare source_id uuid:=current_setting('draft_test.source')::uuid; other_id uuid:=current_setting('draft_test.other')::uuid;
  first_id uuid:=current_setting('draft_test.first')::uuid; legacy_id uuid:=current_setting('draft_test.legacy')::uuid;
  source_name text; other_name text; before_source bigint; before_other bigint;
begin
  select name into source_name from storage.objects where id=source_id;
  select name into other_name from storage.objects where id=other_id;
  before_source:=private.admin_image_reference_count('caption-images',source_name);
  before_other:=private.admin_image_reference_count('caption-images',other_name);
  perform public.admin_save_linked_draft(source_id,first_id,
    array['Moved dry one','Moved dry two','Moved dry three','Moved warm one','Moved warm two','Moved warm three','Moved absurd one','Moved absurd two','Moved absurd three'],'mixed',other_name);
  if (select to_jsonb(d)-'captions'-'style'-'image_path'-'content_key'-'edit_revision' from public.caption_drafts d where id=first_id)<>current_setting('draft_test.metadata')::jsonb then raise exception 'Draft owner, selected index, publication link, or generation metadata changed'; end if;
  if (select to_jsonb(g) from public.ai_generations g where id=current_setting('draft_test.published')::uuid)<>current_setting('draft_test.post_snapshot')::jsonb then raise exception 'Editing a published draft changed its post'; end if;
  if not exists(select 1 from public.caption_drafts where id=legacy_id and style='absurd' and cardinality(captions)=3 and published_generation_id is null) then raise exception 'Legacy draft edit or unpublished state failed'; end if;
  if private.admin_image_reference_count('caption-images',source_name)<>before_source-1
    or private.admin_image_reference_count('caption-images',other_name)<>before_other+1 then raise exception 'Draft reference counts did not follow its image'; end if;
  if not exists(select 1 from jsonb_array_elements(public.admin_get_image_linked_records(other_id)->'records') r where r->>'kind'='draft' and r->>'id'=first_id::text and r->>'publishedId'=current_setting('draft_test.published')) then raise exception 'Moved draft missing from read results or publication link lost'; end if;
  begin perform public.admin_save_linked_draft(source_id,first_id,array['One','Two','Three'],'dry'); raise exception 'Stale draft edit allowed'; exception when no_data_found then null; end;
  begin perform public.admin_save_linked_draft(other_id,first_id,array['One','Two','Three'],'dry'); raise exception 'Published option layout changed'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_save_linked_draft(source_id,legacy_id,array['A','B','C','D','E','F','G','H','I'],'mixed'); raise exception 'Legacy option layout changed'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_save_linked_draft(source_id,null,array['Same','same','Other'],'dry'); raise exception 'Duplicate options accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_save_linked_draft(source_id,null,array['One','','Three'],'dry'); raise exception 'Empty option accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_save_linked_draft(source_id,legacy_id,array['One','Two','Three'],'mixed'); raise exception 'Invalid style accepted'; exception when invalid_parameter_value then null; end;
  if public.admin_delete_linked_draft(source_id,first_id) then raise exception 'Stale image link deleted a moved draft'; end if;
end; $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('draft_test.user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if public.get_saved_image(current_setting('draft_test.other')::uuid) is null then raise exception 'Draft owner lost access to its replacement photo'; end if;
  if public.publish_caption_choice(current_setting('draft_test.first')::uuid,0)::text<>current_setting('draft_test.published') then raise exception 'Published draft was republished after admin edit'; end if;
end; $$;
select set_config('draft_test.legacy_published',public.publish_caption_choice(current_setting('draft_test.legacy')::uuid,2)::text,true);
reset role;
do $$ begin
  if not exists(select 1 from public.ai_generations where id=current_setting('draft_test.legacy_published')::uuid and caption='Edited legacy three' and style='absurd') then raise exception 'Edited unpublished draft did not publish its saved option'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('draft_test.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if not public.admin_delete_linked_draft(current_setting('draft_test.other')::uuid,current_setting('draft_test.first')::uuid)
    or public.admin_delete_linked_draft(current_setting('draft_test.other')::uuid,current_setting('draft_test.first')::uuid) then raise exception 'Published draft delete/missing result failed'; end if;
  if not public.admin_delete_linked_draft(current_setting('draft_test.source')::uuid,current_setting('draft_test.legacy')::uuid) then raise exception 'Legacy draft deletion failed'; end if;
end; $$;
reset role;
do $$ declare used integer; denied boolean:=false;
begin
  if (select to_jsonb(g) from public.ai_generations g where id=current_setting('draft_test.published')::uuid)<>current_setting('draft_test.post_snapshot')::jsonb
    or not exists(select 1 from public.ai_generations where id=current_setting('draft_test.legacy_published')::uuid) then raise exception 'Deleting a draft affected a published caption'; end if;
  select count(*) into used from public.caption_drafts where user_id=current_setting('draft_test.admin')::uuid
    and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  for i in used..9 loop perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array['Quota '||i||' one','Quota '||i||' two','Quota '||i||' three'],'dry'); end loop;
  begin perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array['Over quota one','Over quota two','Over quota three'],'dry');
  exception when sqlstate 'P0001' then denied:=true; end;
  if not denied then raise exception 'Admin draft creation bypassed the existing quota'; end if;
  if (select count(*) from storage.objects)<>current_setting('draft_test.objects')::bigint then raise exception 'Storage metadata changed'; end if;
end; $$;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  begin perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array['One','Two','Three'],'dry'); raise exception 'Anonymous creation allowed'; exception when insufficient_privilege then null; end;
  begin perform public.admin_delete_linked_draft(current_setting('draft_test.source')::uuid,gen_random_uuid()); raise exception 'Anonymous delete allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'Draft CRUD, legacy and nine-option sets, image changes, owner/privacy preservation, publication isolation/idempotence, quota, and access checks passed; all changes rolled back.' as result;
rollback;
