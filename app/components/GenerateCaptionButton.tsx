'use client';

import CaptionComposerDialog from './CaptionComposerDialog';
import { useEffect, useRef, useState } from 'react';

export default function GenerateCaptionButton() {
  const primaryLink = useRef<HTMLButtonElement>(null);
  const [showFloating, setShowFloating] = useState(false);
  const [composerAnchor, setComposerAnchor] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    const link = primaryLink.current;
    if (!link) return;
    const observer = new IntersectionObserver(([entry]) => {
      setShowFloating(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    }, { threshold: 0 });
    observer.observe(link);
    return () => observer.disconnect();
  }, []);

  return <>
    <button type="button" ref={primaryLink} onClick={event => setComposerAnchor(event.currentTarget)} aria-haspopup="dialog" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--foreground)] px-5 py-3 font-bold text-[var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]">
      Generate a caption
    </button>
    {showFloating && <button
      type="button"
      onClick={event => setComposerAnchor(event.currentTarget)}
      aria-haspopup="dialog"
      data-composer-placement="center"
      aria-label="Generate a caption"
      title="Generate a caption"
      className="group fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-start overflow-hidden rounded-full border border-[#252923]/20 bg-[var(--accent)] px-[14px] text-[#252923] shadow-lg transition-[width,box-shadow,transform] duration-300 ease-out hover:w-52 hover:scale-[1.02] hover:shadow-xl focus-visible:w-52 focus-visible:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:right-8 sm:bottom-8 sm:h-16 sm:px-[18px]"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-7 w-7 shrink-0 transition-transform duration-300 ease-out group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100"><path d="M12 5v14M5 12h14" /></svg>
      <span className="ml-0 max-w-0 translate-x-1 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-[max-width,margin,opacity,transform] duration-300 ease-out group-hover:ml-2 group-hover:max-w-40 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-40 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none">Generate a caption</span>
    </button>}
    {composerAnchor && <CaptionComposerDialog anchor={composerAnchor} onClose={() => setComposerAnchor(null)} />}
  </>;
}
