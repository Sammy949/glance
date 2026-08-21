/* generate-icons.mjs — render glance's icons from the Onee master mark, with zero
 * dependencies. Reads icons/icon.svg (the single source of truth), flattens its
 * M/L/C/Z paths, scanline-fills them over the navy tile via 4x supersampling, and
 * encodes PNG (Node zlib), .ico (Windows) and .icns (macOS) by hand.
 *   node scripts/generate-icons.mjs
 *
 * The master SVG is the approved "Onee" artwork: a light face (#dbe2f5) with two
 * dark eyes (#111316) peeking out of a deep-navy (#004883) rounded tile. Edit
 * icons/icon.svg and re-run to regenerate every raster below. */

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');
const MASTER = path.join(OUT, 'icon.svg');
fs.mkdirSync(OUT, { recursive: true });

/* ---- PNG encoding ---- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // no filter
    rgba.copy ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
              : Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---- .ico (Windows) — a container of PNG images ---- */
function encodeICO(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  let offset = 6 + count * 16;
  const entries = [];
  const datas = [];
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 == 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    datas.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

/* ---- .icns (macOS) — typed chunks of PNG data ---- */
function encodeICNS(chunks) {
  const parts = [];
  for (const { type, png } of chunks) {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    parts.push(head, png);
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

/* ---- parse the master SVG into primitives we can rasterize ---- */
function parseMaster(svg) {
  const vb = svg.match(/viewBox="\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/);
  if (!vb) throw new Error('icon.svg: no viewBox');
  const [minX, minY, vbW, vbH] = vb.slice(1).map(Number);

  const rx = Number((svg.match(/<rect[^>]*\brx="([\d.]+)"/) || [])[1] ?? 0);
  const bg = (svg.match(/<rect[^>]*\bfill="(#[0-9a-fA-F]{3,8})"/) || [])[1] || '#000000';

  const tm = svg.match(/transform="translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)\s*scale\(\s*([\d.]+)\s*\)"/);
  const tx = tm ? Number(tm[1]) : 0, ty = tm ? Number(tm[2]) : 0, s = tm ? Number(tm[3]) : 1;

  // Filled paths only (clipPath copies carry no fill), in document / paint order.
  const paths = [];
  const re = /<path\b[^>]*\bd="([^"]+)"[^>]*\bfill="(#[0-9a-fA-F]{3,8})"/g;
  let m;
  while ((m = re.exec(svg))) paths.push({ d: m[1], fill: m[2] });
  if (!paths.length) throw new Error('icon.svg: no filled paths');

  return { minX, minY, vbW, vbH, rx, bg, tx, ty, s, paths };
}

/* Flatten an SVG path (absolute M/L/C/Z only) into closed subpaths of points,
 * expressed in the SVG's local coordinate space (before the group transform). */
function flatten(d, steps = 40) {
  const nums = [];
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const subpaths = [];
  let sub = null, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '';
  let i = 0;
  const num = () => Number(tokens[i++]);
  const cube = (x1, y1, x2, y2, x, y) => {
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
      sub.push({ x: a * cx + b * x1 + c * x2 + e * x, y: a * cy + b * y1 + c * y2 + e * y });
    }
    cx = x; cy = y;
  };
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[MLCZ]/i.test(tk)) { cmd = tk; i++; } // command letter (else: repeated command)
    if (cmd === 'M' || cmd === 'm') {
      const x = num(), y = num();
      if (sub && sub.length) subpaths.push(sub);
      sub = [{ x, y }]; cx = x; cy = y; sx = x; sy = y; cmd = 'L'; // subsequent pairs are implicit L
    } else if (cmd === 'L' || cmd === 'l') {
      const x = num(), y = num(); sub.push({ x, y }); cx = x; cy = y;
    } else if (cmd === 'C' || cmd === 'c') {
      cube(num(), num(), num(), num(), num(), num());
    } else if (cmd === 'Z' || cmd === 'z') {
      i++; if (sub) { sub.push({ x: sx, y: sy }); subpaths.push(sub); sub = null; }
    } else { i++; } // unknown token: skip defensively
  }
  if (sub && sub.length) subpaths.push(sub);
  return subpaths;
}

/* ---- rasterize ---- */
const hexToRGB = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));

function buildScene(master) {
  // Pre-flatten each path once (local coords).
  return master.paths.map((p) => ({ rgb: hexToRGB(p.fill), subs: flatten(p.d) }));
}

