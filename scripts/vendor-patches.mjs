/** markdown-it-anchor 9.2.1 rescans all tokens after each heading, even when
 * linkInsideHeader only changed inline children. Keep the current index when
 * the heading stayed put; retain the full search for other permalink modes.
 * Source: https://github.com/valeriangalliat/markdown-it-anchor/blob/v9.2.1/index.js#L80-L82
 */
export function patchAnchor(code) {
  const needle = 'l=r.indexOf(i)';
  if (code.split(needle).length !== 2) throw new Error('Anchor source changed; review the index-scan patch');
  return code.replace(needle, 'l=r[l]===i?l:r.indexOf(i)');
}
