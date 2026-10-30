// SPDX-License-Identifier: GPL-3.0-only
// The murmur Pro mark (US-107): a small gold pill with PRO in ink, filled
// where Pro is yours and outlined where Pro offers something. The word is
// drawn by CSS (or, on the header's painted mark, on its canvas), so it
// never joins a row's or a section's name in search; the role and label
// say it aloud instead.
//
// The header's mark is painted, not filled (LaBroi's picks on canvas
// board 7, 2026-10-22): the first time each day the window opens in
// front, it lifts to twice its size, 3 or 4 slashing brush strokes seeded
// by the date paint its gold in from varied angles, and it settles back.
// The strokes stay as they landed, dry ends and small gaps showing, as
// the day's badge. Reduced motion, the switch turned off, and later opens
// that day show the day's brushwork still.
import { useEffect, useRef } from 'react'
import { dayKey } from '../../shared/history'
import {
  ARRIVE,
  type FillStroke,
  LIFT,
  arrivalDue,
  dailyFillDue,
  fillDurationMs,
  fillStrokes,
  liftWaitMs,
  strokeProgress
} from '../../shared/proMark'
import { type Rgb, cachedBrush, canvasDpr, mix, path, stroke, tokenColor } from '../brush'

export function ProMark(props: {
  state: 'filled' | 'outlined'
  size?: 'sm' | 'md'
  /** The moment you buy: fill with gold once and glow. The window sets
   *  each mark's delay from its place on screen (App.tsx). */
  arrive?: boolean
  /** Beside a title that already says murmur Pro: hidden from screen
   *  readers, so the name is not read twice. */
  decorative?: boolean
}): React.JSX.Element {
  const cls = ['pro-mark']
  if (props.size === 'md') cls.push('pro-mark-md')
  if (props.state === 'outlined') cls.push('pro-mark-off')
  else if (props.arrive) cls.push('pro-mark-arrive')
  return (
    <span
      className={cls.join(' ')}
      role={props.decorative ? undefined : 'img'}
      aria-hidden={props.decorative ? true : undefined}
      aria-label={props.decorative ? undefined : props.state === 'filled' ? 'murmur Pro' : 'murmur Pro feature'}
    />
  )
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

/** Bristles per stroke: fine for a 16 px mark, so the grain stays soft
 *  like the painting a day's strokes (LaBroi's pick, 2026-10-22). */
const BRISTLES = 48

function strokePath(s: FillStroke, w: number, h: number): ReturnType<typeof path> {
  const a = (s.angle * Math.PI) / 180
  const half = (s.len * w) / 2
  const cx = s.cx * w
  const cy = s.cy * h
  let p0: [number, number] = [cx - Math.cos(a) * half, cy - Math.sin(a) * half]
  let p2: [number, number] = [cx + Math.cos(a) * half, cy + Math.sin(a) * half]
  if (s.reverse) [p0, p2] = [p2, p0]
  const mid: [number, number] = [cx - Math.sin(a) * s.bow * h, cy + Math.cos(a) * s.bow * h]
  return path([p0, mid, p2], Math.max(0.5, w / 90))
}

/** Paints the day's strokes as far as t ms into the fill, clipped to the pill. */
export function paintFill(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strokes: readonly FillStroke[],
  t: number,
  gold: Rgb
): void {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, h / 2)
  ctx.clip()
  for (const s of strokes) {
    const k = strokeProgress(s, t)
    if (k <= 0) continue
    const P = strokePath(s, w, h)
    const rgb = s.shade >= 0 ? mix(gold, WHITE, s.shade * 0.1) : mix(gold, BLACK, -s.shade * 0.14)
    stroke(ctx, P, cachedBrush(s.brush, BRISTLES), {
      width: s.width * h,
      rgb,
      dry: s.dry,
      // The wet ground stroke lays a solid body under PRO; dry strokes
      // keep a softer body under their bristles.
      core: s.dry < 0.5 ? 0.8 : 0.55,
      ts: 0.05,
      te: s.dry < 0.5 ? 0.26 : 0.42,
      // Gentle light and dark bristles: a soft grain, not wood grain.
      light: 0.05,
      dark: 0.1,
      i1: Math.max(1, Math.round(k * (P.length - 1)))
    })
  }
  ctx.restore()
}

