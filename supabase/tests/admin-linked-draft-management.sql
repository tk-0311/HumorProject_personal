-- Legacy admin draft tools remain compatible with consumed publications.
-- Existing photos are read-only; all record changes roll back.
begin;
select set_config('draft_test.admin',(select user_id::text from public.profiles where role='admin' and private.caption_draft_daily_usage(user_id)<7 limit 1),true);
select set_config('draft_test.user',(select user_id::text from public.profiles where role='user' and not is_superadmin limit 1),true);
select set_config('draft_test.source',(select id::text from storage.objects where bucket_id='caption-images' and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 3145728 order by id limit 1),true);
select set_config('draft_test.other',(select id::text from storage.objects where bucket_id='caption-images' and id<>current_setting('draft_test.source')::uuid and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 3145728 order by id limit 1),true);
select set_config('draft_test.marker',gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('draft_test.admin'),true);
set local role authenticated;
do $$ declare first_id uuid; legacy_id uuid; photo text; moved text; post uuid; options text[]; begin
  select name into photo from storage.objects where id=current_setting('draft_test.source')::uuid;
  select name into moved from storage.objects where id=current_setting('draft_test.other')::uuid;
  options:=array(select current_setting('draft_test.marker')||' option '||n from generate_series(1,9)n);
  first_id:=public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,options,'mixed');
  options[1]:=current_setting('draft_test.marker')||' edited option';
  perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,first_id,options,'mixed',moved);
  if not exists(select 1 from public.caption_drafts where id=first_id and user_id=auth.uid() and image_path=moved and edit_revision=2 and published_generation_id is null) then raise exception 'Admin edit lost ownership, photo or revision'; end if;
  begin perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,first_id,options,'mixed'); raise exception 'Stale photo link accepted'; exception when no_data_found then null; end;
  begin perform public.admin_save_linked_draft(current_setting('draft_test.other')::uuid,first_id,array['a','b','c'],'dry'); raise exception 'Option layout changed'; exception when invalid_parameter_value then null; end;
  legacy_id:=public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array[current_setting('draft_test.marker')||' legacy 1','Legacy 2','Legacy 3'],'dry');
  perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,legacy_id,array[current_setting('draft_test.marker')||' edited legacy 1','Edited legacy 2','Edited legacy 3'],'absurd');
  if not public.admin_delete_linked_draft(current_setting('draft_test.source')::uuid,legacy_id) or public.admin_delete_linked_draft(current_setting('draft_test.source')::uuid,legacy_id) then raise exception 'Draft deletion failed'; end if;
  post:=public.publish_caption_choice(first_id,0);
  if exists(select 1 from public.caption_drafts where id=first_id) then raise exception 'Published draft options remain in admin tools'; end if;
  if public.publish_caption_choice(first_id,0)<>post then raise exception 'Owner publication retry changed'; end if;
  if not exists(select 1 from public.ai_generations where id=post and image_path=moved and caption=options[1]) then raise exception 'Publication lost the edited caption or photo'; end if;
  if public.admin_delete_linked_draft(current_setting('draft_test.other')::uuid,first_id) then raise exception 'A consumed draft was still deletable'; end if;
end; $$;
reset role;
do $$ declare used integer; denied boolean:=false; begin
  used:=private.caption_draft_daily_usage(current_setting('draft_test.admin')::uuid);
  for i in used..9 loop perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array[current_setting('draft_test.marker')||' quota '||i,'Second quota '||i,'Third quota '||i],'dry'); end loop;
  begin perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array['Over quota 1','Over quota 2','Over quota 3'],'dry'); exception when sqlstate 'P0001' then denied:=true; end;
  if not denied then raise exception 'Publishing bypassed daily allowance'; end if;
end; $$;
select set_config('request.jwt.claim.sub',current_setting('draft_test.user'),true);
set local role authenticated;
do $$ begin
  begin perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array['a','b','c'],'dry'); raise exception 'Ordinary user created an admin draft'; exception when insufficient_privilege then null; end;
  begin perform public.admin_delete_linked_draft(current_setting('draft_test.source')::uuid,gen_random_uuid()); raise exception 'Ordinary user deleted an admin draft'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.admin_save_linked_draft(current_setting('draft_test.source')::uuid,null,array['a','b','c'],'dry'); raise exception 'Anonymous creation allowed'; exception when insufficient_privilege then null; end;
end; $$;
rollback;
select 'PASS: legacy admin draft CRUD, photo edits, consumed publishing, retry safety, allowance and access checks' as result;
