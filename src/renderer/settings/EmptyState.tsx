// SPDX-License-Identifier: GPL-3.0-only
// What a tab says when it has nothing yet (US-089): one dry grey brush
// mark, the same scrape the pill shows for no speech, and a sentence
// with the real hotkey saying how to make the first stroke. Never red,
// never splatter: an empty screen is an invitation, not an error.
import { useEffect, useRef } from 'react'
import { cachedBrush, path, stroke, tokenColor } from '../brush'

const W = 120
const H = 40

function paintScrape(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // Seeded, so the mark is the same every time it shows.
  stroke(ctx, path([[6, 24], [50, 18], [114, 22]], 1.4), cachedBrush(55, 16), {
    width: 14,
    rgb: tokenColor('--text-dim', [154, 150, 143]),
    dry: 0.95,
    core: 0,
    ts: 0.05,
    te: 0.2
  })
}

export function EmptyState(props: { title: string; hotkey: string; after: string }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Painted once, and again when the window moves to a screen with a
  // different pixel density so the mark never goes soft.
  useEffect(() => {
    let query: MediaQueryList | null = null
    const paint = (): void => {
      if (canvasRef.current) paintScrape(canvasRef.current)
      query?.removeEventListener('change', paint)
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      query.addEventListener('change', paint)
    }
    paint()
    return () => query?.removeEventListener('change', paint)
  }, [])
  return (
    <section className="panel empty-state">
      <canvas ref={canvasRef} className="dry-mark" aria-hidden="true" />
      <div>
        <p className="empty-title">{props.title}</p>
        <p className="dim">
          Hold <span className="kbd">{props.hotkey}</span> anywhere and speak. {props.after}
        </p>
      </div>
    </section>
  )
}
