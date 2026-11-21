// SPDX-License-Identifier: GPL-3.0-only
// What the receipt says when a sort could not finish (US-180).
import { describe, expect, it } from 'vitest'
import { sortTrouble, sortTroubleBody, sortTroubleTitle, sortWhy } from './sort-notice'

describe('sortTrouble', () => {
  it('speaks up only when lines were left unsorted', () => {
    expect(sortTrouble({ outcome: 'failed', reason: 'http 429', unsorted: 4 })).toBe(true)
    expect(sortTrouble({ outcome: 'filed', reason: 'http 413', unsorted: 1 })).toBe(true)
    expect(sortTrouble({ outcome: 'filed' })).toBe(false)
    // Held lines have their own place under Last note.
    expect(sortTrouble({ outcome: 'rejected', reason: 'low confidence' })).toBe(false)
    expect(sortTrouble({ outcome: 'skipped', reason: 'sorting off', unsorted: 3 })).toBe(false)
  })
})

describe('the words', () => {
  it('says the note is safe and where Sort again is', () => {
    const report = { outcome: 'failed' as const, reason: 'http 429', unsorted: 30 }
    expect(sortTroubleTitle(report)).toBe('Sort did not finish')
    expect(sortTroubleBody(report)).toBe(
      "Your note is safe in the inbox. The provider's rate limit ran out; give it a minute. Sort again is under Settings, Notes, Last note."
    )
  })

  it('counts what is left after a part filed', () => {
    const report = { outcome: 'filed' as const, reason: 'http 413', unsorted: 1 }
    expect(sortTroubleTitle(report)).toBe('Sorted part of your note')
    expect(sortTroubleBody(report)).toBe(
      '1 line is still only in the inbox. The provider said it was too large to send, even 1 line at a time. Sort again under Settings, Notes, Last note sends just those.'
    )
    expect(sortTroubleBody({ ...report, unsorted: 12 })).toMatch(/^12 lines are still only in the inbox\./)
  })

  it('names each reason in plain words', () => {
    expect(sortWhy('timeout')).toBe('The model took too long to answer.')
    expect(sortWhy('network net::ERR_CERT_AUTHORITY_INVALID')).toBe('murmur could not reach the model.')
    expect(sortWhy('http 401')).toBe('The provider turned the key down.')
    expect(sortWhy('http 503')).toBe('The provider had a problem on its side.')
    expect(sortWhy('missing sentences')).toBe("The model's answer did not pass murmur's checks.")
    expect(sortWhy('response not json')).toBe("The model's answer did not pass murmur's checks.")
    expect(sortWhy('write ENOSPC')).toBe('A tasks or ideas file could not be written.')
    expect(sortWhy('no connection')).toBe('No connection has a key to sort with.')
    expect(sortWhy('http 418')).toBe('The sort stopped (http 418).')
  })

  it('keeps to the writing rules', () => {
    const all = [
      sortTroubleBody({ outcome: 'failed', reason: 'timeout', unsorted: 2 }),
      sortTroubleBody({ outcome: 'filed', reason: 'http 429', unsorted: 2 }),
      sortTroubleTitle({ outcome: 'failed' }),
      sortTroubleTitle({ outcome: 'filed' })
    ].join(' ')
    expect(all).not.toMatch(/—| -- | - /)
    expect(all).not.toMatch(/Murmur|MURMUR/)
  })
})
