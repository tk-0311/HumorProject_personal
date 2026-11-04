import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { captionImageResponse, captionImageUrl } from '../lib/ai/caption-image';

const id = '11111111-1111-4111-8111-111111111111';
function fixture({ missing = false, signFailure = false, queryFailure = false } = {}) {
  let queries = 0;
  let signs = 0;
  const client = createClient('https://project.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/rest/v1/ai_generations') {
        queries++;
        assert.equal(url.searchParams.get('select'), 'image_path');
        assert.equal(url.searchParams.get('id'), `eq.${id}`);
        if (queryFailure) return Response.json({ code: '42501', message: 'Denied' }, { status: 403 });
        return Response.json(missing ? null : { image_path: 'owner/photo.jpg' });
      }
      assert.equal(url.pathname, '/storage/v1/object/sign/caption-images/owner/photo.jpg');
      assert.equal(JSON.parse(String(init?.body)).expiresIn, 60);
      signs++;
      if (signFailure) return Response.json({ message: 'Unavailable' }, { status: 500 });
      return Response.json({ signedURL: `/object/sign/caption-images/owner/photo.jpg?token=fresh-${signs}` });
    } },
  });
  return { client, counts: () => ({ queries, signs }) };
}

test('each image load resolves a fresh uncached link, including a later retry from the same page', async () => {
  const { client, counts } = fixture();
  assert.equal(captionImageUrl(id), `/api/caption-images/${id}`);
  const first = await captionImageResponse(client, id);
  const later = await captionImageResponse(client, id);
  for (const response of [first, later]) {
    assert.equal(response.status, 307);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.equal(response.headers.get('vary'), 'Cookie');
  }
  assert.notEqual(first.headers.get('location'), later.headers.get('location'));
  assert.deepEqual(counts(), { queries: 2, signs: 2 });
});

test('arbitrary paths and unpublished or missing captions cannot be signed', async () => {
  const normal = fixture();
  for (const invalid of ['../owner/photo.jpg', 'owner/photo.jpg', 'not-a-caption-id']) {
    const response = await captionImageResponse(normal.client, invalid);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
  }
  assert.deepEqual(normal.counts(), { queries: 0, signs: 0 });
  const missing = fixture({ missing: true });
  assert.equal((await captionImageResponse(missing.client, id)).status, 404);
  assert.deepEqual(missing.counts(), { queries: 1, signs: 0 });
});

test('query and signing failures return uncached errors without leaking storage details', async () => {
  for (const options of [{ queryFailure: true }, { signFailure: true }]) {
    const { client } = fixture(options);
    const response = await captionImageResponse(client, id);
    assert.equal(response.status, 502);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.equal(response.headers.get('location'), null);
    assert.equal(await response.text(), '');
  }
});