/** The last purchase whose arrival played, so a remount never replays it. */
let arrivalPlayed = 0

export interface LabelStyle {
  font: string
  /** Letter spacing in CSS pixels; the pill's padding already balances
   *  the space after the last letter. */
  spacing: number
  gold: Rgb
  ink: Rgb
}

/**
 * Draws PRO over the day's paint: ink wherever paint landed and gold
 * where the ground is bare, so it reads clearly on every stroke, dark
 * shades and dry ends included (a blend mode left it a muddy brown on
 * the darker strokes; measured on 30 days, 2026-10-22).
 */
export function paintLabel(ctx: CanvasRenderingContext2D, w: number, h: number, label: LabelStyle): void {
  ctx.save()
  ctx.font = label.font
  ctx.letterSpacing = `${label.spacing}px`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const width = ctx.measureText('PRO').width - label.spacing
  const x = (w - width) / 2
  const y = h / 2 + 0.5
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = `rgb(${label.ink.join(',')})`
  ctx.fillText('PRO', x, y)
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = `rgb(${label.gold.join(',')})`
  ctx.fillText('PRO', x, y)
  ctx.restore()
}

interface Run {
  raf: number
  wait: number
  hold: number
  strokes: FillStroke[]
  t0: number
  end: number
  lifted: boolean
  anims: Animation[]
  settling: boolean
}

