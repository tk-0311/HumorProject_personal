import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaptionOptions, parseStyle, validCaptionSelection, buildImageCaptionPrompt } from '../lib/ai/caption-options';
test('accepts exactly three distinct trimmed captions', () => {
 assert.deepEqual(parseCaptionOptions('{"captions":[" First ","Second","Third"]}'),['First','Second','Third']);
});
test('rejects incomplete, duplicate, malformed and oversized caption options', () => {
 const inputs: unknown[]=[null,{}, {caption:'one'}, {captions:['one','two']}, {captions:['one','two','three','four']}, {captions:['One',' one ','two']}, {captions:['one',4,'three']}, {captions:['one',' ', 'three']}, {captions:['one','two','x'.repeat(281)]}];
 for(const input of inputs) assert.throws(()=>parseCaptionOptions(JSON.stringify(input)));
 assert.throws(()=>parseCaptionOptions('not JSON'));
});
test('selection accepts only a stored draft id and index zero to eight', () => {
 const id='11111111-1111-4111-8111-111111111111';
 for(const i of [0,1,2,3,4,5,6,7,8]) assert.equal(validCaptionSelection(id,i),true);
 for(const i of [-1,9,1.5,'1',null,NaN,Infinity]) assert.equal(validCaptionSelection(id,i),false);
 assert.equal(validCaptionSelection('arbitrary caption text',0),false);
});
test('prompt is grounded in the image and requires three options', () => {
 assert.equal(parseStyle('dry'),'dry'); assert.equal(parseStyle('unknown'),null);
 assert.ok(buildImageCaptionPrompt('dry').includes('exactly three distinct'));
 assert.ok(buildImageCaptionPrompt('dry').includes('Use the visible photo as your source'));
});
