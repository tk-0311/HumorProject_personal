-- Requires existing admin and ordinary-user profiles. All test writes roll back.
begin;
select set_config('test.response_baseline',(select count(*)::text from public.ai_caption_chain_runs),true);
do $$
declare admin_id uuid; user_id uuid;
begin
 select p.user_id into admin_id from public.profiles p join auth.users u on u.id=p.user_id where p.role='admin' limit 1;
 select p.user_id into user_id from public.profiles p join auth.users u on u.id=p.user_id where p.role is distinct from 'admin' limit 1;
 assert admin_id is not null and user_id is not null, 'Role fixtures required';
 perform set_config('test.response_admin',admin_id::text,true);
 perform set_config('test.response_user',user_id::text,true);
 perform set_config('request.jwt.claim.sub',user_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',user_id,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare
 step jsonb := jsonb_build_object('index',1,'position',1,'title','Response history verification','model','test-model','modelName','Test model','provider','gemini','includeImage',true,'status','completed','response','Visible model response','durationMs',25);
 invalid_step jsonb;
begin
 perform public.record_caption_chain_run('humor_project','completed',30,jsonb_build_array(step));
 assert not exists(select 1 from public.ai_caption_chain_runs), 'Non-admin users must not read responses, including their own';
 begin
   perform public.record_caption_chain_run('admin_panel','completed',30,jsonb_build_array(step));
   raise exception 'Expected admin-surface write denial';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.ai_caption_chain_runs(user_id,surface,status,duration_ms,step_count,steps) values(auth.uid(),'humor_project','completed',30,1,jsonb_build_array(step));
   raise exception 'Expected direct insert denial';
 exception when insufficient_privilege then null; end;
 for invalid_step in
   select value from jsonb_array_elements(jsonb_build_array(
     step||jsonb_build_object('apiKey','forbidden-field'),
     step||jsonb_build_object('response',repeat('x',12001)),
     step||jsonb_build_object('index',2),
     step||jsonb_build_object('durationMs',120001),
     step||jsonb_build_object('status','not_run'),
     step||jsonb_build_object('provider','unknown-provider'),
     step-'response'
   ))
 loop
   begin
     perform public.record_caption_chain_run('humor_project','completed',30,jsonb_build_array(invalid_step));
     raise exception 'Expected response validation rejection';
   exception when invalid_parameter_value then null; end;
 end loop;
 perform set_config('request.jwt.claim.sub',current_setting('test.response_admin'),true);
 assert (select count(*) from public.ai_caption_chain_runs)=current_setting('test.response_baseline')::integer+1, 'Admin must see community run';
 perform public.record_caption_chain_run('admin_panel','completed',30,jsonb_build_array(step));
 assert (select count(*) from public.ai_caption_chain_runs)=current_setting('test.response_baseline')::integer+2, 'Admin must see both applications';
 assert (select steps->0->>'response' from public.ai_caption_chain_runs where surface='humor_project' and steps->0->>'title'='Response history verification' order by created_at desc limit 1)='Visible model response';
 begin
   update public.ai_caption_chain_runs set status='failed';
   raise exception 'Expected immutable history';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 begin
   perform public.record_caption_chain_run('humor_project','completed',30,jsonb_build_array(step));
   raise exception 'Expected unauthenticated rejection';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select jsonb_build_object('adminCanReadBothApps',true,'usersCannotRead',true,'directWritesDenied',true,'invalidPayloadsRejected',true,'responsesPreserved',true,'immutable',true,'anonymousExecuteRevoked',not has_function_privilege('anon','public.record_caption_chain_run(text,text,integer,jsonb,text)','EXECUTE'),'anonymousTableReadRevoked',not has_table_privilege('anon','public.ai_caption_chain_runs','SELECT')) as verification;
rollback;

