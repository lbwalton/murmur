// SPDX-License-Identifier: GPL-3.0-only
// The header's two painted touches (US-090): the belt insignia beside the
// wordmark, painted by the Journey's own belt painter, and a short brand
// gold brush stroke under the tab you are on, in place of a pill. Each
// tab's stroke has its own seed, so it keeps its shape whenever you come
// back to that tab.
import cosmeticsFile from '../../../shared/cosmetics.json'
import { cachedBrush, mulberry, path, stroke, tokenColor } from '../brush'
import { PaintCanvas } from './PaintCanvas'
import { journeyColors, paintBelt } from './journeyPaint'

const BELT_HEX = (cosmeticsFile as { beltColors: Record<string, string> }).beltColors

export function Insignia(props: { belt: string; stripes: number; label: string; founder: boolean }): React.JSX.Element {
  return (
    <span className="insignia" title={`your belt: ${props.label}`}>
      <PaintCanvas
        className="insignia-canvas"
        width={52}
        height={15}
        label={`your belt: ${props.label}`}
        paintKey={`${props.belt}|${props.stripes}`}
        paint={(ctx, w, h) => paintBelt(ctx, w, h, props.belt, props.stripes, journeyColors(BELT_HEX))}
      />
      {props.founder && <span className="insignia-crown">♛</span>}
    </span>
  )
}

/** Each tab's own seed, so its stroke is always the same stroke. */
const TAB_SEEDS: Record<string, number> = { home: 31, analytics: 37, wrapup: 41, journey: 43, setup: 47 }

export function TabStroke(props: { tab: string }): React.JSX.Element {
  const seed = TAB_SEEDS[props.tab] ?? 53
  return (
    <PaintCanvas
      className="tab-stroke"
      paintKey={props.tab}
      paintInMs={240}
      paint={(ctx, w, h, k) => {
        const r = mulberry(seed)
        const mid = h / 2
        const P = path(
          [
            [2, mid + 0.6 + (r() - 0.5)],
            [w * 0.45, mid - 0.5 + (r() - 0.5)],
            [w - 2, mid + (r() - 0.5)]
          ],
          1.2
        )
        const i1 = Math.max(1, Math.floor(Math.min(1, k) * (P.length - 1)))
        stroke(ctx, P, cachedBrush(seed, 12), {
          width: h * 0.62,
          rgb: tokenColor('--brand', [217, 164, 65]),
          dry: 0.45,
          core: 0.5,
          ts: 0.08,
          te: 0.3,
          i1
        })
      }}
    />
  )
}
