'use client';
import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { generateCaptionOptions, publishCaptionChoice, type CaptionOptionsState } from './actions';
import { imageFileError } from '@/lib/ai/images';
import SavedImagePicker from '@/app/components/SavedImagePicker';
import type { SavedImage } from '@/lib/storage/saved-images';
import { CAPTION_STYLE_ORDER, CAPTION_STYLE_LABELS, captionChoicesForStyle, captionStyleAt, captionStyleForKey, type CaptionStyle } from '@/lib/ai/caption-choices';
const empty: CaptionOptionsState = { error: '', draftId: '', captions: [] };
export default function GenerationForm({ onPublished }: { onPublished?: () => void } = {}) {
  const router = useRouter();
  const [image, setImage] = useState<File | null>(null);
  const [savedImage, setSavedImage] = useState<SavedImage | null>(null), [showSaved, setShowSaved] = useState(false);
  const [preview, setPreview] = useState('');
  const [activeStyle, setActiveStyle] = useState<CaptionStyle>('dry');
  const [options, setOptions] = useState(empty);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [publishedId, setPublishedId] = useState('');
  const [generating, generateTransition] = useTransition();
  const [publishing, publishTransition] = useTransition();
  const busy = generating || publishing;
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const pickerId = useId();
  const tabs = useRef<Partial<Record<CaptionStyle, HTMLButtonElement | null>>>({});
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);
  function clearOptions() { setOptions(empty); setActiveStyle('dry'); setSelected(null); setPublishedId(''); setError(''); }
  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    clearOptions();
    setSavedImage(null);
    const file = event.target.files?.[0];
    if (!file) { setImage(null); setPreview(''); return; }
    const issue = imageFileError(file.size, file.type);
    if (issue) { setImage(null); setPreview(''); event.target.value = ''; setError(issue); return; }
    setImage(file); setPreview(URL.createObjectURL(file));
  }
  function removeImage() { clearOptions(); setImage(null); setSavedImage(null); setPreview(''); if (input.current) input.current.value = ''; }
  function generate() {
    if (inFlight.current) return;
    if (!image && !savedImage) { setError('Upload a photo or choose a saved image first.'); return; }
    inFlight.current = true;
    clearOptions();
    const form = new FormData(); if (image) form.set('image', image); else if (savedImage) form.set('savedImageId', savedImage.id);
    generateTransition(async () => {
      try { const result = await generateCaptionOptions(form); setOptions(result); setError(result.error); }
      catch { setError('Could not generate captions. Your photo is still selected—please try again.'); }
      finally { inFlight.current = false; }
    });
  }
  function publish() {
    if (inFlight.current || selected === null || !options.draftId || publishedId) return;
    inFlight.current = true;
    setError('');
    publishTransition(async () => {
      try {
        const result = await publishCaptionChoice(options.draftId, selected);
        setError(result.error);
        if (result.id) {
          setPublishedId(result.id);
          if (onPublished) onPublished();
          else router.replace('/');
        }
      }
      catch { setError('Could not confirm publication. Please retry; this will not create a duplicate post.'); }
      finally { inFlight.current = false; }
    });
  }
  return <div className="space-y-7">
    <section aria-labelledby="upload-title" className="app-surface space-y-5 rounded-2xl border border-[var(--border)] p-6">
      <h2 id="upload-title" className="text-xl font-bold">1. Pick your photo</h2>
      <label htmlFor="image" className="block font-semibold">Upload an image</label>
      <input ref={input} id="image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={chooseImage} aria-describedby="image-help" className="block w-full rounded-lg border border-dashed border-[var(--border)] p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:font-semibold file:text-[#252923]"/>
      <p id="image-help" className="text-sm text-[var(--muted)]">JPEG, PNG, or WebP · up to 3 MB. AI will suggest captions based on what’s in the photo.</p>
      <button type="button" disabled={busy} aria-expanded={showSaved} onClick={() => setShowSaved(value => !value)} className="min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-50">{showSaved ? 'Hide saved images' : 'Use an existing image'}</button>
      {showSaved && <SavedImagePicker selectedId={savedImage?.id} disabled={busy} onSelect={selectedImage => { clearOptions(); setSavedImage(selectedImage); setImage(null); setPreview(selectedImage.previewUrl); setShowSaved(false); if (input.current) input.current.value = ''; }} />}
      {preview && <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Photo selected for caption generation" onError={() => { removeImage(); setError('This photo could not be opened. Choose another file.'); }} className="max-h-80 w-full rounded-xl object-contain"/>
        <button type="button" onClick={removeImage} disabled={busy} className="min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-50">Remove photo</button>
      </div>}
      <p className="text-sm text-[var(--muted)]">Get three dry, three wholesome, and three absurd captions. Browse one style at a time.</p>
      <button type="button" onClick={generate} disabled={busy || (!image && !savedImage)} className="min-h-11 rounded-lg bg-[var(--foreground)] px-5 py-3 font-bold text-[var(--background)] disabled:opacity-50">{generating ? 'Finding your flavor of funny…' : options.draftId ? 'Generate new captions' : 'Generate caption options'}</button>
      <p className="text-sm text-[var(--muted)]">Your photo is sent to our AI provider. Only your selected caption is published to the feed. Only successfully generated and saved sets count toward your 10 daily sets (UTC). Failed attempts do not count.</p>
    </section>
    {options.draftId && <section aria-labelledby="choice-title" className="app-surface space-y-5 rounded-2xl border border-[var(--border)] p-6">
      <h2 id="choice-title" className="text-xl font-bold">2. Pick the one that lands</h2>
      <div role="tablist" aria-label="Caption humor style" className="grid grid-cols-3 gap-2">
        {CAPTION_STYLE_ORDER.map(style => <button key={style} ref={element => { tabs.current[style] = element; }} type="button" role="tab" id={`${pickerId}-${style}`} aria-selected={activeStyle === style} aria-controls={`${pickerId}-options`} tabIndex={activeStyle === style ? 0 : -1} disabled={busy || !!publishedId} onClick={() => setActiveStyle(style)} onKeyDown={event => {
          const next = captionStyleForKey(style, event.key);
          if (next) { event.preventDefault(); setActiveStyle(next); tabs.current[next]?.focus(); }
        }} className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-[var(--accent-strong)] disabled:opacity-50 ${activeStyle === style ? 'border-[var(--accent-strong)] bg-[var(--menu-hover)]' : 'border-[var(--border)]'}`}>{CAPTION_STYLE_LABELS[style]}</button>)}
      </div>
      <div role="tabpanel" id={`${pickerId}-options`} aria-labelledby={`${pickerId}-${activeStyle}`}>
        <fieldset disabled={busy || !!publishedId} className="space-y-3"><legend className="mb-3 text-sm text-[var(--muted)]">Choose one of three {activeStyle} captions.</legend>{captionChoicesForStyle(options.captions, activeStyle).map(({ caption, index }) => <label key={index} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${selected === index ? 'border-[var(--accent-strong)] bg-[var(--menu-hover)]' : 'border-[var(--border)]'}`}><input type="radio" name="caption-choice" value={index} checked={selected === index} onChange={() => setSelected(index)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent-strong)]"/><span className="text-lg leading-relaxed">{caption}</span></label>)}</fieldset>
      </div>
      {selected !== null && <div className="rounded-xl border border-[var(--border)] p-4 text-sm" role="status"><p className="mb-1 font-bold">Selected · {CAPTION_STYLE_LABELS[captionStyleAt(selected)!]}</p><p>{options.captions[selected]}</p></div>}
      {!publishedId && <><button type="button" onClick={publish} disabled={busy || selected === null} className="min-h-11 rounded-lg bg-[var(--foreground)] px-5 py-3 font-bold text-[var(--background)] disabled:opacity-50">{publishing ? 'Publishing…' : 'Publish selected caption'}</button><p className="text-sm text-[var(--muted)]">Your photo and chosen caption will be visible in the feed for others to rate.</p></>}
      {publishedId && <div role="status"><p className="font-bold">Published. Let the people decide.</p><Link href={`/captions#caption-${publishedId}`} className="mt-3 inline-block underline">View your photo and caption</Link></div>}
    </section>}
    <p role="status" className="text-sm">{generating ? 'Generating three captions for each humor style…' : publishing ? 'Publishing your selected caption…' : error || (options.draftId && !publishedId ? 'Nine captions are ready. Browse three per style and choose your favorite.' : '')}</p>
  </div>;
}
