// The application never calls a model provider. Keep this transport identical
// to HumorProject_personal/lib/ai/prompt-chain-client.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceHeaders } from './service-signature';
import { ProviderError } from './ai-provider';
import { ChainFailure, telemetryChainContext, type ChainFailureContext } from './chain-diagnostics';

export function promptChainOrigin(value = process.env.PROMPT_CHAIN_URL) {
  let url: URL;
  try { url = new URL(value || 'https://prompt-chain-chi.vercel.app'); } catch { throw new Error('PROMPT_CHAIN_URL must be an absolute app URL.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('PROMPT_CHAIN_URL must be an HTTPS app origin; local HTTP requires a loopback host.');
  return url.origin;
}
export async function callPromptChain(client: Pick<SupabaseClient, 'auth'>, path: '/api/v1/captions' | '/api/v1/catalog', body: Record<string, unknown>, transport: typeof fetch = fetch) {
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw new ProviderError('Sign in again before contacting Prompt Studio.', 401);
  const raw = JSON.stringify({ ...body, version: 1 });
  let response: Response;
  try { response = await transport(`${promptChainOrigin()}${path}`, { method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(path === '/api/v1/catalog' ? 15000 : 270000), headers: serviceHeaders(path, raw, session.access_token), body: raw }); }
  catch { throw new ProviderError('Prompt Studio could not be reached. Please try again shortly.', 503); }
  let result: Record<string, unknown>;
  try { const text = await response.text(); if (text.length > 512000) throw new Error(); result = JSON.parse(text); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); }
  catch { throw new ProviderError('Prompt Studio returned an invalid response. Please try again shortly.', 502); }
  if (!response.ok) {
    const message = typeof result.error === 'string' ? result.error.slice(0, 500) : 'Prompt Studio could not complete this request.';
    const phase = (result.failed_step as ChainFailureContext | undefined)?.phase;
    if (phase && ['chain_configuration', 'credentials', 'provider_request', 'provider_response', 'output_validation'].includes(phase)) {
      const context = telemetryChainContext(result.failed_step as ChainFailureContext)!;
      throw new ChainFailure(message, context, typeof result.model === 'string' ? result.model : undefined, typeof result.provider_status === 'number' ? result.provider_status : undefined);
    }
    throw new ProviderError(message, response.status);
  }
  if (result.version !== 1) throw new ProviderError('Prompt Studio returned an incompatible API version.', 502);
  return result;
}
