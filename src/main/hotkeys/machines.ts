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
