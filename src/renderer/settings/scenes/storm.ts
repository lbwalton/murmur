// SPDX-License-Identifier: GPL-3.0-only
// Red storm (US-174, the black belt theme, the heaviest): near-black, a
// dim red moon, slanting rain and a dark crimson sash stirring in the
// wind, from LB's rain and red-moon references (light, texture and color
// only; described in words, no image in the repo). The sash and the red
// rain are crimson, well away from the bright red that means an error.
// The rain and the sash move; the moon is still.
import { rgba } from '../../brush'
import { glow, mod } from './paint'
import { type Palette, SCENE_H, SCENE_W, type ThemeScene } from './space'

interface Drop {
  x: number
  y: number
  v: number
  l: number
  red: boolean
}

interface StormState {
  drops: Drop[]
}

/** The strongest alpha each color is painted at (space.ts, peaks). */
const PEAKS = {
  'scene-sky-top': 1,
  'scene-sky-mid': 1,
  'scene-sky-low': 1,
  'scene-moon-glow': 0.28,
  'scene-moon': 0.62,
  'scene-moon-hi': 0.18,
  'scene-cloud': 0.85,
  'scene-ground': 1,
  'scene-sash': 1,
  'scene-sash-deep': 1,
  'scene-rain': 0.17,
  'scene-rain-red': 0.32
} as const

const MOON_X = 430
const MOON_Y = 128
/** How far the rain leans: x moves this much per pixel it falls. */
const SLANT = 0.24

export const storm: ThemeScene<StormState> = {
  colors: Object.keys(PEAKS),
  peaks: PEAKS,

  init(r) {
    return {
      drops: Array.from({ length: 140 }, () => ({
        x: r() * (SCENE_W + 120),
        y: r() * SCENE_H,
        v: 260 + r() * 160,
        l: 10 + r() * 14,
        red: r() < 0.12
      }))
    }
  },

  drawStill(ctx, _s, p: Palette) {
    const sky = ctx.createLinearGradient(0, 0, 0, SCENE_H)
    sky.addColorStop(0, rgba(p['scene-sky-top']))
    sky.addColorStop(0.5, rgba(p['scene-sky-mid']))
    sky.addColorStop(1, rgba(p['scene-sky-low']))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)

    glow(ctx, MOON_X, MOON_Y, 200, p['scene-moon-glow'], PEAKS['scene-moon-glow'])
    ctx.fillStyle = rgba(p['scene-moon'], PEAKS['scene-moon'])
    ctx.beginPath()
    ctx.arc(MOON_X, MOON_Y, 92, 0, Math.PI * 2)
    ctx.fill()
    glow(ctx, MOON_X - 20, MOON_Y - 18, 40, p['scene-moon-hi'], PEAKS['scene-moon-hi'])

    // Torn storm cloud drawn across the moon.
    for (const [x, y, rx, ry] of [
      [380, 150, 150, 16],
      [480, 108, 110, 12],
      [300, 186, 170, 20],
      [520, 196, 120, 14]
    ]) {
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(1, ry / rx)
      glow(ctx, 0, 0, rx, p['scene-cloud'], PEAKS['scene-cloud'])
      ctx.restore()
    }

    // A dark ground under the rain.
    ctx.fillStyle = rgba(p['scene-ground'])
    ctx.beginPath()
    ctx.moveTo(0, SCENE_H)
    ctx.lineTo(0, 344)
    ctx.bezierCurveTo(140, 330, 260, 356, 380, 340)
    ctx.bezierCurveTo(460, 330, 520, 346, SCENE_W, 336)
    ctx.lineTo(SCENE_W, SCENE_H)
    ctx.closePath()
    ctx.fill()
  },

  drawMoving(ctx, s, p: Palette, tMs) {
    const sec = tMs / 1000
    const sway = Math.sin(sec * 0.6) * 6

    const sash = ctx.createLinearGradient(330, 0, 560, 220)
    sash.addColorStop(0, rgba(p['scene-sash']))
    sash.addColorStop(1, rgba(p['scene-sash-deep']))
    ctx.fillStyle = sash
    ctx.beginPath()
    ctx.moveTo(300, -10)
    ctx.bezierCurveTo(400, 40 + sway, 450, 20, 600, 150 + sway)
    ctx.lineTo(600, 178 + sway)
    ctx.bezierCurveTo(470, 60 + sway, 410, 78, 290, 18)
    ctx.closePath()
    ctx.fill()
    // The sash's torn end.
    ctx.beginPath()
    ctx.moveTo(560, 140 + sway)
    ctx.lineTo(548, 196 + sway)
    ctx.lineTo(574, 160 + sway)
    ctx.lineTo(590, 205 + sway)
    ctx.lineTo(600, 165 + sway)
    ctx.closePath()
    ctx.fill()

    // Every drop of 1 color is 1 path, so the rain is 2 strokes a frame.
    ctx.lineCap = 'round'
    for (const red of [false, true]) {
      ctx.strokeStyle = red ? rgba(p['scene-rain-red'], PEAKS['scene-rain-red']) : rgba(p['scene-rain'], PEAKS['scene-rain'])
      ctx.lineWidth = red ? 1.1 : 0.8
      ctx.beginPath()
      for (const d of s.drops) {
        if (d.red !== red) continue
        const y = mod(d.y + sec * d.v, SCENE_H + 40) - 20
        const x = mod(d.x - y * SLANT, SCENE_W + 120) - 60
        ctx.moveTo(x, y)
        ctx.lineTo(x - d.l * SLANT, y + d.l)
      }
      ctx.stroke()
    }
  }
}
