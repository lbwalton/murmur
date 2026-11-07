// SPDX-License-Identifier: GPL-3.0-only
// The 1 thing a take needs from a transform that never reached a model:
// word that its instruction is all that remains. The full loop runs in
// smoke.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSFORM_MAX_CHARS } from '../formatter/transform'
import { performTransform } from './index'

const stage = vi.hoisted(() => ({ selection: 'short', event: { at: 123 }, logFails: false, logClosed: false, sent: 0 }))

vi.mock('electron', () => ({ clipboard: {} }))
vi.mock('../audio', () => ({ playCue: vi.fn() }))
vi.mock('../insertion', () => ({
  insertText: vi.fn(async () => 'inserted'),
  readSelection: vi.fn(async () => ({ ok: true, text: stage.selection }))
}))
vi.mock('../overlay', () => ({ setOverlayPhase: vi.fn() }))
vi.mock('../settings', () => ({ getSettings: () => ({ dictionary: [], transform: { keepOriginals: true } }) }))
vi.mock('../smoke', () => ({ registerSmokeCheck: vi.fn() }))
vi.mock('../hotkeys', () => ({ waitForModifiersReleased: async () => true }))
const appLog = vi.hoisted(() => vi.fn())
vi.mock('../window-watch', () => ({ writeAppLog: appLog }))
vi.mock('../history', () => ({
  recordSession: () => {
    if (stage.logFails) throw new Error('disk full')
    return stage.logClosed ? null : stage.event
  }
}))

const deps = (onUnsent: (event: unknown) => void): Parameters<typeof performTransform>[0] => ({
  startedAt: 1,
  transcribe: async () => ({ ok: true, text: 'shorten this', silence: undefined }) as never,
  connection: null,
  onUnsent
})

beforeEach(() => {
  stage.selection = 'short'
  stage.logFails = false
  stage.logClosed = false
  appLog.mockClear()
})

describe('performTransform', () => {
  it('hands over the logged event when the selection is too long to send', async () => {
    stage.selection = 'a'.repeat(TRANSFORM_MAX_CHARS + 1)
    const onUnsent = vi.fn()
    expect(await performTransform(deps(onUnsent))).toBe('too-long')
    expect(onUnsent).toHaveBeenCalledWith(stage.event)
  })

  it('stops and says so when the log refuses a selection too long to send', async () => {
    stage.selection = 'a'.repeat(TRANSFORM_MAX_CHARS + 1)
    stage.logFails = true
    const onUnsent = vi.fn()
    expect(await performTransform(deps(onUnsent))).toBe('unlogged')
    expect(onUnsent).not.toHaveBeenCalled()
  })

  it('sends nothing to the model when the original cannot be recorded first', async () => {
    stage.logFails = true
    // no-connection would mean it went on past the record.
    expect(await performTransform(deps(vi.fn()))).toBe('unlogged')
    expect(appLog).toHaveBeenCalledWith('[transform] the history log refused the take; nothing sent')
  })

  // History that never opened records nothing and throws nothing.
  it('treats a history that never opened like one that refused', async () => {
    stage.logClosed = true
    expect(await performTransform(deps(vi.fn()))).toBe('unlogged')
    stage.selection = 'a'.repeat(TRANSFORM_MAX_CHARS + 1)
    const onUnsent = vi.fn()
    expect(await performTransform(deps(onUnsent))).toBe('unlogged')
    expect(onUnsent).not.toHaveBeenCalled()
  })

  it('stays quiet when the selection goes on to the model', async () => {
    const onUnsent = vi.fn()
    expect(await performTransform(deps(onUnsent))).toBe('no-connection')
    expect(onUnsent).not.toHaveBeenCalled()
  })
})
