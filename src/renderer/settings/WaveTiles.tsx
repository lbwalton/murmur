// SPDX-License-Identifier: GPL-3.0-only
// The waveform setting as a grid of live mini pills (US-084), one per
// style, each drawn by the overlay's own renderer and driven by a
// made-up voice; the microphone is never touched. Locked styles stay
// visible, dimmed, with the belt that unlocks them, so the grid also
// shows the path through the Journey. Tiles move only while they are on
// screen and the window is showing; reduced motion gets a still frame.
import { memo, useEffect, useRef, useState } from 'react'
import type { CosmeticItem } from '../../shared/cosmetics'
import { isInkStyle } from '../../shared/overlay-state'
import { BAR_COUNT, Bars } from '../overlay/Bars'
import { InkWave } from '../overlay/InkWave'
import { PulseWave } from '../overlay/PulseWave'
import { SpeckleWave } from '../overlay/SpeckleWave'
import { STILL_LEVEL, stillLevels, voiceLevel } from './fakeVoice'

type StyleItem = CosmeticItem & { unlocked: boolean }

/** How long a still frame paints before it is kept (reduced motion):
 *  long enough for ink dabs to fill the pill (a column every 66 ms). */
const STILL_AFTER_MS = 1600
/** Canvas tiles never read the bar levels; one shared empty list keeps
 *  them from re-rendering with every bar. */
const NO_LEVELS: number[] = []

export function WaveTiles(props: {
  styles: StyleItem[]
  value: string
  /** The chosen accent; null is the default, signal amber, as the
   *  overlay draws it. */
  accent: string | null
  onPick: (id: string) => void
}): React.JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([])
  const levelRef = useRef(0)
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [levels, setLevels] = useState<number[]>(() =>
    reduced ? stillLevels(BAR_COUNT) : new Array<number>(BAR_COUNT).fill(0)
  )
  const [onScreen, setOnScreen] = useState(false)
  const [showing, setShowing] = useState(() => !document.hidden)
  const active = onScreen && showing
  const chosen = Math.max(
    0,
    props.styles.findIndex((s) => s.id === props.value)
  )
  const [focusAt, setFocusAt] = useState(chosen)
  // The tab stop is the style in use (the radio group rule) whenever
  // focus is outside the grid: after the styles load, or a pick made
  // some other way.
  useEffect(() => {
    if (!gridRef.current?.contains(document.activeElement)) setFocusAt(chosen)
  }, [chosen, props.styles.length])
  // Signal amber from the tokens, for the default accent.
  const [amber] = useState(
    () => getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() || 'rgb(240, 164, 75)'
  )

  // On screen: the grid is in view (and its tab is open), and the window
  // is not hidden in the tray.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const seen = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)))
    seen.observe(grid)
    const onVisibility = (): void => setShowing(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      seen.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // The made-up voice feeds every tile while they are live, at the pace
  // the overlay's level stream runs.
  useEffect(() => {
    if (reduced) {
      levelRef.current = STILL_LEVEL
      return
    }
    if (!active) return
    let raf = 0
    let lastBar = 0
    const start = performance.now()
    const tick = (now: number): void => {
      const level = voiceLevel((now - start) / 1000)
      levelRef.current = level
      if (now - lastBar > 50) {
        lastBar = now
        setLevels((prev) => [...prev.slice(1), Math.min(1, level * 3)])
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, reduced])

  const move = (to: number): void => {
    const n = props.styles.length
    const next = (to + n) % n
    setFocusAt(next)
    tileRefs.current[next]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(focusAt + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(focusAt - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(props.styles.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div className="wave-tiles" role="radiogroup" aria-label="Waveform" ref={gridRef} onKeyDown={onKeyDown}>
      {props.styles.map((item, i) => {
        const inUse = item.id === props.value
        const locked = !item.unlocked
        const status = inUse
          ? 'in use'
          : locked
            ? `locked: ${item.hint}`
            : item.unlock?.rank
              ? `earned at ${item.unlock.rank} belt`
              : item.hint
        return (
          <button
            key={item.id}
            ref={(el) => {
              tileRefs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={inUse}
            aria-disabled={locked}
            tabIndex={i === focusAt ? 0 : -1}
            className="wave-tile"
            onFocus={() => setFocusAt(i)}
            onClick={() => {
              if (!locked && !inUse) props.onPick(item.id)
            }}
          >
            <MiniPill
              style={item.id}
              active={active}
              reduced={reduced}
              levelRef={levelRef}
              levels={item.id === 'bars' ? levels : NO_LEVELS}
              accent={props.accent ?? amber}
            />
            <span className="tile-name">{item.name}</span>
            <span className="tile-status">{status}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * One mini pill. Canvas styles mount their overlay renderer only while
 * the grid is live; when it goes off screen the last frame is copied to
 * a still canvas and the renderer unmounts, so nothing animates unseen.
 * Under reduced motion the renderer paints once at a mid-speech level,
 * the frame is kept, and it never moves.
 */
const MiniPill = memo(function MiniPill(props: {
  style: string
  active: boolean
  reduced: boolean
  levelRef: React.MutableRefObject<number>
  levels: number[]
  accent: string
}): React.JSX.Element {
  const holderRef = useRef<HTMLDivElement>(null)
  const stillRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [kept, setKept] = useState(false)
  const isCanvas = props.style !== 'bars'

  const keepFrame = (): void => {
    const live = holderRef.current?.querySelector('canvas')
    const still = stillRef.current
    if (!live || !still || live.width === 0) return
    still.width = live.width
    still.height = live.height
    still.getContext('2d')?.drawImage(live, 0, 0)
    setKept(true)
  }

  // The renderers size their bitmap once on mount; a tile that changes
  // width (the window resized, the grid reflowed) remounts its renderer
  // at the new size rather than stretching.
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const holder = holderRef.current
    if (!holder || !isCanvas) return
    const watch = new ResizeObserver(() => setWidth(Math.round(holder.clientWidth)))
    watch.observe(holder)
    return () => watch.disconnect()
  }, [isCanvas])

  useEffect(() => {
    if (!isCanvas) return
    if (props.reduced) {
      if (!props.active && drawing) {
        // Left before the still was kept: keep what is there, and stop.
        keepFrame()
        setDrawing(false)
        return
      }
      if (!props.active || kept) return
      setDrawing(true)
      const timer = window.setTimeout(() => {
        keepFrame()
        setDrawing(false)
      }, STILL_AFTER_MS)
      return () => window.clearTimeout(timer)
    }
    if (props.active) {
      setDrawing(true)
      return
    }
    if (drawing) {
      keepFrame()
      setDrawing(false)
    }
    // keepFrame reads refs only; drawing and kept are read here, never
    // a reason to run again.
  }, [props.active, props.reduced, isCanvas])

  return (
    <span className="mini-pill" aria-hidden="true">
      <span className="dot" />
      <span className="wave" ref={holderRef} style={{ '--wave-accent': props.accent } as React.CSSProperties}>
        {!isCanvas && <Bars levels={props.levels} />}
        {isCanvas && drawing && (
          <>
            {isInkStyle(props.style) ? (
              <InkWave key={width} kind={props.style} levelRef={props.levelRef} phase="recording" accent={props.accent} />
            ) : props.style === 'pulse' ? (
              <PulseWave key={width} levelRef={props.levelRef} muted={false} accent={props.accent} />
            ) : (
              <SpeckleWave key={width} levelRef={props.levelRef} muted={false} accent={props.accent} />
            )}
          </>
        )}
        {isCanvas && <canvas ref={stillRef} className="wave-still" hidden={drawing || !kept} />}
      </span>
    </span>
  )
})
