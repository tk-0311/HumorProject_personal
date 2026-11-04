-- Run as the database owner. Uses existing photos; every test record/change is
-- rolled back. Storage object metadata and file bytes are never written.
begin;
select set_config('linked_test.admin',(select user_id::text from public.profiles where role='admin' limit 1),true);
select set_config('linked_test.user',(select p.user_id::text from public.profiles p where p.role='user'
  and (select count(*) from public.caption_drafts d where d.user_id=p.user_id and d.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')<10 limit 1),true);
select set_config('linked_test.source',(select id::text from storage.objects where bucket_id='caption-images'
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 3145728
  and archived_at is null and not coalesce(is_delete_marker,false) order by id limit 1),true);
select set_config('linked_test.other',(select id::text from storage.objects where bucket_id='caption-images'
  and id::text<>current_setting('linked_test.source') and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
  and (metadata->>'size')::bigint between 1 and 3145728 and archived_at is null and not coalesce(is_delete_marker,false) order by id limit 1),true);
select set_config('linked_test.objects',(select count(*)::text from storage.objects),true);
do $$ begin
  if nullif(current_setting('linked_test.admin'),'') is null or nullif(current_setting('linked_test.user'),'') is null
    or nullif(current_setting('linked_test.source'),'') is null or nullif(current_setting('linked_test.other'),'') is null then
    raise exception 'Requires an admin, an ordinary user below quota, and two saved caption photos.';
  end if;
  if has_function_privilege('anon','public.admin_save_linked_caption(uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.admin_delete_linked_caption(uuid,uuid)','EXECUTE') then
    raise exception 'Anonymous callers must not have caption management privileges.';
  end if;
end; $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('linked_test.admin'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('linked_test.first',public.admin_save_linked_caption(current_setting('linked_test.source')::uuid,null,'First test caption','dry')::text,true);
select set_config('linked_test.second',public.admin_save_linked_caption(current_setting('linked_test.source')::uuid,null,'Other caption stays unchanged','wholesome')::text,true);
reset role;
-- An existing caption can belong to another user; admin edits must preserve its
-- original attribution and generation metadata.
update public.ai_generations set user_id=current_setting('linked_test.user')::uuid where id=current_setting('linked_test.first')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('linked_test.user'),'role','authenticated')::text,true);
insert into public.caption_drafts(user_id,image_path,prompt,model,style,captions,published_generation_id,selected_index)
  select current_setting('linked_test.user')::uuid,name,'Test draft stays intact','Test','dry',
    array['First original option','Second original option','Third original option'],current_setting('linked_test.first')::uuid,0
  from storage.objects where id=current_setting('linked_test.source')::uuid;
select set_config('linked_test.second_snapshot',(select to_jsonb(g)::text from public.ai_generations g where id=current_setting('linked_test.second')::uuid),true);
select set_config('linked_test.first_metadata',(select (to_jsonb(g)-'caption'-'style'-'image_path')::text from public.ai_generations g where id=current_setting('linked_test.first')::uuid),true);
set local role authenticated;
do $$ begin
  begin perform public.admin_save_linked_caption(current_setting('linked_test.source')::uuid,null,'Unauthorized','dry'); raise exception 'Ordinary user created a caption';
  exception when insufficient_privilege then null; end;
  begin perform private.admin_save_linked_caption(current_setting('linked_test.source')::uuid,current_setting('linked_test.first')::uuid,'Unauthorized','dry'); raise exception 'Ordinary user edited a caption';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_delete_linked_caption(current_setting('linked_test.source')::uuid,current_setting('linked_test.first')::uuid); raise exception 'Ordinary user deleted a caption';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('linked_test.admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.admin_save_linked_caption(current_setting('linked_test.source')::uuid,current_setting('linked_test.first')::uuid,'Edited first caption','absurd');
reset role;
-- Inspect full metadata as the database owner; authenticated clients purposely
-- cannot read every generation column (including private prompts).
do $$ declare source_id uuid:=current_setting('linked_test.source')::uuid; other_id uuid:=current_setting('linked_test.other')::uuid;
  first_id uuid:=current_setting('linked_test.first')::uuid; second_id uuid:=current_setting('linked_test.second')::uuid;
  source_name text; other_name text; before_source bigint; before_other bigint;
begin
  select name into source_name from storage.objects where id=source_id;
  select name into other_name from storage.objects where id=other_id;
  before_source:=private.admin_image_reference_count('caption-images',source_name);
  before_other:=private.admin_image_reference_count('caption-images',other_name);
  if public.admin_save_linked_caption(source_id,first_id,'  Edited first caption  ','absurd')<>first_id then raise exception 'Caption identity changed'; end if;
  if not exists(select 1 from public.ai_generations where id=first_id and caption='Edited first caption' and style='absurd' and image_path=source_name) then
    raise exception 'Caption text/style update failed'; end if;
  perform public.admin_save_linked_caption(source_id,first_id,'A different image for this caption only','dry',other_name);
  if not exists(select 1 from public.ai_generations where id=first_id and image_path=other_name)
    or (select to_jsonb(g)-'caption'-'style'-'image_path' from public.ai_generations g where id=first_id)<>current_setting('linked_test.first_metadata')::jsonb
    or (select to_jsonb(g) from public.ai_generations g where id=second_id)<>current_setting('linked_test.second_snapshot')::jsonb then
    raise exception 'Image change altered another caption, creator, or generation metadata';
  end if;
  if private.admin_image_reference_count('caption-images',source_name)<>before_source-1
    or private.admin_image_reference_count('caption-images',other_name)<>before_other+1 then raise exception 'Image reference counts did not follow the one-caption move'; end if;
  if not exists(select 1 from public.caption_drafts where published_generation_id=first_id and image_path=source_name
    and captions=array['First original option','Second original option','Third original option']) then raise exception 'The original draft changed'; end if;
  if not exists(select 1 from jsonb_array_elements(public.admin_get_image_linked_records(other_id)->'records') r where r->>'kind'='caption' and r->>'id'=first_id::text) then raise exception 'Moved caption missing from its new image'; end if;
  begin perform public.admin_save_linked_caption(source_id,first_id,'Stale edit','dry'); raise exception 'A stale link overwrote a moved caption'; exception when no_data_found then null; end;
  begin perform public.admin_save_linked_caption(source_id,null,'','dry'); raise exception 'Empty caption accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_save_linked_caption(source_id,null,'Invalid style','mixed'); raise exception 'Invalid style accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.admin_save_linked_caption(source_id,second_id,'Bad path','dry','../missing.png'); raise exception 'Nonexistent image accepted'; exception when invalid_parameter_value then null; end;
  if public.admin_delete_linked_caption(source_id,first_id) then raise exception 'Stale image link deleted a moved caption'; end if;
  if not public.admin_delete_linked_caption(other_id,first_id) or public.admin_delete_linked_caption(other_id,first_id) then raise exception 'Delete/missing caption result failed'; end if;
  if (select to_jsonb(g) from public.ai_generations g where id=second_id)<>current_setting('linked_test.second_snapshot')::jsonb then raise exception 'Deleting one caption affected another'; end if;
  if not exists(select 1 from storage.objects where id in (source_id,other_id)) then raise exception 'Caption deletion removed the photo'; end if;
  perform public.admin_delete_linked_caption(source_id,second_id);
end; $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  begin perform public.admin_save_linked_caption(current_setting('linked_test.source')::uuid,null,'Anonymous','dry'); raise exception 'Anonymous creation allowed'; exception when insufficient_privilege then null; end;
  begin perform public.admin_delete_linked_caption(current_setting('linked_test.source')::uuid,gen_random_uuid()); raise exception 'Anonymous delete allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
do $$ begin
  if (select count(*) from storage.objects)<>current_setting('linked_test.objects')::bigint then raise exception 'Storage catalog changed'; end if;
end; $$;
select 'Caption create/read/update/delete, one-caption image changes, draft isolation, metadata preservation, stale-link checks, and admin access passed; all test changes rolled back.' as result;
rollback;
