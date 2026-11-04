import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAPTION_STYLE_ORDER, captionStyleAt, captionChoicesForStyle, captionStyleForKey, parseAllCaptionOptions, validateAllCaptionOptions } from '../lib/ai/caption-choices';

const grouped = { absurd: ['Absurd one', 'Absurd two', 'Absurd three'], wholesome: ['Wholesome one', 'Wholesome two', 'Wholesome three'], dry: [' Dry one ', 'Dry two', 'Dry three'] };
const expected = ['Dry one', 'Dry two', 'Dry three', ...grouped.wholesome, ...grouped.absurd];
test('groups are flattened in display order regardless of JSON key order', () => {
  assert.deepEqual(parseAllCaptionOptions(JSON.stringify({ captions: grouped })), expected);
});

test('rejects missing, incomplete, malformed, oversized and duplicate groups', () => {
  for (const captions of [
    null, expected, {}, { ...grouped, dry: ['one', 'two'] }, { ...grouped, dry: ['one', 'two', 'three', 'four'] },
    { ...grouped, dry: ['one', 'two', 3] }, { ...grouped, dry: ['one', 'two', ' '] },
    { ...grouped, dry: ['one', 'two', 'x'.repeat(281)] }, { ...grouped, absurd: [' dry ONE ', 'two', 'three'] },
  ]) assert.throws(() => parseAllCaptionOptions(JSON.stringify({ captions })));
  assert.throws(() => parseAllCaptionOptions('invalid'));
  assert.throws(() => validateAllCaptionOptions(expected.slice(0, 8)));
});

test('each style displays exactly three choices with stable global indices and publication styles', () => {
  for (const [position, style] of CAPTION_STYLE_ORDER.entries()) {
    const choices = captionChoicesForStyle(expected, style);
    assert.equal(choices.length, 3);
    assert.deepEqual(choices.map(choice => choice.index), [position * 3, position * 3 + 1, position * 3 + 2]);
    for (const choice of choices) {
      assert.equal(captionStyleAt(choice.index), style);
      assert.equal(expected[choice.index], choice.caption);
    }
  }
  for (const index of [-1, 9, 0.5, NaN]) assert.equal(captionStyleAt(index), null);
  // A selected wholesome caption retains its identity while the absurd tab is displayed.
  const selected = 4;
  captionChoicesForStyle(expected, 'absurd');
  assert.equal(expected[selected], 'Wholesome two');
  assert.equal(captionStyleAt(selected), 'wholesome');
});

test('tabs support arrow-key wrapping and Home/End navigation', () => {
  assert.equal(captionStyleForKey('dry', 'ArrowLeft'), 'absurd');
  assert.equal(captionStyleForKey('absurd', 'ArrowRight'), 'dry');
  assert.equal(captionStyleForKey('dry', 'ArrowRight'), 'wholesome');
  assert.equal(captionStyleForKey('wholesome', 'Home'), 'dry');
  assert.equal(captionStyleForKey('dry', 'End'), 'absurd');
  assert.equal(captionStyleForKey('dry', 'Tab'), null);
});

