// SPDX-License-Identifier: GPL-3.0-only
// A canvas that paints itself (US-076): sized to its box at the screen's
// pixel density, repainted when the box or the density changes, and,
// when asked, painted in over a moment the first time (or, with replay,
// each time its data changes). Reduced motion always gets the finished
// painting at once.
import { useEffect, useRef } from 'react'

export type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number, k: number) => void

export function PaintCanvas(props: {
  paint: Paint
  /** Changes when the picture should repaint (the data behind it). */
  paintKey: string
  /** Paint in over this many milliseconds the first time; 0 paints at once. */
  paintInMs?: number
  /** Paint in again whenever paintKey changes, not only the first time
   *  (a gate drawing on progress made while it is open, US-095). */
  replay?: boolean
  /** A fixed drawing size in CSS pixels; otherwise the element's own box. */
  width?: number
  height?: number
  className?: string
  label?: string
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const painted = useRef(false)
  const lastKey = useRef<string | null>(null)
  const paintRef = useRef(props.paint)
  paintRef.current = props.paint

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let running = false
    const draw = (k: number): void => {
      const w = props.width ?? canvas.clientWidth
      const h = props.height ?? canvas.clientHeight
      if (w === 0 || h === 0) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      paintRef.current(ctx, w, h, k)
    }
    const ms = props.paintInMs ?? 0
    const fresh = !painted.current || (props.replay === true && lastKey.current !== props.paintKey)
    if (fresh && ms > 0 && !reduced && canvas.clientWidth > 0) {
      // The clock starts on the first frame, not now: a hidden window
      // runs no frames, and the paint-in waits for it to be seen.
      let t0 = -1
      running = true
      const tick = (now: number): void => {
        if (t0 < 0) t0 = now
        const k = Math.min(1, (now - t0) / ms)
        draw(k)
        if (k < 1) raf = requestAnimationFrame(tick)
        else running = false
      }
      raf = requestAnimationFrame(tick)
    } else {
      draw(1)
    }
    if (canvas.clientWidth > 0) {
      painted.current = true
      lastKey.current = props.paintKey
    }
    // Repaint finished when the box changes size or the window moves to a
    // screen of another density.
    const watch = new ResizeObserver(() => {
      if (!running) draw(1)
    })
    watch.observe(canvas)
    let density: MediaQueryList | null = null
    const onDensity = (): void => {
      draw(1)
      arm()
    }
    const arm = (): void => {
      density?.removeEventListener('change', onDensity)
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      density.addEventListener('change', onDensity)
    }
    arm()
    return () => {
      cancelAnimationFrame(raf)
      watch.disconnect()
      density?.removeEventListener('change', onDensity)
    }
  }, [props.paintKey, props.width, props.height, props.paintInMs, props.replay])

  const style = props.width !== undefined ? { width: props.width, height: props.height } : undefined
  return (
    <canvas
      ref={ref}
      className={props.className}
      style={style}
      aria-hidden={props.label ? undefined : true}
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
    />
  )
}
