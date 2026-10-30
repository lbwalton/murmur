// SPDX-License-Identifier: GPL-3.0-only
// Dictation trigger state machines. Pure: no timers of their own, the
// clock is injected, callbacks fire synchronously.

export interface DictationCallbacks {
  /** Begin a session. Returning false means nothing began (another
   *  session owns the mic); a machine then stays inactive so its next
   *  press is a fresh start, not a stop for a session it never had. */
  start: () => boolean | void
  stop: () => void
}

export interface TriggerMachine {
  keyDown: () => void
  keyUp: () => void
  isActive: () => boolean
  /** Another key joined the press (a chord, not a lone tap). Optional:
   *  only the hands-free machine cares. */
  interrupt?: () => void
}

/** Hold-to-talk: down starts, up stops. OS key repeat never double-fires. */
export class HoldMachine implements TriggerMachine {
  private active = false
  // Latched from the first key down to the key up whatever start said,
  // so OS key repeat (a down every 85ms while held) never retries a
  // refused start (live-found 2026-09-20: seventeen hints and cues in
  // two seconds from one held note chord with no folder set).
  private held = false

  constructor(private readonly cb: DictationCallbacks) {}

  keyDown(): void {
    if (this.held) return // key repeat
    this.held = true
    if (this.cb.start() === false) return
    this.active = true
  }

  keyUp(): void {
    this.held = false
    if (!this.active) return
    this.active = false
    this.cb.stop()
  }

  isActive(): boolean {
    return this.active
  }
}

/** Toggle: a tap flips recording. Rapid re-taps inside the debounce window are ignored. */
export class ToggleMachine implements TriggerMachine {
  private active = false
  private lastToggleAt = Number.NEGATIVE_INFINITY

  constructor(
    private readonly cb: DictationCallbacks,
    private readonly now: () => number = () => Date.now(),
    private readonly debounceMs = 250
  ) {}

  keyDown(): void {
    const t = this.now()
    if (t - this.lastToggleAt < this.debounceMs) return
    this.lastToggleAt = t
    if (this.active) {
      this.active = false
      this.cb.stop()
      return
    }
    if (this.cb.start() === false) return
    this.active = true
  }

  keyUp(): void {
    // Toggle acts on key down only; key repeat arrives as repeated downs
    // which the debounce window absorbs.
  }

  isActive(): boolean {
    return this.active
  }
}

/** A press held at least this long is a hold, not a tap. */
export const HOLD_MS = 300
/** After a tap's release, how long a second press may still lock the take. */
export const SECOND_TAP_MS = 400
/** After the lock, every press and release is ignored for this long. */
export const LOCK_GUARD_MS = 500

export interface HandsFreeCallbacks extends DictationCallbacks {
  /** The second press locked the take open. */
  lock: () => void
  /** A lone tap expired: throw the take away quietly. */
  discard: () => void
}

/** Schedules fn after ms and returns its cancel. */
export type Schedule = (fn: () => void, ms: number) => () => void

const defaultSchedule: Schedule = (fn, ms) => {
  const id = setTimeout(fn, ms)
  return () => clearTimeout(id)
}

type HandsFreeState = 'idle' | 'pressed' | 'tapped' | 'lockPending' | 'locked'

/**
 * Hold to talk, or double-tap to lock the mic open.
 *   idle -> pressed (first down, take recording)
 *   pressed -> idle on release at or after HOLD_MS (stop)
 *   pressed -> tapped on a shorter release; SECOND_TAP_MS later -> idle (discard)
 *   tapped -> locked on a second down (lock); LOCK_GUARD_MS of ignored keys follow
 *   locked -> idle on the next real press (stop)
 * cleanRelease (modifier-only bindings) moves the lock and the stop from the
 * press to the release of a press that no other key joined (interrupt()).
 */
