'use client';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { voteCaption } from '@/app/captions/actions';
import { updateVoteCounts } from '@/lib/ai/vote-counts';
import CaptionComments from './CaptionComments';
export type Caption = { id: string; situation: string; caption: string; style: string; created_at: string; image_path?: string | null };
export default function CaptionCard({ caption, likes, dislikes, myVote, canVote, imageUrl, onVoteChange }: { caption: Caption; likes: number; dislikes: number; myVote: number; canVote: boolean; imageUrl?: string; onVoteChange?: (value: number) => void }) {
  const [current, setCurrent] = useState({ likes, dislikes, vote: myVote });
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  function cast(value: -1 | 1) {
    if (!canVote || inFlight.current) return;
    inFlight.current = true;
    const previous = current;
    const next = current.vote === value ? 0 : value;
    const optimistic = updateVoteCounts(current, next);
    // Show the vote immediately while the authenticated action saves it.
    setCurrent(optimistic);
    startTransition(async () => {
      try {
        const result = await voteCaption(caption.id, next);
        if (result.error) {
          setCurrent(previous);
          return;
        }
        const confirmedVote = result.value ?? next;
        setCurrent({ vote: confirmedVote, likes: result.likes ?? optimistic.likes, dislikes: result.dislikes ?? optimistic.dislikes });
        onVoteChange?.(confirmedVote);
      } catch {
        setCurrent(previous);
      } finally {
        inFlight.current = false;
      }
    });
  }
  return <article id={`caption-${caption.id}`} className="app-surface w-full scroll-mt-6 rounded-2xl border border-[var(--border)] p-5 sm:p-6"><div className="flex justify-between gap-3 text-sm text-[var(--muted)]"><span>AI caption · {caption.style}</span><time dateTime={caption.created_at}>{new Date(caption.created_at).toISOString().slice(0,10)}</time></div>{caption.situation !== 'A photo shared for a caption.' && <p className="mt-4 text-sm text-[var(--muted)]">{caption.situation}</p>}{caption.image_path && <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">{imageUrl && failedImageUrl !== imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl} alt="User-uploaded photo for this AI caption" loading="lazy" onError={() => setFailedImageUrl(imageUrl)} className="max-h-[480px] w-full object-contain"/>
  ) : <div className="p-4 text-sm text-[var(--muted)]"><p>Photo could not load.</p>{imageUrl && <button type="button" onClick={() => setFailedImageUrl(null)} className="mt-2 min-h-11 rounded-lg border border-[var(--border)] px-4 font-semibold">Retry photo</button>}</div>}</div>}<h3 className="my-5 whitespace-pre-wrap break-words text-2xl font-semibold leading-relaxed">{caption.caption}</h3><div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">{canVote ? <>{([1,-1] as const).map(value => <button key={value} disabled={pending} aria-pressed={current.vote === value} aria-label={`${value === 1 ? 'Upvote' : 'Downvote'} caption`} onClick={() => cast(value)} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-bold ${current.vote === value ? 'border-[var(--accent-strong)] bg-[var(--accent)] text-[#252923]' : 'border-[var(--border)]'}`}>{value === 1 ? '↑ Funny' : '↓ Try again'}</button>)}</> : <Link href="/login" className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-bold">Log in to rate</Link>}<div className="ml-auto flex items-center gap-2 text-sm tabular-nums" aria-live="polite" aria-label="Caption vote totals"><span className="rounded-full border border-[#4b641d] bg-[#d9f36a] px-3 py-1 font-bold text-[#20251f] shadow-sm" aria-label={`${current.likes} likes`}>↑ {current.likes} likes</span><span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 font-medium text-[var(--foreground)]" aria-label={`${current.dislikes} dislikes`}>↓ {current.dislikes} dislikes</span></div></div><CaptionComments captionId={caption.id} canComment={canVote}/></article>;
}
