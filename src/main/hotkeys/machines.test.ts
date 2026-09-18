// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { HoldMachine, ToggleMachine } from './machines'

function recorder() {
  const events: string[] = []
  return {
    events,
    cb: {
      start: (): void => {
        events.push('start')
      },
      stop: (): void => {
        events.push('stop')
      }
    }
  }
}

describe('HoldMachine', () => {
  it('starts on down, stops on up', () => {
    const { events, cb } = recorder()
    const m = new HoldMachine(cb)
    m.keyDown()
    expect(m.isActive()).toBe(true)
    m.keyUp()
    expect(events).toEqual(['start', 'stop'])
    expect(m.isActive()).toBe(false)
  })

  it('ignores OS key repeat while held', () => {
    const { events, cb } = recorder()
    const m = new HoldMachine(cb)
    m.keyDown()
    m.keyDown()
    m.keyDown()
    m.keyUp()
    expect(events).toEqual(['start', 'stop'])
  })

  it('ignores a stray up with no down', () => {
    const { events, cb } = recorder()
    new HoldMachine(cb).keyUp()
    expect(events).toEqual([])
  })
})

describe('ToggleMachine', () => {
  it('taps toggle start and stop', () => {
    const { events, cb } = recorder()
    let t = 0
    const m = new ToggleMachine(cb, () => t)
    m.keyDown()
    m.keyUp()
    t += 1000
    m.keyDown()
    m.keyUp()
    expect(events).toEqual(['start', 'stop'])
    expect(m.isActive()).toBe(false)
  })

  it('absorbs rapid re-taps and key repeat inside the debounce window', () => {
    const { events, cb } = recorder()
    let t = 0
    const m = new ToggleMachine(cb, () => t, 250)
    m.keyDown() // start
    t += 30
    m.keyDown() // repeat, absorbed
    t += 30
    m.keyDown() // repeat, absorbed
    t += 500
    m.keyDown() // stop
    expect(events).toEqual(['start', 'stop'])
  })

  it('key up never toggles', () => {
    const { events, cb } = recorder()
    const m = new ToggleMachine(cb, () => 0)
    m.keyUp()
    expect(events).toEqual([])
  })
})

describe('a refused start (review gate 2026-09-18, two chords sharing one mic)', () => {
  it('leaves a hold machine inactive so its release stops nothing', () => {
    const calls: string[] = []
    const m = new HoldMachine({
      start: () => {
        calls.push('start')
        return false
      },
      stop: () => calls.push('stop')
    })
    m.keyDown()
    expect(m.isActive()).toBe(false)
    m.keyUp()
    expect(calls).toEqual(['start'])
  })

  it('leaves a toggle machine inactive so the next tap is a fresh start, not a stop', () => {
    const calls: string[] = []
    let allow = false
    let t = 0
    const m = new ToggleMachine(
      {
        start: () => {
          calls.push('start')
          return allow
        },
        stop: () => calls.push('stop')
      },
      () => (t += 1000)
    )
    m.keyDown()
    expect(m.isActive()).toBe(false)
    allow = true
    m.keyDown()
    expect(m.isActive()).toBe(true)
    m.keyDown()
    expect(m.isActive()).toBe(false)
    expect(calls).toEqual(['start', 'start', 'stop'])
  })

  it('treats a start that returns nothing as begun', () => {
    const m = new HoldMachine({ start: () => undefined, stop: () => undefined })
    m.keyDown()
    expect(m.isActive()).toBe(true)
  })
})
