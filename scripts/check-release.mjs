import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const manifest = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const packageSection = manifest.split(/^\[package\]\s*$/m)[1]?.split(/^\[/m)[0];
const cargoVersion = packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const version = config.version;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid Tauri version: ${version}`);
}
if (cargoVersion !== version) {
  throw new Error(`Version mismatch: Tauri ${version}, Cargo ${cargoVersion ?? 'missing'}`);
}

const tag = process.argv[2];
if (tag && tag !== `v${version}`) {
  throw new Error(`Tag ${tag} does not match app version v${version}`);
}

console.log(`Release version verified: v${version}`);
