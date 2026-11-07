// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { WaitingTake } from '../../main/transcribe/recovery'
import { shorterKeepQuestion, clearAllQuestion, discardAllQuestion, discardedMessage, retriedDictationMessage, waitingLine } from './HomeView'

describe('clear all', () => {
  it('asks with the whole log count and says what starts over', () => {
    expect(clearAllQuestion(1204)).toBe(
      'Clear all 1,204 entries from your history? This cannot be undone. Your stats, time back, and belt progress are counted from your history, so they start over. Note files stay in your notes folder.'
    )
    expect(clearAllQuestion(1)).toMatch(/^Clear the 1 entry in your history\? /)
  })
})

describe('a shorter Keep history', () => {
  it('says the words go and the numbers stay', () => {
    expect(shorterKeepQuestion(1, 1204, 2)).toBe(
      'This removes the words of 1,204 entries and 2 recordings waiting to retry now, and it cannot be undone. Your numbers and belts stay.'
    )
    expect(shorterKeepQuestion(-1, 1, 0)).toBe(
      'This removes the words of 1 entry now, and it cannot be undone. Your numbers and belts stay.'
    )
  })

  it('says whole entries go on the day limits', () => {
    expect(shorterKeepQuestion(30, 12, 1)).toBe(
      'This removes 12 entries and 1 recording waiting to retry now, and it cannot be undone. Their numbers go too, so your totals drop.'
    )
  })

  it('asks nothing when nothing goes', () => {
    expect(shorterKeepQuestion(1, 0, 0)).toBe('')
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

  it('a held take says its recording stays up to 24 hours, not that it failed', () => {
    expect(waitingLine(take({ kind: 'held', detail: 'idle' }), 'darwin')).toBe(
      'never reached an app, so its recording stays up to 24 hours'
    )
  })

  it('a hands-free take parked on sleep or quit says when it was saved', () => {
    expect(waitingLine(take({ kind: 'parked', detail: 'sleep' }), 'darwin')).toBe('saved when your Mac went to sleep')
    expect(waitingLine(take({ kind: 'parked', detail: 'sleep' }), 'win32')).toBe('saved when your PC went to sleep')
    expect(waitingLine(take({ kind: 'parked', detail: 'quit' }), 'darwin')).toBe('saved when murmur quit')
  })

  it('a hands-free take cancelled with Escape says so', () => {
    expect(waitingLine(take({ kind: 'parked', detail: 'cancel' }), 'darwin')).toBe('saved when you cancelled it')
    expect(waitingLine(take({ kind: 'parked', detail: 'cancel' }), 'win32')).toBe('saved when you cancelled it')
  })
})

describe('retried dictation message', () => {
  it('says the words are in the log and the clipboard is untouched', () => {
    expect(retriedDictationMessage('Cmd+Shift+V', true)).toBe(
      'Done: the words are in your log. Press Cmd+Shift+V in any app to paste them there.'
    )
    expect(retriedDictationMessage('', true)).toBe('Done: the words are in your log. Click copy on it in the log below.')
    expect(retriedDictationMessage('', true)).not.toMatch(/clipboard/)
  })

  it('never names a disarmed paste-last chord, which does nothing', () => {
    expect(retriedDictationMessage('Cmd+Shift+V', false)).toBe(
      'Done: the words are in your log. Click copy on it in the log below.'
    )
  })
})
