// SPDX-License-Identifier: GPL-3.0-only
// Overlay phase machine. Pure and shared: the main process enforces
// transitions, tests exercise them, the renderer just paints phases.

export type OverlayPhase =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'inserted'
  | 'error'
  | 'nospeech'
  /** A short message with no session behind it (a chord pressed before
   *  its setting exists). Shown from rest, lingers, returns to idle. */
  | 'hint'

/** What a session is for: the cursor, a note file, or an edit of the
 *  selection (US-054). Set when recording starts, carried through the
 *  outcome, reset at idle. */
export type OverlayMode = 'dictation' | 'note' | 'transform'

/** How the pill is drawn (US-061): the classic pill, the same pill at
 *  about two thirds, or no box at all (a translucent waveform with the
 *  timer beneath it). Text that has to be read always gets the pill. */
export const OVERLAY_LOOKS = ['pill', 'compact', 'bare'] as const
export type OverlayLook = (typeof OVERLAY_LOOKS)[number]

/** A usable look: the value itself when it is one of the three, else
 *  pill, so a stored or foreign value can never leave the pill undrawn. */
export function normalizeOverlayLook(value: unknown): OverlayLook {
  return (OVERLAY_LOOKS as readonly unknown[]).includes(value) ? (value as OverlayLook) : 'pill'
}

export interface OverlayState {
  phase: OverlayPhase
  /** Epoch ms when recording began; drives the live timer. */
  startedAt: number | null
  /** Words per minute of the finished session, shown on inserted. */
  wpm: number | null
  mode: OverlayMode
  /** The message of a hint phase, or an error's reason when the error
   *  has one worth saying (a selection that could not be read); null
   *  otherwise. */
  hint: string | null
}

export interface TransitionExtras {
  mode?: OverlayMode
  hint?: string
}

const ALLOWED: Record<OverlayPhase, readonly OverlayPhase[]> = {
  idle: ['recording', 'hint'],
  recording: ['processing', 'idle'],
  processing: ['inserted', 'error', 'nospeech', 'idle'],
  inserted: ['idle', 'recording', 'hint'],
  error: ['idle', 'recording', 'hint'],
  nospeech: ['idle', 'recording', 'hint'],
  hint: ['idle', 'recording']
}

const REST: OverlayState = { phase: 'idle', startedAt: null, wpm: null, mode: 'dictation', hint: null }

export class OverlayMachine {
  private state: OverlayState = { ...REST }

  get(): OverlayState {
    return { ...this.state }
  }

  /** Attempt a transition. Returns the new state, or null if disallowed. */
  transition(
    to: OverlayPhase,
    now: () => number = () => Date.now(),
    wpm: number | null = null,
    extras: TransitionExtras = {}
  ): OverlayState | null {
    if (!ALLOWED[this.state.phase].includes(to)) return null
    const mode: OverlayMode =
      to === 'recording' || to === 'hint'
        ? (extras.mode ?? 'dictation')
        : to === 'idle'
          ? 'dictation'
          : this.state.mode
    this.state = {
      phase: to,
      startedAt: to === 'recording' ? now() : to === 'processing' ? this.state.startedAt : null,
      wpm: to === 'inserted' ? wpm : null,
      mode,
      hint: to === 'hint' ? (extras.hint ?? '') : to === 'error' ? (extras.hint ?? null) : null
    }
    return this.get()
  }
}
