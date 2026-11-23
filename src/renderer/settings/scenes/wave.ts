// SPDX-License-Identifier: GPL-3.0-only
// Great wave (US-174, the purple belt theme): an indigo sea of 4 swells
// with curling crests and cream foam, a red sun and a far mountain with a
// snowcap, from LB's woodblock references (light, texture and color only;
// described in words, no image in the repo). The swell rolls low, so the
// cards sit over calm water; only the sea moves. The foam is a muted
// cream so the theme's ink sheet holds every text at 4.5 to 1.
import { rgba } from '../../brush'
import { glow } from './paint'
import { type Palette, SCENE_H, SCENE_W, type ThemeScene } from './space'

interface Spray {
  /** Offset along the crest, 0 to 24. */
  x: number
  dy: number
  r: number
  a: number
}

interface WaveState {
  spray: Spray[]
}

/** The strongest alpha each color is painted at (space.ts, peaks). */
const PEAKS = {
  'scene-sky-top': 1,
  'scene-sky-mid': 1,
  'scene-sky-low': 1,
  'scene-sun-glow': 0.22,
  'scene-sun': 1,
  'scene-mountain-far': 1,
  'scene-mountain': 1,
  'scene-snowcap': 0.35,
  'scene-wave-far': 1,
  'scene-wave-mid': 1,
  'scene-wave-low': 1,
  'scene-wave-near': 1,
  'scene-foam': 0.8
} as const

const SEAS = ['scene-wave-far', 'scene-wave-mid', 'scene-wave-low', 'scene-wave-near'] as const

/** The spray's strongest alpha: it can land on a farther swell's foam. */
const SPRAY_PEAK = 0.5

const SUN_X = 112
const SUN_Y = 92

export const wave: ThemeScene<WaveState> = {
  colors: Object.keys(PEAKS),
  peaks: PEAKS,
  grounds: ['scene-mountain-far', 'scene-mountain', ...SEAS],
  stacks: [
    [
      ['scene-foam', PEAKS['scene-foam']],
      ['scene-foam', SPRAY_PEAK]
    ]
  ],

  init(r) {
    return {
      spray: Array.from({ length: 60 }, () => ({
        x: r() * 24,
        dy: 4 + r() * 16,
        r: 0.6 + r() * 1.5,
        a: 0.25 + r() * (SPRAY_PEAK - 0.25)
      }))
    }
  },

  drawStill(ctx, _s, p: Palette) {
    const sky = ctx.createLinearGradient(0, 0, 0, SCENE_H)
    sky.addColorStop(0, rgba(p['scene-sky-top']))
    sky.addColorStop(0.7, rgba(p['scene-sky-mid']))
    sky.addColorStop(1, rgba(p['scene-sky-low']))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)

    glow(ctx, SUN_X, SUN_Y, 110, p['scene-sun-glow'], PEAKS['scene-sun-glow'])
    ctx.fillStyle = rgba(p['scene-sun'])
    ctx.beginPath()
    ctx.arc(SUN_X, SUN_Y, 42, 0, Math.PI * 2)
    ctx.fill()

    // A farther, hazier range, then the peak with its snowcap.
    ctx.fillStyle = rgba(p['scene-mountain-far'])
    ctx.beginPath()
    ctx.moveTo(150, 250)
    ctx.lineTo(196, 222)
    ctx.lineTo(228, 232)
    ctx.lineTo(276, 204)
    ctx.lineTo(318, 226)
    ctx.lineTo(560, 236)
    ctx.lineTo(560, 250)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = rgba(p['scene-mountain'])
    ctx.beginPath()
    ctx.moveTo(250, 250)
    ctx.lineTo(330, 196)
    ctx.lineTo(352, 210)
    ctx.lineTo(410, 172)
    ctx.lineTo(500, 250)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = rgba(p['scene-snowcap'], PEAKS['scene-snowcap'])
    ctx.beginPath()
    ctx.moveTo(398, 180)
    ctx.lineTo(410, 172)
    ctx.lineTo(424, 184)
    ctx.lineTo(412, 182)
    ctx.closePath()
    ctx.fill()
  },

  drawMoving(ctx, s, p: Palette, tMs) {
    // Neighboring swells roll against each other, slowly.
    const roll = (tMs / 1000) * 0.35
    ctx.lineCap = 'round'
    for (let i = 0; i < SEAS.length; i++) {
      const base = 242 + i * 34
      const amp = 7 + i * 4.5
      const f = 0.024 - i * 0.003
      const ph = i * 1.9 + (i % 2 ? roll : -roll)
      const yAt = (x: number): number => base + amp * Math.sin(x * f + ph) + amp * 0.35 * Math.sin(x * f * 2.4 + ph * 1.3)

      ctx.fillStyle = rgba(p[SEAS[i]])
      ctx.beginPath()
      ctx.moveTo(0, SCENE_H)
      for (let x = 0; x <= SCENE_W; x += 4) ctx.lineTo(x, yAt(x))
      ctx.lineTo(SCENE_W, SCENE_H)
      ctx.closePath()
      ctx.fill()

      // The foam line and each crest's curl are 1 stroke, so a curl
      // never lays foam over foam.
      const crests: number[] = []
      ctx.strokeStyle = rgba(p['scene-foam'], PEAKS['scene-foam'])
      ctx.lineWidth = 1.2 + i * 0.35
      ctx.beginPath()
      for (let x = 0; x <= SCENE_W; x += 4) {
        if (x) ctx.lineTo(x, yAt(x))
        else ctx.moveTo(x, yAt(x))
      }
      for (let x = 8; x < SCENE_W - 8; x += 2) {
        const at = yAt(x)
        if (!(at < yAt(x - 2) && at <= yAt(x + 2))) continue
        crests.push(x)
        const r = 3.5 + i
        const from = Math.PI * 1.05
        ctx.moveTo(x + 3 + r * Math.cos(from), at + 3.5 + r * Math.sin(from))
        ctx.arc(x + 3, at + 3.5, r, from, Math.PI * 1.95)
      }
      ctx.stroke()

      // The near swells throw a little spray off each crest.
      if (i < 2) continue
      for (const x of crests) {
        const at = yAt(x)
        for (let k = i; k < s.spray.length; k += 6) {
          const drop = s.spray[k]
          ctx.fillStyle = rgba(p['scene-foam'], drop.a)
          ctx.beginPath()
          ctx.arc(x + drop.x - 12, at - drop.dy, drop.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }
}
