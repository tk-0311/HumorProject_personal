import type { SupabaseClient } from '@supabase/supabase-js';

export async function signupEmailError(client: Pick<SupabaseClient, 'rpc'>, email: string): Promise<string | null> {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  try {
    const { data: allowed, error } = await client.rpc('is_signup_email_allowed', { p_email: email }).abortSignal(AbortSignal.timeout(5000));
    if (error || typeof allowed !== 'boolean') return 'Signup is temporarily unavailable. Please try again later.';
    return allowed ? null : 'New accounts are limited to approved email domains or whitelisted email addresses. Please use an approved email address.';
  } catch { return 'Signup is temporarily unavailable. Please try again later.'; }
}
