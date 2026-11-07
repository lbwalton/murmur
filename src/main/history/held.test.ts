// SPDX-License-Identifier: GPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchHeld } from './held'

const MINUTE = 60_000

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('watchHeld', () => {
  it('checks at launch, and again on the slow timer with nothing waiting', async () => {
    const check = vi.fn(async () => null)
    watchHeld(check, 15 * MINUTE)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15 * MINUTE - 1)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('checks the moment the next take comes due, ahead of the slow timer', async () => {
    const check = vi.fn<() => Promise<number | null>>().mockResolvedValueOnce(MINUTE).mockResolvedValue(null)
    watchHeld(check, 15 * MINUTE)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('a take held later joins the watch', async () => {
    const check = vi.fn<() => Promise<number | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce(2 * MINUTE).mockResolvedValue(null)
    const checkNow = watchHeld(check, 15 * MINUTE)
    await vi.advanceTimersByTimeAsync(0)
    checkNow()
    await vi.advanceTimersByTimeAsync(2 * MINUTE)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('a due take that is mid-retry cannot spin the check', async () => {
    const check = vi.fn(async () => 0)
    watchHeld(check, 15 * MINUTE)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(check.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('a failed check stays quiet and the slow timer tries again', async () => {
    const check = vi.fn<() => Promise<number | null>>().mockRejectedValueOnce(new Error('no')).mockResolvedValue(null)
    watchHeld(check, 15 * MINUTE)
    await vi.advanceTimersByTimeAsync(15 * MINUTE)
    expect(check).toHaveBeenCalledTimes(2)
  })
})
