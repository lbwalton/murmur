// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { OVERLAY_LOOKS, OverlayMachine, normalizeOverlayLook } from './overlay-state'

describe('normalizeOverlayLook', () => {
  it('keeps the three looks and falls back to pill for anything else', () => {
    expect(OVERLAY_LOOKS).toEqual(['pill', 'compact', 'bare'])
    expect(normalizeOverlayLook('pill')).toBe('pill')
    expect(normalizeOverlayLook('compact')).toBe('compact')
    expect(normalizeOverlayLook('bare')).toBe('bare')
    expect(normalizeOverlayLook('huge')).toBe('pill')
    expect(normalizeOverlayLook('')).toBe('pill')
    expect(normalizeOverlayLook(undefined)).toBe('pill')
    expect(normalizeOverlayLook(3)).toBe('pill')
  })
})

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

describe('error reasons (US-054)', () => {
  it('an error can say why, and the reason clears at idle', () => {
    const m = new OverlayMachine()
    m.transition('recording', undefined, null, { mode: 'transform' })
    m.transition('processing')
    const failed = m.transition('error', undefined, null, { hint: 'could not read the selection' })
    expect(failed?.hint).toBe('could not read the selection')
    expect(failed?.mode).toBe('transform')
    expect(m.transition('idle')?.hint).toBeNull()
  })

  it('a plain error carries no reason', () => {
    const m = new OverlayMachine()
    m.transition('recording')
    m.transition('processing')
    expect(m.transition('error')?.hint).toBeNull()
  })
})

describe('where a note landed (US-082)', () => {
  it('inserted can say where, and it clears with the next press', () => {
    const m = new OverlayMachine()
    m.transition('recording', undefined, null, { mode: 'note' })
    m.transition('processing')
    const noted = m.transition('inserted', undefined, 12, { hint: 'inbox' })
    expect(noted?.hint).toBe('inbox')
    expect(noted?.mode).toBe('note')
    expect(m.transition('recording')?.hint).toBeNull()
  })

  it('a plain insert carries no place', () => {
    const m = new OverlayMachine()
    m.transition('recording')
    m.transition('processing')
    expect(m.transition('inserted', undefined, 140)?.hint).toBeNull()
  })
})

describe('hands-free (US-117)', () => {
  it('recording can move to cancelled and cancelled to idle', () => {
    const m = new OverlayMachine()
    expect(m.transition('cancelled')).toBeNull()
    m.transition('recording', () => 1000, null, { mode: 'note' })
    const cancelled = m.transition('cancelled')
    expect(cancelled?.phase).toBe('cancelled')
    expect(cancelled?.startedAt).toBeNull()
    expect(cancelled?.mode).toBe('note')
    expect(m.transition('processing')).toBeNull()
    expect(m.transition('hint', undefined, null, { hint: 'nope' })).toBeNull()
    expect(m.transition('idle')?.phase).toBe('idle')
    // Only a live take can be thrown away.
    m.transition('recording')
    m.transition('processing')
    expect(m.transition('cancelled')).toBeNull()
    m.transition('inserted')
    expect(m.transition('cancelled')).toBeNull()
  })

  it('a new take can start while the cancel lingers', () => {
    const m = new OverlayMachine()
    m.transition('recording', () => 1000)
    m.transition('cancelled')
    const next = m.transition('recording', () => 2000)
    expect(next?.phase).toBe('recording')
    expect(next?.startedAt).toBe(2000)
    expect(next?.locked).toBe(false)
  })

  it('locked is false at rest and survives recording but not processing', () => {
    const m = new OverlayMachine()
    expect(m.get().locked).toBe(false)
    // Only a recording can be locked.
    expect(m.setLocked(true)).toBeNull()
    expect(m.get().locked).toBe(false)
    m.transition('recording', () => 1000)
    expect(m.get().locked).toBe(false)
    const locked = m.setLocked(true)
    expect(locked?.locked).toBe(true)
    expect(locked?.startedAt).toBe(1000) // the timer still counts from the first press
    expect(m.get().locked).toBe(true)
    expect(m.setLocked(true)).toBeNull() // nothing changed
    expect(m.transition('processing')?.locked).toBe(false)
    expect(m.setLocked(true)).toBeNull()
    expect(m.transition('inserted')?.locked).toBe(false)
    expect(m.transition('idle')?.locked).toBe(false)
  })

  it('every way out of a locked recording unlocks it', () => {
    const m = new OverlayMachine()
    for (const out of ['idle', 'cancelled', 'processing'] as const) {
      m.transition('idle')
      m.transition('recording')
      m.setLocked(true)
      expect(m.transition(out)?.locked).toBe(false)
    }
    m.transition('idle')
    m.transition('recording')
    m.setLocked(true)
    expect(m.setLocked(false)?.locked).toBe(false)
    expect(m.get().phase).toBe('recording')
  })
})
