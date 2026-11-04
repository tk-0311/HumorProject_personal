import type { SupabaseClient } from '@supabase/supabase-js';
import { imageFileError, matchesImageSignature } from '../ai/images';

export type SavedImage = { id: string; bucket: string; name: string; size: number; mime: string; updatedAt: string; owned: boolean; previewUrl: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export class ImageSelectionError extends Error { constructor(public status: number, message: string) { super(message); } }
export function savedImageOffset(value: string | null): number {
  const text = value ?? '0', offset = Number(text);
  if (!/^(0|[1-9][0-9]*)$/.test(text) || !Number.isSafeInteger(offset) || offset > 1000000) throw new ImageSelectionError(400, 'Invalid image page.');
  return offset;
}
export function savedImageId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new ImageSelectionError(400, 'Choose a saved image.');
  return value;
}
export function savedImagePreview(image: Pick<SavedImage, 'id' | 'updatedAt'>) {
  return `/api/saved-images/${encodeURIComponent(image.id)}/file?v=${encodeURIComponent(image.updatedAt)}`;
}
export async function getSavedImage(client: SupabaseClient, id: string): Promise<SavedImage> {
  savedImageId(id);
  const { data, error } = await client.rpc('get_saved_image', { p_image_id: id });
  if (error) throw new ImageSelectionError(502, 'Could not load the saved image.');
  if (!data) throw new ImageSelectionError(404, 'This image is unavailable or you do not have access.');
  return { ...data, previewUrl: savedImagePreview(data) };
}
export async function resolveImageInput(client: SupabaseClient, form: FormData): Promise<{ bytes: Uint8Array; mime: string; path: string | null }> {
  const file = form.get('image'), selected = form.get('savedImageId');
  const uploaded = file instanceof File && file.size > 0;
  if (uploaded && selected) throw new ImageSelectionError(400, 'Choose either an upload or a saved image.');
  let bytes: Uint8Array, mime: string, path: string | null = null;
  if (selected) {
    const image = await getSavedImage(client, savedImageId(selected));
    if (image.bucket !== 'caption-images') throw new ImageSelectionError(400, 'Choose a caption image.');
    const issue = imageFileError(Number(image.size), image.mime);
    if (issue) throw new ImageSelectionError(400, issue);
    const { data, error } = await client.storage.from(image.bucket).download(image.name, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' });
    if (error || !data) throw new ImageSelectionError(502, 'Could not open the saved image.');
    bytes = new Uint8Array(await data.arrayBuffer()); mime = image.mime; path = image.name;
  } else {
    if (!uploaded) throw new ImageSelectionError(400, 'Upload a photo or choose a saved image first.');
    mime = file.type;
    const issue = imageFileError(file.size, mime);
    if (issue) throw new ImageSelectionError(400, issue);
    bytes = new Uint8Array(await file.arrayBuffer());
  }
  const issue = imageFileError(bytes.byteLength, mime);
  if (issue || !matchesImageSignature(bytes, mime)) throw new ImageSelectionError(400, issue ?? 'This file does not match its image format.');
  return { bytes, mime, path };
}
export async function savedImagesResponse(request: Request, client: SupabaseClient, userId: string | null, buckets: readonly string[] = ['caption-images']): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.pathname === '/api/saved-images') {
      if (!userId) throw new ImageSelectionError(401, 'Sign in to choose a saved image.');
      const bucket = url.searchParams.get('bucket') ?? 'caption-images';
      if (!buckets.includes(bucket)) throw new ImageSelectionError(400, 'Choose a valid image collection.');
      const offset = savedImageOffset(url.searchParams.get('offset'));
      const exclude = url.searchParams.get('exclude'); if (exclude) savedImageId(exclude);
      const { data, error } = await client.rpc('list_saved_images', { p_bucket: bucket, p_offset: offset, p_exclude_id: exclude || null });
      if (error || !data) throw new ImageSelectionError(502, 'Could not load saved images. Please try again.');
      return Response.json({ ...data, images: data.images.slice(0, 10).map((image: SavedImage) => ({ ...image, previewUrl: savedImagePreview(image) })) }, { headers });
    }
    const match = url.pathname.match(/^\/api\/saved-images\/([0-9a-f-]{36})\/file$/i);
    if (!match) throw new ImageSelectionError(404, 'Image not found.');
    const image = await getSavedImage(client, match[1]);
    const { data, error } = await client.storage.from(image.bucket).createSignedUrl(image.name, 60);
    if (error || !data?.signedUrl) throw new ImageSelectionError(502, 'Could not open this image.');
    return new Response(null, { status: 307, headers: { ...headers, Location: data.signedUrl } });
  } catch (error) {
    return Response.json({ error: error instanceof ImageSelectionError ? error.message : 'Could not load saved images.' }, { status: error instanceof ImageSelectionError ? error.status : 500, headers });
  }
}
