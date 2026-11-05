import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import CaptionFeed from '@/app/components/CaptionFeed';
import NavBar from '@/app/components/NavBar';

export default async function PublishedCaptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { data: { user } } = await createClient(await cookies()).auth.getUser();
  return <><NavBar /><main className="mx-auto w-full max-w-2xl px-5 py-10">
    <Link href="/captions" className="mb-6 inline-block font-semibold underline">← All published captions</Link>
    <h1 className="mb-6 text-3xl font-extrabold">Published on HumorProject Personal</h1>
    <CaptionFeed canVote={!!user} captionId={id} />
  </main></>;
}
