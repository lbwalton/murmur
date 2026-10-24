// SPDX-License-Identifier: GPL-3.0-only
// One gold brush stroke under Home's back today (US-085): its length is
// today's time back against a typical day, and a dotted pencil line runs
// on for the rest of the typical day. A day past typical fills the
// width. Seeded by the date, so the stroke keeps its shape all day.
import { useEffect, useRef } from 'react'
import { DAY_STROKE_H, paintDayStroke } from './analyticsPaint'

/** Sizes the canvas to its width; the stroke is analyticsPaint's, shared
 *  with the iPhone (IOS-022). */
function paint(canvas: HTMLCanvasElement, share: number, day: string): void {
  const width = Math.max(40, canvas.clientWidth)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(DAY_STROKE_H * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, DAY_STROKE_H)
  paintDayStroke(ctx, width, share, day)
}

export function DayStroke(props: { share: number; day: string }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = (): void => paint(canvas, props.share, props.day)
    draw()
    // Repainted when the card changes width, never stretched.
    const watch = new ResizeObserver(draw)
    watch.observe(canvas)
    return () => watch.disconnect()
  }, [props.share, props.day])
  return <canvas ref={canvasRef} className="day-stroke" aria-hidden="true" />
}
