/* Case-insensitive filename matching, returning original string offsets. */
export function matchFilename(name, query) {
  if (!query) return { start: 0, end: 0 };
  // Some Unicode characters expand when lowercased. Map back to source offsets
  // so highlighting never slices the wrong character after such an expansion.
  let folded = '';
  const offsets = [];
  let offset = 0;
  for (const char of name) {
    const lower = char.toLowerCase();
    for (let i = 0; i < lower.length; i++) offsets.push({ start: offset, end: offset + char.length });
    folded += lower;
    offset += char.length;
  }
  const start = folded.indexOf(query.toLowerCase());
  return start < 0 ? null : { start: offsets[start].start, end: offsets[start + query.toLowerCase().length - 1].end };
}
