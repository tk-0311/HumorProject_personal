import { cookies } from 'next/headers';
import GenerateCaptionButton from './components/GenerateCaptionButton';
import { createClient } from '@/utils/supabase/server';
import NavBar from './components/NavBar';
import CaptionFeed from './components/CaptionFeed';
import HumorLanding from './components/HumorLanding';
import MemeBrowser from './meme/MemeBrowser';
import { parseMemeFilters, type MemeSearchParams } from '@/lib/meme-search';
import MemeFeedShell from './components/MemeFeedShell';

export default async function Page({ searchParams }: { searchParams: Promise<MemeSearchParams> }) {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;

  // Visitors can open the home feed from the landing page without signing in.
  if (!user && view !== 'feed') return <><NavBar /><HumorLanding><CaptionFeed canVote={false} /></HumorLanding></>;

  const { filters, errors } = parseMemeFilters({ topic: params.topic, page: params.page });

  return (
    <>
      <NavBar />
      <MemeFeedShell>
        <section aria-labelledby="feed-title">
          <h1 id="feed-title" className="sr-only">Latest memes</h1>
          <MemeBrowser filters={filters} errors={errors} showFilters={false} browsePath="/">
            <CaptionFeed canVote={!!user} filters={filters} layout="grid" browsePath="/" />
          </MemeBrowser>
          <GenerateCaptionButton floatingOnly canGenerate={!!user} />
        </section>
      </MemeFeedShell>
    </>
  );
}
