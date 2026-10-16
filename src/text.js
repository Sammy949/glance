/* text.js — keep a file's line endings and BOM intact across edit + save.
 * A <textarea> always normalizes CRLF to LF, so documents are held as LF text
 * with their original encoding details on the side, and re-encoded on save. */

/** Raw file text -> { text (LF, no BOM), eol, bom }. */
export function decodeText(raw) {
  const bom = raw.charCodeAt(0) === 0xfeff;
  const body = bom ? raw.slice(1) : raw;
  const crlf = (body.match(/\r\n/g) || []).length;
  const lf = (body.match(/\n/g) || []).length - crlf;
  return { text: body.replace(/\r\n?/g, '\n'), eol: crlf > lf ? '\r\n' : '\n', bom };
}

/** LF text + the original details -> the exact text to write back. */
export function encodeText(text, { eol = '\n', bom = false } = {}) {
  const body = eol === '\n' ? text : text.replace(/\n/g, eol);
  return bom ? `﻿${body}` : body;
}

/** Read a File/Blob without the browser silently dropping a leading BOM. */
export async function readFileText(file) {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await file.arrayBuffer());
}
