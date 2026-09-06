// SPDX-License-Identifier: GPL-3.0-only
// The waveform pill. Everything else in the app stays quiet; this is the
// one loud element. Amber only while live, red only for errors.
import { useEffect, useRef, useState } from 'react'
import type { OverlayState } from '../../shared/overlay-state'
import { formatDuration } from '../../shared/time'
import type { OverlayApi, OverlayConfig } from '../../preload/overlay'
import { SpeckleWave } from './SpeckleWave'

declare global {
  interface Window {
    murmurOverlay: OverlayApi
  }
}

const BAR_COUNT = 21

export function App(): React.JSX.Element {
  const [state, setState] = useState<OverlayState>({ phase: 'idle', startedAt: null })
  const [levels, setLevels] = useState<number[]>(() => new Array<number>(BAR_COUNT).fill(0))
  const [style, setStyle] = useState<OverlayConfig['style']>('bars')
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
    })
  }, [])

  useEffect(() => {
    document.body.dataset.phase = state.phase
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
  return (
    <div className={`pill pill-${state.phase}`}>
      <span className={`dot ${live ? 'dot-live' : ''}`} />
      <div className="wave" aria-hidden="true">
        {style === 'speckle' ? (
          <SpeckleWave levelRef={levelRef} muted={state.phase !== 'recording'} />
        ) : (
          levels.map((level, i) => (
            <span key={i} className="bar" style={{ height: `${Math.round(6 + level * 30)}px` }} />
          ))
        )}
      </div>
      <span className="status-slot">
        {(state.phase === 'recording' || state.phase === 'processing') && (
          <span className="timer" data-timer="">
            {formatDuration(elapsed)}
          </span>
        )}
        {state.phase === 'inserted' && <span className="ok">inserted</span>}
        {state.phase === 'nospeech' && <span className="quiet">no speech</span>}
        {state.phase === 'error' && <span className="err">error</span>}
      </span>
    </div>
  )
}
