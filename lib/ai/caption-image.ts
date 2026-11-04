import type { SupabaseClient } from '@supabase/supabase-js';

const imageHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export function captionImageUrl(id: string): string {
  return `/api/caption-images/${encodeURIComponent(id)}`;
}

// Resolve by a published caption ID, never by a client-supplied storage path.
// The caller's normal RLS and storage permissions still apply.
export async function captionImageResponse(client: SupabaseClient, id: string): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response(null, { status: 404, headers: imageHeaders });
  }
  const { data: caption, error } = await client.from('ai_generations')
    .select('image_path').eq('id', id).maybeSingle();
  if (error) return new Response(null, { status: 502, headers: imageHeaders });
  if (!caption?.image_path) return new Response(null, { status: 404, headers: imageHeaders });
  const { data: image, error: imageError } = await client.storage.from('caption-images')
    .createSignedUrl(caption.image_path, 60);
  if (imageError || !image?.signedUrl) {
    return new Response(null, { status: 502, headers: imageHeaders });
  }
  // This redirect must not be cached: a photo loaded hours after its page
  // was opened still needs a newly signed URL.
  return new Response(null, { status: 307, headers: { ...imageHeaders, Location: image.signedUrl } });
}

