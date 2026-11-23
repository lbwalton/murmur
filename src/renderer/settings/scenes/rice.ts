// SPDX-License-Identifier: GPL-3.0-only
// Rice paper (US-174, the white belt theme, the calmest): tea-stained
// paper with burnt edges, a little ink wash, ink flecks gathered in the
// corners and 1 vermilion drip, from LB's parchment and ink-wash
// references (light, texture and color only; described in words, no
// image in the repo). It is the 1 light theme and it never moves: the
// paper is the window's ground, under a thin paper sheet that keeps ink
// text at 4.5 to 1 even over a fleck (look.test.ts, --scene-dark).
//
// It wears through the day (US-186; LB's picks 2026-11-22): as today's
// painting fills, the paper darkens and yellows, its rim burns deeper and
// frays, more tea stains bloom, 2 fold lines come in, the drip runs
// longer, and the flecks spread and lighten a touch so ink still reads
// over the darkest spot. It changes in steps (shared/paperWear.ts), each
// a color set in tokens.css, and is redrawn once per step: nothing
// animates. Fresh paper (wear 0) is exactly the painting LB passed.
import { rgba } from '../../brush'
import { glow } from './paint'
import { type Palette, SCENE_H, SCENE_W, type ThemeScene } from './space'

interface Mark {
  x: number
  y: number
  r: number
  a: number
}

interface Fleck extends Mark {
  /** The corner it gathers at, which it spreads out from as the paper wears. */
  cx: number
  cy: number
}

interface RiceState {
  /** The fresh paper's stains, then the ones wear brings, in order. */
  stains: Mark[]
  /** Per corner: the fresh paper's flecks, then the ones wear brings. */
  flecks: Fleck[][]
  /** Burnt blotches along the rim, which only wear shows. */
  frays: Mark[]
  /** The 2 fold lines, across and down. */
  folds: Array<Array<[number, number]>>
  /** The drip's whole path; wear lets it run further down. */
  drip: Array<[number, number]>
}

/** LB's pick (2026-11-22): medium. Wear 1, the most a day wears the
 *  paper, is this far toward the heaviest paper the preview showed. */
const MEDIUM = 0.75

const FRESH_STAINS = 14
const MORE_STAINS = 20
const FRESH_FLECKS = 26
const MORE_FLECKS = 14
const FRAYS = 46
const FRESH_DRIP_END = 236
const MORE_DRIP = 80

/** How the paper looks at a wear from 0 (fresh) to 1 (a finished day). */
function aged(wear: number) {
  const w = Math.max(0, Math.min(1, wear)) * MEDIUM
  return {
    w,
    lightAlpha: 0.85 - 0.4 * w,
    lightRadius: 330 - 80 * w,
    stainCount: Math.round(FRESH_STAINS + MORE_STAINS * w),
    stainBoost: 1 + 0.7 * w,
    stainGrow: 1 + 0.25 * w,
    burnInner: 120 - 50 * w,
    burnMid: 0.1 + 0.14 * w,
    burnEdge: 0.5 + 0.28 * w,
    frayCount: Math.round(FRAYS * w),
    // Fold lines come in once the paper has started to wear.
    fold: Math.max(0, (w - 0.2) / 0.8),
    fleckCount: Math.round(FRESH_FLECKS + MORE_FLECKS * w),
    fleckSpread: 1 + 0.35 * w,
    // Lighter flecks on darker paper, so ink keeps 4.5 to 1 over them.
    fleckCap: 0.8 - 0.16 * w,
    dripEnd: FRESH_DRIP_END + MORE_DRIP * w
  }
}

const FRAY_PEAK = 0.38
/** The fold's lit lip, at a full fold. Faint, so even where the 2 lips
 *  cross over the glow the paper stays darker than its cards. */
const LIP = 0.2

/** The strongest alpha each color is painted at, at a wear (space.ts). */
function peaksAt(wear: number): Record<string, number> {
  const a = aged(wear)
  return {
    'scene-sky-top': 1,
    'scene-paper-light': a.lightAlpha,
    'scene-stain': 0.22 * a.stainBoost,
    'scene-burn': a.burnEdge,
    'scene-wash': 0.07,
    'scene-fleck': a.fleckCap,
    'scene-drip': 1
  }
}

