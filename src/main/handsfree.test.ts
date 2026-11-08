// SPDX-License-Identifier: GPL-3.0-only
// What a locked take that stopped on its own says afterwards, since
// nobody was watching the pill.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEP_NO_TEXT } from '../shared/history'
import { handsFreeAutoStop, handsFreeLock, lastHandsFreeNotice } from './handsfree'

const stage = vi.hoisted(() => ({ retentionDays: 90, outcome: 'delivered', held: false, live: 'note' }))

vi.mock('electron', () => ({
  Notification: { isSupported: () => false },
  app: {},
  clipboard: {},
  powerMonitor: {},
  powerSaveBlocker: { start: () => 1, stop: vi.fn() }
}))
vi.mock('uiohook-napi', () => ({ UiohookKey: {} }))
vi.mock('./audio', () => ({ onAudioSessionEnd: vi.fn(), playCue: vi.fn(), setKeepAudioOnQuit: vi.fn(), stallCaptureForSmoke: vi.fn() }))
vi.mock('./dictation', () => ({
  dictationLocked: vi.fn(),
  dictationStop: async () => stage.outcome,
  lastTakeHeld: () => stage.held,
  liveSessionKind: () => stage.live
}))
vi.mock('./hotkeys', () => ({ getHotkeysStatus: () => ({ pasteBindingValid: true }), resetHandsFreeGestures: vi.fn(), smokeHotkeyEvent: vi.fn() }))
vi.mock('./overlay', () => ({
  getOverlayPhase: () => 'recording',
  getOverlayState: () => ({ startedAt: 1 }),
  setAudioLevelListener: vi.fn(),
  setOverlayLocked: vi.fn(),
  setOverlayPhase: vi.fn()
}))
vi.mock('./settings', () => ({
  getSettings: () => ({ hotkey: { pasteLastBinding: 'Ctrl+F12' }, history: { retentionDays: stage.retentionDays } })
}))
vi.mock('./smoke', () => ({ isSmoke: true, registerSmokeCheck: vi.fn() }))
vi.mock('./tray', () => ({ setTrayHandsFree: vi.fn(), trayMenuLabels: vi.fn() }))
vi.mock('./window-watch', () => ({ writeAppLog: vi.fn() }))

async function stopped(kind: 'dictation' | 'note'): Promise<string> {
  stage.live = kind
  handsFreeLock(kind)
  await handsFreeAutoStop('silence')
  return lastHandsFreeNotice()?.body ?? ''
}

beforeEach(() => {
  stage.retentionDays = 90
  stage.outcome = 'delivered'
  stage.held = false
})

describe('a locked take that stopped on its own', () => {
  it('a note history holds says so, and never that the take was lost', async () => {
    stage.outcome = 'logged'
    const body = await stopped('note')
    expect(body).toContain('The note could not be filed. Your words are in history.')
    expect(body).not.toContain('could not be saved')
  })

  it('promises the recording only when one was held', async () => {
    stage.retentionDays = KEEP_NO_TEXT
    stage.held = true
    expect(await stopped('dictation')).toContain('until you quit murmur, and the recording goes after 24 hours')
    stage.held = false
    const body = await stopped('dictation')
    expect(body).toContain('until you quit murmur')
    expect(body).not.toContain('recording')
  })

  it('a take with no home says it could not be saved', async () => {
    stage.outcome = 'failed'
    expect(await stopped('note')).toContain('The take could not be saved.')
  })
})
