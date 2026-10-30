// SPDX-License-Identifier: GPL-3.0-only
// The hands-free ring (US-117), painted on a canvas over the whole
// overlay window. While a take is locked, one signal amber stroke closes
// the loop round the pill (in bare, round the dot and the waveform
// together), drying to brand gold in the last minute before the hard
// stop. On a cancel the loop fades with the pill under one dry grey
// scrape, never red. Reduced motion draws the loop closed and still, and
// the scrape still. Mounted only while locked or cancelled, so holding
// draws nothing and costs nothing.
import { useEffect, useRef } from 'react'
import type { OverlayLook, OverlayPhase } from '../../shared/overlay-state'
import { applyInkEdge, inkEdge } from './bare'
import {
  CANCEL_LINGER_MS,
  LOCK_DRAW_MS,
  PILL_FADE_MS,
  SCRAPE_MS,
  ringBox,
  ringBrush,
  ringDryness,
  scrapePoints,
  stadium
} from './lockRing'
import { cachedBrush, canvasDpr, clamp, easeOut, mix, path, stroke, tokenColor } from '../brush'

export function LockRingCanvas(props: {
  phase: OverlayPhase
  /** The look actually drawn this phase. */
  look: OverlayLook
  /** Epoch ms of the take's first press; null once it has ended. */
  startedAt: number | null
  pillRef: React.RefObject<HTMLDivElement | null>
  needleRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const C = {
      amber: tokenColor('--amber', [240, 164, 75]),
      gold: tokenColor('--brand', [217, 164, 65]),
      dim: tokenColor('--text-dim', [154, 150, 143])
    }
    // Bare paints into a buffer and lays it down once with the ink edge,
    // like the ink waveforms, so the loop reads over a white page.
    const buffer = document.createElement('canvas')
    const bufferCtx = buffer.getContext('2d')
    const edge = inkEdge()

    // Mounting is the lock: the loop draws in from now. Mounted straight
    // onto a cancel, there was no loop to fade, only the scrape to draw.
    const lockedAt = performance.now()
    const hadLoop = propsRef.current.phase === 'recording'
    let cancelledAt: number | null = null
    let dryness = 0
    let lastKey = ''
    let raf = 0

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame)
      const { phase, look, startedAt, pillRef, needleRef } = propsRef.current
      const el = look === 'bare' ? needleRef.current : pillRef.current
      if (!el) return
      if (phase === 'cancelled' && cancelledAt === null) cancelledAt = now
      // The take's age dries the loop; a cancel keeps the shade it had.
      if (phase === 'recording' && startedAt !== null) dryness = ringDryness(Date.now() - startedAt)

      const progress = reduced ? 1 : easeOut(clamp((now - lockedAt) / LOCK_DRAW_MS, 0, 1))
      let ringAlpha = hadLoop ? 1 : 0
      let scrape = 0
      let scrapeAlpha = 0
      if (cancelledAt !== null) {
        const since = now - cancelledAt
        const gone = SCRAPE_MS + PILL_FADE_MS
        // The loop goes with the pill; the scrape outlives both and is
        // faded out by the time the pill rests.
        ringAlpha = reduced ? 0 : ringAlpha * (1 - clamp((since - SCRAPE_MS) / PILL_FADE_MS, 0, 1))
        scrape = reduced ? 1 : easeOut(clamp(since / SCRAPE_MS, 0, 1))
        scrapeAlpha = 0.9 * (reduced ? 1 : 1 - clamp((since - gone) / (CANCEL_LINGER_MS - gone), 0, 1))
      }

      const W = window.innerWidth
      const H = window.innerHeight
      const dpr = canvasDpr()
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      // Paint only when something visible changed: a held loop is still.
      const key = [W, H, dpr, look, r.left, r.top, r.width, r.height, progress, dryness, ringAlpha, scrape, scrapeAlpha]
        .map((v) => (typeof v === 'number' ? v.toFixed(3) : v))
        .join('|')
      if (key === lastKey) return
      lastKey = key
      const pw = Math.round(W * dpr)
      const ph = Math.round(H * dpr)
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
      }
      const paint = look === 'bare' && bufferCtx ? bufferCtx : ctx
      const bare = paint !== ctx
      if (bare && (buffer.width !== pw || buffer.height !== ph)) {
        buffer.width = pw
        buffer.height = ph
      }
      for (const c of bare ? [ctx, paint] : [ctx]) {
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.clearRect(0, 0, pw, ph)
      }
      paint.setTransform(dpr, 0, 0, dpr, 0, 0)

      const target = { x: r.left, y: r.top, w: r.width, h: r.height }
      if (ringAlpha > 0) {
        const box = ringBox(target, look)
        const P = path(stadium(box.x, box.y, box.w, box.h), 1.5)
        const b = ringBrush(look)
        stroke(paint, P, cachedBrush(b.seed, 26), {
          width: b.width,
          rgb: mix(C.amber, C.gold, dryness),
          dry: 0.3 + 0.45 * dryness,
          alpha: ringAlpha,
          i1: Math.max(1, Math.floor(progress * (P.length - 1))),
          ts: 0.05,
          te: 0.22
        })
      }
      if (scrapeAlpha > 0) {
        const P = path(scrapePoints(target), 1.5)
        stroke(paint, P, cachedBrush(19, 22), {
          width: look === 'compact' ? 7 : 10,
          rgb: C.dim,
          dry: 0.85,
          alpha: scrapeAlpha,
          i1: Math.max(1, Math.floor(scrape * (P.length - 1)))
        })
      }
      if (bare) {
        ctx.save()
        applyInkEdge(ctx, edge, dpr)
        ctx.drawImage(buffer, 0, 0)
        ctx.restore()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} className="lock-ring" data-lock-ring="" aria-hidden="true" />
}
