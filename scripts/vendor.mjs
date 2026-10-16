/* vendor.mjs — download pinned runtime deps into vendor/ so the app never
 * touches a CDN at runtime (instant startup, fully offline, desktop-safe).
 * Zero npm deps; run on demand when bumping versions:
 *   node scripts/vendor.mjs
 *
 * JS comes from esm.sh as self-contained ES modules (?bundle inlines deps).
 * esm.sh serves a small re-export wrapper at the bare URL; we follow it to the
 * real build file and verify the result has no external imports left.
 * CSS/fonts come from jsdelivr as raw npm files; KaTeX css is rewritten to
 * woff2-only and its fonts downloaded alongside. Mermaid is the chunked ESM
 * build from jsdelivr, so a diagram loads only the code its type needs.
 *
 * Refresh one group with --only=core or --only=mermaid. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor');
fs.mkdirSync(path.join(OUT, 'katex', 'fonts'), { recursive: true });

const ESM_MODULES = [
  ['markdown-it.js', 'markdown-it@14'],
  ['dompurify.js', 'dompurify@3'],
  ['markdown-it-emoji.js', 'markdown-it-emoji@3'],
  ['markdown-it-footnote.js', 'markdown-it-footnote@4'],
  ['markdown-it-deflist.js', 'markdown-it-deflist@3'],
  ['markdown-it-task-lists.js', 'markdown-it-task-lists@2'],
  ['markdown-it-katex.js', '@traptitech/markdown-it-katex@3'],
  ['markdown-it-anchor.js', 'markdown-it-anchor@9'],
  ['highlight.js', 'highlight.js@11/lib/common'],
];

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchBin(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/* Follow esm.sh's re-export wrapper to the actual self-contained build. */
async function fetchEsm(spec) {
  const base = 'https://esm.sh';
  let code = await fetchText(`${base}/${spec}?bundle&target=es2022`);
  const refs = [...code.matchAll(/from\s*"(\/[^"]+)"/g)].map((m) => m[1]);
  if (refs.length && code.length < 4000) {
    // wrapper: all refs point at the same build file
    const build = refs.find((r) => /\.m?js$/.test(r));
    if (build) code = await fetchText(base + build);
  }
  return code;
}

const MERMAID = 'mermaid@12.1.0';

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const want = (group) => !only || only === group;

let failed = 0;

for (const [file, spec] of want('core') ? ESM_MODULES : []) {
  try {
    let code = await fetchEsm(spec);
    // esm.sh leaves a node process polyfill import in some builds (used only
    // for process.env checks) — shim it inline so the module is standalone.
    code = code.replace(
      /import\s+([\w$]+)\s+from\s*"\/node\/process\.mjs";?/g,
      'var $1={env:{NODE_ENV:"production"}};'
    ).replace(/import\s*"\/node\/process\.mjs";?/g, '');
    const externals = [...code.matchAll(/(?:from|import)\s*"((?:https?:)?\/[^"]+)"/g)]
      .map((m) => m[1]);
    if (externals.length) {
      console.error(`FAIL ${file}: unresolved external imports:`, externals.slice(0, 5));
      failed++;
      continue;
    }
    fs.writeFileSync(path.join(OUT, file), code);
    console.log(`ok   ${file} (${(code.length / 1024).toFixed(0)}kb) <- ${spec}`);
  } catch (e) {
    console.error(`FAIL ${file}:`, e.message);
    failed++;
  }
}

/* ---- CSS ---- */
const JSD = 'https://cdn.jsdelivr.net/npm';

for (const [file, url] of !want('core') ? [] : [
  ['hljs-github.min.css', `${JSD}/highlight.js@11/styles/github.min.css`],
  ['hljs-github-dark.min.css', `${JSD}/highlight.js@11/styles/github-dark.min.css`],
]) {
  try {
    fs.writeFileSync(path.join(OUT, file), await fetchText(url));
    console.log(`ok   ${file}`);
  } catch (e) { console.error(`FAIL ${file}:`, e.message); failed++; }
}

/* KaTeX css: keep only woff2 sources, then pull the referenced fonts. */
if (want('core')) try {
  let css = await fetchText(`${JSD}/katex@0.16/dist/katex.min.css`);
  css = css.replace(/,url\(fonts\/[^)]+\.(woff|ttf)\) format\("(?:woff|truetype)"\)/g, '');
  fs.writeFileSync(path.join(OUT, 'katex', 'katex.min.css'), css);
  const fonts = [...new Set([...css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
  let done = 0;
  for (const f of fonts) {
    fs.writeFileSync(path.join(OUT, 'katex', f), await fetchBin(`${JSD}/katex@0.16/dist/${f}`));
    done++;
  }
  console.log(`ok   katex/katex.min.css + ${done} woff2 fonts`);
} catch (e) { console.error('FAIL katex:', e.message); failed++; }

/* Mermaid: entry module + its relative chunks (source maps left out). */
if (want('mermaid')) try {
  const meta = JSON.parse(await fetchText(`https://data.jsdelivr.com/v1/packages/npm/${MERMAID}?structure=flat`));
  const files = meta.files.map((f) => f.name.slice('/dist/'.length)).filter((n) =>
    n === 'mermaid.esm.min.mjs' || (n.startsWith('chunks/mermaid.esm.min/') && n.endsWith('.mjs')));
  const dir = path.join(OUT, 'mermaid');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'chunks', 'mermaid.esm.min'), { recursive: true });
  let bytes = 0;
  for (const file of files) {
    const code = (await fetchText(`${JSD}/${MERMAID}/dist/${file}`)).replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');
    const externals = [...code.matchAll(/(?<![\w$.])(?:from|import)\s*\(?\s*"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((spec) => /^(?:https?:|\/|@|[a-z])[\w@/.:-]*$/i.test(spec) && !spec.startsWith('./') && !spec.startsWith('../'));
    if (externals.length) throw new Error(`${file} imports ${externals.slice(0, 3)}`);
    fs.writeFileSync(path.join(dir, file), code);
    bytes += code.length;
  }
  console.log(`ok   mermaid/ (${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)}mb) <- ${MERMAID}`);
} catch (e) { console.error('FAIL mermaid:', e.message); failed++; }

if (failed) { console.error(`\n${failed} item(s) failed`); process.exit(1); }
console.log('\nvendor/ complete');