function draw(master, scene, size, { maskable = false, center = false, fit = 0.72 } = {}) {
  const SS = 4, N = size * SS;
  const { minX, minY, vbW, vbH, rx, s, tx, ty } = master;
  const bg = hexToRGB(master.bg);
  const px = new Uint8ClampedArray(N * N * 4); // transparent

  // viewBox <-> supersampled-pixel mapping (uniform, y-down, no rotation)
  const unitX = N / vbW, unitY = N / vbH;
  const vbAt = (X, Y) => [minX + (X + 0.5) / unitX, minY + (Y + 0.5) / unitY];

  // Where the artwork lands in viewBox space. Standard icons keep Onee exactly as
  // authored (peeking from the corner, bleeding to the tile edges). The maskable
  // variant re-centers the mark inside the platform safe zone — a corner peek would
  // be cropped by circular adaptive-icon masks — scaling it to `fit` of the tile.
  const cxc = minX + vbW / 2, cyc = minY + vbH / 2; // tile center
  let place;
  if (center) {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const { subs } of scene) for (const sub of subs) for (const c of sub) {
      const vx = tx + s * c.x, vy = ty + s * c.y;
      if (vx < bx0) bx0 = vx; if (vx > bx1) bx1 = vx;
      if (vy < by0) by0 = vy; if (vy > by1) by1 = vy;
    }
    const bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2;
    const he = Math.max((bx1 - bx0) / 2, (by1 - by0) / 2) || 1;
    const K = (Math.min(vbW, vbH) * fit / 2) / he;
    place = (c) => [cxc + (tx + s * c.x - bcx) * K, cyc + (ty + s * c.y - bcy) * K];
  } else {
    place = (c) => [tx + s * c.x, ty + s * c.y];
  }

  // Frame mask: inside the rounded tile (or the whole square for maskable, which
  // the platform masks itself). Rounded rect is centered on the origin here.
  const halfW = vbW / 2, halfH = vbH / 2, r = maskable ? 0 : rx;
  const mask = new Uint8Array(N * N);
  for (let Y = 0; Y < N; Y++) {
    for (let X = 0; X < N; X++) {
      const [vx, vy] = vbAt(X, Y);
      let inside;
      if (maskable) inside = true;
      else {
        const ax = Math.abs(vx), ay = Math.abs(vy);
        if (ax > halfW || ay > halfH) inside = false;
        else if (ax <= halfW - r || ay <= halfH - r) inside = true;
        else inside = (ax - (halfW - r)) ** 2 + (ay - (halfH - r)) ** 2 <= r * r;
      }
      if (inside) {
        mask[Y * N + X] = 1;
        const i = (Y * N + X) * 4;
        px[i] = bg[0]; px[i + 1] = bg[1]; px[i + 2] = bg[2]; px[i + 3] = 255;
      }
    }
  }

  // Map a local path point -> supersampled pixel coords, via its viewBox placement.
  const toPix = (c) => {
    const [vx, vy] = place(c);
    return { x: (vx - minX) * unitX, y: (vy - minY) * unitY };
  };

  // Scanline-fill each path in paint order (face first, eyes on top), clipped to
  // the frame mask — faithfully reproducing the SVG's frame clip-path.
  for (const { rgb, subs } of scene) {
    const edges = [];
    let ymin = Infinity, ymax = -Infinity;
    for (const sub of subs) {
      const pts = sub.map(toPix);
      for (let j = 0; j < pts.length - 1; j++) {
        const a = pts[j], b = pts[j + 1];
        if (a.y === b.y) continue;
        edges.push(a.y < b.y ? [a.x, a.y, b.x, b.y] : [b.x, b.y, a.x, a.y]);
        ymin = Math.min(ymin, a.y, b.y); ymax = Math.max(ymax, a.y, b.y);
      }
    }
    const y0 = Math.max(0, Math.ceil(ymin - 0.5));
    const y1 = Math.min(N - 1, Math.floor(ymax - 0.5));
    for (let Y = y0; Y <= y1; Y++) {
      const sy = Y + 0.5;
      const xs = [];
      for (const [ax, ay, bx, by] of edges) {
        if (sy >= ay && sy < by) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let s2 = 0; s2 + 1 < xs.length; s2 += 2) {
        const xStart = Math.max(0, Math.ceil(xs[s2] - 0.5));
        const xEnd = Math.min(N - 1, Math.floor(xs[s2 + 1] - 0.5));
        for (let X = xStart; X <= xEnd; X++) {
          if (!mask[Y * N + X]) continue; // clip to tile
          const i = (Y * N + X) * 4;
          px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255;
        }
      }
    }
  }

  // downsample SSxSS -> size (alpha-weighted box filter for clean AA edges)
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r0 = 0, g0 = 0, b0 = 0, a0 = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * N + (x * SS + sx)) * 4;
          const af = px[i + 3];
          r0 += px[i] * af; g0 += px[i + 1] * af; b0 += px[i + 2] * af; a0 += af;
        }
      }
      const o = (y * size + x) * 4;
      if (a0 > 0) { out[o] = r0 / a0; out[o + 1] = g0 / a0; out[o + 2] = b0 / a0; }
      out[o + 3] = a0 / (SS * SS);
    }
  }
  return Buffer.from(out.buffer);
}

/* ---- run ---- */
const master = parseMaster(fs.readFileSync(MASTER, 'utf8'));
const scene = buildScene(master);
const render = (size, opts) => encodePNG(size, size, draw(master, scene, size, opts));

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true, center: true, fit: 0.72 }],
  ['favicon-32.png', 32, {}],
];
for (const [name, size, opts] of targets) {
  const buf = render(size, opts);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('wrote', name, `(${size}x${size}, ${buf.length} bytes)`);
}

/* Tauri icon set (PNGs + .ico/.icns to bundle desktop installers). */
const TAURI = path.join(ROOT, 'src-tauri', 'icons');
if (fs.existsSync(path.dirname(TAURI))) {
  fs.mkdirSync(TAURI, { recursive: true });
  const tauriTargets = [['32x32.png', 32], ['128x128.png', 128], ['[email protected]', 256], ['icon.png', 512]];
  for (const [name, size] of tauriTargets) {
    const buf = render(size);
    fs.writeFileSync(path.join(TAURI, name), buf);
    console.log('wrote', path.join('src-tauri/icons', name), `(${size}x${size})`);
  }
  const ico = encodeICO([16, 32, 48, 64, 128, 256].map((sz) => ({ size: sz, png: render(sz) })));
  fs.writeFileSync(path.join(TAURI, 'icon.ico'), ico);
  console.log('wrote src-tauri/icons/icon.ico', `(${ico.length} bytes)`);

  const icns = encodeICNS([['ic07', 128], ['ic08', 256], ['ic09', 512]].map(([type, sz]) => ({ type, png: render(sz) })));
  fs.writeFileSync(path.join(TAURI, 'icon.icns'), icns);
  console.log('wrote src-tauri/icons/icon.icns', `(${icns.length} bytes)`);
}
