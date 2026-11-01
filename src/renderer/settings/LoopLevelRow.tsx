// SPDX-License-Identifier: GPL-3.0-only
// The hands-free loop's resting level (US-117): a slider, and a still
// tile above it showing a locked recording as the overlay draws it in
// the user's own look, waveform, and accent (the waveform tiles' mini
// pill, scaled to the tile as in the preview LaBroi approved on
// 2026-11-01), with the loop painted round the measured pill (the
// needle in bare) at the slider's level, by the overlay's own stadium,
// brush, and stroke, so dragging shows the result. The tile follows the
// draft while dragging; the setting is saved when the drag settles,
// like the volume slider. Still by design: the waveform paints once and
// keeps its frame, as the tiles do under reduced motion, and the loop
// is painted, not animated.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LOOP_LEVEL_MAX, LOOP_LEVEL_MIN, type OverlayLook } from '../../shared/overlay-state'
import { cachedBrush, canvasDpr, path, stroke, tokenColor } from '../brush'
import { BAR_COUNT } from '../overlay/Bars'
import { applyInkEdge, inkEdge } from '../overlay/bare'
import { ringBox, ringBrush, stadium } from '../overlay/lockRing'
import { STILL_LEVEL, stillLevels } from './fakeVoice'
import { MiniPill } from './WaveTiles'

/** The bars of a still frame, the same for every paint. */
const STILL_BARS = stillLevels(BAR_COUNT)
/** What the tile's timer reads: a take under way. */
const TIMER = '0:42'

function LoopTile(props: {
  look: OverlayLook
  level: number
  style: string
  accent: string | null
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const levelRef = useRef(STILL_LEVEL)
  // Signal amber from the tokens, for the default accent, as the
  // waveform tiles read it.
  const [amber] = useState(
    () => getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() || 'rgb(240, 164, 75)'
  )
  // Zooming the window changes the pixel ratio; repaint at the new one
  // so the tile stays sharp (US-111). The mini pill remounts too, so
  // its kept frame is painted again at the new ratio.
  const [ratio, setRatio] = useState(() => canvasDpr())
  useEffect(() => {
    const onResize = (): void => setRatio(canvasDpr())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The waveform paints only where it can be seen (rAF stops in a
  // hidden window, and a tile that is not laid out has no size), as the
  // waveform tiles do.
  const [onScreen, setOnScreen] = useState(false)
  const [showing, setShowing] = useState(() => !document.hidden)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const seen = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)))
    seen.observe(host)
    const onVisibility = (): void => setShowing(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      seen.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // The loop, round the pill as it is laid out. Painted again when the
  // level, the look, or the ratio changes, and when the tile gets its
  // size (Settings is laid out only once its tab is open).
  useLayoutEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!host || !canvas || !ctx) return
    const bare = props.look === 'bare'
    const buffer = bare ? document.createElement('canvas') : null
    const bufferCtx = buffer?.getContext('2d') ?? null
    const paint = (): void => {
      const W = host.clientWidth
      const H = host.clientHeight
      const target = host.querySelector(bare ? '.needle' : '.mini-pill')
      if (W < 1 || H < 1 || !target) return
      const base = host.getBoundingClientRect()
      const r = target.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      const pw = Math.round(W * ratio)
      const ph = Math.round(H * ratio)
      canvas.width = pw
      canvas.height = ph
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, pw, ph)
      // Bare paints into a buffer and lays it down with the ink edge,
      // as the overlay's loop does.
      const paintCtx = buffer && bufferCtx ? bufferCtx : ctx
      if (buffer && bufferCtx) {
        buffer.width = pw
        buffer.height = ph
      }
      paintCtx.setTransform(ratio, 0, 0, ratio, 0, 0)
      const box = ringBox({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }, props.look)
      const P = path(stadium(box.x, box.y, box.w, box.h), 1.5)
      const b = ringBrush(props.look)
      stroke(paintCtx, P, cachedBrush(b.seed, 26), {
        width: b.width,
        rgb: tokenColor('--amber', [240, 164, 75]),
        dry: 0.3,
        alpha: props.level / 100,
        i1: P.length - 1,
        ts: 0.05,
        te: 0.22
      })
      if (buffer) {
        ctx.save()
        applyInkEdge(ctx, inkEdge(), ratio)
        ctx.drawImage(buffer, 0, 0)
        ctx.restore()
      }
    }
    paint()
    const watch = new ResizeObserver(paint)
    watch.observe(host)
    return () => watch.disconnect()
  }, [props.look, props.level, ratio])

  return (
    <div className="loop-tile" ref={hostRef}>
      <div className="loop-tile-scale">
        <MiniPill
          key={`${props.style}|${props.look}|${props.accent}|${ratio}`}
          style={props.style}
          active={onScreen && showing}
          reduced
          levelRef={levelRef}
          levels={STILL_BARS}
          accent={props.accent ?? amber}
          look={props.look}
          live
          timer={TIMER}
        />
      </div>
      <canvas ref={canvasRef} className="loop-ring" aria-hidden="true" />
    </div>
  )
}

export function LoopLevelSlider(props: {
  value: number
  look: OverlayLook
  /** The waveform the overlay draws (overlay.style). */
  style: string
  /** The chosen accent; null is the default, signal amber, as the
   *  overlay draws it. */
  accent: string | null
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
      <div className={props.disabled ? 'loop-tile-wrap dim' : 'loop-tile-wrap'} aria-hidden="true">
        <LoopTile look={props.look} level={draft} style={props.style} accent={props.accent} />
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