/** The darkest the paper gets: a fleck on the wash on a stain on the
 *  burnt rim, with a frayed blotch and a fold line there once it wears. */
function stacksAt(wear: number): Array<Array<readonly [string, number]>> {
  const a = aged(wear)
  const p = peaksAt(wear)
  const layers: Array<readonly [string, number]> = [
    ['scene-burn', a.burnEdge],
    ['scene-stain', p['scene-stain']]
  ]
  if (a.w > 0) layers.push(['scene-burn', FRAY_PEAK * a.w])
  if (a.fold > 0) layers.push(['scene-burn', 0.16 * a.fold])
  layers.push(['scene-wash', p['scene-wash']], ['scene-fleck', p['scene-fleck']])
  return [layers]
}

/** The lightest the paper gets, over its sky: the glow's middle, and
 *  where the 2 fold lips cross over it once the paper has folded. A card
 *  is held lighter than this at every step (scenes.test.ts). */
export function riceLightest(wear: number): Array<readonly [string, number]> {
  const a = aged(wear)
  const lips: Array<readonly [string, number]> = a.fold > 0 ? [['scene-paper-light', LIP * a.fold], ['scene-paper-light', LIP * a.fold]] : []
  return [['scene-paper-light', a.lightAlpha], ...lips]
}

const PEAKS = peaksAt(0)

/** Where the ink flecks gather: the 4 corners, away from the cards. */
const FLECK_CORNERS: ReadonlyArray<[number, number]> = [
  [470, 300],
  [520, 60],
  [40, 330],
  [90, 40]
]

function stainAt(r: () => number, i: number, inset: number): Mark {
  const edge = i % 4
  const x = edge === 0 ? r() * inset : edge === 1 ? SCENE_W - r() * inset : r() * SCENE_W
  const y = edge === 2 ? r() * (inset - 10) : edge === 3 ? SCENE_H - r() * (inset - 10) : r() * SCENE_H
  return { x, y, r: 40 + r() * 90, a: 0.08 + r() * (PEAKS['scene-stain'] - 0.08) }
}

function fleckAt(r: () => number, cx: number, cy: number): Fleck {
  const d = Math.pow(r(), 1.8) * 70
  const a = r() * Math.PI * 2
  return { cx, cy, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: 0.4 + Math.pow(r(), 3) * 3.2, a: 0.3 + r() * (PEAKS['scene-fleck'] - 0.3) }
}

function line(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<[number, number]>, dx = 0, dy = 0): void {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)))
  ctx.stroke()
}

