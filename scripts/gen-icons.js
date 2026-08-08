// Generates every icon Murmur needs (tray states, app icon, installer .ico)
// from code, so the repo contains no binary assets and no image libraries.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'generated');
const BUILD = path.join(ROOT, 'build');

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(canvas) {
  const { w, h, data } = canvas;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- tiny canvas

function makeCanvas(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4, 0) };
}

function blendPx(c, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4;
  const da = c.data[i + 3] / 255;
  const sa = a / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  c.data[i] = Math.round((r * sa + c.data[i] * da * (1 - sa)) / oa);
  c.data[i + 1] = Math.round((g * sa + c.data[i + 1] * da * (1 - sa)) / oa);
  c.data[i + 2] = Math.round((b * sa + c.data[i + 2] * da * (1 - sa)) / oa);
  c.data[i + 3] = Math.round(oa * 255);
}

// Rounded rect with 1px antialiased edge, drawn by signed distance.
function fillRoundedRect(c, rx, ry, rw, rh, radius, color) {
  const r = Math.min(radius, rw / 2, rh / 2);
  for (let y = Math.floor(ry) - 1; y <= Math.ceil(ry + rh) + 1; y++) {
    for (let x = Math.floor(rx) - 1; x <= Math.ceil(rx + rw) + 1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const dx = Math.max(rx + r - px, px - (rx + rw - r), 0);
      const dy = Math.max(ry + r - py, py - (ry + rh - r), 0);
      const dist = Math.sqrt(dx * dx + dy * dy) - r;
      const inX = px >= rx && px <= rx + rw;
      const inY = py >= ry && py <= ry + rh;
      let cov;
      if (!inX || !inY) cov = 0;
      else cov = Math.max(0, Math.min(1, 0.5 - dist));
      if (cov > 0) blendPx(c, x, y, [color[0], color[1], color[2], Math.round(color[3] * cov)]);
    }
  }
}

// ---------------------------------------------------------------- the glyph

// Murmur's mark: five waveform bars, the shape the overlay draws when you speak.
const BAR_RATIOS = [0.34, 0.62, 1.0, 0.52, 0.28];

function drawBars(c, cx, cy, unit, color) {
  // unit: height of the tallest bar. Bar width and gap derive from it.
  const bw = Math.max(2, Math.round(unit * 0.14));
  const gap = Math.max(2, Math.round(bw * 0.9));
  const totalW = BAR_RATIOS.length * bw + (BAR_RATIOS.length - 1) * gap;
  let x = cx - totalW / 2;
  for (const ratio of BAR_RATIOS) {
    const bh = Math.max(bw, unit * ratio);
    fillRoundedRect(c, x, cy - bh / 2, bw, bh, bw / 2, color);
    x += bw + gap;
  }
}

const INK = [23, 22, 27, 255];        // panel ink
const AMBER = [240, 164, 75, 255];    // signal amber
const WHITE = [236, 233, 228, 235];   // warm off-white for tray
const BLACK = [0, 0, 0, 255];         // macOS Template images: black + alpha only

function trayIcon(size, color) {
  const c = makeCanvas(size, size);
  drawBars(c, size / 2, size / 2, size * 0.72, color);
  return c;
}

function appIcon(size) {
  const c = makeCanvas(size, size);
  const pad = Math.round(size * 0.04);
  fillRoundedRect(c, pad, pad, size - pad * 2, size - pad * 2, size * 0.22, INK);
  // hairline inner edge, drawn as a slightly smaller translucent ring effect
  fillRoundedRect(c, pad + 1, pad + 1, size - (pad + 1) * 2, size - (pad + 1) * 2, size * 0.21, [46, 44, 53, 60]);
  fillRoundedRect(c, pad + 2, pad + 2, size - (pad + 2) * 2, size - (pad + 2) * 2, size * 0.205, INK);
  drawBars(c, size / 2, size / 2, size * 0.5, AMBER);
  return c;
}

