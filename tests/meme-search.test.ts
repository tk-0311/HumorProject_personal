import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memeHref, memeTopicFilter, memeTopics, parseMemeFilters, validMemeDate, visibleMemeTopics } from '../lib/meme-search';

test('no selected topic or type means the complete feed and a clean URL', () => {
  const { filters, errors } = parseMemeFilters({});
  assert.deepEqual(filters, { topic: 'all', style: 'all', from: '', to: '', page: 1 });
  assert.deepEqual(errors, []);
  assert.equal(memeHref(filters), '/meme');
  assert.equal(memeTopicFilter(filters.topic), null);
});

test('filter URLs preserve topic, type, UTC dates and pagination', () => {
  const { filters } = parseMemeFilters({ topic: ['coffee', 'butler'], style: 'dry', from: '2026-11-01', to: '2026-11-17', page: '3' });
  assert.equal(memeHref(filters), '/meme?topic=coffee&style=dry&from=2026-11-01&to=2026-11-17&page=3');
  assert.deepEqual(parseMemeFilters(Object.fromEntries(new URL(memeHref(filters), 'https://example.test').searchParams)).filters, filters);
  assert.equal(memeHref({ ...filters, topic: 'all', style: 'all', page: 1 }), '/meme?from=2026-11-01&to=2026-11-17');
});

test('home topic navigation, clearing and pagination stay on the home feed', () => {
  const { filters } = parseMemeFilters({ topic: 'coffee', page: '2' });
  assert.equal(memeHref(filters, '/'), '/?view=feed&topic=coffee&page=2');
  assert.equal(memeHref({ ...filters, page: 1 }, '/'), '/?view=feed&topic=coffee');
  assert.equal(memeHref({ ...filters, topic: 'all', page: 1 }, '/'), '/?view=feed');
  assert.equal(memeHref(filters), '/meme?topic=coffee&page=2');
});

test('invalid topics, types, dates and oversized pages cannot become query filters', () => {
  const { filters, errors } = parseMemeFilters({ topic: 'coffee,caption.not.is.null', style: 'anything', from: '2026-02-30', to: 'tomorrow', page: '999999999999999999999' });
  assert.deepEqual(filters, { topic: 'all', style: 'all', from: '', to: '', page: 1 });
  assert.equal(errors.length, 4);
  assert.equal(validMemeDate('2024-02-29'), true);
  assert.equal(validMemeDate('2026-02-29'), false);
  assert.equal(validMemeDate('2026-11-17T00:00:00Z'), false);
  const inverted = parseMemeFilters({ from: '2026-11-17', to: '2026-11-01', topic: 'butler' });
  assert.equal(inverted.filters.topic, 'butler');
  assert.equal(inverted.filters.from, '');
  assert.equal(inverted.filters.to, '');
  assert.equal(inverted.errors.length, 1);
  for (const page of ['0', '-1', '1.5', '10001', 'Infinity']) assert.equal(parseMemeFilters({ page }).filters.page, 1);
});

test('every topic searches caption and situation using a fixed, escaped full-text query', () => {
  for (const topic of memeTopics) {
    assert.equal(memeTopicFilter(topic.id), `caption.wfts(english).${JSON.stringify(topic.query)},situation.wfts(english).${JSON.stringify(topic.query)}`);
  }
  assert.match(memeTopicFilter('midterms')!, /midterm OR exam OR finals/);
  assert.ok(memeTopicFilter('study-groups')!.includes('\\"study group\\"'));
  assert.equal(memeTopicFilter('untrusted' as 'all'), null);
});

test('the topic row leaves extra topics for More even on wide screens and keeps catalog order', () => {
  const widths = [90, 80, 100, 110, 85, 85, 130, 120];
  const original = [...widths];
  assert.equal(visibleMemeTopics(widths, 2000, 8), 5);
  assert.equal(visibleMemeTopics(widths, 180, 8), 2);
  assert.equal(visibleMemeTopics(widths, 150, 8), 1);
  assert.equal(visibleMemeTopics(widths, 50, 8), 0);
  assert.deepEqual(widths, original);
  assert.deepEqual(memeTopics.map(topic => topic.id), ['midterms', 'butler', 'dorm-life', 'dining-hall', 'subway', 'coffee', 'study-groups', 'professors']);
});
