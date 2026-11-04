"use client";

import { useState, type ReactNode } from "react";

export type PostCardProps = {
  name: string;
  profileImage?: string;
  content: string;
  imageSrc?: string;
  imageAlt?: string;
  initialLikes?: number;
  initialLiked?: boolean;
  initialBookmarked?: boolean;
  shareUrl?: string;
  onLikeChange?: (liked: boolean) => void;
  onBookmarkChange?: (bookmarked: boolean) => void;
};

function Icon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {children}
    </svg>
  );
}

/** Requires Tailwind CSS. Initial likes include this user's like, if any.
 * Use key={post.id} when rendering different posts. Callbacks can persist changes.
 */
export default function PostCard({
  name,
  profileImage,
  content,
  imageSrc,
  imageAlt = "Post image",
  initialLikes = 0,
  initialLiked = false,
  initialBookmarked = false,
  shareUrl,
  onLikeChange,
  onBookmarkChange,
}: PostCardProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const likes = Math.max(0, initialLikes + Number(liked) - Number(initialLiked));
  const buttonClass = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:bg-[var(--menu-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]";

  function toggleLike() {
    const next = !liked;
    setLiked(next);
    onLikeChange?.(next);
  }

  function toggleBookmark() {
    const next = !bookmarked;
    setBookmarked(next);
    onBookmarkChange?.(next);
  }

  async function share() {
    setSharing(true);
    setShareStatus("");
    try {
      const url = new URL(shareUrl || window.location.href, window.location.href).href;
      if (navigator.share) {
        await navigator.share({ title: `Post by ${name}`, text: content, url });
        setShareStatus("Shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareStatus("Link copied!");
      } else {
        setShareStatus("Sharing is unavailable. Copy the page URL to share.");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setShareStatus("Could not share. Please try again.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <article className="app-surface w-full max-w-[620px] overflow-hidden rounded-[16px] border border-[var(--border)] shadow-[0_10px_35px_rgba(37,41,35,0.06)]">
      <div className="p-5 sm:p-6">
        <header className="mb-7 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {profileImage ? (
              // Standard img allows local and remote URLs without image-host configuration.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileImage} alt={`${name}'s profile`} width={44} height={44}
                className="h-11 w-11 shrink-0 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-bold text-[var(--foreground)]">
                {Array.from(name.trim())[0]?.toUpperCase() || "?"}
              </span>
            )}
            <span className="truncate text-xl font-bold text-[var(--foreground)]">{name}</span>
          </div>

          <button type="button" onClick={toggleLike} aria-pressed={liked}
            aria-label={`${liked ? "Unlike" : "Like"} post, ${likes} likes`}
            className={`${buttonClass} shrink-0 flex-col gap-1 px-2 py-1 ${liked ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}>
            <Icon filled={liked}>
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
            </Icon>
            <span className="text-xl font-medium tabular-nums">{likes}</span>
          </button>
        </header>

        <p className="mb-7 whitespace-pre-wrap break-words text-2xl font-semibold leading-relaxed sm:text-[32px] sm:leading-[1.6]">
          {content}
        </p>

        {imageSrc && (
          <div className="app-surface-border overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt={imageAlt} loading="lazy"
              className="block max-h-[650px] w-full object-contain" />
          </div>
        )}
      </div>

      <footer className="app-surface-border flex min-h-[72px] items-center justify-between gap-3 border-t px-5 py-3 sm:px-6">
        <button type="button" onClick={toggleBookmark} aria-pressed={bookmarked}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark post"}
          className={`${buttonClass} shrink-0 ${bookmarked ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}>
          <Icon filled={bookmarked}>
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1Z" />
          </Icon>
        </button>

        <span role="status" aria-live="polite" className="text-center text-xs text-[var(--muted)]">
          {shareStatus}
        </span>

        <button type="button" onClick={share} disabled={sharing} aria-label="Share post"
          className={`${buttonClass} shrink-0 disabled:cursor-wait disabled:opacity-50`}>
          <Icon>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
          </Icon>
        </button>
      </footer>
    </article>
  );
}
