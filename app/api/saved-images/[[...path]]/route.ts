import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { savedImagesResponse } from '@/lib/storage/saved-images';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const client = createClient(await cookies());
  const { data: { user } } = await client.auth.getUser();
  return savedImagesResponse(request, client, user?.id ?? null, ['caption-images', 'profile-photos']);
}
