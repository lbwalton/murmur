// SPDX-License-Identifier: GPL-3.0-only
// The speckle waveform: a field of dots that drifts when quiet and
// vibrates with the voice. Plain canvas 2D driven by the same RMS level
// stream as the bars; no libraries, tiny window, cheap to paint.
import { useEffect, useRef } from 'react'
import { OVERHANG, applyInkEdge, fadeToEdges, inkEdge } from './bare'

interface SpeckleWaveProps {
  /** Latest smoothed RMS level, written by the level stream. */
  levelRef: React.MutableRefObject<number>
  /** Dim and slow the field while processing. */
  muted: boolean
  /** Unlockable accent for the warm sparks; null keeps signal amber. */
  accent?: string | null
  /** The bare look: the dust keeps to its slot inside an overhanging
   *  canvas, each dot carries an ink edge, and the field fades out
   *  before the canvas ends. */
  bare?: boolean
}

interface Dot {
  x: number
  y: number
  r: number
  phase: number
  speed: number
  alpha: number
  warm: boolean
}

const DOT_COUNT = 84

export function SpeckleWave(props: SpeckleWaveProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mutedRef = useRef(props.muted)
  mutedRef.current = props.muted

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.scale(dpr, dpr)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bare = props.bare === true
    const edge = bare ? inkEdge() : ''
    // The field's own rectangle: the whole canvas, or in bare the slot
    // inside the overhang.
    const fx0 = bare ? OVERHANG.x : 0
    const fy0 = bare ? OVERHANG.y : 0
    const fieldW = width - 2 * fx0
    const fieldH = height - 2 * fy0

    // Colors come from the design tokens, never hardcoded: the canvas
    // reads the same variables the stylesheets consume.
    const styles = getComputedStyle(document.documentElement)
    const amber = props.accent ?? (styles.getPropertyValue('--amber').trim() || 'rgb(240, 164, 75)')
    const cream = styles.getPropertyValue('--text').trim() || 'rgb(236, 233, 228)'

    // Jittered grid rather than pure random: even speckle coverage with
    // no clumps or bald patches, like film grain.
    const cols = 14
    const rows = Math.ceil(DOT_COUNT / cols)
    const cellW = fieldW / cols
    const cellH = fieldH / rows
    const dots: Dot[] = Array.from({ length: DOT_COUNT }, (_, i) => ({
      x: fx0 + (i % cols) * cellW + cellW * (0.2 + Math.random() * 0.6),
      y: fy0 + Math.floor(i / cols) * cellH + cellH * (0.2 + Math.random() * 0.6),
      r: 0.5 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.1,
      alpha: 0.16 + Math.random() * 0.42,
      // A few amber sparks in the cream dust; amber is a live color and
      // this field only exists while live.
      warm: Math.random() < 0.16
    }))

    let smoothed = 0
    let raf = 0

    // Soft-edge falloff: dots fade toward every edge of the field so the
    // speckle melts into the pill instead of ending at a hard rectangle.
    const FADE_X = 7
    const FADE_Y = 8
    const edgeFade = (px: number, py: number): number => {
      const fx = Math.min(1, Math.max(0, Math.min(px, width - px) / FADE_X))
      const fy = Math.min(1, Math.max(0, Math.min(py, height - py) / FADE_Y))
      const f = fx * fy
      return f * f * (3 - 2 * f) // smoothstep
    }

    const draw = (t: number): void => {
      const target = mutedRef.current ? 0 : props.levelRef.current
      smoothed += (target - smoothed) * 0.25
      const energy = Math.min(1, smoothed * 3.2)

      ctx.clearRect(0, 0, width, height)
      if (bare) applyInkEdge(ctx, edge, dpr)
      const baseAlpha = mutedRef.current ? 0.35 : 1
      for (const dot of dots) {
        const jitter = reduced ? 0 : 1.2 + energy * 6
        const px = dot.x + Math.sin(t / 190 * dot.speed + dot.phase) * jitter
        const py = dot.y + Math.cos(t / 160 * dot.speed + dot.phase * 1.7) * jitter
        // Bare dots are a touch larger and fade less: there is no pill
        // behind them, and the canvas-wide fade replaces the per-dot one.
        const radius = dot.r * (bare ? 1.2 : 1) * (1 + energy * 0.8)
        ctx.globalAlpha = bare
          ? Math.min(1, (0.5 + dot.alpha * 0.8) * (0.6 + energy * 0.4)) * baseAlpha
          : dot.alpha * (0.4 + energy * 0.6) * baseAlpha * edgeFade(px, py)
        ctx.fillStyle = dot.warm ? amber : cream
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      if (bare) fadeToEdges(ctx, width, height, 0.88)
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [props.levelRef, props.accent, props.bare])

  return <canvas ref={canvasRef} className="speckle" aria-hidden="true" />
}
