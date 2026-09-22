// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { OverlayMachine } from './overlay-state'

describe('OverlayMachine', () => {
  it('walks the happy path idle to recording to processing to inserted to idle', () => {
    const m = new OverlayMachine()
    expect(m.transition('recording', () => 1000)?.phase).toBe('recording')
    expect(m.get().startedAt).toBe(1000)
    expect(m.transition('processing')?.phase).toBe('processing')
    expect(m.get().startedAt).toBe(1000) // timer freezes through processing
    expect(m.transition('inserted')?.phase).toBe('inserted')
    expect(m.get().startedAt).toBeNull()
    expect(m.transition('idle')?.phase).toBe('idle')
  })

  it('rejects illegal jumps', () => {
    const m = new OverlayMachine()
    expect(m.transition('inserted')).toBeNull()
    expect(m.transition('processing')).toBeNull()
    m.transition('recording')
    expect(m.transition('inserted')).toBeNull()
    expect(m.get().phase).toBe('recording')
  })

  it('carries wpm only through the inserted phase', () => {
    const m = new OverlayMachine()
    m.transition('recording')
    m.transition('processing')
    expect(m.transition('inserted', undefined, 132)?.wpm).toBe(132)
    expect(m.transition('idle')?.wpm).toBeNull()
    m.transition('recording')
    expect(m.get().wpm).toBeNull()
  })

  it('allows cancel from recording straight to idle', () => {
    const m = new OverlayMachine()
    m.transition('recording')
    expect(m.transition('idle')?.phase).toBe('idle')
    expect(m.get().startedAt).toBeNull()
  })

  it('starts in dictation mode and carries note mode through the outcome', () => {
    const m = new OverlayMachine()
    expect(m.get().mode).toBe('dictation')
    m.transition('recording', undefined, null, { mode: 'note' })
    expect(m.get().mode).toBe('note')
    m.transition('processing')
    expect(m.get().mode).toBe('note')
    expect(m.transition('inserted', undefined, 90)?.mode).toBe('note')
    expect(m.transition('idle')?.mode).toBe('dictation')
    // A plain recording never inherits the last note session's mode.
    m.transition('recording', undefined, null, { mode: 'note' })
    m.transition('idle')
    expect(m.transition('recording')?.mode).toBe('dictation')
  })

  it('shows a hint from rest and from any outcome, never mid-session', () => {
    const m = new OverlayMachine()
    const shown = m.transition('hint', undefined, null, { mode: 'note', hint: 'set a notes folder' })
    expect(shown?.phase).toBe('hint')
    expect(shown?.hint).toBe('set a notes folder')
    expect(shown?.mode).toBe('note')
    expect(shown?.startedAt).toBeNull()
    expect(m.transition('idle')?.hint).toBeNull()
    m.transition('recording')
    expect(m.transition('hint', undefined, null, { hint: 'nope' })).toBeNull()
    m.transition('processing')
    expect(m.transition('hint', undefined, null, { hint: 'nope' })).toBeNull()
    m.transition('nospeech')
    expect(m.transition('hint', undefined, null, { hint: 'again' })?.phase).toBe('hint')
    // A hint never blocks the next press.
    expect(m.transition('recording', () => 5)?.phase).toBe('recording')
    expect(m.get().hint).toBeNull()
  })

  it('supports error and nospeech outcomes and restart from them', () => {
    const m = new OverlayMachine()
    m.transition('recording')
    m.transition('processing')
    expect(m.transition('nospeech')?.phase).toBe('nospeech')
    expect(m.transition('recording', () => 2000)?.phase).toBe('recording')
    m.transition('processing')
    expect(m.transition('error')?.phase).toBe('error')
  })
})
