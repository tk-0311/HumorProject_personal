import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { findDuplicateImage, imageFingerprint, storedImageMatches, uploadUniqueImage } from '../lib/storage/image-deduplication';

const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const bytes = new Uint8Array([1, 2, 3, 4]);
type Asset = { bucket: string; path: string; bytes: Uint8Array };
function fixture(initial: Asset[] = [], options: { emptyLists?: boolean; listFailure?: boolean; downloadFailure?: boolean; uploadFailure?: boolean } = {}) {
  const files = new Map(initial.map(file => [`${file.bucket}/${file.path}`, file]));
  const uploads: string[] = [], downloads: string[] = [], prefixes: string[] = [];
  let writes = 0, adminReads = 0;
  const client = createClient('https://project.supabase.co', 'test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)); const path = decodeURIComponent(url.pathname);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (path === '/rest/v1/rpc/admin_list_storage_images') {
      adminReads++;
      const rows = Array.from(files.values()).filter(file => file.bucket === body.p_bucket);
      return Response.json({ images: rows.slice(body.p_offset, body.p_offset + 24).map(file => ({ name: file.path, size: file.bytes.length })), total: rows.length });
    }
    const list = path.match(/^\/storage\/v1\/object\/list\/(.+)$/);
    if (list) {
      prefixes.push(body.prefix);
      if (options.listFailure) return Response.json({ message: 'Unavailable' }, { status: 500 });
      const rows = options.emptyLists ? [] : Array.from(files.values()).filter(file => file.bucket === list[1] && file.path.startsWith(`${body.prefix}/`));
      return Response.json(rows.slice(body.offset, body.offset + body.limit).map(file => ({ id: file.path, name: file.path.slice(body.prefix.length + 1), metadata: { size: file.bytes.length } })));
    }
    const object = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/); assert.ok(object, path);
    const key = `${object[1]}/${object[2]}`;
    if ((init?.method ?? 'GET') === 'GET') {
      downloads.push(key); assert.ok(url.searchParams.get('cacheNonce')); assert.equal(init?.cache, 'no-store');
      if (options.downloadFailure) return Response.json({ message: 'Unavailable' }, { status: 500 });
      const file = files.get(key);
      return file ? new Response(new Uint8Array(file.bytes)) : Response.json({ message: 'Not found' }, { status: 404 });
    }
    assert.equal(init?.method, 'POST'); assert.equal(new Headers(init.headers).get('x-upsert'), 'false'); uploads.push(key);
    if (options.uploadFailure) return Response.json({ message: 'Unavailable' }, { status: 500 });
    if (files.has(key)) return Response.json({ statusCode: '409', message: 'The resource already exists' }, { status: 409 });
    files.set(key, { bucket: object[1], path: object[2], bytes: new Uint8Array(init?.body as Uint8Array) }); writes++;
    return Response.json({ Id: 'object-id', Key: key });
  } } });
  return { client, files, uploads, downloads, prefixes, counts: () => ({ writes, adminReads }) };
}
const input = { bucket: 'caption-images', userId: owner, bytes, contentType: 'image/png' };

test('image fingerprints compare file bytes rather than names or file sizes', async () => {
  assert.equal(await imageFingerprint(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(await imageFingerprint(bytes), await imageFingerprint(new Uint8Array([1, 2, 3, 5])));
});

test('reuses an identical legacy upload under a different filename without writing a file', async () => {
  const f = fixture([{ bucket: input.bucket, path: `${owner}/old-random-name.png`, bytes }]);
  assert.deepEqual(await uploadUniqueImage(f.client, input), { path: `${owner}/old-random-name.png`, reused: true });
  assert.deepEqual(f.uploads, []); assert.deepEqual(f.prefixes, [owner]);
});

test('same-size images and other users or buckets never cause an incorrect or private-file reuse', async () => {
  const f = fixture([{ bucket: input.bucket, path: `${other}/private.png`, bytes },
    { bucket: 'profile-photos', path: `${owner}/avatar.png`, bytes },
    { bucket: input.bucket, path: `${owner}/different.png`, bytes: new Uint8Array([4, 3, 2, 1]) }]);
  const result = await uploadUniqueImage(f.client, input);
  assert.equal(result.reused, false); assert.match(result.path, new RegExp(`^${owner}/[a-f0-9]{64}\\.png$`));
  assert.equal(f.counts().writes, 1); assert.equal(f.downloads.some(path => path.includes(other)), false);
});

test('simultaneous identical uploads save one object and verify the winning file before reuse', async () => {
  const f = fixture([], { emptyLists: true });
  const results = await Promise.all(Array.from({ length: 12 }, () => uploadUniqueImage(f.client, input)));
  assert.equal(new Set(results.map(result => result.path)).size, 1);
  assert.equal(results.filter(result => !result.reused).length, 1);
  assert.equal(f.counts().writes, 1); assert.equal(f.files.size, 1);
  assert.ok(f.downloads.length > 0);
});

test('admin library checks can reuse existing files across owners without changing community scope', async () => {
  const f = fixture([{ bucket: input.bucket, path: `${other}/existing.png`, bytes }]);
  assert.deepEqual(await uploadUniqueImage(f.client, { ...input, scope: 'admin' }), { path: `${other}/existing.png`, reused: true });
  assert.equal(f.counts().adminReads, 1); assert.deepEqual(f.prefixes, []); assert.equal(f.counts().writes, 0);
});

test('a replaced hash-named file is preserved and later uploads converge on the next free slot', async () => {
  const hash = await imageFingerprint(bytes), oldPath = `${owner}/${hash}.png`;
  const changed = new Uint8Array([4, 3, 2, 1]);
  const f = fixture([{ bucket: input.bucket, path: oldPath, bytes: changed }]);
  const first = await uploadUniqueImage(f.client, input), second = await uploadUniqueImage(f.client, input);
  assert.equal(first.path, `${owner}/${hash}-1.png`); assert.equal(first.reused, false);
  assert.deepEqual(second, { path: first.path, reused: true });
  assert.deepEqual(f.files.get(`${input.bucket}/${oldPath}`)?.bytes, changed); assert.equal(f.counts().writes, 1);
});

test('storage failures stop upload instead of silently skipping duplicate checks', async () => {
  for (const option of [{ listFailure: true }, { downloadFailure: true }, { uploadFailure: true }]) {
    const f = fixture(option.downloadFailure ? [{ bucket: input.bucket, path: `${owner}/old.png`, bytes }] : [], option);
    await assert.rejects(uploadUniqueImage(f.client, input), /Could not/);
    assert.equal(f.counts().writes, 0);
  }
});

test('replacement checks ignore only the target path and verify current bytes without cache', async () => {
  const path = `${owner}/target.png`, f = fixture([{ bucket: input.bucket, path, bytes }]);
  assert.equal(await storedImageMatches(f.client, input.bucket, path, bytes), true);
  assert.equal(await findDuplicateImage(f.client, { ...input, excludePath: path }), null);
  assert.equal(await storedImageMatches(f.client, input.bucket, path, new Uint8Array([4, 3, 2, 1])), false);
});
