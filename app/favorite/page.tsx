import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { captionImageUrl } from '@/lib/ai/caption-image';
import type { Caption } from '../components/CaptionCard';
import LikedCaptionsList from './LikedCaptionsList';
import NavBar from '../components/NavBar';

export const metadata: Metadata = {
  title: 'Liked memes | Humor Project',
};

type VoteRow = { generation_id: string };
type VoteCount = { generation_id: string; likes: number; dislikes: number };

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export default async function FavoritePage() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <NavBar />
        <main className="min-h-[calc(100svh-85px)] bg-[var(--background)] px-5 py-12 text-[var(--foreground)] sm:min-h-[calc(100svh-104px)]">
          <section className="app-surface mx-auto max-w-xl rounded-2xl border border-[var(--border)] p-8 text-center">
            <h1 className="text-3xl font-extrabold">Your liked memes</h1>
            <p className="my-4 text-[var(--muted)]">Log in to see the memes you’ve voted “↑ Funny”.</p>
            <Link href="/login" className="inline-flex min-h-12 items-center rounded-lg bg-[var(--foreground)] px-6 font-bold text-white">Log in</Link>
          </section>
        </main>
      </>
    );
  }

  const likedVotes: VoteRow[] = [];
  let loadError = false;
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('caption_votes')
      .select('generation_id')
      .eq('user_id', user.id)
      .eq('value', 1)
      .order('created_at', { ascending: false })
      .order('generation_id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      loadError = true;
      break;
    }
    const page = (data ?? []) as VoteRow[];
    likedVotes.push(...page);
    if (page.length < pageSize) break;
  }

  const likedIds = likedVotes.map((vote) => vote.generation_id);
  const captionsById = new Map<string, Caption>();
  const countsById = new Map<string, { likes: number; dislikes: number }>();

  for (const group of chunks(chunks(likedIds, 100), 10)) {
    const results = await Promise.all(group.map(async (ids) => {
      const [captionsResult, countsResult] = await Promise.all([
        supabase.from('ai_generations').select('id,situation,caption,style,created_at,image_path').in('id', ids),
        supabase.rpc('caption_vote_counts', { generation_ids: ids }),
      ]);
      return { captionsResult, countsResult };
    }));

    for (const { captionsResult, countsResult } of results) {
      if (captionsResult.error || countsResult.error) {
        loadError = true;
        continue;
      }
      for (const caption of (captionsResult.data ?? []) as Caption[]) captionsById.set(caption.id, caption);
      for (const count of (countsResult.data ?? []) as VoteCount[]) {
        countsById.set(count.generation_id, { likes: Number(count.likes), dislikes: Number(count.dislikes) });
      }
    }
  }

  const captions = likedIds.flatMap((id) => {
    const caption = captionsById.get(id);
    if (!caption) return [];
    const counts = countsById.get(id) ?? { likes: 0, dislikes: 0 };
    return [{ caption, ...counts }];
  });

  const likedCaptions = captions.map(({ caption, likes, dislikes }) => ({
    caption,
    likes,
    dislikes,
    imageUrl: caption.image_path ? captionImageUrl(caption.id) : undefined,
  }));

  return (
    <>
      <NavBar />
      <main className="min-h-[calc(100svh-85px)] bg-[var(--background)] px-5 py-10 text-[var(--foreground)] sm:min-h-[calc(100svh-104px)] sm:py-12">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent-strong)]">Your collection</p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Liked memes</h1>
            <p className="mt-2 text-[var(--muted)]">Memes you’ve voted “↑ Funny”. Remove your upvote to take one off this list.</p>
          </header>
          {loadError && <p role="status" className="mb-5 rounded-lg border border-[var(--border)] p-4">Some liked captions couldn’t be loaded. Please refresh to try again.</p>}
          {(!loadError || likedCaptions.length > 0) && <LikedCaptionsList initialCaptions={likedCaptions} />}
        </div>
      </main>
    </>
  );
}
