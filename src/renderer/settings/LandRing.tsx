// SPDX-License-Identifier: GPL-3.0-only
// Where a control went (LaBroi, 2026-11-12): when the sidebar is hidden,
// Hide words moves beside Home's title, and 1 gold brush loop is drawn
// around it there, then lifts. An open loop, like the mark. Reduced
// motion gets the finished loop, still, for the same moment.
import { cachedBrush, mulberry, path, stroke, tokenColor } from '../brush'
import { PaintCanvas } from './PaintCanvas'

/** How long the loop stays before the caller takes it away. */
export const LAND_RING_MS = 2100

const SEED = 61

/** The loop's points around a box: a rounded lap that starts at the
 *  upper left, runs clockwise, and stops short of where it began. */
export function ringPoints(w: number, h: number, seed = SEED): Array<[number, number]> {
  const r = mulberry(seed)
  const cx = w / 2
  const cy = h / 2
  const rx = w / 2 - 5
  const ry = h / 2 - 4
  const pts: Array<[number, number]> = []
  const from = -Math.PI * 0.86
  const sweep = Math.PI * 1.8
  const n = 28
  for (let i = 0; i <= n; i++) {
    const a = from + (sweep * i) / n
    // A squarer lap than an ellipse, so it hugs a wide, short control.
    const c = Math.cos(a)
    const s = Math.sin(a)
    const px = Math.sign(c) * Math.pow(Math.abs(c), 0.62)
    const py = Math.sign(s) * Math.pow(Math.abs(s), 0.62)
    pts.push([cx + rx * px + (r() - 0.5) * 1.2, cy + ry * py + (r() - 0.5) * 1.2])
  }
  return pts
}

export function LandRing(): React.JSX.Element {
  return (
    <PaintCanvas
      className="land-ring"
      paintKey="land"
      paintInMs={520}
      paint={(ctx, w, h, k) => {
        const P = path(ringPoints(w, h), 1.5)
        const i1 = Math.max(1, Math.floor(Math.min(1, k) * (P.length - 1)))
        stroke(ctx, P, cachedBrush(SEED, 14), {
          width: 6,
          rgb: tokenColor('--brand', [217, 164, 65]),
          dry: 0.5,
          core: 0.45,
          ts: 0.05,
          te: 0.35,
          i1
        })
      }}
    />
  )
}
