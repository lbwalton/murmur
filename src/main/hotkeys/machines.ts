// SPDX-License-Identifier: GPL-3.0-only
// Dictation trigger state machines. Pure: no timers of their own, the
// clock is injected, callbacks fire synchronously.

export interface DictationCallbacks {
  start: () => void
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

  constructor(private readonly cb: DictationCallbacks) {}

  keyDown(): void {
    if (this.active) return // key repeat
    this.active = true
    this.cb.start()
  }

  keyUp(): void {
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
    this.active = !this.active
    if (this.active) this.cb.start()
    else this.cb.stop()
  }

  keyUp(): void {
    // Toggle acts on key down only; key repeat arrives as repeated downs
    // which the debounce window absorbs.
  }

  isActive(): boolean {
    return this.active
  }
}
