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
  /** A live take thrown away with Escape (US-117): one dry grey scrape,
   *  never red. Reached only from recording; lingers CANCEL_LINGER_MS,
   *  then idle, and a new take may start while it lingers. */
  | 'cancelled'

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

/** The ink waveforms (US-074), drawn with the brush. Each is a
 *  cosmetic in shared/cosmetics.json, unlocked one per belt. */
export const INK_STYLES = ['dabs', 'flecks', 'rings', 'ribbon'] as const
export type InkStyle = (typeof INK_STYLES)[number]

export function isInkStyle(value: unknown): value is InkStyle {
  return (INK_STYLES as readonly unknown[]).includes(value)
}

/** How long the cancelled phase stays up before the pill rests: the
 *  scrape is drawn and the pill has faded inside it (US-117). */
export const CANCEL_LINGER_MS = 900

export interface OverlayState {
  phase: OverlayPhase
  /** Epoch ms when recording began; drives the live timer. */
  startedAt: number | null
  /** Words per minute of the finished session, shown on inserted. */
  wpm: number | null
  mode: OverlayMode
  /** The message of a hint phase, an error's reason when the error has
   *  one worth saying (a selection that could not be read), or where a
   *  note landed on inserted (inbox); null otherwise. */
  hint: string | null
  /** Hands-free (US-117): murmur holds the mic for this take, so the pill
   *  closes its loop. Set only while recording; every transition clears
   *  it, so it never outlives the take that was locked. */
  locked: boolean
}

export interface TransitionExtras {
  mode?: OverlayMode
  hint?: string
}

const ALLOWED: Record<OverlayPhase, readonly OverlayPhase[]> = {
  idle: ['recording', 'hint'],
  recording: ['processing', 'idle', 'cancelled'],
  processing: ['inserted', 'error', 'nospeech', 'idle'],
  inserted: ['idle', 'recording', 'hint'],
  error: ['idle', 'recording', 'hint'],
  nospeech: ['idle', 'recording', 'hint'],
  hint: ['idle', 'recording'],
  cancelled: ['idle', 'recording']
}

const REST: OverlayState = {
  phase: 'idle',
  startedAt: null,
  wpm: null,
  mode: 'dictation',
  hint: null,
  locked: false
}

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
      hint: to === 'hint' ? (extras.hint ?? '') : to === 'error' || to === 'inserted' ? (extras.hint ?? null) : null,
      // A new take starts unlocked, and leaving a recording unlocks it.
      locked: false
    }
    return this.get()
  }

  /** Lock or unlock the live take (US-117). Only a recording can be
   *  locked. Returns the new state, or null when nothing changed. */
  setLocked(locked: boolean): OverlayState | null {
    if (this.state.phase !== 'recording' || this.state.locked === locked) return null
    this.state = { ...this.state, locked }
    return this.get()
  }
}
