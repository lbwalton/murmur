// SPDX-License-Identifier: GPL-3.0-only
// Overlay phase machine. Pure and shared: the main process enforces
// transitions, tests exercise them, the renderer just paints phases.

export type OverlayPhase = 'idle' | 'recording' | 'processing' | 'inserted' | 'error' | 'nospeech'

export interface OverlayState {
  phase: OverlayPhase
  /** Epoch ms when recording began; drives the live timer. */
  startedAt: number | null
}

const ALLOWED: Record<OverlayPhase, readonly OverlayPhase[]> = {
  idle: ['recording'],
  recording: ['processing', 'idle'],
  processing: ['inserted', 'error', 'nospeech', 'idle'],
  inserted: ['idle', 'recording'],
  error: ['idle', 'recording'],
  nospeech: ['idle', 'recording']
}

export class OverlayMachine {
  private state: OverlayState = { phase: 'idle', startedAt: null }

  get(): OverlayState {
    return { ...this.state }
  }

  /** Attempt a transition. Returns the new state, or null if disallowed. */
  transition(to: OverlayPhase, now: () => number = () => Date.now()): OverlayState | null {
    if (!ALLOWED[this.state.phase].includes(to)) return null
    this.state = {
      phase: to,
      startedAt: to === 'recording' ? now() : to === 'processing' ? this.state.startedAt : null
    }
    return this.get()
  }
}
