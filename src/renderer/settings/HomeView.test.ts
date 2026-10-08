// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { discardAllQuestion, discardedMessage } from './HomeView'

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
