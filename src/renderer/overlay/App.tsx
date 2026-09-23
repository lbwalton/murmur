// SPDX-License-Identifier: GPL-3.0-only
// The waveform pill. Everything else in the app stays quiet; this is the
// one loud element. Amber only while live, red only for errors.
import { useEffect, useRef, useState } from 'react'
import {
  type OverlayLook,
  type OverlayPhase,
  type OverlayState,
  normalizeOverlayLook
} from '../../shared/overlay-state'
import { formatDuration } from '../../shared/time'
import type { OverlayApi } from '../../preload/overlay'
import { PulseWave } from './PulseWave'
import { SpeckleWave } from './SpeckleWave'

declare global {
  interface Window {
    murmurOverlay: OverlayApi
  }
}

const BAR_COUNT = 21
/** Phases whose whole point is a sentence to read: they always get
 *  the full pill, whatever the look. */
const TEXT_PHASES: ReadonlySet<OverlayPhase> = new Set(['hint', 'error', 'nospeech'])

export function App(): React.JSX.Element {
  const [state, setState] = useState<OverlayState>({
    phase: 'idle',
    startedAt: null,
    wpm: null,
    mode: 'dictation',
    hint: null
  })
  const [levels, setLevels] = useState<number[]>(() => new Array<number>(BAR_COUNT).fill(0))
  const [style, setStyle] = useState<string>('bars')
  const [look, setLook] = useState<OverlayLook>('pill')
  const [accent, setAccent] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const levelRef = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    window.murmurOverlay.onState((next) => {
      setState(next)
      if (next.phase === 'idle' || next.phase === 'recording') {
        setLevels(new Array<number>(BAR_COUNT).fill(0))
        levelRef.current = 0
      }
    })
    window.murmurOverlay.onLevel((level) => {
      levelRef.current = level
      setLevels((prev) => [...prev.slice(1), Math.min(1, level * 3)])
    })
    window.murmurOverlay.onConfig((config) => {
      setStyle(config.style)
      setLook(normalizeOverlayLook(config.look))
      setAccent(config.accent ?? null)
    })
  }, [])

  useEffect(() => {
    document.body.dataset.look = look
  }, [look])

  useEffect(() => {
    document.body.dataset.phase = state.phase
    document.body.dataset.mode = state.mode
    if (state.phase !== 'recording' && state.phase !== 'processing') {
      setElapsed(0)
      return
    }
    if (state.startedAt === null) return
    const startedAt = state.startedAt
    setElapsed(Date.now() - startedAt)
    if (state.phase !== 'recording') return
    const timer = setInterval(() => {
      setElapsed(Date.now() - startedAt)
    }, 250)
    return () => clearInterval(timer)
  }, [state])

  const live = state.phase === 'recording'
  // Bare sheds its box while the needle is the message and puts it
  // back for text; compact grows back to full size for the same
  // phases, so a hint, an error, or no speech reads the same anywhere.
  const bareNow = look === 'bare' && !TEXT_PHASES.has(state.phase)
  const compactNow = look === 'compact' && !TEXT_PHASES.has(state.phase)
  const barBase = compactNow ? 4 : 6
  const barSpan = compactNow ? 20 : 30
  const classes = [
    'pill',
    `pill-${state.phase}`,
    state.mode === 'note' ? 'pill-note' : '',
    state.mode === 'transform' ? 'pill-transform' : '',
    state.phase === 'error' && state.hint ? 'pill-says' : '',
    bareNow ? 'look-bare' : '',
    compactNow ? 'look-compact' : ''
  ]
  return (
    <div className={classes.filter(Boolean).join(' ')}>
      <div className="needle">
        <span className={`dot ${live ? 'dot-live' : ''}`} />
        <div
          className="wave"
          aria-hidden="true"
          style={accent ? ({ '--wave-accent': accent } as React.CSSProperties) : undefined}
        >
          {/* The canvases size their bitmap once on mount, so a look
              change (a different box) must remount them: keyed by look. */}
          {style === 'pulse' ? (
            <PulseWave
              key={look}
              levelRef={levelRef}
              muted={state.phase !== 'recording'}
              accent={accent ?? 'rgb(240, 164, 75)'}
            />
          ) : style === 'speckle' ? (
            <SpeckleWave
              key={look}
              levelRef={levelRef}
              muted={state.phase !== 'recording'}
              accent={accent}
            />
          ) : (
            levels.map((level, i) => (
              <span
                key={i}
                className="bar"
                style={{ height: `${Math.round(barBase + level * barSpan)}px` }}
              />
            ))
          )}
        </div>
      </div>
      <span className="status-slot">
        {(state.phase === 'recording' || state.phase === 'processing') && (
          <>
            {state.mode === 'note' && <span className="mode-tag">note</span>}
            {state.mode === 'transform' && <span className="mode-tag">transform</span>}
            <span className="timer" data-timer="">
              {formatDuration(elapsed)}
            </span>
          </>
        )}
        {state.phase === 'inserted' && (
          <span className="ok" data-wpm="">
            {state.mode === 'note'
              ? 'noted'
              : state.mode === 'transform'
                ? 'transformed'
                : state.wpm && state.wpm > 0
                  ? `${state.wpm} wpm`
                  : 'inserted'}
          </span>
        )}
        {state.phase === 'hint' && (
          <span className="quiet" data-hint="">
            {state.hint}
          </span>
        )}
        {state.phase === 'nospeech' && <span className="quiet">no speech</span>}
        {state.phase === 'error' && (
          <span className="err" data-error="">
            {state.hint ?? 'error'}
          </span>
        )}
      </span>
    </div>
  )
}
