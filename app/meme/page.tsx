import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { parseMemeFilters, type MemeSearchParams } from '@/lib/meme-search';
import NavBar from '@/app/components/NavBar';
import CaptionFeed from '@/app/components/CaptionFeed';
import GenerateCaptionButton from '@/app/components/GenerateCaptionButton';
import MemeBrowser from './MemeBrowser';
import MemeFeedShell from '@/app/components/MemeFeedShell';

export const metadata = { title: 'Memes | HumorProject', description: 'Find your kind of funny. Browse campus memes by topic, meme type, and date.' };

export default async function MemePage({ searchParams }: { searchParams: Promise<MemeSearchParams> }) {
  const { filters, errors } = parseMemeFilters(await searchParams);
  const { data: { user } } = await createClient(await cookies()).auth.getUser();

  return (
    <>
      <NavBar />
      <MemeFeedShell>
        <h1 className="sr-only">Memes</h1>
        <MemeBrowser filters={filters} errors={errors}>
          <CaptionFeed canVote={!!user} filters={filters} layout="grid" />
        </MemeBrowser>
        <GenerateCaptionButton floatingOnly canGenerate={!!user} />
      </MemeFeedShell>
    </>
  );
}
