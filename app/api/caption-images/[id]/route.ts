import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { captionImageResponse } from '@/lib/ai/caption-image';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return captionImageResponse(createClient(await cookies()), id);
}
