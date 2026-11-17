import { styles, type HumorStyle } from './ai/captions';

export const memeTopics = [
  { id: 'midterms', label: 'Midterms', query: 'midterm OR exam OR finals' },
  { id: 'butler', label: 'Butler', query: 'butler' },
  { id: 'dorm-life', label: 'Dorm life', query: 'dorm OR roommate OR residence' },
  { id: 'dining-hall', label: 'Dining hall', query: 'dining OR cafeteria OR Ferris OR "John Jay"' },
  { id: 'subway', label: 'Subway', query: 'subway OR train OR MTA' },
  { id: 'coffee', label: 'Coffee', query: 'coffee OR caffeine OR espresso OR latte' },
  { id: 'study-groups', label: 'Study groups', query: '"study group" OR "study buddy" OR "study buddies"' },
  { id: 'professors', label: 'Professors', query: 'professor OR lecture OR syllabus' },
] as const;

export type MemeTopic = typeof memeTopics[number]['id'];
export type MemeBrowsePath = '/' | '/meme';
export type MemeFilters = {
  topic: MemeTopic | 'all';
  style: HumorStyle | 'all';
  from: string;
  to: string;
  page: number;
};

export type MemeSearchParams = Record<string, string | string[] | undefined>;

export function validMemeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseMemeFilters(params: MemeSearchParams): { filters: MemeFilters; errors: string[] } {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';
  const errors: string[] = [];
  const rawTopic = first(params.topic);
  const rawStyle = first(params.style);
  const rawPage = first(params.page);
  const filters: MemeFilters = { topic: 'all', style: 'all', from: first(params.from), to: first(params.to), page: 1 };

  if (rawTopic && rawTopic !== 'all') {
    if (memeTopics.some(topic => topic.id === rawTopic)) filters.topic = rawTopic as MemeTopic;
    else errors.push('Unknown topic; showing all topics.');
  }
  if (rawStyle && rawStyle !== 'all') {
    if (styles.includes(rawStyle as HumorStyle)) filters.style = rawStyle as HumorStyle;
    else errors.push('Unknown meme type; showing all types.');
  }
  for (const key of ['from', 'to'] as const) {
    if (filters[key] && !validMemeDate(filters[key])) {
      errors.push(`The ${key === 'from' ? 'start' : 'end'} date is invalid and was ignored.`);
      filters[key] = '';
    }
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    errors.push('The start date must be on or before the end date.');
    filters.from = '';
    filters.to = '';
  }
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  if (Number.isSafeInteger(page) && page >= 1 && page <= 10_000) filters.page = page;
  return { filters, errors };
}

export function memeHref(filters: MemeFilters, browsePath: MemeBrowsePath = '/meme'): string {
  const params = new URLSearchParams();
  if (browsePath === '/') params.set('view', 'feed');
  if (filters.topic !== 'all') params.set('topic', filters.topic);
  if (filters.style !== 'all') params.set('style', filters.style);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query ? `${browsePath}?${query}` : browsePath;
}

/** Only fixed catalog queries reach PostgREST's raw OR filter. */
export function memeTopicFilter(topicId: MemeFilters['topic']): string | null {
  const topic = memeTopics.find(item => item.id === topicId);
  if (!topic) return null;
  const query = JSON.stringify(topic.query);
  return `caption.wfts(english).${query},situation.wfts(english).${query}`;
}

export function visibleMemeTopics(widths: readonly number[], available: number, gap: number): number {
  let used = 0;
  let count = 0;
  for (const width of widths.slice(0, 5)) {
    const next = used + (count ? gap : 0) + width;
    if (next > available) break;
    used = next;
    count++;
  }
  return count;
}
