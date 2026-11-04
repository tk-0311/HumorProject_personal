'use client';
import { useEffect, useRef, useState } from 'react';
import type { SavedImage } from '@/lib/storage/saved-images';
import './SavedImagePicker.css';

export default function SavedImagePicker({ selectedId, onSelect, disabled = false, bucket = 'caption-images', excludeId }: { selectedId?: string; onSelect: (image: SavedImage) => void; disabled?: boolean; bucket?: string; excludeId?: string }) {
  const [images, setImages] = useState<SavedImage[]>([]), [offset, setOffset] = useState(0), [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const params = new URLSearchParams({ bucket, offset: String(offset) }); if (excludeId) params.set('exclude', excludeId);
        const response = await fetch(`/api/saved-images?${params}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load saved images.');
        setImages(result.images.slice(0, 10)); setMore(result.hasMore);
      } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [bucket, offset, excludeId, retry]);
  function page(next: number) { setLoading(true); setError(''); setOffset(next); heading.current?.focus(); }
  return <section className="saved-image-picker" aria-label="Choose an existing image" aria-busy={loading}>
    <h3 ref={heading} tabIndex={-1}>Choose an existing image</h3>
    <p>Showing up to 10 saved images at a time.</p>
    {loading ? <p role="status">Loading images…</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); setRetry(value => value + 1); }}>Try again</button></div> : <>
      {!images.length && <p>No available images on this page.</p>}
      <div className="saved-image-picker-grid">{images.map((image, index) => <button key={image.id} type="button" className="saved-image-choice" disabled={disabled} aria-pressed={selectedId === image.id} aria-label={`Choose saved image ${offset + index + 1}`} onClick={() => onSelect(image)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.previewUrl} alt={`Saved photo ${offset + index + 1}`} loading="lazy" />
        <span>{selectedId === image.id ? 'Selected' : image.owned ? 'Your upload' : 'Saved image'}</span>
      </button>)}</div>
      <div className="saved-image-picker-pages"><span role="status">{images.length ? offset + 1 : 0}–{offset + images.length}</span><div>
        <button type="button" disabled={disabled || offset === 0} onClick={() => page(Math.max(0, offset - 10))}>Previous images</button>
        <button type="button" disabled={disabled || !more} onClick={() => page(offset + 10)}>More images</button>
      </div></div>
    </>}
  </section>;
}
