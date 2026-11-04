import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { getSavedImage, ImageSelectionError, resolveImageInput, savedImageOffset, savedImagesResponse } from '../lib/storage/saved-images';

const userId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
function fixture({ hidden = false, fail = false, bucket = 'caption-images', size = 12, bytes = png } = {}) {
  let reads = 0, downloads = 0;
  const image = { id, bucket, name: 'another-owner/saved.png', size, mime: 'image/png', updatedAt: '2026-10-28T00:00:00Z', owned: false };
  const client = createClient('https://project.supabase.co', 'test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)); const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (url.pathname === '/rest/v1/rpc/get_saved_image') { reads++; return fail ? Response.json({ message: 'Private failure', code: 'XX000' }, { status: 500 }) : Response.json(hidden ? null : image); }
    if (url.pathname === '/rest/v1/rpc/list_saved_images') {
      reads++; if (fail) return Response.json({ message: 'Private failure', code: 'XX000' }, { status: 500 });
      const all = Array.from({ length: 13 }, (_, i) => ({ ...image, id: `33333333-3333-4333-8333-${String(i).padStart(12,'0')}` })).filter(item => item.id !== body.p_exclude_id);
      return Response.json({ images: all.slice(body.p_offset, body.p_offset + 10), offset: body.p_offset, limit: 10, hasMore: body.p_offset + 10 < all.length });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return Response.json({ signedURL: '/object/sign/caption-images/saved.png?token=short-lived' });
    assert.equal(init?.method, 'GET', 'saved-image selection must not upload, copy or update storage');
    assert.ok(url.searchParams.get('cacheNonce')); assert.equal(init?.cache, 'no-store'); downloads++;
    return new Response(new Uint8Array(bytes));
  } } });
  return { client, image, counts: () => ({ reads, downloads }) };
}

test('saved-image picker returns ten images per page and More loads the remaining images', async () => {
  const f = fixture();
  const firstResponse = await savedImagesResponse(new Request('https://app.example/api/saved-images'), f.client, userId);
  const first = await firstResponse.json(); assert.equal(first.images.length, 10); assert.equal(first.hasMore, true); assert.equal(first.limit, 10);
  assert.equal(firstResponse.headers.get('cache-control'), 'private, no-store');
  assert.match(first.images[0].previewUrl, /^\/api\/saved-images\/[a-f0-9-]+\/file\?v=/);
  const next = await (await savedImagesResponse(new Request('https://app.example/api/saved-images?offset=10'), f.client, userId)).json();
  assert.equal(next.images.length, 3); assert.equal(next.hasMore, false); assert.equal(next.offset, 10);
  assert.equal(first.images.some((a: { id: string }) => next.images.some((b: { id: string }) => a.id === b.id)), false);
});

test('picker validation rejects anonymous listing, arbitrary buckets, bad IDs and offsets before querying', async () => {
  const f = fixture();
  assert.equal((await savedImagesResponse(new Request('https://app.example/api/saved-images'), f.client, null)).status, 401);
  for (const query of ['bucket=secrets','offset=-1','offset=01','offset=1000001','exclude=../private']) assert.equal((await savedImagesResponse(new Request(`https://app.example/api/saved-images?${query}`), f.client, userId)).status, 400);
  assert.equal(f.counts().reads, 0); assert.equal(savedImageOffset(null), 0);
});

test('a stored-image selection resolves authorized bytes and keeps the original path without uploading', async () => {
  const f = fixture(), form = new FormData(); form.set('savedImageId', id);
  const resolved = await resolveImageInput(f.client, form);
  assert.deepEqual(resolved.bytes, png); assert.equal(resolved.path, f.image.name); assert.equal(resolved.mime, 'image/png');
  assert.deepEqual(f.counts(), { reads: 1, downloads: 1 });
});

test('uploads and saved selections are exclusive, and hidden or malformed stored-image IDs fail closed', async () => {
  const f = fixture(), both = new FormData(); both.set('savedImageId', id); both.set('image', new Blob([png], { type: 'image/png' }), 'photo.png');
  await assert.rejects(resolveImageInput(f.client, both), (error: unknown) => error instanceof ImageSelectionError && error.status === 400);
  await assert.rejects(resolveImageInput(f.client, new FormData()), /Upload a photo or choose/);
  await assert.rejects(getSavedImage(f.client, '../private'), /Choose a saved image/); assert.equal(f.counts().reads, 0);
  await assert.rejects(getSavedImage(fixture({ hidden: true }).client, id), (error: unknown) => error instanceof ImageSelectionError && error.status === 404);
});

test('stored files undergo MIME, byte-signature and size checks before caption generation', async () => {
  const form = new FormData(); form.set('savedImageId', id);
  for (const options of [{ bucket: 'profile-photos' }, { size: 3 * 1024 * 1024 + 1 }, { bytes: new Uint8Array(12) }, { bytes: new Uint8Array(3 * 1024 * 1024 + 1) }]) await assert.rejects(resolveImageInput(fixture(options).client, form), ImageSelectionError);
  const upload = new FormData(); upload.set('image', new Blob([png], { type: 'image/png' }), 'photo.png');
  assert.equal((await resolveImageInput(fixture().client, upload)).path, null);
});

test('stored-image previews follow database access checks and resolve fresh signed links', async () => {
  const request = new Request(`https://app.example/api/saved-images/${id}/file`);
  const visible = await savedImagesResponse(request, fixture().client, null); assert.equal(visible.status, 307); assert.match(visible.headers.get('location')!, /short-lived/); assert.equal(visible.headers.get('vary'), 'Cookie');
  const hidden = await savedImagesResponse(request, fixture({ hidden: true }).client, userId); assert.equal(hidden.status, 404); assert.equal(hidden.headers.get('location'), null);
  const failed = await savedImagesResponse(request, fixture({ fail: true }).client, userId); assert.equal(failed.status, 502); assert.doesNotMatch(await failed.text(), /Private failure/);
});
