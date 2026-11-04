-- Requires existing admin and ordinary-user profiles. Every test write rolls back.
begin;
do $$
declare admin_id uuid; ordinary_id uuid;
begin
 select user_id into admin_id from public.profiles where role='admin' limit 1;
 select user_id into ordinary_id from public.profiles where role is distinct from 'admin' limit 1;
 assert admin_id is not null and ordinary_id is not null;
 perform set_config('test.signup_admin',admin_id::text,true);
 perform set_config('test.signup_user',ordinary_id::text,true);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare domain_id uuid; invalid_domain text; changed integer;
begin
 update public.signup_domain_settings set restrict_signup=false where singleton;
 assert public.is_signup_email_allowed('member@anywhere.test'), 'Disabled restrictions must allow signup';
 insert into public.allowed_signup_domains(domain) values('signup-regression.test') returning id into domain_id;
 assert (select updated_by from public.allowed_signup_domains where id=domain_id)=auth.uid();
 begin
  insert into public.allowed_signup_domains(domain) values('signup-regression.test');
  raise exception 'Expected duplicate rejection';
 exception when unique_violation then null; end;
 foreach invalid_domain in array array['UPPER.test',' space.test','https://bad.test','*.bad.test','user@bad.test','bad_test.example','-bad.test','bad-.test','bad..test','localhost','127.0.0.1','bad.t','bad.test.','bad@test','bad/test'] loop
  begin
   insert into public.allowed_signup_domains(domain) values(invalid_domain);
   raise exception 'Expected invalid domain rejection: %',invalid_domain;
  exception when check_violation then null; end;
 end loop;
 update public.signup_domain_settings set restrict_signup=true where singleton;
 assert public.is_signup_email_allowed('Member@SIGNUP-REGRESSION.TEST');
 assert public.is_signup_email_allowed(' Member+tag@signup-regression.test ');
 assert not public.is_signup_email_allowed('member@signup-regression.test.evil.test');
 assert not public.is_signup_email_allowed('member@sub.signup-regression.test');
 assert not public.is_signup_email_allowed('member@other.test');
 assert not public.is_signup_email_allowed('member@signup-regression.test@other.test');
 assert not public.is_signup_email_allowed(null);
 update public.allowed_signup_domains set domain='renamed-signup.test' where id=domain_id;
 assert not public.is_signup_email_allowed('member@signup-regression.test');
 assert public.is_signup_email_allowed('member@renamed-signup.test');
 delete from public.allowed_signup_domains where id=domain_id;
 assert not public.is_signup_email_allowed('member@renamed-signup.test'), 'Empty enabled list must block signup';
 insert into public.allowed_signup_domains(domain) values('signup-regression.test');
 perform set_config('request.jwt.claim.sub',current_setting('test.signup_user'),true);
 assert not exists(select 1 from public.allowed_signup_domains), 'Users cannot read domains';
 assert not exists(select 1 from public.signup_domain_settings), 'Users cannot read settings';
 begin
  insert into public.allowed_signup_domains(domain) values('unauthorized.test');
  raise exception 'Expected user insert denial';
 exception when insufficient_privilege then null; end;
 update public.allowed_signup_domains set domain='unauthorized.test';
 get diagnostics changed = row_count;
 assert changed=0, 'User update must be denied by RLS';
 delete from public.allowed_signup_domains;
 get diagnostics changed = row_count;
 assert changed=0, 'User delete must be denied by RLS';
 update public.signup_domain_settings set restrict_signup=false;
 get diagnostics changed = row_count;
 assert changed=0, 'User policy changes must be denied by RLS';
end $$;
reset role;
do $$
declare fixture uuid; provider text;
begin
 foreach provider in array array['email','google'] loop
  fixture:=gen_random_uuid();
  begin
   insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
   values(fixture,'authenticated','authenticated',fixture::text||'@blocked-signup.test',jsonb_build_object('provider',provider),jsonb_build_object('username','test_'||left(fixture::text,8)));
   raise exception 'Expected blocked signup for %',provider;
  exception when check_violation then null; end;
  assert not exists(select 1 from auth.users where id=fixture);
  fixture:=gen_random_uuid();
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
  values(fixture,'authenticated','authenticated',fixture::text||'@signup-regression.test',jsonb_build_object('provider',provider),jsonb_build_object('username','test_'||left(fixture::text,8)));
  assert exists(select 1 from auth.users where id=fixture);
  -- Signup restrictions never revoke existing account access or block email updates.
  update auth.users set email=fixture::text||'@unlisted-existing.test' where id=fixture;
  assert exists(select 1 from auth.users where id=fixture and email like '%@unlisted-existing.test');
 end loop;
end $$;
reset role;
set local role anon;
do $$ begin
 assert public.is_signup_email_allowed('member@signup-regression.test');
 assert not public.is_signup_email_allowed('member@unlisted.test');
 begin
  perform domain from public.allowed_signup_domains;
  raise exception 'Expected anonymous domain read denial';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select jsonb_build_object('adminCrud',true,'duplicatesRejected',true,'invalidDomainsRejected',true,'usersCannotReadOrMutate',true,'exactDomainMatching',true,'emptyEnabledListBlocks',true,'emailAndGoogleInsertionEnforced',true,'existingAccountsUnaffected',true,'anonymousListPrivate',true) as verification;
rollback;

