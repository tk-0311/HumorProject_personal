import test from 'node:test';
import assert from 'node:assert/strict';
import { imageFileError, MAX_IMAGE_BYTES, matchesImageSignature } from '../lib/ai/images';
import { parseSituation, buildPrompt } from '../lib/ai/captions';
test('rejects empty, oversized, and unsupported uploads', () => {
 assert.ok(imageFileError(0,'image/png'));
 assert.ok(imageFileError(MAX_IMAGE_BYTES+1,'image/jpeg'));
 assert.ok(imageFileError(123,'image/svg+xml'));
 assert.ok(imageFileError(123,'text/html'));
 assert.equal(imageFileError(MAX_IMAGE_BYTES,'image/webp'),null);
});
test('checks MIME against the file header', () => {
 const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13]);
 assert.equal(matchesImageSignature(png,'image/png'),true);
 assert.equal(matchesImageSignature(png,'image/jpeg'),false);
 assert.equal(matchesImageSignature(new TextEncoder().encode('<svg>not a png</svg>'),'image/png'),false);
 assert.equal(matchesImageSignature(new Uint8Array(3),'image/webp'),false);
 assert.equal(matchesImageSignature(new TextEncoder().encode('RIFF1234WEBP'),'image/webp'),true);
});
test('allows image-only and short image context but preserves text-only validation', () => {
 assert.ok(parseSituation('','dry',true));
 assert.ok(parseSituation('Oops','dry',true));
 assert.equal(parseSituation('Oops','dry'),null);
 assert.equal(parseSituation('x'.repeat(501),'dry',true),null);
 assert.equal(parseSituation('','unknown',true),null);
 assert.ok(buildPrompt('Photo','dry',true).includes('attached image as the primary source'));
});
