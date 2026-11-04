import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectModel, type ModelCatalog } from '../lib/ai/models';

const catalog: ModelCatalog = {
  models: [
    { id: 'primary', name: 'Primary', model_id: 'gemini-primary', provider: 'gemini' },
    { id: 'alternate', name: 'Alternate', model_id: 'gemini-alternate', provider: 'gemini' },
  ],
  defaults: { admin_panel: 'primary', humor_project: 'alternate' },
};

test('each app resolves its own default while an explicit choice overrides it', () => {
  assert.equal(selectModel(catalog, 'admin_panel', null)?.model_id, 'gemini-primary');
  assert.equal(selectModel(catalog, 'humor_project', '')?.model_id, 'gemini-alternate');
  assert.equal(selectModel(catalog, 'humor_project', 'primary')?.model_id, 'gemini-primary');
});

test('unregistered, deleted, missing defaults and non-string models are rejected', () => {
  for (const value of ['deleted', 'gemini-primary', {}, 42]) assert.equal(selectModel(catalog, 'humor_project', value), undefined);
  assert.equal(selectModel({ ...catalog, defaults: {} }, 'humor_project', ''), undefined);
  assert.equal(selectModel({ ...catalog, models: [] }, 'admin_panel', ''), undefined);
});
