import type { SupabaseClient } from '@supabase/supabase-js';

type ImageInput = { bucket: string; userId: string; bytes: Uint8Array; contentType: string; scope?: 'owner' | 'admin'; excludePath?: string };
type Candidate = { path: string; size: number };
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function imageFingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function* candidates(client: SupabaseClient, input: ImageInput): AsyncGenerator<Candidate> {
  // Owner-scoped checks never inspect or disclose another user's private images.
  for (let offset = 0; offset < 100000; ) {
    if (input.scope === 'admin') {
      const { data, error } = await client.rpc('admin_list_storage_images', { p_bucket: input.bucket, p_search: '', p_offset: offset });
      if (error || !data || !Array.isArray(data.images)) throw new Error('Could not check existing images. Please try again.');
      for (const image of data.images) if (typeof image.name === 'string') yield { path: image.name, size: Number(image.size) };
      offset += 24;
      if (offset >= data.total) return;
      if (!data.images.length) throw new Error('The image list changed. Please try again.');
    } else {
      const { data, error } = await client.storage.from(input.bucket).list(input.userId, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error || !Array.isArray(data)) throw new Error('Could not check existing images. Please try again.');
      for (const image of data) if (image.id && image.metadata) yield { path: `${input.userId}/${image.name}`, size: Number(image.metadata.size) };
      if (data.length < 100) return;
      offset += 100;
    }
  }
  throw new Error('There are too many images to check safely. Please contact an administrator.');
}

async function fingerprintAt(client: SupabaseClient, bucket: string, path: string): Promise<string> {
  // Read current bytes rather than a cached photo from before an admin replacement.
  const { data, error } = await client.storage.from(bucket).download(path, { cacheNonce: globalThis.crypto.randomUUID() }, { cache: 'no-store' });
  if (error || !data) throw new Error('Could not check an existing image. Please try again.');
  return imageFingerprint(new Uint8Array(await data.arrayBuffer()));
}

export async function storedImageMatches(client: SupabaseClient, bucket: string, path: string, bytes: Uint8Array): Promise<boolean> {
  return await fingerprintAt(client, bucket, path) === await imageFingerprint(bytes);
}

export async function findDuplicateImage(client: SupabaseClient, input: ImageInput): Promise<string | null> {
  const fingerprint = await imageFingerprint(input.bytes);
  for await (const candidate of candidates(client, input)) {
    if (candidate.path === input.excludePath || candidate.size !== input.bytes.byteLength) continue;
    if (await fingerprintAt(client, input.bucket, candidate.path) === fingerprint) return candidate.path;
  }
  return null;
}

function isCollision(error: unknown): boolean {
  const value = error as { statusCode?: string | number; status?: number; message?: string };
  const status = String(value?.statusCode ?? value?.status ?? '');
  return ['400', '409'].includes(status) && /already exists|duplicate|resource exists/i.test(value?.message ?? '');
}

export async function uploadUniqueImage(client: SupabaseClient, input: ImageInput): Promise<{ path: string; reused: boolean }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.userId)
    || !['caption-images', 'profile-photos', 'profile pictures'].includes(input.bucket) || !extensions[input.contentType]) throw new Error('Invalid image upload.');
  const existing = await findDuplicateImage(client, input);
  if (existing) return { path: existing, reused: true };
  const fingerprint = await imageFingerprint(input.bytes);
  // Simultaneous uploads use the same path. Storage's unique path constraint
  // selects a winner; a loser verifies the saved bytes before reusing that file.
  for (let slot = 0; slot < 16; slot++) {
    const path = `${input.userId}/${fingerprint}${slot ? `-${slot}` : ''}.${extensions[input.contentType]}`;
    const { error } = await client.storage.from(input.bucket).upload(path, input.bytes, { contentType: input.contentType, cacheControl: '0', upsert: false });
    if (!error) return { path, reused: false };
    if (!isCollision(error)) throw new Error('Could not save this image. Please try again.');
    if (await fingerprintAt(client, input.bucket, path) === fingerprint) return { path, reused: true };
    // An administrator may have replaced bytes at an earlier hash-named path.
    // Keep that linked image intact and use the next deterministic slot.
  }
  throw new Error('Could not safely reserve this image. Please try again later.');
}
