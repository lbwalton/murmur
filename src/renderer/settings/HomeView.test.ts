// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { WaitingTake } from '../../main/transcribe/recovery'
import { clearAllQuestion, discardAllQuestion, discardedMessage, waitingLine } from './HomeView'

describe('clear all', () => {
  it('asks with the whole log count and says what starts over', () => {
    expect(clearAllQuestion(1204)).toBe(
      'Clear all 1,204 entries from your history? This cannot be undone. Your stats, time back, and belt progress are counted from your history, so they start over. Note files stay in your notes folder.'
    )
    expect(clearAllQuestion(1)).toMatch(/^Clear the 1 entry in your history\? /)
  })
})

describe('discard all', () => {
  it('asks with the count before deleting', () => {
    expect(discardAllQuestion(8)).toBe(
      'Discard all 8 recordings waiting to retry? Their audio is deleted from this computer, and they cannot be retried.'
    )
  })

  it('says how many went', () => {
    expect(discardedMessage(8, 8)).toBe('Discarded 8 recordings.')
    expect(discardedMessage(1, 1)).toBe('Discarded 1 recording.')
  })

  it('says what could not be deleted and is still listed', () => {
    expect(discardedMessage(5, 8)).toBe('Discarded 5 of 8. 3 recordings could not be deleted and are still listed below.')
    expect(discardedMessage(7, 8)).toBe('Discarded 7 of 8. 1 recording could not be deleted and is still listed below.')
    expect(discardedMessage(0, 8)).toBe('Could not discard 8 recordings. They are still listed below; try again in a moment.')
  })
})

describe('a waiting take', () => {
  const take = (failure: { kind: string; detail: string } | null): WaitingTake => ({
    id: 'recovery-1790000000000',
    savedAt: 1_790_000_000_000,
    startedAt: 1_789_999_990_000,
    audioMs: 10_000,
    kind: 'dictation',
    failure
  })

  it('says why it was not transcribed', () => {
    expect(waitingLine(take({ kind: 'network', detail: 'fetch failed' }), 'darwin')).toBe(
      'not transcribed: murmur could not reach the provider'
    )
    expect(waitingLine(take(null), 'win32')).toBe('not transcribed: saved before murmur kept reasons')
  })

  it('a hands-free take parked on sleep or quit says when it was saved', () => {
    expect(waitingLine(take({ kind: 'parked', detail: 'sleep' }), 'darwin')).toBe('Saved when your Mac went to sleep')
    expect(waitingLine(take({ kind: 'parked', detail: 'sleep' }), 'win32')).toBe('Saved when your PC went to sleep')
    expect(waitingLine(take({ kind: 'parked', detail: 'quit' }), 'darwin')).toBe('Saved when murmur quit')
  })
})
