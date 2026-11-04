import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { withChainResponseHistory } from '../lib/ai/chain-responses';
import { runCaptionChain } from '../lib/ai/caption-chain-runner';
import { ProviderError } from '../lib/ai/ai-provider';
import type { ModelCatalog } from '../lib/ai/model-types';
import type { CaptionPromptChain } from '../lib/ai/prompt-chain';

const id = '11111111-1111-4111-8111-111111111111';
const privateModel = { id, name: 'Vision writer', provider: 'gemini' as const, model_id: 'test-model', encrypted_api_key: 'private-ciphertext' };
const catalog: ModelCatalog = { models: [privateModel], defaults: {} };
const chain: CaptionPromptChain = { executionMode: 'sequential', steps: [
  { title: 'Observe', prompt: 'Private prompt', modelId: id, includeImage: true },
  { title: 'Write', prompt: 'Another private prompt', modelId: id, includeImage: false, position: 2 },
] };
const image = { mimeType: 'image/png', base64: 'private-image-bytes' };
const final = '{"captions":["First","Second","Third"]}';
type Snapshot = { p_surface: string; p_status: string; p_failure_phase: string | null; p_steps: { index: number; position: number; title: string; model: string; response: string | null; status: string }[] };
function fixture(fail = false) {
  const records: Snapshot[] = [];
  const client = createClient('https://project.supabase.co', 'test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/record_caption_chain_run');
    records.push(JSON.parse(String(init?.body)));
    return fail ? Response.json({ code: 'XX000', message: 'Unavailable' }, { status: 500 }) : Response.json(null);
  } } });
  return { client, records };
}

test('captures each visible response in order without adding history or secrets to the generation result', async () => {
  const { client, records } = fixture();
  const result = await withChainResponseHistory(client, catalog, chain, 'humor_project', capture =>
    runCaptionChain(catalog, chain, 'dry', image, async () => 'private-provider-key', () => {}, async (_model, _key, stage) => stage.final ? final : 'Visible image description.', capture));
  assert.deepEqual(Object.keys(result).sort(), ['captions', 'model']);
  assert.equal(records.length, 1);
  assert.equal(records[0].p_surface, 'humor_project');
  assert.equal(records[0].p_status, 'completed');
  assert.equal(records[0].p_failure_phase, null);
  assert.deepEqual(records[0].p_steps.map(step => step.response), ['Visible image description.', final]);
  assert.deepEqual(records[0].p_steps.map(step => step.position), [1, 3]);
  assert.doesNotMatch(JSON.stringify(records), /private-provider-key|private-ciphertext|private-image-bytes|Private prompt|Another private prompt/);
});

test('failed runs retain earlier outputs and identify the failed link without storing raw provider errors', async () => {
  const { client, records } = fixture();
  await assert.rejects(withChainResponseHistory(client, catalog, chain, 'admin_panel', capture =>
    runCaptionChain(catalog, chain, 'dry', image, async () => 'key', () => {}, async (_model, _key, stage) => {
      if (!stage.final) return 'First output survives.';
      throw new ProviderError('private-provider-error', 429);
    }, capture)), /private-provider-error/);
  assert.equal(records[0].p_status, 'failed');
  assert.equal(records[0].p_failure_phase, 'provider_response');
  assert.equal(records[0].p_steps[0].response, 'First output survives.');
  assert.equal(records[0].p_steps[0].status, 'completed');
  assert.equal(records[0].p_steps[1].response, null);
  assert.equal(records[0].p_steps[1].status, 'failed');
  assert.doesNotMatch(JSON.stringify(records), /private-provider-error/);
});

test('invalid model output remains inspectable and unexecuted links remain explicitly marked', async () => {
  const { client, records } = fixture();
  await assert.rejects(withChainResponseHistory(client, catalog, chain, 'admin_panel', capture =>
    runCaptionChain(catalog, chain, 'dry', image, async () => 'key', () => {}, async () => 'x'.repeat(5001), capture)), /unusable content/);
  assert.equal(records[0].p_failure_phase, 'output_validation');
  assert.equal(records[0].p_steps[0].response?.length, 5001);
  assert.equal(records[0].p_steps[0].status, 'failed');
  assert.equal(records[0].p_steps[1].status, 'not_run');
  assert.equal(records[0].p_steps[1].response, null);

  const second = fixture();
  await assert.rejects(withChainResponseHistory(second.client, catalog, chain, 'humor_project', capture =>
    runCaptionChain(catalog, chain, 'dry', image, async () => 'key', () => {}, async (_model, _key, stage) => stage.final ? 'invalid final JSON' : 'Description', capture)), /unusable captions/);
  assert.equal(second.records[0].p_steps[1].response, 'invalid final JSON');
  assert.equal(second.records[0].p_steps[1].status, 'failed');
});

test('history storage failures never replace a successful generation or the original generation failure', async () => {
  const { client } = fixture(true);
  const expected = { captions: ['First', 'Second', 'Third'], model: 'test-model' };
  assert.equal(await withChainResponseHistory(client, catalog, chain, 'admin_panel', async () => expected), expected);
  const original = new Error('Original failure');
  await assert.rejects(withChainResponseHistory(client, catalog, chain, 'admin_panel', async () => { throw original; }), error => error === original);
});

test('credential failures record no model text and mark the failing link', async () => {
  const { client, records } = fixture();
  await assert.rejects(withChainResponseHistory(client, catalog, chain, 'admin_panel', capture =>
    runCaptionChain(catalog, chain, 'dry', image, async () => { throw new Error('private-key-error'); }, () => {}, async () => final, capture)), /API key/);
  assert.equal(records[0].p_failure_phase, 'credentials');
  assert.equal(records[0].p_steps[0].status, 'failed');
  assert.ok(records[0].p_steps.every(step => step.response === null));
  assert.doesNotMatch(JSON.stringify(records), /private-key-error/);
});

