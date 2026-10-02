// SPDX-License-Identifier: GPL-3.0-only
// The ink waveforms (US-074): dabs, flecks, rings, and ribbon, painted
// with the brush. One set of rules for all four: wet paint in the
// accent while live, drying to brand gold (or a darker shade of a
// custom accent) when the brush lifts, one sheen while processing, flat
// when inserted, a dry grey scrape for no speech, and clean red with no
// bristles for an error. Works in every look; in bare the marks carry
// the ink edge and fade before the canvas ends, like pulse and speckle.
import { useEffect, useRef } from 'react'
import type { InkStyle, OverlayPhase } from '../../shared/overlay-state'
import { OVERHANG, applyInkEdge, fadeToEdges, inkEdge } from './bare'
import { type Rgb, cachedBrush, clamp, easeOut, lerp, mix, mulberry, parseColor, path, rgba, stroke, tokenColor } from '../brush'

type Mode = 'idle' | 'rec' | 'proc' | 'ins' | 'err' | 'nospeech'

function modeOf(phase: OverlayPhase): Mode {
  switch (phase) {
    case 'recording':
      return 'rec'
    case 'processing':
      return 'proc'
    case 'inserted':
      return 'ins'
    case 'error':
      return 'err'
    case 'nospeech':
      return 'nospeech'
    default:
      return 'idle'
  }
}

/** A new level column every 66 ms, the rhythm of the bars. */
const PUSH_MS = 66
const COLS = 21
const RIBBON_SAMPLES = 48
/** How long a phase change keeps animating before the canvas rests. */
const SETTLE_MS = 1600

interface Column {
  lv: number
  seed: number
  born: number
}
interface Ring {
  born: number
  s: number
  seed: number
}
interface Fling {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  r: number
}

