#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Generates every icon murmur uses: app icons (png, icns, ico) and tray
// icons, all drawn programmatically so the repo never tracks a binary
// asset. Pure Node, no dependencies; the drawing kit is scripts/lib/draw.js.
// Deterministic: same bytes on every run.
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { encodePng, render, makeBars, appIconScene } = require('./lib/draw')

const root = join(__dirname, '..')
const iconsDir = join(root, 'build', 'icons')
const trayDir = join(root, 'build', 'icons', 'tray')

// Night studio palette.
const INK = [15, 14, 17]
const AMBER = [240, 164, 75]
const RED = [229, 72, 77]
const BLACK = [0, 0, 0]
const WHITE = [236, 233, 228]

/** Tray icon: transparent background, waveform only, given color. */
function trayScene(s, color) {
  const bars = makeBars(s, 0.38 * s, 0.11 * s, 0.09 * s)
  return (px, py) => (bars(px, py) ? [...color, 1] : [0, 0, 0, 0])
}

// ---------------------------------------------------------- containers ---

function buildIcns(pngBySize) {
  const TYPES = [
    ['ic11', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic13', 256],
    ['ic08', 256],
    ['ic14', 512],
    ['ic09', 512],
    ['ic10', 1024]
  ]
  const entries = TYPES.map(([type, size]) => {
    const png = pngBySize[size]
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(8 + png.length, 4)
    return Buffer.concat([head, png])
  })
  const body = Buffer.concat(entries)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(8 + body.length, 4)
  return Buffer.concat([header, body])
}

function buildIco(pngBySize, sizes) {
  const count = sizes.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const dirs = []
  const datas = []
  let offset = 6 + count * 16
  for (const size of sizes) {
    const png = pngBySize[size]
    const dir = Buffer.alloc(16)
    dir[0] = size >= 256 ? 0 : size
    dir[1] = size >= 256 ? 0 : size
    dir.writeUInt16LE(1, 4) // planes
    dir.writeUInt16LE(32, 6) // bit count
    dir.writeUInt32LE(png.length, 8)
    dir.writeUInt32LE(offset, 12)
    offset += png.length
    dirs.push(dir)
    datas.push(png)
  }
  return Buffer.concat([header, ...dirs, ...datas])
}

// ------------------------------------------------------------------ go ---

function main() {
  mkdirSync(iconsDir, { recursive: true })
  mkdirSync(trayDir, { recursive: true })

  const appSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  const pngBySize = {}
  for (const s of appSizes) {
    pngBySize[s] = encodePng(s, s, render(s, appIconScene(s, INK, AMBER)))
    writeFileSync(join(iconsDir, `icon-${s}.png`), pngBySize[s])
  }

  writeFileSync(join(root, 'build', 'icon.icns'), buildIcns(pngBySize))
  writeFileSync(join(root, 'build', 'icon.ico'), buildIco(pngBySize, [16, 24, 32, 48, 64, 128, 256]))
  writeFileSync(join(root, 'build', 'icon.png'), pngBySize[512])

  // Tray set. macOS gets template images (black + alpha, system recolors).
  // Windows picks warm-white or ink at runtime to match the taskbar theme
  // (a white icon on a light taskbar reads as a ghost outline), and both
  // platforms get a red recording variant.
  const trayVariants = [
    ['trayTemplate.png', 16, BLACK],
    ['trayTemplate@2x.png', 32, BLACK],
    ['tray-light.png', 16, WHITE],
    ['tray-light@2x.png', 32, WHITE],
    ['tray-dark.png', 16, INK],
    ['tray-dark@2x.png', 32, INK],
    ['tray-recording.png', 16, RED],
    ['tray-recording@2x.png', 32, RED]
  ]
  for (const [name, size, color] of trayVariants) {
    writeFileSync(join(trayDir, name), encodePng(size, size, render(size, trayScene(size, color))))
  }

  console.log(`icons generated: ${appSizes.length} png, icon.icns, icon.ico, ${trayVariants.length} tray`)
}

main()
