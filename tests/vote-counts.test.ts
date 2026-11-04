import test from 'node:test';
import assert from 'node:assert/strict';
import { updateVoteCounts } from '../lib/ai/vote-counts';

test('counts adding, removing and switching either vote separately', () => {
  for (const previous of [-1, 0, 1]) {
    for (const next of [-1, 0, 1]) {
      const result = updateVoteCounts({ likes: 5, dislikes: 3, vote: previous }, next);
      assert.deepEqual(result, {
        vote: next,
        likes: 5 - Number(previous === 1) + Number(next === 1),
        dislikes: 3 - Number(previous === -1) + Number(next === -1),
      });
    }
  }
  assert.deepEqual(updateVoteCounts({ likes: 1, dislikes: 0, vote: 1 }, -1), { likes: 0, dislikes: 1, vote: -1 });
  assert.deepEqual(updateVoteCounts({ likes: 0, dislikes: 1, vote: -1 }, 0), { likes: 0, dislikes: 0, vote: 0 });
});
