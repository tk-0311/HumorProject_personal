import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { signupEmailError } from '../lib/auth/signup-policy';

function fixture(value: unknown, failed = false) {
 let calls = 0;
 const client=createClient('https://project.supabase.co','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  calls++;
  assert.equal(new URL(String(input)).pathname,'/rest/v1/rpc/is_signup_email_allowed');
  assert.equal(typeof JSON.parse(String(init?.body)).p_email,'string');
  return failed?Response.json({code:'XX000',message:'Private database detail'},{status:503}):Response.json(value);
 }}});
 return {client,calls:()=>calls};
}
test('email signup proceeds only when the policy returns true',async()=>{
 const allowed=fixture(true);assert.equal(await signupEmailError(allowed.client,'student@columbia.edu'),null);assert.equal(allowed.calls(),1);
 const blocked=fixture(false);assert.match((await signupEmailError(blocked.client,'student@unlisted.test'))!,/approved email domains/);
});
test('unavailable or malformed policy responses fail closed with a general message',async()=>{
 for(const result of [null,{},'true',false]){
  const {client}=fixture(result,result===false);
  const error=await signupEmailError(client,'person@example.edu');
  assert.match(error!,/temporarily unavailable/);assert.doesNotMatch(error!,/Private database detail/);
 }
});
test('invalid email input is rejected before checking eligibility',async()=>{
 const {client,calls}=fixture(true);
 for(const email of ['not-email','name@@example.edu','name@example.edu@evil.test','name with space@example.edu','x'.repeat(255)+'@example.edu']) assert.match((await signupEmailError(client,email))!,/valid email/);
 assert.equal(calls(),0);
});

