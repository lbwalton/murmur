// SPDX-License-Identifier: GPL-3.0-only
// Rice paper (US-174, the white belt theme, the calmest): tea-stained
// paper with burnt edges, a little ink wash, ink flecks gathered in the
// corners and 1 vermilion drip, from LB's parchment and ink-wash
// references (light, texture and color only; described in words, no
// image in the repo). It is the 1 light theme and it never moves: the
// paper is the window's ground, under a thin paper sheet that keeps ink
// text at 4.5 to 1 even over a fleck (look.test.ts, --scene-dark).
import { rgba } from '../../brush'
import { glow } from './paint'
import { type Palette, SCENE_H, SCENE_W, type ThemeScene } from './space'

interface Stain {
  x: number
  y: number
  r: number
  a: number
}

interface Fleck {
  x: number
  y: number
  r: number
  a: number
}

interface RiceState {
  stains: Stain[]
  flecks: Fleck[]
  drip: Array<[number, number]>
}

/** The strongest alpha each color is painted at (space.ts, peaks). */
const PEAKS = {
  'scene-sky-top': 1,
  'scene-paper-light': 0.85,
  'scene-stain': 0.22,
  'scene-burn': 0.5,
  'scene-wash': 0.07,
  'scene-fleck': 0.8,
  'scene-drip': 1
} as const

/** Where the ink flecks gather: the 4 corners, away from the cards. */
const FLECK_CORNERS: ReadonlyArray<[number, number]> = [
  [470, 300],
  [520, 60],
  [40, 330],
  [90, 40]
]

export const rice: ThemeScene<RiceState> = {
  colors: Object.keys(PEAKS),
  peaks: PEAKS,

  init(r) {
    // Tea stains pool along the edges.
    const stains: Stain[] = []
    for (let i = 0; i < 14; i++) {
      const edge = i % 4
      const x = edge === 0 ? r() * 60 : edge === 1 ? SCENE_W - r() * 60 : r() * SCENE_W
      const y = edge === 2 ? r() * 50 : edge === 3 ? SCENE_H - r() * 50 : r() * SCENE_H
      stains.push({ x, y, r: 40 + r() * 90, a: 0.08 + r() * (PEAKS['scene-stain'] - 0.08) })
    }
    const flecks: Fleck[] = []
    for (const [cx, cy] of FLECK_CORNERS) {
      for (let i = 0; i < 26; i++) {
        const d = Math.pow(r(), 1.8) * 70
        const a = r() * Math.PI * 2
        flecks.push({
          x: cx + Math.cos(a) * d,
          y: cy + Math.sin(a) * d,
          r: 0.4 + Math.pow(r(), 3) * 3.2,
          a: 0.3 + r() * (PEAKS['scene-fleck'] - 0.3)
        })
      }
    }
    // 1 vermilion drip, running down from the top edge on the right.
    const drip: Array<[number, number]> = []
    let x = 512
    for (let y = -2; y <= 236; y += 6) {
      x += (r() - 0.5) * 0.9
      drip.push([x, y])
    }
    return { stains, flecks, drip }
  },

  drawStill(ctx, s, p: Palette) {
    ctx.fillStyle = rgba(p['scene-sky-top'])
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)
    glow(ctx, SCENE_W * 0.46, SCENE_H * 0.46, 330, p['scene-paper-light'], PEAKS['scene-paper-light'])
    for (const st of s.stains) glow(ctx, st.x, st.y, st.r, p['scene-stain'], st.a)

    // Burnt edges: the paper darkens toward its rim.
    const burn = ctx.createRadialGradient(SCENE_W / 2, SCENE_H / 2, 120, SCENE_W / 2, SCENE_H / 2, 345)
    burn.addColorStop(0, rgba(p['scene-burn'], 0))
    burn.addColorStop(0.75, rgba(p['scene-burn'], 0.1))
    burn.addColorStop(1, rgba(p['scene-burn'], PEAKS['scene-burn']))
    ctx.fillStyle = burn
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)

    glow(ctx, 70, 250, 110, p['scene-wash'], PEAKS['scene-wash'])
    glow(ctx, 500, 330, 90, p['scene-wash'], 0.06)

    ctx.strokeStyle = rgba(p['scene-drip'])
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    s.drip.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    const end = s.drip[s.drip.length - 1]
    ctx.fillStyle = rgba(p['scene-drip'])
    ctx.beginPath()
    ctx.ellipse(end[0], end[1] + 5, 3.2, 4.4, 0, 0, Math.PI * 2)
    ctx.fill()

    for (const f of s.flecks) {
      ctx.fillStyle = rgba(p['scene-fleck'], f.a)
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fill()
    }
  },

  // Paper stays still.
  drawMoving() {}
}
