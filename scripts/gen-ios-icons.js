// Generates every icon the iOS app needs into the asset catalogs, so the
// repo commits no binary assets (project law, same as desktop). Runs on
// postinstall next to gen-icons.js; run it once before the first xcodebuild
// on a fresh clone. The Contents.json files are committed; only the PNGs
// here are generated and gitignored.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { encodePng, makeCanvas, fillRoundedRect, drawBars, INK, AMBER, WHITE } = require('./gen-icons.js');

const ROOT = path.join(__dirname, '..');
const APP_ICON_DIR = path.join(ROOT, 'ios', 'Murmur', 'Assets.xcassets', 'AppIcon.appiconset');
const KB_GLYPH_DIR = path.join(ROOT, 'ios', 'MurmurKeyboard', 'Assets.xcassets', 'KeyboardGlyph.imageset');

// App Store marketing icons must carry no alpha channel at all, opaque
// pixels included (ITMS rejects the upload otherwise), so the app icon is
// encoded as color type 2 RGB instead of the shared writer's RGBA.
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

function encodePngOpaque(canvas) {
  const { w, h, data } = canvas;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB, no alpha channel
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (w * 3 + 1) + 1 + x * 3;
      raw[dst] = data[src];
      raw[dst + 1] = data[src + 1];
      raw[dst + 2] = data[src + 2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// iOS masks its own corners, so unlike the desktop tile the icon is drawn
// full bleed: an ink square edge to edge, the amber five-bar mark centered,
// and a faint panel-tone plate behind the mark for depth at small sizes.
function iosAppIcon(size) {
  const c = makeCanvas(size, size);
  fillRoundedRect(c, -2, -2, size + 4, size + 4, 0, [INK[0], INK[1], INK[2], 255]);
  fillRoundedRect(c, size * 0.20, size * 0.20, size * 0.60, size * 0.60, size * 0.14, [38, 36, 44, 255]);
  drawBars(c, size / 2, size / 2, size * 0.42, AMBER);
  return c;
}

// The keyboard's in-UI mark: the same five bars in warm text tone on a
// transparent field, at 1x, 2x, and 3x of a 40pt box. Amber stays reserved
// for the live recording state (US-106 recolors at runtime, not here).
function keyboardGlyph(pt, scale) {
  const px = pt * scale;
  const c = makeCanvas(px, px);
  drawBars(c, px / 2, px / 2, px * 0.62, WHITE);
  return c;
}

fs.mkdirSync(APP_ICON_DIR, { recursive: true });
fs.mkdirSync(KB_GLYPH_DIR, { recursive: true });

fs.writeFileSync(path.join(APP_ICON_DIR, 'icon-1024.png'), encodePngOpaque(iosAppIcon(1024)));
for (const scale of [1, 2, 3]) {
  fs.writeFileSync(path.join(KB_GLYPH_DIR, `glyph-40@${scale}x.png`), encodePng(keyboardGlyph(40, scale)));
}

console.log('iOS icons written to the asset catalogs (AppIcon 1024, KeyboardGlyph 1x/2x/3x)');
