// SPDX-License-Identifier: GPL-3.0-only
// The speckle waveform: a field of dots that drifts when quiet and
// vibrates with the voice. Plain canvas 2D driven by the same RMS level
// stream as the bars; no libraries, tiny window, cheap to paint.
import { useEffect, useRef } from 'react'

interface SpeckleWaveProps {
  /** Latest smoothed RMS level, written by the level stream. */
  levelRef: React.MutableRefObject<number>
  /** Dim and slow the field while processing. */
  muted: boolean
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

export function SpeckleWave({ levelRef, muted }: SpeckleWaveProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

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

    // Jittered grid rather than pure random: even speckle coverage with
    // no clumps or bald patches, like film grain.
    const cols = 14
    const rows = Math.ceil(DOT_COUNT / cols)
    const cellW = width / cols
    const cellH = height / rows
    const dots: Dot[] = Array.from({ length: DOT_COUNT }, (_, i) => ({
      x: (i % cols) * cellW + cellW * (0.2 + Math.random() * 0.6),
      y: Math.floor(i / cols) * cellH + cellH * (0.2 + Math.random() * 0.6),
      r: 0.7 + Math.random() * 1.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.1,
      alpha: 0.2 + Math.random() * 0.55,
      // A few amber sparks in the cream dust; amber is a live color and
      // this field only exists while live.
      warm: Math.random() < 0.16
    }))

    let smoothed = 0
    let raf = 0

    const draw = (t: number): void => {
      const target = mutedRef.current ? 0 : levelRef.current
      smoothed += (target - smoothed) * 0.25
      const energy = Math.min(1, smoothed * 3.2)

      ctx.clearRect(0, 0, width, height)
      const baseAlpha = mutedRef.current ? 0.35 : 1
      for (const dot of dots) {
        const jitter = reduced ? 0 : 1.2 + energy * 6.5
        const px = dot.x + Math.sin(t / 190 * dot.speed + dot.phase) * jitter
        const py = dot.y + Math.cos(t / 160 * dot.speed + dot.phase * 1.7) * jitter
        const radius = dot.r * (1 + energy * 1.1)
        ctx.globalAlpha = dot.alpha * (0.4 + energy * 0.6) * baseAlpha
        ctx.fillStyle = dot.warm ? '#F0A44B' : '#ECE9E4'
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [levelRef])

  return <canvas ref={canvasRef} className="speckle" aria-hidden="true" />
}
