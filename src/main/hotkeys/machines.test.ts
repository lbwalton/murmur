// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { HoldMachine, ToggleMachine } from './machines'

function recorder() {
  const events: string[] = []
  return {
    events,
    cb: {
      start: () => events.push('start'),
      stop: () => events.push('stop')
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