export function HeaderProMark(props: {
  /** Settings, murmur Pro: Paint the mark each day. */
  enabled: boolean
  lastPaintDay: string
  /** Records the day as played, once the moment starts in front. */
  onPlayed: (day: string) => void
  /** Bumps when Activate or Reactivate just succeeded: the mark arrives
   *  with the fill right away, and that counts as the day's fill. */
  arrival: number
  /** How far the belt steps aside while the mark is lifted; null once it settles. */
  onLift: (shiftPx: number | null) => void
}): React.JSX.Element {
  const liftRef = useRef<HTMLButtonElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const run = useRef<Run | null>(null)
  const waiting = useRef(0)
  const latest = useRef(props)
  latest.current = props
  const controls = useRef<{ check: () => void; startArrival: () => void } | null>(null)

  useEffect(() => {
    const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const inFront = (): boolean => document.visibilityState === 'visible' && document.hasFocus()
    const gold = (): Rgb => tokenColor('--brand', [217, 164, 65])
    const label = (pill: HTMLElement): LabelStyle => {
      const cs = getComputedStyle(pill)
      return {
        font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`,
        spacing: Number.parseFloat(cs.letterSpacing) || 0,
        gold: gold(),
        ink: tokenColor('--ink', [15, 14, 17])
      }
    }

    const draw = (strokes: readonly FillStroke[] | null, t: number): void => {
      const canvas = canvasRef.current
      const pill = pillRef.current
      if (!canvas || !pill) return
      const w = pill.clientWidth
      const h = pill.clientHeight
      if (w === 0 || h === 0) return
      // Drawn at twice the screen's density from the start, so PRO and
      // the bristles stay sharp while the mark is lifted to 2x.
      const dpr = canvasDpr(LIFT.scale)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (strokes) paintFill(ctx, w, h, strokes, t, gold())
      paintLabel(ctx, w, h, label(pill))
    }

    const rest = (day: string): void => draw(fillStrokes(day), Number.POSITIVE_INFINITY)

    const clearWait = (): void => {
      window.clearTimeout(waiting.current)
      waiting.current = 0
    }

    const finish = (r: Run): void => {
      cancelAnimationFrame(r.raf)
      window.clearTimeout(r.hold)
      run.current = null
      for (const a of r.anims) a.cancel()
      latest.current.onLift(null)
    }

    const settle = (r: Run, skipped: boolean): void => {
      if (r.settling) return
      r.settling = true
      window.clearTimeout(r.hold)
      cancelAnimationFrame(r.raf)
      draw(r.strokes, Number.POSITIVE_INFINITY)
      const el = liftRef.current
      if (!r.lifted || !el) {
        finish(r)
        return
      }
      // From wherever the lift is (a skip can land mid-grow) back to 1x.
      const from = new DOMMatrixReadOnly(getComputedStyle(el).transform).a || 1
      latest.current.onLift(null)
      const back = el.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], {
        duration: skipped ? LIFT.skipSettleMs : LIFT.settleMs,
        easing: 'cubic-bezier(.4,0,.2,1)',
        fill: 'forwards'
      })
      r.anims.push(back)
      back.onfinish = () => {
        if (run.current === r) finish(r)
      }
    }

    const start = (day: string, record: boolean, glow = false): void => {
      clearWait()
      const prior = run.current
      if (prior) finish(prior)
      if (record) latest.current.onPlayed(day)
      const strokes = fillStrokes(day)
      const el = liftRef.current
      // Grow by up to the full 2x, never past the room left before the
      // tabs on the same row, so the belt never slides over a tab name.
      let grow = 0
      if (el && el.offsetWidth > 0) {
        grow = el.offsetWidth * (LIFT.scale - 1)
        const wordmark = el.closest('.wordmark')
        const nav = el.closest('.masthead')?.querySelector('.nav')
        if (wordmark && nav) {
          const w = wordmark.getBoundingClientRect()
          const n = nav.getBoundingClientRect()
          if (n.top < w.bottom - 2) grow = Math.min(grow, Math.max(0, n.left - w.right - 12))
        }
      }
      const scale = el ? 1 + grow / el.offsetWidth : 1
      const lift = el && scale > 1.05 ? el : null
      const r: Run = {
        raf: 0,
        wait: 0,
        hold: 0,
        strokes,
        t0: 0,
        end: fillDurationMs(strokes),
        lifted: Boolean(lift),
        anims: [],
        settling: false
      }
      run.current = r
      draw(null, 0)
      const pill = pillRef.current
      if (glow && pill) {
        // The moment you buy: the same bright glow as the marks below it,
        // drawn at half size since the lift doubles it. A skip ends it
        // with the rest of the run.
        const root = getComputedStyle(document.documentElement)
        const bright = root.getPropertyValue('--brand-glow').trim()
        const fade = root.getPropertyValue('--brand-glow-fade').trim()
        r.anims.push(
          pill.animate(
            [
              { boxShadow: '0 0 0 0 transparent', easing: 'ease-out' },
              { boxShadow: `0 0 9px 3.5px ${bright}`, offset: 0.22, easing: 'ease-out' },
              { boxShadow: `0 0 6px 2px ${fade}`, offset: 0.45, easing: 'ease-out' },
              { boxShadow: '0 0 0 0 transparent' }
            ],
            { duration: ARRIVE.glowMs }
          )
        )
      }
      if (lift) {
        // Grows from its left edge, away from the wordmark, and the belt
        // steps aside by the same amount: paint never covers words.
        latest.current.onLift(grow)
        r.anims.push(
          lift.animate(
            [
              { transform: 'scale(1)' },
              { transform: `scale(${(scale * LIFT.overshoot) / LIFT.scale})`, offset: 0.7 },
              { transform: `scale(${scale})` }
            ],
            { duration: LIFT.growMs, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }
          )
        )
      }
      // The strokes start the moment the lift lands.
      r.t0 = performance.now() + (r.lifted ? LIFT.growMs : 0)
      const tick = (now: number): void => {
        if (run.current !== r || r.settling) return
        const t = now - r.t0
        draw(r.strokes, t)
        if (t < r.end) r.raf = requestAnimationFrame(tick)
        else r.hold = window.setTimeout(() => settle(r, false), LIFT.holdMs)
      }
      r.raf = requestAnimationFrame(tick)
    }

    /** Looks at the day each time the window comes to the front. */
    const check = (): void => {
      if (run.current) return
      const p = latest.current
      const today = dayKey(Date.now())
      if (!dailyFillDue({ status: { pro: true }, enabled: p.enabled, lastPaintDay: p.lastPaintDay, today })) {
        clearWait()
        rest(today)
        return
      }
      if (reduced()) {
        rest(today)
        p.onPlayed(today)
        return
      }
      // Due: the outline waits, unpainted, for the window to be seen.
      draw(null, 0)
      if (!inFront() || waiting.current) return
      // The page loads when the window first opens, so its age says
      // whether this is the window murmur opened by itself at launch.
      waiting.current = window.setTimeout(() => {
        waiting.current = 0
        const now = latest.current
        const day = dayKey(Date.now())
        const due = dailyFillDue({ status: { pro: true }, enabled: now.enabled, lastPaintDay: now.lastPaintDay, today: day })
        if (inFront() && !run.current && due) start(day, true)
      }, liftWaitMs(performance.now()))
    }

    const skip = (): void => {
      const r = run.current
      if (r && !r.settling) settle(r, true)
    }
    const onPointer = (e: PointerEvent): void => {
      // A press on the mark itself is handled by its own click.
      if (liftRef.current?.contains(e.target as Node)) return
      skip()
    }
    const onBlur = (): void => {
      clearWait()
      skip()
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') check()
      else onBlur()
    }

    const button = liftRef.current
    const onClick = (): void => {
      if (run.current) {
        skip()
        return
      }
      // Asked for, never pushed: a press replays today's close look. A
      // press while the day's fill is still due plays it, and counts.
      if (reduced()) return
      const today = dayKey(Date.now())
      const p = latest.current
      start(today, dailyFillDue({ status: { pro: true }, enabled: p.enabled, lastPaintDay: p.lastPaintDay, today }))
    }

    controls.current = { check, startArrival: () => start(dayKey(Date.now()), true, true) }
    check()
    window.addEventListener('focus', check)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', skip, true)
    document.addEventListener('visibilitychange', onVisibility)
    button?.addEventListener('click', onClick)
    const watch = new ResizeObserver(() => {
      if (!run.current) check()
    })
    if (pillRef.current) watch.observe(pillRef.current)
    // A zoom step (US-111) changes the density without resizing the pill,
    // so the mark repaints at the new density as well.
    let density: MediaQueryList | null = null
    const onDensity = (): void => {
      if (!run.current) check()
      watchDensity()
    }
    const watchDensity = (): void => {
      density?.removeEventListener('change', onDensity)
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      density.addEventListener('change', onDensity)
    }
    watchDensity()
    return () => {
      clearWait()
      const r = run.current
      if (r) finish(r)
      window.removeEventListener('focus', check)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', skip, true)
      document.removeEventListener('visibilitychange', onVisibility)
      button?.removeEventListener('click', onClick)
      watch.disconnect()
      density?.removeEventListener('change', onDensity)
      controls.current = null
    }
  }, [])

  // The switch or the record changed: look again (a fill already playing finishes).
  useEffect(() => {
    controls.current?.check()
  }, [props.enabled, props.lastPaintDay])

  // The moment you buy: the mark arrives with the fill at once. The mark
  // often mounts in the same instant the purchase lands, so a fresh
  // arrival counts at mount too.
  useEffect(() => {
    if (!arrivalDue(props.arrival, arrivalPlayed, Date.now())) return
    arrivalPlayed = props.arrival
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      latest.current.onPlayed(dayKey(Date.now()))
      return
    }
    controls.current?.startArrival()
  }, [props.arrival])

  return (
    <button
      ref={liftRef}
      type="button"
      className="pro-lift"
      aria-label={
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'murmur Pro'
          : "murmur Pro. Press to see today's mark painted close up"
      }
      title="murmur Pro"
    >
      <span ref={pillRef} className="pro-mark pro-daily">
        <canvas ref={canvasRef} className="pro-daily-canvas" aria-hidden="true" />
      </span>
    </button>
  )
}
