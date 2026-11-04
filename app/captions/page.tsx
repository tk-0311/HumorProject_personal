import Link from 'next/link';
import { cookies } from 'next/headers';
import { styles, type HumorStyle } from '@/lib/ai/captions';
import { createClient } from '@/utils/supabase/server';
import NavBar from '@/app/components/NavBar';
import CaptionFeed from '@/app/components/CaptionFeed';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function CaptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawStyle = firstValue(params.style);
  const rawFrom = firstValue(params.from);
  const rawTo = firstValue(params.to);
  const rawPage = firstValue(params.page);
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 10_000 ? parsedPage : 1;
  const filterErrors: string[] = [];

  let style: HumorStyle | 'all' = 'all';
  if (rawStyle && rawStyle !== 'all') {
    if (styles.includes(rawStyle as HumorStyle)) style = rawStyle as HumorStyle;
    else filterErrors.push('Unknown meme style; showing all styles.');
  }

  let from = rawFrom;
  let to = rawTo;
  if (from && !validDate(from)) {
    filterErrors.push('The start date is invalid and was ignored.');
    from = '';
  }
  if (to && !validDate(to)) {
    filterErrors.push('The end date is invalid and was ignored.');
    to = '';
  }
  if (from && to && from > to) {
    filterErrors.push('The start date must be on or before the end date.');
    from = '';
    to = '';
  }

  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <>
      <NavBar />
      <main className="mx-auto w-full max-w-2xl px-5 py-10">
        <div className="mb-7">
          <p className="text-sm font-bold uppercase tracking-widest text-[var(--accent-strong)]">The community decides</p>
          <h1 className="my-3 text-4xl font-extrabold">Campus chaos, captioned.</h1>
          <p className="mb-5 text-[var(--muted)]">Photos, AI captions, and the community’s favorite picks. Rate the ones that land.</p>
          <Link href={user ? '/new' : '/login'} className="inline-block rounded-lg bg-[var(--foreground)] px-5 py-3 font-bold text-[var(--background)]">{user ? 'Generate a caption' : 'Log in to generate'}</Link>
        </div>

        <form action="/captions" method="get" className="app-surface mb-7 space-y-4 rounded-2xl border border-[var(--border)] p-5">
          <h2 className="text-lg font-bold">Find a meme</h2>
          <div>
            <label htmlFor="meme-style" className="mb-1 block text-sm font-semibold">Meme type</label>
            <select id="meme-style" name="style" defaultValue={style} className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]">
              <option value="all">All styles</option>
              <option value="dry">Dry — painfully relatable</option>
              <option value="absurd">Absurd — a little unhinged</option>
              <option value="wholesome">Wholesome — gentle chaos</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="meme-from" className="mb-1 block text-sm font-semibold">From date (UTC)</label>
              <input id="meme-from" type="date" name="from" defaultValue={from} className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
            </div>
            <div>
              <label htmlFor="meme-to" className="mb-1 block text-sm font-semibold">Through date (UTC)</label>
              <input id="meme-to" type="date" name="to" defaultValue={to} className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[var(--foreground)]" />
            </div>
          </div>
          <p className="text-xs text-[var(--muted)]">Dates use UTC, matching the dates shown on meme cards.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="min-h-11 rounded-lg bg-[var(--foreground)] px-5 font-bold text-[var(--background)]">Search memes</button>
            <Link href="/captions" className="min-h-11 content-center rounded-lg border border-[var(--border)] px-4 text-sm font-semibold">Clear filters</Link>
          </div>
          {filterErrors.length > 0 && <ul role="status" className="list-inside list-disc text-sm text-[var(--muted)]">{filterErrors.map((message) => <li key={message}>{message}</li>)}</ul>}
        </form>

        <CaptionFeed canVote={!!user} filters={{ style, from, to, page }} />
      </main>
    </>
  );
}
