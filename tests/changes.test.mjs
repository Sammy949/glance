import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffBlocks } from '../src/changes.js';

const diff = (before, after) => {
  const { changed, removed } = diffBlocks(before, after);
  return { changed: [...changed].sort((x, y) => x - y), removed: [...removed].sort((x, y) => x - y) };
};

test('identical and empty versions have no changes', () => {
  assert.deepEqual(diff(['# a', 'b'], ['# a', 'b']), { changed: [], removed: [] });
  assert.deepEqual(diff([], []), { changed: [], removed: [] });
});

test('an edited block is the only one marked', () => {
  assert.deepEqual(diff(['# a', 'b', 'c'], ['# a', 'b2', 'c']), { changed: [1], removed: [] });
});

test('inserted and appended blocks are marked', () => {
  assert.deepEqual(diff(['a', 'c'], ['a', 'b', 'c']), { changed: [1], removed: [] });
  assert.deepEqual(diff(['a'], ['a', '## new', 'text']), { changed: [1, 2], removed: [] });
  assert.deepEqual(diff([], ['a', 'b']), { changed: [0, 1], removed: [] });
});

test('a deletion marks the place it was, including the end', () => {
  assert.deepEqual(diff(['a', 'b', 'c'], ['a', 'c']), { changed: [], removed: [1] });
  assert.deepEqual(diff(['a', 'b', 'c'], ['a', 'b']), { changed: [], removed: [2] });
  assert.deepEqual(diff(['a', 'b'], []), { changed: [], removed: [0] });
});

test('a replaced block counts as changed, not removed', () => {
  assert.deepEqual(diff(['a', 'b', 'c'], ['a', 'x', 'c']), { changed: [1], removed: [] });
});

test('a moved block is marked where it lands', () => {
  assert.deepEqual(diff(['a', 'b', 'c', 'd'], ['a', 'c', 'd', 'b']), { changed: [3], removed: [1] });
});

test('repeated blocks still diff sensibly', () => {
  assert.deepEqual(diff(['x', 'x', 'x'], ['x', 'y', 'x', 'x']), { changed: [1], removed: [] });
});

test('an oversized middle falls back to marking all of it', () => {
  const before = Array.from({ length: 3000 }, (_, i) => `old ${i}`);
  const after = ['keep', ...Array.from({ length: 3000 }, (_, i) => `new ${i}`), 'tail'];
  const { changed, removed } = diffBlocks(['keep', ...before, 'tail'], after);
  assert.equal(changed.size, 3000);
  assert.equal(removed.size, 0);
  assert.ok(changed.has(1) && changed.has(3000) && !changed.has(0) && !changed.has(3001));
});
