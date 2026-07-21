/* build-web.mjs — copy the static web app into src-tauri/frontend so Tauri
 * bundles a clean tree (no .git, node scripts, or Rust). Runs from the
 * beforeDevCommand / beforeBuildCommand hooks. Paths resolve from this file's
 * location, so it works regardless of the invoking cwd. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // src-tauri/
const root = path.resolve(here, '..');                     // repo root
const out = path.join(here, 'frontend');

const ASSETS = ['index.html', 'manifest.webmanifest', 'sw.js', 'styles', 'src', 'icons', 'vendor'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ASSETS) {
  const from = path.join(root, item);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(out, item), { recursive: true });
}
console.log('[build-web] copied web app ->', path.relative(root, out));
