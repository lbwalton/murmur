// SPDX-License-Identifier: GPL-3.0-only
// A theme's painting on a canvas (US-151): behind the whole window as
// the backdrop, or small inside a theme's tile. It reads its colors where
// it sits (a tile sits under data-theme-preview), draws a finished still
// frame first, and moves only when asked to. The motion clock is kept
// across pauses, so a painting resumes where it stopped instead of
// jumping back to its first frame.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Motion, motionSpeed, sceneMoves } from '../../shared/themes'
import { canvasDpr } from '../brush'
import { THEME_SCENES, coverFit, readPalette, sceneRandom } from './scenes'

/** The most frames a second a painting draws: its motion is slow, and a
 *  120 Hz screen (or Windows' software drawing) need not pay for more. */
export const SCENE_FPS = 30

export function ScenePainting(props: {
  scene: string
  /** The theme whose colors it paints with; a change re-reads them. */
  theme: string
  moving: boolean
  speed: number
  className: string
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const clock = useRef(0)
  const states = useRef(new Map<string, unknown>())

  useEffect(() => {
    const canvas = ref.current
    const painting = THEME_SCENES[props.scene]
    const ctx = canvas?.getContext('2d')
    if (!canvas || !painting || !ctx) return
    if (!states.current.has(props.scene)) states.current.set(props.scene, painting.init(sceneRandom(props.scene)))
    const state = states.current.get(props.scene) as never
    // What never moves is drawn once per size, scale and palette into a
    // layer kept here; each frame copies it, then draws what moves.
    const still = document.createElement('canvas')
    const stillCtx = still.getContext('2d')
    let palette = readPalette(canvas, painting.colors)
    let box = { w: 0, h: 0, dpr: 1 }
    const fitTo = (target: CanvasRenderingContext2D): void => {
      const fit = coverFit(box.w, box.h)
      target.setTransform(box.dpr * fit.scale, 0, 0, box.dpr * fit.scale, box.dpr * fit.x, box.dpr * fit.y)
    }
    const paintStill = (): void => {
      if (!stillCtx) return
      still.width = canvas.width
      still.height = canvas.height
      fitTo(stillCtx)
      painting.drawStill(stillCtx, state, palette)
    }
    const size = (): void => {
      const dpr = canvasDpr()
      box = { w: canvas.clientWidth, h: canvas.clientHeight, dpr }
      canvas.width = Math.max(1, Math.round(box.w * dpr))
      canvas.height = Math.max(1, Math.round(box.h * dpr))
      paintStill()
    }
    const frame = (dt: number): void => {
      if (box.w === 0 || box.h === 0) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(still, 0, 0)
      fitTo(ctx)
      painting.drawMoving(ctx, state, palette, clock.current * 1000, dt)
    }
    let raf = 0
    let last = 0
    let drawn = 0
    const tick = (now: number): void => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) * props.speed : 0
      last = now
      clock.current += dt
      if (!drawn || now - drawn >= 1000 / SCENE_FPS - 1) {
        drawn = now
        frame(dt)
      }
      if (props.moving) raf = requestAnimationFrame(tick)
    }
    // The first frame waits a beat, so the window's theme attributes
    // (set by the page's own effects, which run after this one) are on
    // <html> before the colors are read.
    raf = requestAnimationFrame(() => {
      palette = readPalette(canvas, painting.colors)
      size()
      tick(performance.now())
    })
    const resized = (): void => {
      size()
      frame(0)
    }
    const sized = new ResizeObserver(resized)
    sized.observe(canvas)
    // A move to a screen of another density (or a zoom step) changes the
    // pixel ratio without changing the canvas's size.
    let density: MediaQueryList | null = null
    const watchDensity = (): void => {
      density?.removeEventListener('change', onDensity)
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      density.addEventListener('change', onDensity)
    }
    function onDensity(): void {
      watchDensity()
      resized()
    }
    watchDensity()
    return () => {
      cancelAnimationFrame(raf)
      sized.disconnect()
      density?.removeEventListener('change', onDensity)
    }
  }, [props.scene, props.theme, props.moving, props.speed])

  return <canvas ref={ref} className={props.className} aria-hidden="true" />
}

/** Whether this window is showing and in front, kept current. */
function useInFront(): { visible: boolean; focused: boolean } {
  const read = (): { visible: boolean; focused: boolean } => ({
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus()
  })
  const [state, setState] = useState(read)
  useEffect(() => {
    const update = (): void => setState(read())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])
  return state
}

/** The system's Reduce motion, kept current. */
export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = (): void => setReduced(list.matches)
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [])
  return reduced
}

/** The worn theme's painting behind the whole window. It sits under the
 *  page's ink sheet (body::before, --scene-sheet), so it is placed in
 *  <body> itself, outside the page's own layers. */
export function SceneBackdrop(props: { scene: string; theme: string; motion: Motion }): React.ReactPortal {
  const front = useInFront()
  const reducedMotion = useReducedMotion()
  const moving = sceneMoves({ ...front, motion: props.motion, reducedMotion })
  return createPortal(
    <ScenePainting
      scene={props.scene}
      theme={props.theme}
      moving={moving}
      speed={motionSpeed(props.motion)}
      className="scene-backdrop"
    />,
    document.body
  )
}
