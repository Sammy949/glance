/* generate-icons.mjs — render glance's PWA icons with zero dependencies.
 * Draws a rounded blue tile with a white "eye" (an almond lens + pupil) via
 * 4x supersampling, then encodes PNG using Node's built-in zlib.
 *   node scripts/generate-icons.mjs */

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const ACCENT = [3, 102, 214];   // #0366d6 (matches link color)
const WHITE = [255, 255, 255];
const PUPIL = [11, 32, 64];     // deep navy

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

/* ---- drawing ---- */
function draw(size, { maskable = false, plain = false } = {}) {
  const SS = 4, N = size * SS;
  const px = new Uint8ClampedArray(N * N * 4); // transparent

  const cx = N / 2, cy = N / 2;
  const eyeScale = maskable ? 0.72 : 1;   // maskable keeps art in the safe zone
  const corner = maskable ? 0 : N * 0.22; // platform masks maskable icons

  // almond lens = intersection of two vertically offset circles
  const R = N * 0.5 * eyeScale, dy = N * 0.34 * eyeScale;
  const pupilR = N * 0.13 * eyeScale;
  const hlR = N * 0.045 * eyeScale, hlX = cx - N * 0.05 * eyeScale, hlY = cy - N * 0.05 * eyeScale;

  const inRoundRect = (x, y) => {
    const minX = corner, minY = corner, maxX = N - corner, maxY = N - corner;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true; // straight edges band
    if (corner === 0) return x >= 0 && y >= 0 && x < N && y < N;
    const rx = x < minX ? minX : x > maxX ? maxX : x;
    const ry = y < minY ? minY : y > maxY ? maxY : y;
    return (x - rx) ** 2 + (y - ry) ** 2 <= corner * corner;
  };
  const d2 = (x, y, ox, oy) => (x - ox) ** 2 + (y - oy) ** 2;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let c = null;
      if (maskable ? true : inRoundRect(x, y)) c = ACCENT; // background
      const inLens = !plain && d2(x, y, cx, cy - dy) <= R * R && d2(x, y, cx, cy + dy) <= R * R;
      if (inLens) {
        c = WHITE;
        if (d2(x, y, cx, cy) <= pupilR * pupilR) c = PUPIL;
        if (d2(x, y, hlX, hlY) <= hlR * hlR) c = WHITE; // glint
      }
      if (c) {
        const i = (y * N + x) * 4;
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
      }
    }
  }

  // downsample SSxSS -> size (box filter, averages alpha too for AA edges)
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * N + (x * SS + sx)) * 4;
          const af = px[i + 3];
          r += px[i] * af; g += px[i + 1] * af; b += px[i + 2] * af; a += af;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = a / (SS * SS);
    }
  }
  return Buffer.from(out.buffer);
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['favicon-32.png', 32, { plain: true }],
];
for (const [name, size, opts] of targets) {
  const buf = encodePNG(size, size, draw(size, opts));
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('wrote', name, `(${size}x${size}, ${buf.length} bytes)`);
}

/* Tauri icon set (PNGs only; run `cargo tauri icon` to also emit .ico/.icns). */
const TAURI = path.resolve(OUT, '..', 'src-tauri', 'icons');
if (fs.existsSync(path.dirname(TAURI))) {
  fs.mkdirSync(TAURI, { recursive: true });
  const tauriTargets = [
    ['32x32.png', 32],
    ['128x128.png', 128],
    ['[email protected]', 256],
    ['icon.png', 512],
  ];
  for (const [name, size] of tauriTargets) {
    const buf = encodePNG(size, size, draw(size));
    fs.writeFileSync(path.join(TAURI, name), buf);
    console.log('wrote', path.join('src-tauri/icons', name), `(${size}x${size})`);
  }

  // Windows .ico + macOS .icns, required to bundle desktop installers.
  const pngAt = (s) => encodePNG(s, s, draw(s));
  const ico = encodeICO([16, 32, 48, 64, 128, 256].map((s) => ({ size: s, png: pngAt(s) })));
  fs.writeFileSync(path.join(TAURI, 'icon.ico'), ico);
  console.log('wrote src-tauri/icons/icon.ico', `(${ico.length} bytes)`);

  const icns = encodeICNS([['ic07', 128], ['ic08', 256], ['ic09', 512]].map(([type, s]) => ({ type, png: pngAt(s) })));
  fs.writeFileSync(path.join(TAURI, 'icon.icns'), icns);
  console.log('wrote src-tauri/icons/icon.icns', `(${icns.length} bytes)`);
}
