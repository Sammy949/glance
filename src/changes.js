/* changes.js: which top-level blocks changed between two versions of a file.
 *
 * Input is two lists of block sources (one string per top-level block, as
 * pipeline.js records them). Output, in terms of the new list:
 *   changed: indexes of blocks that are new or edited
 *   removed: indexes a deleted block sat just before (new.length = the end)
 *
 * Unchanged runs at both ends are matched first, since agents and editors
 * usually change one region. The middle is diffed by longest common
 * subsequence, unless it's too big, in which case all of it counts as changed. */

const MAX_CELLS = 4_000_000;

export function diffBlocks(before, after) {
  const changed = new Set();
  const removed = new Set();
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  if (!a.length && !b.length) return { changed, removed };

  if (a.length * b.length > MAX_CELLS) {
    for (let j = 0; j < b.length; j++) changed.add(start + j);
    if (!b.length) removed.add(start);
    return { changed, removed };
  }

  // lcs[i][j] = longest common subsequence of a[i..] and b[j..]
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i] === b[j]
        ? lcs[(i + 1) * width + j + 1] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  // Walk the table. A deleted block only gets a "removed" mark when nothing
  // new took its place; a replaced block is already marked as changed.
  let i = 0;
  let j = 0;
  let pendingRemoval = false;
  const settle = () => {
    if (pendingRemoval) removed.add(start + j);
    pendingRemoval = false;
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      settle();
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i * width + j + 1] > lcs[(i + 1) * width + j])) {
      // On a tie, delete first: an insertion right after then reads as a
      // replacement and clears the pending removal.
      changed.add(start + j);
      pendingRemoval = false;
      j++;
    } else {
      pendingRemoval = true;
      i++;
    }
  }
  settle();
  return { changed, removed };
}
