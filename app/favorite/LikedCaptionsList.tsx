'use client';

import { useState } from 'react';
import Link from 'next/link';
import CaptionCard, { type Caption } from '../components/CaptionCard';

type LikedCaption = {
  caption: Caption;
  likes: number;
  dislikes: number;
  imageUrl?: string;
};

export default function LikedCaptionsList({ initialCaptions }: { initialCaptions: LikedCaption[] }) {
  const [captions, setCaptions] = useState(initialCaptions);

  if (!captions.length) {
    return (
      <section className="app-surface rounded-2xl border border-[var(--border)] p-6 text-center">
        <h2 className="text-xl font-bold">No liked memes yet</h2>
        <p className="my-3 text-[var(--muted)]">Tap “↑ Funny” on a meme and it’ll show up here.</p>
        <Link href="/" className="font-bold underline">Browse captions</Link>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {captions.map(({ caption, likes, dislikes, imageUrl }) => (
        <CaptionCard
          key={caption.id}
          caption={caption}
          likes={likes}
          dislikes={dislikes}
          myVote={1}
          canVote
          imageUrl={imageUrl}
          onVoteChange={(value) => {
            if (value !== 1) setCaptions((current) => current.filter((item) => item.caption.id !== caption.id));
          }}
        />
      ))}
    </div>
  );
}
