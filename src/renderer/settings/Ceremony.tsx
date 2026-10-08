// SPDX-License-Identifier: GPL-3.0-only
// The belt promotion ceremony (US-077): the next time the Journey opens
// after a new belt, one big stroke in the belt's color sweeps across the
// window with splatter, and the rank is set large with its title and the
// words and days that earned it. It lives inside murmur's own window, so
// it never covers the app you dictate into. It is a modal dialog, so
// focus stays in it and the window behind is inert. Click, Escape, Enter,
// or Space closes it, focus returns where it was, and it ends on its own
// after a few seconds. Reduced motion shows the finished painting.
import { useEffect, useRef, useState } from 'react'
import cosmeticsFile from '../../../shared/cosmetics.json'
import type { RankSpec } from '../../shared/ranks'
import { type SceneItem, type Surface, animateScene, cachedBrush, paintScene, path, splat } from '../brush'
import { beltOnInk, journeyColors } from './journeyPaint'

const BELT_HEX = (cosmeticsFile as { beltColors: Record<string, string> }).beltColors
/** How long the ceremony stays before it ends on its own. */
export const CEREMONY_MS = 4600

function surface(canvas: HTMLCanvasElement, w: number, h: number): Surface | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { canvas, ctx, dpr }
}

/** The ceremony's painting: the sweep in the belt's color, an ember
 *  splat, a splat of the belt's color, and a chalky rice stroke above. */
function scene(rank: RankSpec, W: number, H: number): SceneItem[] {
  const c = journeyColors(BELT_HEX)
  const col = beltOnInk(rank.belt, c)
  const yc = H * 0.34
  const bw = Math.min(H * 0.24, 210)
  return [
    {
      start: 140,
      dur: 720,
      stroke: {
        P: path(
          [
            [-W * 0.06, yc + bw * 0.3],
            [W * 0.3, yc - bw * 0.12],
            [W * 0.66, yc + bw * 0.08],
            [W * 1.06, yc - bw * 0.22]
          ],
          3
        ),
        B: cachedBrush(990, 40),
        opts: { width: bw, rgb: col, dry: 0.3, core: 0.85, ts: 0.02, te: 0.12 }
      }
    },
    {
      start: 520,
      splat: { sp: splat(992, W * 0.24, yc + bw * 0.62, { r: bw * 0.18, count: 20, mist: 30, dir: 2.4, spread: 0.9, reach: 3 }), rgb: col }
    },
    {
      start: 560,
      dur: 420,
      stroke: {
        P: path(
          [
            [W * 0.12, yc - bw * 0.85],
            [W * 0.4, yc - bw * 1.0],
            [W * 0.62, yc - bw * 0.88]
          ],
          2
        ),
        B: cachedBrush(993, 30),
        opts: { width: bw * 0.12, rgb: c.rice, alpha: 0.7, dry: 0.75 }
      }
    },
    {
      start: 620,
      splat: {
        sp: splat(991, W * 0.78, yc - bw * 0.55, { r: bw * 0.22, count: 26, mist: 40, dir: -0.6, spread: 1.1, reach: 3, blob: true }),
        rgb: c.ember
      }
    }
  ]
}

export function Ceremony(props: { rank: RankSpec; onClose: () => void }): React.JSX.Element {
  const rootRef = useRef<HTMLDialogElement>(null)
  // Where focus was before the ceremony, read once at the first render
  // (a second effect run in development would otherwise read the dialog).
  const [returnTo] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const baseRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)
  const [shown, setShown] = useState(false)
  const closeRef = useRef(props.onClose)
  closeRef.current = props.onClose

  useEffect(() => {
    const root = rootRef.current
    const base = baseRef.current
    const fx = fxRef.current
    if (!root || !base || !fx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cancel = (): void => undefined
    const paint = (animate: boolean): void => {
      cancel()
      cancel = (): void => undefined
      const W = window.innerWidth
      const H = window.innerHeight
      const B = surface(base, W, H)
      const F = surface(fx, W, H)
      if (!B || !F) return
      F.ctx.clearRect(0, 0, W, H)
      const items = scene(props.rank, W, H)
      if (animate) cancel = animateScene(B, F, items)
      else paintScene(B.ctx, items)
    }
    paint(!reduced)
    // A resize repaints the finished picture at the new size.
    const onResize = (): void => paint(false)
    window.addEventListener('resize', onResize)
    if (!root.open) root.showModal()
    root.focus({ preventScroll: true })
    const textTimer = window.setTimeout(() => setShown(true), reduced ? 0 : 480)
    let closed = false
    const close = (): void => {
      if (closed) return
      closed = true
      cancel()
      if (root.open) root.close()
      returnTo?.focus({ preventScroll: true })
      closeRef.current()
    }
    // Escape arrives as the dialog's cancel event; Enter closes on press;
    // Space on release, so its release never clicks what gets focus back.
    const onCancel = (e: Event): void => {
      e.preventDefault()
      close()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
      if (e.key === 'Enter') close()
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        e.preventDefault()
        close()
      }
    }
    root.addEventListener('cancel', onCancel)
    root.addEventListener('keydown', onKeyDown)
    root.addEventListener('keyup', onKeyUp)
    root.addEventListener('click', close)
    const endTimer = window.setTimeout(close, CEREMONY_MS)
    return () => {
      window.clearTimeout(textTimer)
      window.clearTimeout(endTimer)
      window.removeEventListener('resize', onResize)
      root.removeEventListener('cancel', onCancel)
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('keyup', onKeyUp)
      root.removeEventListener('click', close)
      cancel()
    }
  }, [props.rank, returnTo])

  const earned =
    props.rank.words !== null && props.rank.activeDays !== null
      ? `${props.rank.words.toLocaleString()} words, ${props.rank.activeDays.toLocaleString()} days on the mat`
      : ''
  return (
    <dialog
      className={`ceremony${shown ? ' ceremony-shown' : ''}`}
      ref={rootRef}
      aria-labelledby="ceremony-rank"
      aria-describedby="ceremony-detail"
      tabIndex={-1}
    >
      <canvas ref={baseRef} className="ceremony-paint" aria-hidden="true" />
      <canvas ref={fxRef} className="ceremony-paint" aria-hidden="true" />
      <div className="ceremony-text">
        <h2 id="ceremony-rank">{props.rank.label}</h2>
        <p className="ceremony-title" id="ceremony-detail">
          "{props.rank.title}"{earned && <span className="visually-hidden">. Earned with {earned}.</span>}
        </p>
        {earned && (
          <p className="ceremony-earned" aria-hidden="true">
            {earned}
          </p>
        )}
        <p className="ceremony-hint">click or press Escape to continue</p>
      </div>
    </dialog>
  )
}
