// SPDX-License-Identifier: GPL-3.0-only
// The icons on a dictation's row (US-166): what you said, report and
// copy. Each is drawn here, in code, like every other mark in murmur;
// none is taken from an icon set. They carry no box (LaBroi,
// 2026-11-12), so the row stays about the words; each says its name
// beside it the moment it is pointed at or focused (HomeView).
import { cachedBrush, path, stroke, tokenColor } from '../brush'
import { PaintCanvas } from './PaintCanvas'

const SIZE = 16

function Glyph(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {props.children}
    </svg>
  )
}

/** Copy: 2 sheets, 1 over the other. */
export function CopyIcon(): React.JSX.Element {
  return (
    <Glyph>
      <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
      <path d="M10.5 5.5v-1a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1" />
    </Glyph>
  )
}

/** Report: a flag, as in "flag this one for us". */
export function FlagIcon(): React.JSX.Element {
  return (
    <Glyph>
      <path d="M3.5 14V2.5" />
      <path d="M3.5 3h8.5l-1.8 2.75L12 8.5H3.5" />
    </Glyph>
  )
}

/** What you said: a filled speech bubble with 3 dots cut out of it, so
 *  whatever is behind the row shows through the dots. */
export function SaidIcon(): React.JSX.Element {
  const dot = (cx: number): string => `M${cx - 0.85} 7.3a.85.85 0 1 0 1.7 0a.85.85 0 1 0-1.7 0z`
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={`M8 2.4c3.4 0 6.1 2.2 6.1 4.9S11.4 12.2 8 12.2c-.7 0-1.3-.1-1.9-.25L2.9 13.6l.9-2.7C2.6 10 1.9 8.7 1.9 7.3 1.9 4.6 4.6 2.4 8 2.4z${dot(5.3)}${dot(8)}${dot(10.7)}`}
      />
    </svg>
  )
}

/** How long the check takes to draw, and how long copy stays a check. */
export const CHECK_DRAW_MS = 320
export const COPIED_MS = 1500

const CHECK_SEED = 59
/** The check's path in a box of 1 by 1: down to the corner, then up. */
const CHECK: ReadonlyArray<readonly [number, number]> = [
  [0.14, 0.5],
  [0.26, 0.63],
  [0.38, 0.78],
  [0.58, 0.5],
  [0.88, 0.17]
]

/** Copy's answer: 1 gold brush stroke draws a check (LaBroi,
 *  2026-11-12). The stroke is seeded, so it is the same check every
 *  time, and reduced motion gets it finished at once (PaintCanvas). */
export function CopyCheck(): React.JSX.Element {
  return (
    <PaintCanvas
      className="copy-check"
      width={18}
      height={18}
      paintKey="check"
      paintInMs={CHECK_DRAW_MS}
      paint={(ctx, w, h, k) => {
        const P = path(
          CHECK.map(([x, y]) => [x * w, y * h] as const),
          0.8
        )
        const i1 = Math.max(1, Math.floor(Math.min(1, k) * (P.length - 1)))
        stroke(ctx, P, cachedBrush(CHECK_SEED, 10), {
          width: h * 0.24,
          rgb: tokenColor('--brand', [217, 164, 65]),
          dry: 0.4,
          core: 0.6,
          ts: 0.06,
          te: 0.34,
          i1
        })
      }}
    />
  )
}