export const rice: ThemeScene<RiceState> = {
  colors: Object.keys(PEAKS),
  peaks: PEAKS,
  stacks: stacksAt(0),
  worn: { peaks: peaksAt, stacks: stacksAt },

  init(r) {
    // The fresh paper first, drawn from the seed in the order it always
    // was, so wear 0 is the painting LB passed; what wear brings is drawn
    // from the seed after it.
    // Tea stains pool along the edges.
    const stains: Mark[] = []
    for (let i = 0; i < FRESH_STAINS; i++) stains.push(stainAt(r, i, 60))
    const flecks: Fleck[][] = FLECK_CORNERS.map(([cx, cy]) => Array.from({ length: FRESH_FLECKS }, () => fleckAt(r, cx, cy)))
    // 1 vermilion drip, running down from the top edge on the right.
    const drip: Array<[number, number]> = []
    let x = 512
    for (let y = -2; y <= FRESH_DRIP_END; y += 6) {
      x += (r() - 0.5) * 0.9
      drip.push([x, y])
    }

    // What wear brings: stains reaching further in, more flecks, the
    // frayed rim, the fold lines, and the rest of the drip.
    for (let i = 0; i < MORE_STAINS; i++) stains.push(stainAt(r, i, 110))
    FLECK_CORNERS.forEach(([cx, cy], c) => {
      for (let i = 0; i < MORE_FLECKS; i++) flecks[c].push(fleckAt(r, cx, cy))
    })
    const frays: Mark[] = []
    for (let i = 0; i < FRAYS; i++) {
      const t = r() * 2 * (SCENE_W + SCENE_H)
      const inward = r() * 18
      const [fx, fy] =
        t < SCENE_W
          ? [t, inward]
          : t < SCENE_W + SCENE_H
            ? [SCENE_W - inward, t - SCENE_W]
            : t < 2 * SCENE_W + SCENE_H
              ? [t - SCENE_W - SCENE_H, SCENE_H - inward]
              : [inward, t - 2 * SCENE_W - SCENE_H]
      frays.push({ x: fx, y: fy, r: 10 + r() * 34, a: 0.14 + r() * (FRAY_PEAK - 0.14) })
    }
    const across: Array<[number, number]> = []
    for (let fx = 0; fx <= SCENE_W; fx += 14) across.push([fx, SCENE_H * 0.55 - fx * 0.03 + (r() - 0.5) * 1.6])
    const down: Array<[number, number]> = []
    for (let fy = 0; fy <= SCENE_H; fy += 14) down.push([SCENE_W * 0.37 + fy * 0.02 + (r() - 0.5) * 1.6, fy])
    for (let y = drip[drip.length - 1][1] + 6; y <= FRESH_DRIP_END + MORE_DRIP; y += 6) {
      x += (r() - 0.5) * 0.9
      drip.push([x, y])
    }
    return { stains, flecks, frays, folds: [across, down], drip }
  },

  drawStill(ctx, s, p: Palette, wear = 0) {
    const a = aged(wear)
    ctx.fillStyle = rgba(p['scene-sky-top'])
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)
    glow(ctx, SCENE_W * 0.46, SCENE_H * 0.46, a.lightRadius, p['scene-paper-light'], a.lightAlpha)
    for (const st of s.stains.slice(0, a.stainCount)) {
      glow(ctx, st.x, st.y, st.r * a.stainGrow, p['scene-stain'], st.a * a.stainBoost)
    }

    // The folds: a crease of burn with a lit lip beside it.
    if (a.fold > 0) {
      ctx.lineWidth = 1.4
      ctx.lineCap = 'round'
      ctx.strokeStyle = rgba(p['scene-burn'], 0.16 * a.fold)
      for (const fold of s.folds) line(ctx, fold)
      ctx.strokeStyle = rgba(p['scene-paper-light'], LIP * a.fold)
      line(ctx, s.folds[0], 0, 1.3)
      line(ctx, s.folds[1], 1.3, 0)
    }

    // Burnt edges: the paper darkens toward its rim.
    const burn = ctx.createRadialGradient(SCENE_W / 2, SCENE_H / 2, a.burnInner, SCENE_W / 2, SCENE_H / 2, 345)
    burn.addColorStop(0, rgba(p['scene-burn'], 0))
    burn.addColorStop(0.75, rgba(p['scene-burn'], a.burnMid))
    burn.addColorStop(1, rgba(p['scene-burn'], a.burnEdge))
    ctx.fillStyle = burn
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)
    for (const f of s.frays.slice(0, a.frayCount)) glow(ctx, f.x, f.y, f.r, p['scene-burn'], f.a * a.w)

    glow(ctx, 70, 250, 110, p['scene-wash'], PEAKS['scene-wash'])
    glow(ctx, 500, 330, 90, p['scene-wash'], 0.06)

    const drip = s.drip.filter(([, y]) => y <= a.dripEnd)
    ctx.strokeStyle = rgba(p['scene-drip'])
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    line(ctx, drip)
    const end = drip[drip.length - 1]
    ctx.fillStyle = rgba(p['scene-drip'])
    ctx.beginPath()
    ctx.ellipse(end[0], end[1] + 5, 3.2, 4.4, 0, 0, Math.PI * 2)
    ctx.fill()

    for (const corner of s.flecks) {
      for (const f of corner.slice(0, a.fleckCount)) {
        const fx = a.fleckSpread === 1 ? f.x : f.cx + (f.x - f.cx) * a.fleckSpread
        const fy = a.fleckSpread === 1 ? f.y : f.cy + (f.y - f.cy) * a.fleckSpread
        ctx.fillStyle = rgba(p['scene-fleck'], Math.min(a.fleckCap, f.a))
        ctx.beginPath()
        ctx.arc(fx, fy, f.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },

  // Paper stays still.
  drawMoving() {}
}
