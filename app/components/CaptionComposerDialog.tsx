'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import GenerationForm from '../new/GenerationForm';

export default function CaptionComposerDialog({ anchor, onClose }: { anchor: HTMLButtonElement; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    function positionPopover() {
      if (!element) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 16;
      const width = Math.min(640, window.innerWidth - margin * 2);
      if (anchor.dataset.composerPlacement === 'center') {
        element.style.width = `${width}px`;
        element.style.maxHeight = `${window.innerHeight - margin * 2}px`;
        element.style.left = '50%';
        element.style.top = '50%';
        element.style.bottom = 'auto';
        element.style.transform = 'translate(-50%, -50%)';
        return;
      }
      element.style.transform = 'none';
      const below = window.innerHeight - rect.bottom - margin - 12;
      const above = rect.top - margin - 12;
      const opensBelow = below >= Math.min(420, above);
      const height = Math.max(160, opensBelow ? below : above);
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
      element.style.width = `${width}px`;
      element.style.maxHeight = `${Math.min(height, window.innerHeight - margin * 2)}px`;
      element.style.left = `${left}px`;
      element.style.top = opensBelow ? `${Math.max(margin, rect.bottom + 12)}px` : 'auto';
      element.style.bottom = opensBelow ? 'auto' : `${Math.max(margin, window.innerHeight - rect.top + 12)}px`;
    }
    positionPopover();
    if (element && !element.open) element.showModal();
    document.body.style.overflow = 'hidden';
    window.addEventListener('resize', positionPopover);
    return () => {
      window.removeEventListener('resize', positionPopover);
      document.body.style.overflow = previousOverflow;
    };
  }, [anchor]);

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="composer-title"
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}
    className="fixed m-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 text-[var(--foreground)] shadow-2xl backdrop:bg-black/50 sm:p-6">
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent-strong)]">Campus chaos meets AI</p>
        <h2 id="composer-title" className="my-3 text-3xl font-extrabold tracking-tight">Make the moment funny.</h2>
        <p className="text-[var(--muted)]">Upload a photo. Pick your favorite AI caption and share it.</p>
      </div>
      <button type="button" autoFocus onClick={onClose} aria-label="Close caption generator"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-2xl hover:bg-[var(--menu-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-strong)]">×</button>
    </div>
    <GenerationForm onPublished={() => { onClose(); router.refresh(); }} />
  </dialog>;
}
