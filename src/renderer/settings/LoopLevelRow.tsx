// SPDX-License-Identifier: GPL-3.0-only
// The hands-free loop's resting level (US-117): a slider, and a still
// tile above it that paints the loop at the slider's level round a mini
// pill in the user's own look, with the overlay's own stadium, brush and
// stroke, so dragging shows the result. The tile follows the draft while
// dragging; the setting is saved when the drag settles, like the volume
// slider. Still by design: no animation, so reduced motion needs no
// special case.
import { useEffect, useRef, useState } from 'react'
import {
  LOOP_LEVEL_MAX,
  LOOP_LEVEL_MIN,
  type OverlayLook
} from '../../shared/overlay-state'
import { cachedBrush, canvasDpr, path, stroke, tokenColor } from '../brush'
import { ringBox, ringBrush, stadium, type Box } from '../overlay/lockRing'

const TILE_W = 200
const TILE_H = 64

/** The mini pill (or, in bare, the dot and waveform) inside the tile. */
function pillBox(look: OverlayLook): Box {
  const w = look === 'bare' ? 84 : look === 'compact' ? 108 : 124
  const h = look === 'bare' ? 22 : look === 'compact' ? 28 : 40
  return { x: (TILE_W - w) / 2, y: (TILE_H - h) / 2, w, h }
}

/** A fixed row of bar heights, as a quiet stand-in for the waveform. */
const BARS = [0.35, 0.6, 0.45, 0.85, 0.55, 0.7, 0.4, 0.6, 0.3]

function LoopTile(props: { look: OverlayLook; level: number }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  // Zooming the window changes the pixel ratio; repaint at the new one
  // so the tile stays sharp (US-111).
  const [ratio, setRatio] = useState(() => canvasDpr())
  useEffect(() => {
    const onResize = (): void => setRatio(canvasDpr())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = ratio
    canvas.width = Math.round(TILE_W * dpr)
    canvas.height = Math.round(TILE_H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, TILE_W, TILE_H)
    const amber = tokenColor('--amber', [240, 164, 75])
    const dim = tokenColor('--text-dim', [154, 150, 143])
    const edge = tokenColor('--cream-25', [236, 233, 228])
    const box = pillBox(props.look)

    // The pill itself (bare has no box, only the dot and the bars).
    if (props.look !== 'bare') {
      ctx.beginPath()
      ctx.roundRect(box.x, box.y, box.w, box.h, box.h / 2)
      ctx.strokeStyle = `rgba(${edge[0]},${edge[1]},${edge[2]},0.22)`
      ctx.lineWidth = 1
      ctx.stroke()
    }
    const cy = box.y + box.h / 2
    ctx.fillStyle = `rgba(${dim[0]},${dim[1]},${dim[2]},0.8)`
    ctx.beginPath()
    ctx.arc(box.x + 14, cy, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = `rgba(${amber[0]},${amber[1]},${amber[2]},0.75)`
    const barsLeft = box.x + 28
    const barsRight = box.x + box.w - 14
    const gap = (barsRight - barsLeft) / BARS.length
    BARS.forEach((v, i) => {
      const bh = (box.h - 14) * v
      ctx.fillRect(barsLeft + i * gap, cy - bh / 2, 3, bh)
    })

    // The loop, at the level.
    const around = ringBox(box, props.look)
    const P = path(stadium(around.x, around.y, around.w, around.h), 1.5)
    const b = ringBrush(props.look)
    stroke(ctx, P, cachedBrush(b.seed, 26), {
      width: b.width,
      rgb: amber,
      dry: 0.3,
      alpha: props.level / 100,
      i1: P.length - 1,
      ts: 0.05,
      te: 0.22
    })
  }, [props.look, props.level, ratio])

  return <canvas ref={ref} className="loop-tile" style={{ width: TILE_W, height: TILE_H }} aria-hidden="true" />
}

export function LoopLevelSlider(props: {
  value: number
  look: OverlayLook
  disabled: boolean
  onCommit: (level: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => setDraft(props.value), [props.value])
  const commit = (): void => {
    if (draft !== props.value) props.onCommit(draft)
  }
  return (
    <div className="loop-level">
      <div className={props.disabled ? 'loop-tile-wrap dim' : 'loop-tile-wrap'}>
        <LoopTile look={props.look} level={draft} />
      </div>
      <div className="inline">
        <input
          type="range"
          min={LOOP_LEVEL_MIN}
          max={LOOP_LEVEL_MAX}
          step={5}
          value={draft}
          disabled={props.disabled}
          aria-label="Loop once it settles"
          aria-valuetext={`${draft} percent`}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span className="status-dim loop-level-value">{draft}%</span>
      </div>
    </div>
  )
}
