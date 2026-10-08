// SPDX-License-Identifier: GPL-3.0-only
// One gold brush stroke under Home's back today (US-085): its length is
// today's time back against a typical day, and a dotted pencil line runs
// on for the rest of the typical day. A day past typical fills the
// width. Seeded by the date, so the stroke keeps its shape all day.
import { useEffect, useRef } from 'react'
import { cachedBrush, mulberry, path, rgba, stroke, tokenColor } from '../brush'
import { daySeed } from './inkMarks'

const H = 24

function paint(canvas: HTMLCanvasElement, share: number, day: string): void {
  const width = Math.max(40, canvas.clientWidth)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, H)
  const seed = daySeed(day)
  const r = mulberry(seed)
  const x0 = 3
  const full = width - 6
  const reach = share > 0 ? Math.max(10, Math.min(1, share) * full) : 0
  const mid = H / 2
  if (reach > 0) {
    // A few control points with a little lift and sag, the same all day.
    const n = 4
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= n; i++) pts.push([x0 + (reach * i) / n, mid + (r() - 0.5) * 3.2])
    stroke(ctx, path(pts, 1.5), cachedBrush(80 + (seed % 6), 22), {
      width: 9,
      rgb: tokenColor('--brand', [217, 164, 65]),
      dry: 0.55,
      core: 0.35,
      ts: 0.06,
      te: 0.25
    })
  }
  // The rest of a typical day, in pencil.
  const from = x0 + reach + (reach > 0 ? 6 : 0)
  if (from < x0 + full - 4) {
    ctx.save()
    ctx.setLineDash([1.5, 4])
    ctx.lineCap = 'round'
    ctx.lineWidth = 1.3
    ctx.strokeStyle = rgba(tokenColor('--text-dim', [154, 150, 143]), 0.55)
    ctx.beginPath()
    ctx.moveTo(from, mid)
    ctx.lineTo(x0 + full, mid)
    ctx.stroke()
    ctx.restore()
  }
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
