/* search.js: find a query in a document's text, line by line.
 *
 * Plain, case-insensitive substring search. Each result is one line: its
 * number, a short excerpt around the first match with the match's offsets in
 * that excerpt, and `occurrence`, how many matches come before it in the file
 * (so a click can step in-document find to roughly the same place). */

import { matchFilename } from './filter.js';

const BEFORE = 28;
const AFTER = 64;

function excerpt(line, match) {
  let from = 0;
  while (from < match.start && /\s/.test(line[from])) from++;
  let start = Math.max(from, match.start - BEFORE);
  const end = Math.min(line.length, match.end + AFTER);
  let text = line.slice(start, end);
  let offset = start;
  if (start > from) { text = `…${text}`; offset -= 1; }
  if (end < line.length) text += '…';
  return { text, start: match.start - offset, end: match.end - offset };
}

export function searchText(text, query, limit = Infinity) {
  const results = [];
  if (!query) return results;
  const folded = query.toLowerCase();
  const lines = text.split('\n');
  let before = 0;
  for (let i = 0; i < lines.length && results.length < limit; i++) {
    const lower = lines[i].toLowerCase();
    let at = lower.indexOf(folded);
    if (at < 0) continue;
    const match = matchFilename(lines[i], query);
    if (match) results.push({ line: i + 1, occurrence: before, ...excerpt(lines[i], match) });
    while (at >= 0) { before++; at = lower.indexOf(folded, at + folded.length); }
  }
  return results;
}
