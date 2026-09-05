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

  it('allows cancel from recording straight to idle', () => {
    const m = new OverlayMachine()
    m.transition('recording')
    expect(m.transition('idle')?.phase).toBe('idle')
    expect(m.get().startedAt).toBeNull()
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
