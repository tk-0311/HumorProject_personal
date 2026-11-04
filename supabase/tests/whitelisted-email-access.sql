-- Requires existing admin and ordinary-user profiles. All test changes roll back.
begin;
do $$
declare admin_id uuid; ordinary_id uuid;
begin
 select user_id into admin_id from public.profiles where role='admin' limit 1;
 select user_id into ordinary_id from public.profiles where role is distinct from 'admin' limit 1;
 assert admin_id is not null and ordinary_id is not null;
 perform set_config('test.whitelist_admin',admin_id::text,true);
 perform set_config('test.whitelist_user',ordinary_id::text,true);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare entry_id uuid; invalid_email text; changed integer;
begin
 update public.signup_domain_settings set restrict_signup=true where singleton;
 insert into public.whitelisted_signup_emails(email) values('signup.whitelist+tag@outside-regression.test') returning id into entry_id;
 assert (select updated_by from public.whitelisted_signup_emails where id=entry_id)=auth.uid();
 assert public.is_signup_email_allowed(' Signup.Whitelist+TAG@OUTSIDE-REGRESSION.TEST ');
 assert not public.is_signup_email_allowed('signup.whitelist@outside-regression.test'), 'Plus aliases must not broaden access';
 assert not public.is_signup_email_allowed('signupwhitelist+tag@outside-regression.test'), 'Dots must not broaden access';
 assert not public.is_signup_email_allowed('other@outside-regression.test'), 'Whitelisting one address must not allow its entire domain';
 begin
  insert into public.whitelisted_signup_emails(email) values('signup.whitelist+tag@outside-regression.test');
  raise exception 'Expected duplicate email rejection';
 exception when unique_violation then null; end;
 foreach invalid_email in array array['UPPER@example.test',' space@example.test','*@example.test','person@*.test','https://person@example.test','mailto:person@example.test','person@@example.test','person@example.test,other@example.test','.person@example.test','person.@example.test','per..son@example.test','person@localhost','person@127.0.0.1','person@-bad.test','person@bad..test',repeat('x',65)||'@example.test',repeat('x',250)||'@example.test'] loop
  begin
   insert into public.whitelisted_signup_emails(email) values(invalid_email);
   raise exception 'Expected invalid email rejection: %',invalid_email;
  exception when check_violation then null; end;
 end loop;
 update public.whitelisted_signup_emails set email='renamed@outside-regression.test' where id=entry_id;
 assert not public.is_signup_email_allowed('signup.whitelist+tag@outside-regression.test');
 assert public.is_signup_email_allowed('renamed@outside-regression.test');
 delete from public.whitelisted_signup_emails where id=entry_id;
 assert not public.is_signup_email_allowed('renamed@outside-regression.test');
 insert into public.whitelisted_signup_emails(email) values('signup.whitelist+tag@outside-regression.test');
 insert into public.allowed_signup_domains(domain) values('domain-whitelist-regression.test');
 assert public.is_signup_email_allowed('anybody@domain-whitelist-regression.test'), 'Allowed domains must continue working';
 assert public.is_signup_email_allowed('signup.whitelist+tag@outside-regression.test'), 'Exact email must work alongside domains';
 perform set_config('request.jwt.claim.sub',current_setting('test.whitelist_user'),true);
 assert not exists(select 1 from public.whitelisted_signup_emails), 'Users cannot read private email addresses';
 begin
  insert into public.whitelisted_signup_emails(email) values('unauthorized@example.test');
  raise exception 'Expected user insertion denial';
 exception when insufficient_privilege then null; end;
 update public.whitelisted_signup_emails set email='unauthorized@example.test';
 get diagnostics changed=row_count;assert changed=0;
 delete from public.whitelisted_signup_emails;
 get diagnostics changed=row_count;assert changed=0;
end $$;
reset role;
do $$
declare fixture uuid; provider text;
begin
 foreach provider in array array['email','google'] loop
  fixture:=gen_random_uuid();
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
  values(fixture,'authenticated','authenticated','signup.whitelist+tag@outside-regression.test',jsonb_build_object('provider',provider),jsonb_build_object('username','wl_'||left(fixture::text,8)));
  assert exists(select 1 from auth.users where id=fixture);
  -- This remains an existing account even after its address is removed from eligibility.
  update auth.users set email=fixture::text||'@existing-whitelist.test' where id=fixture;
  fixture:=gen_random_uuid();
  begin
   insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
   values(fixture,'authenticated','authenticated','other@outside-regression.test',jsonb_build_object('provider',provider),jsonb_build_object('username','wl_'||left(fixture::text,8)));
   raise exception 'Expected non-whitelisted signup denial';
  exception when check_violation then null; end;
 end loop;
end $$;
set local role anon;
do $$ begin
 assert public.is_signup_email_allowed('signup.whitelist+tag@outside-regression.test');
 assert not public.is_signup_email_allowed('other@outside-regression.test');
 begin
  perform email from public.whitelisted_signup_emails;
  raise exception 'Expected anonymous email list read denial';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select jsonb_build_object('adminCrud',true,'exactEmailExceptions',true,'domainsStillAllowed',true,'duplicateAndInvalidEntriesRejected',true,'normalUsersCannotReadOrMutate',true,'emailAndGoogleSignupEnforced',true,'existingAccountsUnaffected',true,'anonymousListPrivate',true) as verification;
rollback;

