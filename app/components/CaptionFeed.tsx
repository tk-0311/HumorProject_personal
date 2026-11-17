import { captionImageUrl } from '@/lib/ai/caption-image';
import { memeHref, memeTopicFilter, memeTopics, type MemeBrowsePath, type MemeFilters } from '@/lib/meme-search';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import CaptionCard, { type Caption } from './CaptionCard';

const pageSize = 30;

function pageHref(filters: MemeFilters, page: number, browsePath: MemeBrowsePath): string {
  return memeHref({ ...filters, page }, browsePath);
}

export default async function CaptionFeed({ canVote, prioritizeRecentLikes = false, filters, captionId, layout = 'list', browsePath = '/meme' }: { canVote: boolean; prioritizeRecentLikes?: boolean; filters?: MemeFilters; captionId?: string; layout?: 'list' | 'grid'; browsePath?: MemeBrowsePath }) {
  const supabase = createClient(await cookies());
  const newestCaptions = () => supabase.from('ai_generations').select('id,situation,caption,style,created_at,image_path').order('created_at', { ascending: false }).limit(pageSize);
  let data: Caption[] | null = null;
  let error: { code?: string } | null = null;
  let hasMore = false;

  if (captionId) {
    const result = await supabase.from('ai_generations').select('id,situation,caption,style,created_at,image_path').eq('id', captionId).maybeSingle();
    if (!result.error && !result.data) notFound();
    data = result.data ? [result.data as Caption] : null;
    error = result.error;
  } else if (filters) {
    let query = supabase
      .from('ai_generations')
      .select('id,situation,caption,style,created_at,image_path')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    const topicFilter = memeTopicFilter(filters.topic);
    if (topicFilter) query = query.or(topicFilter);
    if (filters.style !== 'all') query = query.eq('style', filters.style);
    if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00.000Z`);
    if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59.999999Z`);
    const offset = (filters.page - 1) * pageSize;
    const result = await query.range(offset, offset + pageSize);
    data = (result.data?.slice(0, pageSize) ?? null) as Caption[] | null;
    error = result.error;
    hasMore = (result.data?.length ?? 0) > pageSize;
  } else {
    const result = prioritizeRecentLikes
      ? await supabase.rpc('ranked_caption_feed')
      : await newestCaptions();
    data = result.data as Caption[] | null;
    error = result.error;
    if (prioritizeRecentLikes && error && ['PGRST202', '42883'].includes(error.code ?? '')) {
      console.warn('[caption-feed] Ranking function is missing. Apply database/ranked-caption-feed.sql; showing newest posts instead.');
      const fallback = await newestCaptions();
      data = fallback.data as Caption[] | null;
      error = fallback.error;
    }
  }

  if (error) {
    console.error('[caption-feed] Could not load captions', { code: error.code });
    return <p role="status" className="rounded-lg border border-[var(--border)] p-5">Captions are unavailable right now. Please try again later.</p>;
  }
  const captions: Caption[] = data ?? [];
  if (!captions.length) return <div className="app-surface rounded-2xl border border-[var(--border)] p-6"><h3 className="text-xl font-bold">No memes found</h3><p className="my-3 text-[var(--muted)]">{browsePath === '/' ? 'Try a different topic.' : 'Try a different topic, meme type, or date range.'}</p><Link href={memeHref({ topic: 'all', style: 'all', from: '', to: '', page: 1 }, browsePath)} className="font-bold underline">{browsePath === '/' ? 'Clear topic' : 'Clear search filters'}</Link></div>;
  const ids = captions.map(c => c.id);
  const { data: scores, error: scoreError } = await supabase.rpc('caption_vote_counts', { generation_ids: ids });
  const { data: votes, error: voteError } = canVote ? await supabase.from('caption_votes').select('generation_id,value').in('generation_id',ids) : { data: [], error: null };
  if (scoreError || voteError) return <p role="status">Voting information could not be loaded. Please refresh before rating.</p>;
  const countMap = new Map<string, { likes: number; dislikes: number }>((scores ?? []).map((r: {generation_id:string;likes:number;dislikes:number}) => [r.generation_id, { likes: Number(r.likes), dislikes: Number(r.dislikes) }]));
  const voteMap = new Map<string,number>((votes ?? []).map((r: {generation_id:string;value:number}) => [r.generation_id,r.value]));
  const topicLabel = filters ? memeTopics.find(topic => topic.id === filters.topic)?.label : undefined;
  return (
    <>
      <p className="mb-4 text-sm text-[var(--muted)]" aria-live="polite">{filters ? `Page ${filters.page} · ${captions.length} meme${captions.length === 1 ? '' : 's'}${topicLabel ? ` about ${topicLabel}` : ' shown'}` : captionId ? 'Published caption' : 'Latest memes'}</p>
      <div className={layout === 'grid' ? 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-5'}>{captions.map(c => <CaptionCard key={`${c.id}-${countMap.get(c.id)?.likes}-${countMap.get(c.id)?.dislikes}-${voteMap.get(c.id)}`} caption={c} imageUrl={c.image_path ? captionImageUrl(c.id) : undefined} likes={countMap.get(c.id)?.likes ?? 0} dislikes={countMap.get(c.id)?.dislikes ?? 0} myVote={voteMap.get(c.id) ?? 0} canVote={canVote} compact={layout === 'grid'}/>)}</div>
      {filters && (filters.page > 1 || hasMore) && (
        <nav aria-label="Meme search result pages" className="mt-7 flex items-center justify-between gap-4">
          {filters.page > 1 ? <Link href={pageHref(filters, filters.page - 1, browsePath)} className="min-h-11 content-center rounded-lg border border-[var(--border)] px-4 font-semibold">← Newer memes</Link> : <span />}
          <span className="text-sm text-[var(--muted)]">Page {filters.page}</span>
          {hasMore ? <Link href={pageHref(filters, filters.page + 1, browsePath)} className="min-h-11 content-center rounded-lg border border-[var(--border)] px-4 font-semibold">Older memes →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
