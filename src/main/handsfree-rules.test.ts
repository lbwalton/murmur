// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  LEVEL_FRAME_MS,
  LOCK_SCREEN_WAIT_MS,
  SILENCE_VOICED_MS,
  SILENCE_WINDOW_MS,
  SilenceWatch,
  TAKE_LIMIT_MS,
  VOICED_LEVEL,
  failedNotice,
  parkNotice,
  retryNotice,
  stopNotice
} from './handsfree-rules'
import { MIN_VOICED_MS, SPEECH_RMS_THRESHOLD } from '../shared/speech-gate'

describe('the hands-free times', () => {
  it('are the story numbers, and silence is judged by the speech gate', () => {
    expect(TAKE_LIMIT_MS).toBe(12 * 60_000)
    expect(SILENCE_WINDOW_MS).toBe(2 * 60_000)
    expect(SILENCE_VOICED_MS).toBe(200)
    expect(VOICED_LEVEL).toBe(0.01)
    expect(LEVEL_FRAME_MS).toBe(33)
    // A lid close locks the screen just before the sleep it brings.
    expect(LOCK_SCREEN_WAIT_MS).toBe(1_000)
    expect(VOICED_LEVEL).toBe(SPEECH_RMS_THRESHOLD)
    expect(SILENCE_VOICED_MS).toBe(MIN_VOICED_MS)
  })
})

describe('SilenceWatch', () => {
  it('counts a sample at or above the speech threshold as one level frame of voice', () => {
    const watch = new SilenceWatch()
    watch.push(0.01, 1_000)
    expect(watch.voicedMs(1_000)).toBe(33)
    watch.push(0.009, 1_033)
    expect(watch.voicedMs(1_033)).toBe(33)
    watch.push(0.4, 1_066)
    expect(watch.voicedMs(1_066)).toBe(66)
  })

  it('forgets voice older than 2 minutes', () => {
    const watch = new SilenceWatch()
    watch.push(0.2, 0)
    watch.push(0.2, 60_000)
    expect(watch.voicedMs(SILENCE_WINDOW_MS - 1)).toBe(66)
    expect(watch.voicedMs(SILENCE_WINDOW_MS)).toBe(33)
    expect(watch.voicedMs(60_000 + SILENCE_WINDOW_MS)).toBe(0)
  })

  it('is quiet only after 2 minutes locked with under 200 ms of voice', () => {
    const lockedAt = 10_000
    const end = lockedAt + SILENCE_WINDOW_MS
    const six = new SilenceWatch()
    const seven = new SilenceWatch()
    for (let i = 0; i < 7; i++) {
      const at = lockedAt + 30_000 + i * LEVEL_FRAME_MS
      if (i < 6) six.push(0.05, at)
      seven.push(0.05, at)
    }
    // Nothing is quiet before the take has been locked a whole window.
    expect(six.quiet(end - 1, lockedAt)).toBe(false)
    expect(new SilenceWatch().quiet(end - 1, lockedAt)).toBe(false)
    // 6 frames is 198 ms of voice: quiet. 7 is 231 ms: still talking.
    expect(six.voicedMs(end)).toBe(198)
    expect(six.quiet(end, lockedAt)).toBe(true)
    expect(seven.voicedMs(end)).toBe(231)
    expect(seven.quiet(end, lockedAt)).toBe(false)
    expect(new SilenceWatch().quiet(end, lockedAt)).toBe(true)
  })

  it('a cough does not keep the mic open', () => {
    const lockedAt = 0
    const watch = new SilenceWatch()
    for (let t = lockedAt; t <= lockedAt + SILENCE_WINDOW_MS; t += 20_000) watch.push(0.6, t)
    expect(watch.quiet(lockedAt + SILENCE_WINDOW_MS, lockedAt)).toBe(true)
  })

  it('takes a shorter window for smoke', () => {
    const watch = new SilenceWatch(1_500)
    watch.push(0.2, 0)
    expect(watch.voicedMs(1_499)).toBe(33)
    expect(watch.voicedMs(1_500)).toBe(0)
    expect(watch.quiet(1_499, 0)).toBe(false)
    expect(watch.quiet(1_500, 0)).toBe(true)
  })
})

describe('the hands-free notices', () => {
  it('every stop reason has copy for a dictation and a note', () => {
    const words = 'Your words are on the clipboard and in history.'
    const note = 'Your note is saved.'
    const why = {
      silence: 'Stopped after 2 minutes of quiet. ',
      lock: 'Stopped when your screen locked. ',
      limit: 'Stopped at 12 minutes, the longest take. ',
      menu: '',
      changed: 'Stopped because the hotkey changed. '
    } as const
    for (const reason of Object.keys(why) as Array<keyof typeof why>) {
      expect(stopNotice(reason, 'dictation')).toEqual({ title: 'murmur hands-free', body: `${why[reason]}${words}` })
      expect(stopNotice(reason, 'note')).toEqual({ title: 'murmur hands-free', body: `${why[reason]}${note}` })
    }
    expect(stopNotice('silence', 'dictation').body).toBe(
      'Stopped after 2 minutes of quiet. Your words are on the clipboard and in history.'
    )
    expect(stopNotice('menu', 'note').body).toBe('Your note is saved.')
  })

  it('a stopped take whose transcription failed says it waits in Retry', () => {
    const retry = 'Your take is saved. Open murmur and press Retry on Home.'
    expect(retryNotice('silence')).toEqual({
      title: 'murmur hands-free',
      body: 'Stopped after 2 minutes of quiet. Your take is saved. Open murmur and press Retry on Home.'
    })
    expect(retryNotice('lock').body).toBe(`Stopped when your screen locked. ${retry}`)
    expect(retryNotice('limit').body).toBe(`Stopped at 12 minutes, the longest take. ${retry}`)
    expect(retryNotice('changed').body).toBe(`Stopped because the hotkey changed. ${retry}`)
    expect(retryNotice('menu')).toEqual({ title: 'murmur hands-free', body: retry })
  })

  it('a stopped take that could not be saved says so', () => {
    expect(failedNotice('silence')).toEqual({
      title: 'murmur hands-free',
      body: 'Stopped after 2 minutes of quiet. The take could not be saved.'
    })
    expect(failedNotice('lock').body).toBe('Stopped when your screen locked. The take could not be saved.')
    expect(failedNotice('limit').body).toBe('Stopped at 12 minutes, the longest take. The take could not be saved.')
    expect(failedNotice('changed').body).toBe('Stopped because the hotkey changed. The take could not be saved.')
    expect(failedNotice('menu')).toEqual({ title: 'murmur hands-free', body: 'The take could not be saved.' })
  })

  it('a parked take says why and where to find it', () => {
    expect(parkNotice('sleep', 'darwin')).toEqual({
      title: 'murmur hands-free',
      body: 'Your Mac went to sleep, so your take is saved. Open murmur and press Retry on Home.'
    })
    expect(parkNotice('sleep', 'win32').body).toBe(
      'Your PC went to sleep, so your take is saved. Open murmur and press Retry on Home.'
    )
    expect(parkNotice('quit', 'darwin')).toEqual({
      title: 'murmur hands-free',
      body: 'murmur quit, so your take is saved. Open murmur and press Retry on Home.'
    })
    expect(parkNotice('quit', 'win32')).toEqual(parkNotice('quit', 'darwin'))
  })
})