export function InkWave(props: {
  kind: InkStyle
  /** Latest RMS level, written by the level stream. */
  levelRef: React.MutableRefObject<number>
  phase: OverlayPhase
  /** Unlockable accent color; null keeps signal amber. */
  accent: string | null
  bare?: boolean
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(props.phase)
  phaseRef.current = props.phase
  const accentRef = useRef(props.accent)
  accentRef.current = props.accent
  const kickRef = useRef<() => void>(() => undefined)

  // A phase or accent change wakes a resting canvas.
  useEffect(() => {
    kickRef.current()
  }, [props.phase, props.accent])

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

    const kind = props.kind
    const bare = props.bare === true
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Bare paints into a buffer and lays it down once with the ink edge:
    // one shadow per frame instead of one per bristle.
    let paint: CanvasRenderingContext2D = ctx
    let buffer: HTMLCanvasElement | null = null
    if (bare) {
      buffer = document.createElement('canvas')
      buffer.width = canvas.width
      buffer.height = canvas.height
      const b = buffer.getContext('2d')
      if (!b) return
      b.scale(dpr, dpr)
      paint = b
    }
    const edge = bare ? inkEdge() : ''
    // The field: the whole canvas, or in bare the slot inside the overhang.
    const fx0 = bare ? OVERHANG.x : 0
    const fy0 = bare ? OVERHANG.y : 0
    const fw = width - 2 * fx0
    const fh = height - 2 * fy0
    const cy = fy0 + fh / 2

    const C = {
      amber: tokenColor('--amber', [240, 164, 75]),
      gold: tokenColor('--brand', [217, 164, 65]),
      red: tokenColor('--red', [229, 72, 77]),
      text: tokenColor('--text', [236, 233, 228]),
      dim: tokenColor('--text-dim', [154, 150, 143]),
      ink: tokenColor('--ink', [15, 14, 17])
    }
    // Wet is the accent; dry is brand gold for the default, or the
    // custom accent a shade darker, the same pigment once it sets. Main
    // always sends a color, the default included, so signal amber itself
    // counts as the default (review gate 2026-10-01).
    const isAmber = (c: Rgb): boolean =>
      Math.abs(c[0] - C.amber[0]) + Math.abs(c[1] - C.amber[1]) + Math.abs(c[2] - C.amber[2]) < 6
    const palette = (): { wet: Rgb; dry: Rgb } => {
      const custom = parseColor(accentRef.current)
      if (!custom || isAmber(custom)) return { wet: C.amber, dry: C.gold }
      return { wet: custom, dry: mix(custom, C.ink, 0.35) }
    }

    let lastPhase = phaseRef.current
    let mode: Mode = modeOf(lastPhase)
    let modeAt = performance.now()
    let seedN = 0
    const cols: Column[] = Array.from({ length: COLS }, () => ({ lv: 0, seed: seedN++, born: -1e9 }))
    const ribbon = new Array<number>(RIBBON_SAMPLES).fill(0)
    let pushes = 0
    let lastPush = modeAt
    let snap: Rgb[] = []
    // Where the columns sat when the brush lifted, so release never jumps.
    let frozen = 0
    let smoothed = 0
    const rings: Ring[] = []
    let lastBirth = 0
    const flung: Fling[] = []
    const rnd = mulberry(4040)
    const dotCols = 14
    const dotRows = 6
    const dots = Array.from({ length: dotCols * dotRows }, (_, i) => ({
      x: fx0 + ((i % dotCols) + 0.2 + rnd() * 0.6) * (fw / dotCols),
      y: fy0 + (Math.floor(i / dotCols) + 0.2 + rnd() * 0.6) * (fh / dotRows),
      r: 0.6 + rnd() * 1.0,
      ph: rnd() * Math.PI * 2,
      sp: 0.4 + rnd() * 1.1,
      a: 0.22 + rnd() * 0.45,
      warm: rnd() < 0.16
    }))

    const colorRec = (c: Column, now: number, p: { wet: Rgb; dry: Rgb }): Rgb => {
      const age = now - c.born
      return age < 260 ? p.wet : mix(p.wet, p.dry, clamp((age - 260) / 900, 0, 1))
    }
    const tint = (now: number, base: Rgb, p: { dry: Rgb }): Rgb => {
      switch (mode) {
        case 'rec':
          return base
        case 'proc':
          return mix(base, p.dry, easeOut(clamp((now - modeAt) / 600, 0, 1)))
        case 'ins':
          return p.dry
        case 'err':
          return C.red
        case 'nospeech':
          return C.dim
        default:
          return C.text
      }
    }
    const setMode = (m: Mode, now: number): void => {
      const p = palette()
      snap = cols.map((c) => colorRec(c, now, p))
      frozen = mode === 'rec' ? clamp((now - lastPush) / PUSH_MS, 0, 1) : frozen
      mode = m
      modeAt = now
      // Errors and no speech start clean: no ring or flung drop carries over.
      if (m === 'err' || m === 'nospeech') {
        rings.length = 0
        flung.length = 0
      }
      if (m === 'rec' || m === 'idle') {
        frozen = 0
        for (const c of cols) {
          c.lv = 0
          c.born = -1e9
        }
        ribbon.fill(0)
        rings.length = 0
        flung.length = 0
        smoothed = 0
        lastPush = now
      }
    }
    const push = (lv: number, at: number): void => {
      cols.shift()
      cols.push({ lv, seed: seedN++ % 64, born: at })
      ribbon.shift()
      ribbon.push(lv)
      pushes++
    }

    const drawDabs = (now: number, p: { wet: Rgb; dry: Rgb }): void => {
      const gap = fw / COLS
      const maxH = fh * 0.94
      const mt = now - modeAt
      const phase = mode === 'rec' ? clamp((now - lastPush) / PUSH_MS, 0, 1) : frozen
      for (let i = 0; i < COLS; i++) {
        const c = cols[i]
        let lv = c.lv
        let rgb = C.text
        let alpha = 1
        const dry = mode === 'nospeech' ? 0.95 : 0.32
        if (mode === 'rec') {
          rgb = colorRec(c, now, p)
          if (lv < 0.05) {
            rgb = C.text
            alpha = 0.3
          }
        } else if (mode === 'proc') {
          rgb = mix(snap[i] ?? p.dry, p.dry, easeOut(clamp(mt / 600, 0, 1)))
          if (lv < 0.05) {
            rgb = C.text
            alpha = 0.3
          }
        } else if (mode === 'ins') {
          const k = easeOut(clamp(mt / 420, 0, 1))
          rgb = p.dry
          lv = lerp(lv, 0.05, k)
          alpha = 1 - 0.55 * k
        } else if (mode === 'err') {
          rgb = C.red
          lv = 0.1 + (i % 4 === 0 ? 0.12 : 0)
        } else if (mode === 'nospeech') {
          rgb = C.dim
          lv = 0.05 + 0.08 * Math.abs(Math.sin(i * 1.3))
          alpha = 0.9
        } else {
          lv = 0.05
          alpha = 0.32
        }
        const hh = Math.max(3, 3 + lv * (maxH - 3))
        const x = fx0 + (i + 0.5 - phase) * gap
        if (x < fx0 + 1 || x > fx0 + fw - 1) continue
        if (mode === 'err') {
          // Clean red: a plain rounded bar, no bristles.
          paint.strokeStyle = rgba(rgb, alpha)
          paint.lineWidth = gap * 0.5
          paint.lineCap = 'round'
          paint.beginPath()
          paint.moveTo(x, cy + hh / 2)
          paint.lineTo(x, cy - hh / 2)
          paint.stroke()
          continue
        }
        const tilt = (((c.seed * 37) % 7) - 3) * 0.22
        const P = path([[x + tilt, cy + hh / 2], [x - tilt, cy - hh / 2]], 1.3)
        stroke(paint, P, cachedBrush(c.seed % 64, 9), { width: gap * 0.7, rgb, alpha, dry, ts: 0.18, te: 0.3, core: 0.35 })
      }
    }

    const drawFlecks = (now: number, level: number, p: { wet: Rgb; dry: Rgb }): void => {
      const live = mode === 'rec'
      const mt = now - modeAt
      smoothed += ((live ? level : 0) - smoothed) * 0.25
      const e = Math.min(1, smoothed * 1.3)
      const fade = (x: number, y: number): number => {
        if (bare) return 1
        const f = clamp(Math.min(x - fx0, fx0 + fw - x) / 7, 0, 1) * clamp(Math.min(y - fy0, fy0 + fh - y) / 6, 0, 1)
        return f * f * (3 - 2 * f)
      }
      for (const d of dots) {
        const warm = d.warm || d.r > 1.45
        let col = warm ? p.wet : C.text
        let a = d.a * (bare ? 1.4 : 1)
        let jit = 0
        if (live) jit = 1 + e * 6
        else if (mode === 'proc') col = mix(col, p.dry, easeOut(clamp(mt / 600, 0, 1)))
        else if (mode === 'ins') {
          col = p.dry
          a *= 1 - 0.6 * easeOut(clamp(mt / 420, 0, 1))
        } else if (mode === 'err') {
          col = C.red
          a = warm ? 0.9 : 0.35
        } else if (mode === 'nospeech') {
          col = C.dim
          a *= 0.6
        } else {
          // At rest every fleck is plain: amber is for live paint only.
          col = C.text
          a *= 0.5
        }
        if (reduced) jit = 0
        const a1 = (now / 190) * d.sp + d.ph
        const a2 = (now / 160) * d.sp + d.ph * 1.7
        const x = d.x + Math.sin(a1) * jit
        const y = d.y + Math.cos(a2) * jit
        const f = fade(x, y)
        if (f <= 0) continue
        if (mode === 'err') {
          // Clean red: plain round dots, never paint flecks.
          paint.fillStyle = rgba(col, Math.min(1, a) * f)
          paint.beginPath()
          paint.arc(x, y, d.r * 0.8, 0, Math.PI * 2)
          paint.fill()
          continue
        }
        // A fleck of paint: stretched along its motion, a satellite drop
        // trailing the bigger ones. Reduced motion holds every fleck still.
        const ang = reduced ? d.ph : Math.atan2(-Math.sin(a2) / 160, Math.cos(a1) / 190)
        const st = 1 + e * 1.8
        paint.fillStyle = rgba(col, Math.min(1, a) * f)
        paint.beginPath()
        paint.ellipse(x, y, d.r * st * 1.45, d.r * 0.95, ang, 0, Math.PI * 2)
        if (warm) paint.ellipse(x - Math.cos(ang) * d.r * st * 2.2, y - Math.sin(ang) * d.r * st * 2.2, d.r * 0.4, d.r * 0.4, 0, 0, Math.PI * 2)
        paint.fill()
      }
      if (live && !reduced && Math.random() < e * 0.35) {
        const d = dots[(Math.random() * dots.length) | 0]
        const ang = Math.random() * Math.PI * 2
        const v = 0.05 + e * 0.12
        flung.push({ x: d.x, y: d.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v * 0.5, born: now, r: 0.8 + Math.random() * 1.2 })
      }
      for (let i = flung.length - 1; i >= 0; i--) {
        const fl = flung[i]
        const age = now - fl.born
        if (age > 420) {
          flung.splice(i, 1)
          continue
        }
        const x = fl.x + fl.vx * age
        const y = fl.y + fl.vy * age
        const a = 1 - age / 420
        paint.strokeStyle = rgba(p.wet, 0.5 * a)
        paint.lineWidth = fl.r
        paint.lineCap = 'round'
        paint.beginPath()
        paint.moveTo(x - fl.vx * 60, y - fl.vy * 60)
        paint.lineTo(x, y)
        paint.stroke()
        paint.fillStyle = rgba(p.wet, a)
        paint.beginPath()
        paint.arc(x, y, fl.r, 0, Math.PI * 2)
        paint.fill()
      }
    }

    const drawRings = (now: number, level: number, p: { wet: Rgb; dry: Rgb }): void => {
      const live = mode === 'rec'
      smoothed += ((live ? level : 0) - smoothed) * 0.3
      const e = Math.min(1, smoothed * 1.2)
      const col = tint(now, p.wet, p)
      if (live && !reduced && e > 0.08 && now - lastBirth > 340 - e * 240) {
        rings.push({ born: now, s: e, seed: pushes % 32 })
        lastBirth = now
      }
      const ox = fx0 + 6
      // Only the part of an arc that can show gets painted.
      const halfH = fh / 2 + fy0 + 3
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]
        const age = (now - r.born) / 1400
        if (age >= 1) {
          rings.splice(i, 1)
          continue
        }
        const rad = 4 + age * fw * 0.92
        const a = (1 - age) * 0.9 * (0.4 + r.s * 0.6)
        const amax = Math.min(Math.PI / 2.6, Math.asin(Math.min(1, halfH / rad)))
        const pts: Array<[number, number]> = []
        for (let j = 0; j <= 12; j++) {
          const ang = lerp(-amax, amax, j / 12)
          pts.push([ox + Math.cos(ang) * rad, cy + Math.sin(ang) * rad])
        }
        stroke(paint, path(pts, 1.4), cachedBrush(600 + r.seed, 7), { width: 2 + r.s * 3.2, rgb: col, alpha: a, dry: 0.4 + age * 0.5, core: 0.3, ts: 0.2, te: 0.35 })
      }
      paint.fillStyle = rgba(col, mode === 'idle' ? 0.35 : 0.5 + e * 0.5)
      paint.beginPath()
      paint.arc(ox, cy, 2.5 + e * 2, 0, Math.PI * 2)
      paint.fill()
    }

    const drawRibbon = (now: number, p: { wet: Rgb; dry: Rgb }): void => {
      const mt = now - modeAt
      const live = mode === 'rec'
      const sp = fw / (RIBBON_SAMPLES - 2)
      const phase = live ? clamp((now - lastPush) / PUSH_MS, 0, 1) : frozen
      const flat = mode === 'ins' ? 1 - easeOut(clamp(mt / 420, 0, 1)) * 0.85 : 1
      const lvAt = (u: number): number => {
        const x = u * (RIBBON_SAMPLES - 1)
        const i = Math.floor(x)
        return lerp(ribbon[clamp(i, 0, RIBBON_SAMPLES - 1)], ribbon[clamp(i + 1, 0, RIBBON_SAMPLES - 1)], x - i)
      }
      const quiet = mode === 'idle' || mode === 'nospeech' || mode === 'err'
      const pts: Array<[number, number]> = []
      for (let i = 0; i < RIBBON_SAMPLES; i++) pts.push([fx0 + (i - phase) * sp, cy + Math.sin((pushes + i) * 0.45) * 1.1])
      if (mode === 'err') {
        // Clean red: one plain line, no bristles.
        paint.strokeStyle = rgba(C.red)
        paint.lineWidth = Math.max(2, fh * 0.22)
        paint.lineCap = 'round'
        paint.beginPath()
        paint.moveTo(fx0 + fw * 0.08, cy)
        paint.lineTo(fx0 + fw * 0.97, cy)
        paint.stroke()
        return
      }
      const P = path(pts, 1.2, true)
      const pf = (u: number): number => {
        const base = quiet ? 0.12 : 0.1 + 0.9 * lvAt(u) * flat
        return base * clamp(u / 0.08, 0, 1) * (1 - 0.6 * clamp((u - 0.97) / 0.03, 0, 1))
      }
      const wet = live || mode === 'proc' || mode === 'ins'
      const body = wet ? p.dry : tint(now, p.dry, p)
      const sOff = pushes * sp
      stroke(paint, P, cachedBrush(777, 18), {
        width: fh * 0.95,
        rgb: body,
        alpha: mode === 'idle' ? 0.35 : 1,
        dry: mode === 'nospeech' ? 0.95 : 0.35,
        core: 0.4,
        pfn: pf,
        sOff,
        ts: 0.01,
        te: 0.01
      })
      const headA = live ? 1 : mode === 'proc' ? 1 - easeOut(clamp(mt / 600, 0, 1)) : 0
      if (headA > 0) {
        stroke(paint, P, cachedBrush(778, 14), { width: fh * 0.95, rgb: p.wet, alpha: headA, dry: 0.3, core: 0.35, pfn: pf, sOff, i0: Math.floor(P.length * 0.72), ts: 0.01, te: 0.01 })
      }
      // The tail thins out to nothing on the left.
      paint.save()
      paint.globalCompositeOperation = 'destination-out'
      const g = paint.createLinearGradient(fx0, 0, fx0 + fw * 0.3, 0)
      g.addColorStop(0, 'rgba(0, 0, 0, 1)')
      g.addColorStop(1, 'rgba(0, 0, 0, 0)')
      paint.fillStyle = g
      paint.fillRect(0, 0, fx0 + fw * 0.3, height)
      paint.restore()
    }

    const draw = (now: number): void => {
      const p = palette()
      const level = Math.min(1, props.levelRef.current * 3.2)
      if (mode === 'rec') {
        while (now - lastPush >= PUSH_MS) {
          lastPush += PUSH_MS
          push(level, lastPush)
        }
      }
      paint.clearRect(0, 0, width, height)
      if (kind === 'flecks') drawFlecks(now, level, p)
      else if (kind === 'rings') drawRings(now, level, p)
      else if (kind === 'ribbon') drawRibbon(now, p)
      else drawDabs(now, p)
      if (mode === 'proc' && !reduced) {
        // One sheen crosses the wet paint as it dries, on every style.
        const x = fx0 + ((now - modeAt) / 700 - 0.2) * fw * 1.5
        if (x < fx0 + fw * 1.4) {
          paint.save()
          paint.globalCompositeOperation = 'source-atop'
          const g = paint.createLinearGradient(x - fw * 0.18, 0, x + fw * 0.18, 0)
          g.addColorStop(0, 'rgba(255, 244, 222, 0)')
          g.addColorStop(0.5, 'rgba(255, 244, 222, 0.4)')
          g.addColorStop(1, 'rgba(255, 244, 222, 0)')
          paint.fillStyle = g
          paint.fillRect(0, 0, width, height)
          paint.restore()
        }
      }
      // What this frame painted, for the smoke check to read.
      if (canvas.dataset.mode !== mode) canvas.dataset.mode = mode
      if (bare && buffer) {
        ctx.clearRect(0, 0, width, height)
        applyInkEdge(ctx, edge, dpr)
        ctx.drawImage(buffer, 0, 0, width, height)
        ctx.shadowColor = 'transparent'
        fadeToEdges(ctx, width, height, kind === 'rings' ? 0.82 : 0.88)
      }
    }

    let raf = 0
    let running = false
    const frame = (now: number): void => {
      if (phaseRef.current !== lastPhase) {
        lastPhase = phaseRef.current
        setMode(modeOf(lastPhase), now)
      }
      try {
        draw(now)
      } catch (error) {
        // Let the next phase change restart the loop instead of freezing it.
        running = false
        throw error
      }
      const busy = mode === 'rec' || now - modeAt < SETTLE_MS || rings.length > 0 || flung.length > 0
      if (busy) raf = requestAnimationFrame(frame)
      else running = false
    }
    const kick = (): void => {
      if (running) return
      running = true
      raf = requestAnimationFrame(frame)
    }
    kickRef.current = kick
    kick()
    return () => {
      cancelAnimationFrame(raf)
      running = false
      kickRef.current = () => undefined
    }
  }, [props.kind, props.bare, props.levelRef])

  return <canvas ref={canvasRef} className="speckle" data-ink={props.kind} aria-hidden="true" />
}