// At list sizes (System Settings, Finder small views) five thin bars on ink
// collapse into a dark blob, so 16 and 32 px get three bolder bars instead.
// A warm light rim and a slightly lifted tile keep the mark visible on dark
// backgrounds too; a near-black tile vanishes into a dark-mode list row
// (found by Labroi in the System Settings privacy list).
function smallAppIcon(size) {
  const c = makeCanvas(size, size);
  const pad = Math.max(1, Math.round(size * 0.03));
  fillRoundedRect(c, pad, pad, size - pad * 2, size - pad * 2, size * 0.26, [236, 233, 228, 110]);
  fillRoundedRect(c, pad + 1, pad + 1, size - (pad + 1) * 2, size - (pad + 1) * 2, size * 0.22, [38, 36, 44, 255]);
  const ratios = [0.55, 1.0, 0.45];
  const unit = size * 0.5;
  const bw = Math.max(2, Math.round(size * 0.11));
  const gap = Math.max(2, Math.round(bw * 0.9));
  const totalW = ratios.length * bw + (ratios.length - 1) * gap;
  let x = size / 2 - totalW / 2;
  for (const r of ratios) {
    const bh = Math.max(bw, unit * r);
    fillRoundedRect(c, x, size / 2 - bh / 2, bw, bh, bw / 2, AMBER);
    x += bw + gap;
  }
  return c;
}

// ---------------------------------------------------------------- ICNS writer

// Modern ICNS: each chunk is an OSType plus a PNG blob. Writing it here, per
// size, keeps small icons legible; electron-builder's auto-conversion just
// downscales one 512 and loses the mark.
function encodeIcns(entries) {
  const chunks = entries.map(({ type, buf }) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(buf.length + 8, 4);
    return Buffer.concat([h, buf]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// ---------------------------------------------------------------- ICO writer

// Modern ICO: each entry is a PNG blob (valid since Windows Vista).
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);  // planes
    e.writeUInt16LE(32, 6); // bit count
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    blobs.push(buf);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

// ---------------------------------------------------------------- main

function main() {
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(BUILD, { recursive: true });

const files = {
  'tray-idle.png': encodePng(trayIcon(32, WHITE)),
  'tray-rec.png': encodePng(trayIcon(32, AMBER)),
  // macOS menu bar variants at 1x and 2x. Idle is a Template image (black,
  // alpha only) so the OS recolors it for light and dark menu bars; the
  // recording state stays amber and non-template, live color for a live state.
  'tray-idle-mac-16.png': encodePng(trayIcon(16, BLACK)),
  'tray-idle-mac-32.png': encodePng(trayIcon(32, BLACK)),
  'tray-rec-mac-16.png': encodePng(trayIcon(16, AMBER)),
  'tray-rec-mac-32.png': encodePng(trayIcon(32, AMBER)),
  // Small sizes use the bold three-bar variant on Windows too, so Explorer
  // lists and the taskbar stay legible, matching the macOS icns.
  'icon-16.png': encodePng(smallAppIcon(16)),
  'icon-32.png': encodePng(smallAppIcon(32)),
  'icon-48.png': encodePng(appIcon(48)),
  'icon-256.png': encodePng(appIcon(256)),
  'icon-512.png': encodePng(appIcon(512)),
};

for (const [name, buf] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), buf);
}

fs.writeFileSync(
  path.join(BUILD, 'icon.ico'),
  encodeIco([
    { size: 256, buf: files['icon-256.png'] },
    { size: 48, buf: files['icon-48.png'] },
    { size: 32, buf: files['icon-32.png'] },
    { size: 16, buf: files['icon-16.png'] },
  ])
);

// macOS app icon: per-size renders, bolder mark at 16/32 so it reads in
// System Settings lists and the Dock. icon.png stays as a fallback.
fs.writeFileSync(path.join(BUILD, 'icon.png'), files['icon-512.png']);
fs.writeFileSync(
  path.join(BUILD, 'icon.icns'),
  encodeIcns([
    { type: 'icp4', buf: encodePng(smallAppIcon(16)) },  // 16
    { type: 'ic11', buf: encodePng(smallAppIcon(32)) },  // 16@2x
    { type: 'icp5', buf: encodePng(smallAppIcon(32)) },  // 32
    { type: 'ic12', buf: encodePng(appIcon(64)) },       // 32@2x
    { type: 'ic07', buf: encodePng(appIcon(128)) },      // 128
    { type: 'ic13', buf: encodePng(appIcon(256)) },      // 128@2x
    { type: 'ic08', buf: encodePng(appIcon(256)) },      // 256
    { type: 'ic14', buf: encodePng(appIcon(512)) },      // 256@2x
    { type: 'ic09', buf: encodePng(appIcon(512)) },      // 512
  ])
);

console.log('icons written to assets/generated, build/icon.ico, build/icon.png, and build/icon.icns');
}

if (require.main === module) main();

// The PNG writer, canvas, and glyph are shared with scripts/gen-ios-icons.js
// so both platforms draw the identical mark from one implementation.
module.exports = { encodePng, makeCanvas, blendPx, fillRoundedRect, drawBars, appIcon, smallAppIcon, BAR_RATIOS, INK, AMBER, WHITE };
