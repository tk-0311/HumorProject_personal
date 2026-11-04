import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAPTION_STYLE_ORDER, captionStyleAt, captionChoicesForStyle, captionStyleForKey, parseAllCaptionOptions, validateAllCaptionOptions } from '../lib/ai/caption-choices';
import { buildCaptionStagePrompt, type CaptionPromptChain } from '../lib/ai/prompt-chain';
import { runCaptionChain } from '../lib/ai/caption-chain-runner';
import { buildProviderRequest } from '../lib/ai/ai-provider';
import type { ModelCatalog } from '../lib/ai/model-types';

const grouped = { absurd: ['Absurd one', 'Absurd two', 'Absurd three'], wholesome: ['Wholesome one', 'Wholesome two', 'Wholesome three'], dry: [' Dry one ', 'Dry two', 'Dry three'] };
const expected = ['Dry one', 'Dry two', 'Dry three', ...grouped.wholesome, ...grouped.absurd];
const id = '11111111-1111-4111-8111-111111111111';
const chain: CaptionPromptChain = { executionMode: 'sequential', steps: [
  { title: 'Observe', prompt: 'Describe the image for {{style}}.', modelId: id, includeImage: true },
  { title: 'Write', prompt: 'Write three captions for {{style}}.', modelId: id, includeImage: false },
] };
const catalog: ModelCatalog = { models: [{ id, name: 'Test', provider: 'gemini', model_id: 'test-model' }], defaults: {} };

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

test('one sequential chain generates all three styles with the grouped final contract', async () => {
  let calls = 0;
  const result = await runCaptionChain(catalog, chain, 'all', { mimeType: 'image/png', base64: 'photo' }, async () => 'key', () => {}, async (model, key, stage) => {
    calls++;
    assert.equal(stage.allStyles, true);
    assert.match(stage.prompt, /dry, wholesome, and absurd/);
    if (!stage.final) return 'Visible image description.';
    assert.match(stage.prompt, /Visible image description/);
    assert.match(stage.prompt, /nine captions total/);
    assert.doesNotMatch(stage.prompt, /{{style}}/);
    assert.equal(stage.image, undefined);
    return JSON.stringify({ captions: grouped });
  });
  assert.equal(calls, 2, 'the chain runs once, rather than once for each style');
  assert.deepEqual(result.captions, expected);
  assert.equal(result.model, 'test-model');
  await assert.rejects(runCaptionChain(catalog, chain, 'all', { mimeType: 'image/png', base64: 'photo' }, async () => 'key', () => {}, async () => '{"captions":["only","three","captions"]}'), /unusable captions/);
  assert.match(buildCaptionStagePrompt(chain, 'all', 1), /overrides any different count or format/);
});

test('all structured-output providers require three named groups and validate cardinality', () => {
  type CaptionSchema = { properties: { captions: {
    required: string[]; additionalProperties: boolean;
    properties: Record<typeof CAPTION_STYLE_ORDER[number], { type: string; items: { type: string }; minItems?: number }>;
  } } };
  for (const provider of ['gemini', 'openai', 'grok', 'anthropic'] as const) {
    const request = buildProviderRequest({ id, name: 'Test', model_id: 'model', provider }, 'key', { prompt: 'All styles', final: true, allStyles: true });
    const body = request.body as {
      generationConfig: { responseFormat: { text: { schema: CaptionSchema } } };
      text: { format: { schema: CaptionSchema } };
      response_format: { json_schema: { schema: CaptionSchema } };
      output_config: { format: { schema: CaptionSchema } };
    };
    const schema = provider === 'gemini' ? body.generationConfig.responseFormat.text.schema
      : provider === 'openai' ? body.text.format.schema
      : provider === 'grok' ? body.response_format.json_schema.schema
      : body.output_config.format.schema;
    assert.deepEqual(schema.properties.captions.required, [...CAPTION_STYLE_ORDER]);
    assert.equal(schema.properties.captions.additionalProperties, false);
    for (const style of CAPTION_STYLE_ORDER) {
      assert.equal(schema.properties.captions.properties[style].type, 'array');
      assert.equal(schema.properties.captions.properties[style].items.type, 'string');
      if (provider !== 'anthropic') assert.equal(schema.properties.captions.properties[style].minItems, 3);
      else assert.equal(schema.properties.captions.properties[style].minItems, undefined);
    }
  }
});

