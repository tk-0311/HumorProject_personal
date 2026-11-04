'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { addCaptionComment, getCaptionComments, setCaptionCommentLike } from '@/app/captions/actions';
import type { CaptionComment } from '@/app/captions/actions';

function newestFirst(comments: CaptionComment[]) {
  const uniqueComments = new Map(comments.map((comment) => [comment.id, comment]));
  return [...uniqueComments.values()].sort((a, b) => {
    const timeDifference = Date.parse(b.created_at) - Date.parse(a.created_at);
    return timeDifference || b.id.localeCompare(a.id);
  });
}

export default function CaptionComments({ captionId, canComment }: { captionId: string; canComment: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState<CaptionComment[]>([]);
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set());
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const loadingRef = useRef(false);
  const pendingLikesRef = useRef(new Set<string>());

  async function loadComments(offset: number) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await getCaptionComments(captionId, offset);
      if (result.error) {
        setError(result.error);
        return;
      }
      const incoming = result.comments ?? [];
      setComments((current) => newestFirst([...incoming, ...current]));
      setHasMore(result.hasMore ?? false);
      setLoaded(true);
    } catch {
      setError('Comments could not be loaded. Please try again.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function toggleComments() {
    if (!open && !loaded) void loadComments(0);
    setOpen((current) => !current);
  }

  async function toggleCommentLike(comment: CaptionComment) {
    if (pendingLikesRef.current.has(comment.id)) return;
    pendingLikesRef.current.add(comment.id);
    setPendingLikes(new Set(pendingLikesRef.current));
    setError('');
    const nextLiked = !comment.likedByMe;
    setComments((current) => current.map((item) => item.id === comment.id
      ? { ...item, likedByMe: nextLiked, likes: Math.max(0, item.likes + (nextLiked ? 1 : -1)) }
      : item));

    try {
      const result = await setCaptionCommentLike(comment.id, nextLiked);
      if (result.error) {
        setComments((current) => current.map((item) => item.id === comment.id
          ? { ...item, likedByMe: comment.likedByMe, likes: Math.max(0, item.likes + (comment.likedByMe ? 1 : -1)) }
          : item));
        setError(result.error);
        return;
      }
      if (result.likes !== undefined) {
        setComments((current) => current.map((item) => item.id === comment.id
          ? { ...item, likedByMe: result.liked ?? nextLiked, likes: result.likes ?? item.likes }
          : item));
      }
    } catch {
      setComments((current) => current.map((item) => item.id === comment.id
        ? { ...item, likedByMe: comment.likedByMe, likes: Math.max(0, item.likes + (comment.likedByMe ? 1 : -1)) }
        : item));
      setError('Your reaction could not be saved. Please try again.');
    } finally {
      pendingLikesRef.current.delete(comment.id);
      setPendingLikes(new Set(pendingLikesRef.current));
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await addCaptionComment(captionId, content);
      if (result.error || !result.comment) {
        setError(result.error ?? 'Your comment could not be saved. Please try again.');
        return;
      }
      setComments((current) => newestFirst([result.comment!, ...current]));
      setContent('');
    } catch {
      setError('Your comment could not be saved. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-5 border-t border-[var(--border)] pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`comments-${captionId}`}
        onClick={toggleComments}
        className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        <span aria-hidden="true">💬</span>
        Comments{loaded ? ` (${comments.length}${hasMore ? '+' : ''})` : ''}
      </button>

      {open && (
        <div id={`comments-${captionId}`} className="mt-3 space-y-4">
          {loading && <p role="status" className="text-sm text-[var(--muted)]">Loading comments…</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          {loaded && comments.length === 0 && <p className="text-sm text-[var(--muted)]">No comments yet. Start the conversation.</p>}
          {comments.length > 0 && (
            <ul className="space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-xl bg-[var(--surface-raised)] p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                    <span className="font-semibold">Community member</span>
                    <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{comment.content}</p>
                  <div className="mt-3 flex justify-end">
                    {canComment ? (
                      <button
                        type="button"
                        aria-label={`${comment.likedByMe ? 'Remove heart from comment' : 'Heart comment'} (${comment.likes} likes)`}
                        aria-pressed={comment.likedByMe}
                        disabled={pendingLikes.has(comment.id)}
                        onClick={() => void toggleCommentLike(comment)}
                        className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-3 text-sm font-semibold transition-colors disabled:opacity-60 ${comment.likedByMe ? 'text-rose-600' : 'text-[var(--muted)] hover:text-rose-600'}`}
                      >
                        <span aria-hidden="true" className="text-lg">{comment.likedByMe ? '♥' : '♡'}</span>
                        <span>{comment.likes}</span>
                      </button>
                    ) : (
                      <Link
                        href="/login"
                        aria-label={`Log in to heart this comment (${comment.likes} likes)`}
                        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-3 text-sm font-semibold text-[var(--muted)]"
                      >
                        <span aria-hidden="true" className="text-lg">♡</span>
                        <span>{comment.likes}</span>
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {hasMore && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadComments(comments.length)}
              className="min-h-10 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Loading…' : 'Load older comments'}
            </button>
          )}

          {canComment ? (
            <form onSubmit={submitComment} className="space-y-3">
              <label htmlFor={`comment-input-${captionId}`} className="sr-only">Add a comment</label>
              <textarea
                id={`comment-input-${captionId}`}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={1000}
                rows={3}
                required
                placeholder="Add a comment…"
                className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--muted)]">{content.length}/1000</span>
                <button
                  type="submit"
                  disabled={submitting || !content.trim()}
                  className="min-h-10 rounded-lg bg-[var(--foreground)] px-4 text-sm font-bold text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Posting…' : 'Post comment'}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]"><Link href="/login" className="font-bold underline">Log in</Link> to add a comment.</p>
          )}
        </div>
      )}
    </section>
  );
}
