import test from 'node:test';
import assert from 'node:assert/strict';
import { describeGeminiError, shouldFallbackGeminiModel } from '../lib/ai/gemini-error';

test('keeps the provider rejection detail and distinguishes configuration failures', () => {
  const result = describeGeminiError(400, { error: {
    status: 'INVALID_ARGUMENT', message: 'API key not valid.',
    details: [{ reason: 'API_KEY_INVALID', metadata: { secret: 'never-log-me' } }],
  } }, 'secret');
  assert.match(result.message, /API key configuration/);
  assert.equal(result.diagnostic.googleStatus, 'INVALID_ARGUMENT');
  assert.equal(result.diagnostic.reason, 'API_KEY_INVALID');
  assert.equal(result.diagnostic.detail, 'API key not valid.');
  assert.ok(!JSON.stringify(result).includes('never-log-me'));
  assert.match(describeGeminiError(404, null, '').message, /model is unavailable/);
  assert.match(describeGeminiError(403, null, '').message, /permission/);
  assert.match(describeGeminiError(429, null, '').message, /quota/);
  assert.match(describeGeminiError(503, null, '').message, /temporarily unavailable/);
});

test('redacts credentials and inline image data before logging, and bounds output', () => {
  const key = 'private+key/with=symbols';
  const message = `${key}\n${encodeURIComponent(key)} https://example.test?key=another-secret&ok=1 AIzaOtherKey ${'A'.repeat(200)} ${'more '.repeat(200)}`;
  const result = describeGeminiError(400, { error: { message } }, key);
  const text = result.diagnostic.detail;
  for (const secret of [key, encodeURIComponent(key), 'another-secret', 'AIzaOtherKey', 'A'.repeat(200)]) {
    assert.ok(!text.includes(secret));
  }
  assert.ok(!text.includes('\n'));
  assert.ok(text.length <= 600);
  assert.ok(!result.message.includes('example.test'));
});

test('handles empty, non-JSON, or malformed error bodies without hiding HTTP status', () => {
  for (const body of [null, 'gateway error', {}, { error: [] }, { error: { message: {}, details: {} } }]) {
    const result = describeGeminiError(502, body, '');
    assert.equal(result.diagnostic.httpStatus, 502);
    assert.equal(result.diagnostic.detail, '');
  }
});

test('falls back only for temporary Gemini service unavailability', () => {
  assert.equal(shouldFallbackGeminiModel(503, 'UNAVAILABLE'), true);
  assert.equal(shouldFallbackGeminiModel(503, ''), true);
  assert.equal(shouldFallbackGeminiModel(429, 'RESOURCE_EXHAUSTED'), false);
  assert.equal(shouldFallbackGeminiModel(400, 'INVALID_ARGUMENT'), false);
});
