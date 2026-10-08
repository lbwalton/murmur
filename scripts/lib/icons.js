// SPDX-License-Identifier: GPL-3.0-only
// murmur's icons as RGBA buffers (US-075): the ensō pill on an ink
// rounded square for the app, brushed by the app's own brush engine at
// 64 px and up and clean drawn below that, and the clean mark alone for
// the tray. Shared by gen-icons.js and the site build; deterministic.
const { render, insideRoundedRect } = require('./draw')
const { RasterContext } = require('./raster')
const { cleanEnsoScene, paintBrushedEnso } = require('./enso')

// Night studio and paint colors, mirroring src/renderer/tokens.css by hand
// (DESIGN.md lists the places that do): ink, rice paper, signal amber for
// the live dot, ember for the splat.
const INK = [15, 14, 17]
const RICE = [233, 227, 214]
const AMBER = [240, 164, 75]
const EMBER = [232, 88, 43]

/** Brushwork reads from this size up; below it, the clean drawn mark. */
const BRUSHED_FROM = 64

/** The ink rounded square every app icon sits on. */
function inkSquare(s) {
  const inset = 0.05 * s
  const radius = 0.22 * s
  return (px, py) => (insideRoundedRect(px, py, s / 2, s / 2, s / 2 - inset, s / 2 - inset, radius) ? [...INK, 1] : [0, 0, 0, 0])
}

/** The app icon at size s. brush is the loaded brush engine, or null. */
function appIconRgba(s, brush) {
  if (s < BRUSHED_FROM || !brush) {
    return render(s, cleanEnsoScene(s, { loop: RICE, dot: AMBER }, { background: inkSquare(s) }))
  }
  const ground = render(s, inkSquare(s))
  const ctx = new RasterContext(s, s)
  for (let i = 0; i < ground.length; i += 4) {
    const a = ground[i + 3] / 255
    ctx.data[i] = (ground[i] / 255) * a
    ctx.data[i + 1] = (ground[i + 1] / 255) * a
    ctx.data[i + 2] = (ground[i + 2] / 255) * a
    ctx.data[i + 3] = a
  }
  paintBrushedEnso(brush, ctx, s, { loop: RICE, dot: AMBER, splat: EMBER })
  // Paint stays inside the square: the ground's own coverage clips it.
  for (let i = 0; i < ground.length; i += 4) {
    const a = ground[i + 3] / 255
    ctx.data[i] *= a
    ctx.data[i + 1] *= a
    ctx.data[i + 2] *= a
    ctx.data[i + 3] *= a
  }
  return ctx.toRgba()
}

/** A tray icon: the clean mark alone in one color on transparency (a
 *  macOS template image when the color is black), drawn a touch heavier
 *  so it holds at 16 px. */
function trayRgba(size, color) {
  return render(size, cleanEnsoScene(size, { loop: color, dot: color }, { line: 0.11 }))
}

/** The full-bleed brushed mark on ink (the site's home screen icon and
 *  link preview): w by h, the mark size s at the center. */
function markOnInkRgba(w, h, s, brush) {
  const ctx = new RasterContext(w, h)
  for (let i = 0; i < ctx.data.length; i += 4) {
    ctx.data[i] = INK[0] / 255
    ctx.data[i + 1] = INK[1] / 255
    ctx.data[i + 2] = INK[2] / 255
    ctx.data[i + 3] = 1
  }
  if (brush) {
    ctx.translate((w - s) / 2, (h - s) / 2)
    paintBrushedEnso(brush, ctx, s, { loop: RICE, dot: AMBER, splat: EMBER })
    return ctx.toRgba()
  }
  const ink = () => [...INK, 1]
  const scene = cleanEnsoScene(s, { loop: RICE, dot: AMBER }, { background: ink })
  return require('./draw').renderRect(w, h, (px, py) => scene(px - (w - s) / 2, py - (h - s) / 2))
}

module.exports = { appIconRgba, trayRgba, markOnInkRgba, BRUSHED_FROM, INK, RICE, AMBER, EMBER }
