// SPDX-License-Identifier: GPL-3.0-only
// The pulse waveform: rings ripple outward from the live dot's side of
// the pill, born on voice energy, fading as they travel. Canvas 2D,
// accent-colored, an unlockable.
import { useEffect, useRef } from 'react'

interface Ring {
  born: number
  strength: number
}

export function PulseWave(props: {
  levelRef: React.MutableRefObject<number>
  muted: boolean
  accent: string
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mutedRef = useRef(props.muted)
  mutedRef.current = props.muted
  const accentRef = useRef(props.accent)
  accentRef.current = props.accent

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
    const rings: Ring[] = []
    let lastBirth = 0
    let raf = 0

    const draw = (t: number): void => {
      const level = mutedRef.current ? 0 : props.levelRef.current
      const energy = Math.min(1, level * 3.2)
      // Louder voice births rings faster.
      const interval = 340 - energy * 240
      if (!reduced && energy > 0.04 && t - lastBirth > interval) {
        rings.push({ born: t, strength: energy })
        lastBirth = t
      }

      ctx.clearRect(0, 0, width, height)
      const cy = height / 2
      const maxRadius = width * 0.92
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]
        const age = (t - ring.born) / 1400
        if (age >= 1) {
          rings.splice(i, 1)
          continue
        }
        const radius = 4 + age * maxRadius
        ctx.globalAlpha = (1 - age) * 0.55 * (0.4 + ring.strength * 0.6)
        ctx.strokeStyle = accentRef.current
        ctx.lineWidth = 1.5 + ring.strength * 1.5
        ctx.beginPath()
        ctx.arc(6, cy, radius, -Math.PI / 2.6, Math.PI / 2.6)
        ctx.stroke()
      }
      // A steady heart at the origin so the quiet state is not empty.
      ctx.globalAlpha = 0.5 + energy * 0.5
      ctx.fillStyle = accentRef.current
      ctx.beginPath()
      ctx.arc(6, cy, 2.5 + energy * 2, 0, Math.PI * 2)
      ctx.fill()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [props.levelRef])

  return <canvas ref={canvasRef} className="speckle" aria-hidden="true" />
}
