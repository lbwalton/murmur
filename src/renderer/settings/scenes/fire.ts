// SPDX-License-Identifier: GPL-3.0-only
// Ember (US-174, the brown belt theme; its id is fire because ember is
// night studio's id): a charcoal ground lit by a fire glow from below,
// flame ribbons curling at the edges and sparks rising, from LB's fire
// references (light, texture and color only; described in words, no
// image in the repo). The sparks are ember orange, kept well apart from
// the signal amber that means the mic is live. The ribbons' glow is drawn
// once into the still layer; each frame adds only their breath and the
// sparks, with no canvas shadow.
import { type Rgb, rgba } from '../../brush'
import { glow, mod } from './paint'
import { type Palette, SCENE_H, SCENE_W, type ThemeScene } from './space'

interface Spark {
  x: number
  y: number
  vy: number
  ph: number
  r: number
  tone: 'spark' | 'spark-deep' | 'spark-hot'
}

type Ribbon = [[number, number], [number, number], [number, number], [number, number]]

interface FireState {
  sparks: Spark[]
  ribbons: Ribbon[]
}

/** The strongest alpha each color is painted at (space.ts, peaks). */
const PEAKS = {
  'scene-sky-top': 1,
  'scene-sky-mid': 1,
  'scene-sky-low': 1,
  'scene-fire-glow': 0.42,
  'scene-fire-warm': 0.25,
  'scene-ribbon-hot': 0.6,
  'scene-ribbon': 0.5,
  'scene-spark': 0.9,
  'scene-spark-deep': 0.9,
  'scene-spark-hot': 0.9
} as const

/** A spark's halo, as a share of its core's alpha. */
const HALO = 0.22

/** The ribbons' resting strength; the breath adds up to RIBBON_BREATH. */
const RIBBON_REST = 0.42
const RIBBON_BREATH = PEAKS['scene-ribbon-hot'] - RIBBON_REST

/** 1 ribbon: 3 strokes, wide to thin, each a gradient from hot to clear. */
function ribbon(ctx: CanvasRenderingContext2D, rb: Ribbon, hot: Rgb, ember: Rgb, alpha: number, widths: readonly number[]): void {
  const g = ctx.createLinearGradient(rb[0][0], rb[0][1], rb[3][0], rb[3][1])
  g.addColorStop(0, rgba(hot, alpha))
  g.addColorStop(0.5, rgba(ember, alpha * (PEAKS['scene-ribbon'] / PEAKS['scene-ribbon-hot'])))
  g.addColorStop(1, rgba(ember, 0))
  ctx.strokeStyle = g
  widths.forEach((w, k) => {
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.moveTo(rb[0][0] + k * 6, rb[0][1])
    ctx.bezierCurveTo(rb[1][0] + k * 8, rb[1][1], rb[2][0] - k * 6, rb[2][1], rb[3][0] + k * 4, rb[3][1])
    ctx.stroke()
  })
}

export const fire: ThemeScene<FireState> = {
  colors: Object.keys(PEAKS),
  peaks: PEAKS,
  // The brightest a spark gets: its core over its own halo, over the
  // fire's glow and a flame ribbon at full breath.
  stacks: [
    [
      ['scene-fire-glow', PEAKS['scene-fire-glow']],
      ['scene-fire-warm', PEAKS['scene-fire-warm']],
      ['scene-ribbon-hot', PEAKS['scene-ribbon-hot']],
      ['scene-spark-hot', PEAKS['scene-spark-hot'] * HALO],
      ['scene-spark-hot', PEAKS['scene-spark-hot']]
    ]
  ],

  init(r) {
    const sparks = Array.from({ length: 64 }, () => {
      const pick = r()
      return {
        x: r() * SCENE_W,
        y: r() * SCENE_H,
        vy: 14 + r() * 26,
        ph: r() * Math.PI * 2,
        r: 0.7 + r() * 1.8,
        tone: (pick < 0.5 ? 'spark' : pick < 0.75 ? 'spark-deep' : 'spark-hot') as Spark['tone']
      }
    })
    const ribbons: Ribbon[] = [
      [
        [-10, 360],
        [60, 250],
        [10, 150],
        [70, 40]
      ],
      [
        [575, 350],
        [470, 280],
        [560, 170],
        [490, 70]
      ],
      [
        [530, 390],
        [420, 330],
        [600, 250],
        [520, 200]
      ],
      [
        [-20, 120],
        [80, 90],
        [20, 20],
        [110, -10]
      ]
    ]
    return { sparks, ribbons }
  },

  drawStill(ctx, s, p: Palette) {
    const sky = ctx.createLinearGradient(0, 0, 0, SCENE_H)
    sky.addColorStop(0, rgba(p['scene-sky-top']))
    sky.addColorStop(0.6, rgba(p['scene-sky-mid']))
    sky.addColorStop(1, rgba(p['scene-sky-low']))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)

    // The fire is below the window: its glow rises from the bottom edge.
    glow(ctx, SCENE_W * 0.5, SCENE_H + 60, 360, p['scene-fire-glow'], PEAKS['scene-fire-glow'])
    glow(ctx, 40, SCENE_H, 200, p['scene-fire-warm'], PEAKS['scene-fire-warm'])
    glow(ctx, SCENE_W - 30, SCENE_H - 40, 180, p['scene-fire-glow'], 0.22)

    ctx.save()
    ctx.lineCap = 'round'
    ctx.shadowColor = rgba(p['scene-ribbon'], PEAKS['scene-ribbon'])
    ctx.shadowBlur = 16
    for (const rb of s.ribbons) ribbon(ctx, rb, p['scene-ribbon-hot'], p['scene-ribbon'], RIBBON_REST, [7, 3, 1.4])
    ctx.restore()
  },

  drawMoving(ctx, s, p: Palette, tMs) {
    const sec = tMs / 1000
    ctx.lineCap = 'round'
    // The flames breathe: their thin cores brighten and fade, each in its
    // own time.
    s.ribbons.forEach((rb, i) => {
      const breath = RIBBON_BREATH * (0.5 + 0.5 * Math.sin(sec * 0.8 + i))
      if (breath > 0.005) ribbon(ctx, rb, p['scene-ribbon-hot'], p['scene-ribbon'], breath, [3, 1.4])
    })
    for (const spark of s.sparks) {
      const y = SCENE_H + 10 - mod(spark.y + sec * spark.vy, SCENE_H + 20)
      const x = spark.x + Math.sin(sec * 1.4 + spark.ph) * 9
      const a = 0.45 + (PEAKS['scene-spark'] - 0.45) * Math.abs(Math.sin(sec * 3 + spark.ph))
      const c = p[`scene-${spark.tone}`]
      // A faint halo stands in for a blur.
      ctx.fillStyle = rgba(c, a * HALO)
      ctx.beginPath()
      ctx.arc(x, y, spark.r * 2.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = rgba(c, a)
      ctx.beginPath()
      ctx.arc(x, y, spark.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
