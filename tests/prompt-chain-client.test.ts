import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { callPromptChain, promptChainOrigin } from '../lib/ai/prompt-chain-client';
import { verifyServiceRequest } from '../lib/ai/service-signature';
import { generateWithChain } from '../lib/ai/generate-captions';
import { parseCaptionPromptChain, type CaptionPromptChain } from '../lib/ai/chain-contract';
import { ChainFailure } from '../lib/ai/chain-diagnostics';

const secret = 'ab'.repeat(32);
const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-user-token' } }, error: null }) } } as unknown as SupabaseClient;
const chain: CaptionPromptChain = { id: crypto.randomUUID(), revision: 3, name: 'Shared captions', description: '', steps: [{ id: crypto.randomUUID(), title: 'Describe', prompt: 'Describe the image.', model_id: crypto.randomUUID(), model: 'gemini-3.6-flash', include_image: true, output_type: 'text', enabled: true }] };
test('canonical chains preserve IDs, revisions, snake-case fields and twenty steps', () => {
  assert.deepEqual(parseCaptionPromptChain(chain), chain);
  const twenty = { ...chain, steps: Array.from({ length: 20 }, (_, position) => ({ ...chain.steps[0], id: crypto.randomUUID(), position, include_image: position === 0 })) };
  assert.ok(parseCaptionPromptChain(twenty)); assert.equal(parseCaptionPromptChain({ ...twenty, steps: [...twenty.steps, { ...twenty.steps[0], id: crypto.randomUUID() }] }), null);
  for (const invalid of [{ ...chain, steps: [chain.steps[0], chain.steps[0]] }, { ...chain, revision: 0 }, { ...chain, steps: [{ ...chain.steps[0], model_id: null }] }, { ...chain, steps: [{ ...chain.steps[0], include_image: false }] }, { ...chain, steps: [{ ...chain.steps[0], prompt: '{{step:1}}' }] }]) assert.equal(parseCaptionPromptChain(invalid), null);
});
test('gateway sends a signed user session to Prompt Studio and never sends provider keys or prompts', async () => {
  process.env.AI_MODEL_ENCRYPTION_KEY = secret;
  const transport = (async (url, init) => {
    assert.equal(url, 'https://prompt-chain-chi.vercel.app/api/v1/captions'); assert.equal(init?.redirect, 'error');
    const request = new Request(String(url), init); const raw = String(init?.body);
    assert.equal(verifyServiceRequest(request, raw, secret), 'test-user-token');
    assert.doesNotMatch(raw, /encrypted_api_key|api_key|GEMINI|Describe the image|test-provider-secret/);
    assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['chain_id', 'image', 'revision', 'style', 'surface', 'version']);
    return Response.json({ version: 1, accepted: true });
  }) as typeof fetch;
  const result = await callPromptChain(client, '/api/v1/captions', { surface: 'admin_panel', chain_id: chain.id, revision: chain.revision, style: 'all', image: { mime_type: 'image/png', base64: 'photo' } }, transport);
  assert.equal(result.accepted, true);
});
test('generation delegates once, validates the result and retains caption order', async t => {
  process.env.AI_MODEL_ENCRYPTION_KEY = secret; const captions = Array.from({ length: 9 }, (_, i) => `Caption ${i + 1}`); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => { calls++; assert.match(url, /\/api\/v1\/captions$/); assert.equal(JSON.parse(String(init.body)).chain_id, chain.id); return Response.json({ version: 1, chain_id: chain.id, chain_revision: chain.revision, captions, model: 'writer' }); });
  assert.deepEqual(await generateWithChain(client, chain, 'all', { mimeType: 'image/png', base64: 'photo' }, () => {}), { captions, model: 'writer' }); assert.equal(calls, 1);
});
test('service failures retain safe step diagnostics and never fall back to a provider', async () => {
  process.env.AI_MODEL_ENCRYPTION_KEY = secret; let calls = 0;
  const transport = (async () => { calls++; return Response.json({ error: 'Quota reached.', failed_step: { phase: 'provider_response', stepIndex: 2, stepCount: 3, stepTitle: 'Writer', prompt: 'private', apiKey: 'private' }, model: 'writer', provider_status: 429 }, { status: 502 }); }) as typeof fetch;
  await assert.rejects(callPromptChain(client, '/api/v1/captions', {}, transport), error => { assert.ok(error instanceof ChainFailure); assert.equal(error.status, 429); assert.equal(error.context.stepIndex, 2); assert.doesNotMatch(JSON.stringify(error.context), /private|apiKey|prompt/); return true; }); assert.equal(calls, 1);
  await assert.rejects(callPromptChain(client, '/api/v1/catalog', {}, (async () => new Response('<html>private data</html>', { status: 502 })) as typeof fetch), /invalid response/);
});
test('service configuration rejects public HTTP, embedded credentials, queries and path injection', () => {
  assert.equal(promptChainOrigin(), 'https://prompt-chain-chi.vercel.app'); assert.equal(promptChainOrigin('http://localhost:4400'), 'http://localhost:4400');
  for (const value of ['http://provider.example.org', 'https://user:secret@example.org', 'https://example.org/path', 'https://example.org?key=secret']) assert.throws(() => promptChainOrigin(value));
});
test('application source contains no direct provider transports', () => {
  for (const file of ['ai-provider.ts', 'generate-captions.ts', 'prompt-chain-client.ts']) assert.doesNotMatch(readFileSync(new URL(`../lib/ai/${file}`, import.meta.url), 'utf8'), /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.x\.ai/);
  // Keep the actual installed Supabase SDK in the test dependency graph.
  assert.equal(typeof createClient, 'function');
});