export class HandsFreeMachine implements TriggerMachine {
  private state: HandsFreeState = 'idle'
  private held = false // key physically down; latches OS key repeat
  private pressAt = 0
  private lockAt = Number.NEGATIVE_INFINITY
  private clean = true // the current press was never interrupted
  private ignoreUp = false // the coming release belongs to a press we ignored
  private armedStop = false // cleanRelease: the clean release stops the take
  private cancelTimer: (() => void) | null = null

  private readonly now: () => number
  private readonly schedule: Schedule
  private readonly cleanRelease: boolean

  constructor(
    private readonly cb: HandsFreeCallbacks,
    opts: { now?: () => number; schedule?: Schedule; cleanRelease?: boolean } = {}
  ) {
    this.now = opts.now ?? (() => Date.now())
    this.schedule = opts.schedule ?? defaultSchedule
    this.cleanRelease = opts.cleanRelease ?? false
  }

  keyDown(): void {
    if (this.held) return // key repeat
    this.held = true
    const t = this.now()
    switch (this.state) {
      case 'idle':
        if (this.cb.start() === false) return
        this.state = 'pressed'
        this.pressAt = t
        this.clean = true
        return
      case 'tapped':
        this.clearTimer()
        this.clean = true
        if (this.cleanRelease) {
          this.state = 'lockPending'
        } else {
          this.ignoreUp = true // the locking press's release never stops the take
          this.lock(t)
        }
        return
      case 'locked':
        if (t - this.lockAt < LOCK_GUARD_MS) {
          this.ignoreUp = true
          return
        }
        this.clean = true
        if (this.cleanRelease) {
          this.armedStop = true
        } else {
          this.state = 'idle'
          this.cb.stop()
        }
        return
      default:
        return
    }
  }

  keyUp(): void {
    if (!this.held) return
    this.held = false
    if (this.ignoreUp) {
      this.ignoreUp = false
      return
    }
    switch (this.state) {
      case 'pressed':
        if (this.now() - this.pressAt >= HOLD_MS) {
          this.state = 'idle'
          this.cb.stop()
          return
        }
        this.state = 'tapped'
        this.cancelTimer = this.schedule(() => {
          this.cancelTimer = null
          this.state = 'idle'
          this.cb.discard()
        }, SECOND_TAP_MS)
        return
      case 'lockPending':
        if (this.clean) this.lock(this.now())
        else this.state = 'tapped' // unreachable: interrupt() discards first
        return
      case 'locked':
        if (this.armedStop && this.clean) {
          this.armedStop = false
          this.state = 'idle'
          this.cb.stop()
        }
        this.armedStop = false
        return
      default:
        return
    }
  }

  interrupt(): void {
    switch (this.state) {
      case 'pressed':
        this.state = 'idle'
        if (this.now() - this.pressAt >= HOLD_MS) this.cb.stop()
        else this.cb.discard()
        return
      case 'tapped':
      case 'lockPending':
        this.clearTimer()
        this.state = 'idle'
        this.cb.discard()
        return
      case 'locked':
        if (this.held) this.clean = false // the press it joined can no longer stop the take
        return
      default:
        return
    }
  }

  isActive(): boolean {
    return this.state !== 'idle'
  }

  isLocked(): boolean {
    return this.state === 'locked'
  }

  reset(): void {
    this.clearTimer()
    this.state = 'idle'
    this.held = false
    this.ignoreUp = false
    this.armedStop = false
    this.clean = true
  }

  /** For a settings change mid-gesture: pressed ends with stop(), tapped
   *  with discard(), locked resets without callbacks and returns 'locked'
   *  so the caller can save the take. */
  abandon(): 'locked' | 'ended' | 'idle' {
    const was = this.state
    this.reset()
    switch (was) {
      case 'pressed':
        this.cb.stop()
        return 'ended'
      case 'tapped':
      case 'lockPending':
        this.cb.discard()
        return 'ended'
      case 'locked':
        return 'locked'
      default:
        return 'idle'
    }
  }

  private lock(t: number): void {
    this.state = 'locked'
    this.lockAt = t
    this.armedStop = false
    this.cb.lock()
  }

  private clearTimer(): void {
    this.cancelTimer?.()
    this.cancelTimer = null
  }
}
