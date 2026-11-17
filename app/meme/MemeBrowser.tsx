'use client';

import { useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { memeHref, memeTopics, validMemeDate, visibleMemeTopics, type MemeBrowsePath, type MemeFilters } from '@/lib/meme-search';
import styles from './MemeBrowser.module.css';

const memeTypes = [{ id: 'dry', label: 'Dry' }, { id: 'wholesome', label: 'Wholesome' }, { id: 'absurd', label: 'Absurd' }] as const;
type Refinements = Pick<MemeFilters, 'style' | 'from' | 'to'>;

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>;
}

function shortDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function MemeBrowser({ filters, errors, children, showFilters = true, browsePath = '/meme' }: { filters: MemeFilters; errors: string[]; children: ReactNode; showFilters?: boolean; browsePath?: MemeBrowsePath }) {
  const router = useRouter();
  const [active, setActive] = useOptimistic(filters);
  const [pending, startTransition] = useTransition();
  const [visibleCount, setVisibleCount] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Refinements>({ style: filters.style, from: filters.from, to: filters.to });
  const [validationError, setValidationError] = useState('');
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let alive = true;
    const measure = () => {
      const bar = barRef.current;
      if (!alive || !bar || !measureRef.current || !moreRef.current) return;
      const gap = parseFloat(getComputedStyle(bar).columnGap) || 8;
      const filterWidth = showFilters ? filterRef.current?.getBoundingClientRect().width ?? 0 : 0;
      const available = bar.clientWidth - moreRef.current.getBoundingClientRect().width - filterWidth - (showFilters ? 2 : 1) * gap;
      const widths = Array.from(measureRef.current.children, child => child.getBoundingClientRect().width);
      setVisibleCount(visibleMemeTopics(widths, available, gap));
    };
    const observer = new ResizeObserver(measure);
    if (barRef.current) observer.observe(barRef.current);
    if (filterRef.current) observer.observe(filterRef.current);
    measure();
    void document.fonts.ready.then(measure);
    return () => { alive = false; observer.disconnect(); };
  }, [showFilters]);

  useEffect(() => {
    if (!open || !showFilters) return;
    panelRef.current?.querySelector<HTMLButtonElement>('[data-meme-type]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !filterRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); filterRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open, showFilters]);

  function navigate(next: MemeFilters) {
    setOpen(false);
    startTransition(() => {
      const firstPage = { ...next, page: 1 };
      setActive(firstPage);
      router.push(memeHref(firstPage, browsePath), { scroll: false });
    });
  }

  function toggleFilters() {
    if (!open) { setDraft({ style: active.style, from: active.from, to: active.to }); setValidationError(''); }
    setOpen(!open);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((draft.from && !validMemeDate(draft.from)) || (draft.to && !validMemeDate(draft.to))) {
      setValidationError('Please enter valid dates.'); return;
    }
    if (draft.from && draft.to && draft.from > draft.to) {
      setValidationError('The from date must be on or before the through date.'); return;
    }
    filterRef.current?.focus();
    navigate({ ...active, ...draft });
  }

  function topicButton(topic: typeof memeTopics[number]) {
    return <button key={topic.id} type="button" className={styles.topic} aria-pressed={active.topic === topic.id} disabled={pending} onClick={() => navigate({ ...active, topic: active.topic === topic.id ? 'all' : topic.id })}><span className={styles.check} aria-hidden="true">✓</span>{topic.label}</button>;
  }

  const refinements = [
    ...(active.style !== 'all' ? [{ key: 'style' as const, label: memeTypes.find(type => type.id === active.style)!.label }] : []),
    ...(active.from ? [{ key: 'from' as const, label: `Since ${shortDate(active.from)}` }] : []),
    ...(active.to ? [{ key: 'to' as const, label: `Through ${shortDate(active.to)}` }] : []),
  ];

  return (
    <>
      <section className={styles.search} aria-label="Find a meme">
        <div className={styles.measure} aria-hidden="true"><div ref={measureRef}>{memeTopics.map(topic => <span key={topic.id} className={styles.topic}><span className={styles.check}>✓</span>{topic.label}</span>)}</div></div>
        <div ref={barRef} className={styles.bar}>
          <div className={styles.primaryTopics} role="group" aria-label="Topics">{memeTopics.slice(0, visibleCount).map(topicButton)}</div>
          <button ref={moreRef} className={`${styles.button} ${styles.more}`} type="button" aria-expanded={expanded} aria-controls="more-meme-topics" onClick={() => { setOpen(false); setExpanded(!expanded); }}>{expanded ? 'Less' : 'More…'}</button>
          {showFilters && <div className={styles.filterAnchor}>
            <button ref={filterRef} className={`${styles.button} ${styles.filterToggle}`} type="button" aria-expanded={open} aria-haspopup="dialog" aria-controls="meme-filter-panel" onClick={toggleFilters}>
              <svg className={styles.filterIcon} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /></svg>
              Filters{refinements.length > 0 && <span className={styles.count}>{refinements.length}</span>}
            </button>
            {open && <div ref={panelRef} id="meme-filter-panel" className={styles.popover} role="dialog" aria-modal="false" aria-labelledby="meme-filter-title">
              <div className={styles.popoverHeading}><div><h3 id="meme-filter-title">Refine your search</h3><p>A little more specific.</p></div><button className={styles.close} type="button" aria-label="Close filters" onClick={() => { setOpen(false); filterRef.current?.focus(); }}><CloseIcon /></button></div>
              <form onSubmit={applyFilters}>
                <fieldset className={styles.fieldset}><legend>Meme type</legend><div className={styles.types}>{memeTypes.map(type => <button key={type.id} className={styles.topic} type="button" data-meme-type aria-pressed={draft.style === type.id} onClick={() => setDraft({ ...draft, style: draft.style === type.id ? 'all' : type.id })}><span className={styles.check} aria-hidden="true">✓</span>{type.label}</button>)}</div></fieldset>
                <fieldset className={`${styles.fieldset} ${styles.dates}`}><legend>Posted between</legend><div className={styles.dateGrid}>
                  <label htmlFor="meme-from">From<input id="meme-from" type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
                  <label htmlFor="meme-to">Through<input id="meme-to" type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
                </div><p className={styles.note}>Dates use UTC, matching the dates on meme cards.</p></fieldset>
                {validationError && <p className={styles.error} role="alert">{validationError}</p>}
                <div className={styles.popoverFooter}><button className={styles.textButton} type="button" onClick={() => { setDraft({ style: 'all', from: '', to: '' }); setValidationError(''); }}>Reset</button><button className={`${styles.button} ${styles.apply}`} type="submit" disabled={pending}>Apply filters <span aria-hidden="true">→</span></button></div>
              </form>
            </div>}
          </div>}
        </div>
        <div id="more-meme-topics" className={styles.extraTopics} role="group" aria-label="More topics" hidden={!expanded}>{memeTopics.slice(visibleCount).map(topicButton)}</div>
        {showFilters && refinements.length > 0 && <div className={styles.refinements} aria-label="Active filters">{refinements.map(item => <button key={item.key} className={styles.chip} type="button" disabled={pending} aria-label={`Remove ${item.label} filter`} onClick={() => navigate({ ...active, [item.key]: item.key === 'style' ? 'all' : '' })}>{item.label}<CloseIcon /></button>)}<button className={styles.textButton} type="button" disabled={pending} onClick={() => navigate({ ...active, style: 'all', from: '', to: '' })}>Clear filters</button></div>}
        {errors.length > 0 && <ul className={styles.errors} role="status">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
        <p className="sr-only" role="status" aria-live="polite">{pending ? 'Updating memes…' : ''}</p>
      </section>
      <div aria-busy={pending} className={pending ? styles.pendingResults : undefined}>{children}</div>
    </>
  );
}
