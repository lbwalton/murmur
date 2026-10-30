// SPDX-License-Identifier: GPL-3.0-only
// What ends a hands-free take on its own (US-117), and what murmur says
// when it does. Kept free of Electron so the rules can be unit tested;
// handsfree.ts applies them.
import { MIN_VOICED_MS, SPEECH_RMS_THRESHOLD } from '../shared/speech-gate'

/** The longest locked take: 16 kHz 16-bit mono is 32 KB a second, so
 *  12 minutes is about 23 MB, under the 25 MB upload limit. */
export const TAKE_LIMIT_MS = 720_000
/** Quiet is judged over this much of the newest audio. */
export const SILENCE_WINDOW_MS = 120_000
/** Under this much voice in the window is quiet: the speech gate's own
 *  minimum, so a cough or a key click does not keep the mic open. */
export const SILENCE_VOICED_MS = MIN_VOICED_MS
/** A level at or above this is voice: the speech gate's RMS threshold. */
export const VOICED_LEVEL = SPEECH_RMS_THRESHOLD
/** One overlay level sample stands for this much audio. */
export const LEVEL_FRAME_MS = 33

/** Why a locked take stopped and was saved without a paste. */
export type StopReason = 'silence' | 'lock' | 'limit' | 'menu' | 'changed'
/** Why a locked take was kept for Retry without being transcribed. */
export type ParkReason = 'sleep' | 'quit'

const TITLE = 'murmur hands-free'

/**
 * The live levels of one locked take, reduced to when voice was heard.
 * Only voiced samples are kept, and only for one window, so a 12 minute
 * take holds at most a window's worth of timestamps.
 */
export class SilenceWatch {
  private voiced: number[] = []

  constructor(private readonly windowMs = SILENCE_WINDOW_MS) {}

  push(level: number, at: number): void {
    if (level >= VOICED_LEVEL) this.voiced.push(at)
    this.forget(at)
  }

  /** Voice heard in the last window, one level frame per voiced sample. */
  voicedMs(now: number): number {
    this.forget(now)
    return this.voiced.length * LEVEL_FRAME_MS
  }

  /** Locked a whole window, and that window held too little voice. */
  quiet(now: number, lockedAt: number): boolean {
    return now - lockedAt >= this.windowMs && this.voicedMs(now) < SILENCE_VOICED_MS
  }

  private forget(now: number): void {
    let drop = 0
    while (drop < this.voiced.length && now - this.voiced[drop] >= this.windowMs) drop += 1
    if (drop > 0) this.voiced.splice(0, drop)
  }
}

const STOPPED: Record<StopReason, string> = {
  silence: 'Stopped after 2 minutes of quiet. ',
  lock: 'Stopped when your screen locked. ',
  limit: 'Stopped at 12 minutes, the longest take. ',
  menu: '',
  changed: 'Stopped because the hotkey changed. '
}

/** The notification for a take that stopped on its own: why, then
 *  where the words went (nothing was pasted). */
export function stopNotice(reason: StopReason, kind: 'dictation' | 'note'): { title: string; body: string } {
  const where = kind === 'note' ? 'Your note is saved.' : 'Your words are on the clipboard and in history.'
  return { title: TITLE, body: `${STOPPED[reason]}${where}` }
}

/** The notification for a take kept for Retry: why, then where. */
export function parkNotice(
  reason: ParkReason,
  platform: NodeJS.Platform = process.platform
): { title: string; body: string } {
  const why =
    reason === 'quit' ? 'murmur quit' : platform === 'win32' ? 'Your PC went to sleep' : 'Your Mac went to sleep'
  return { title: TITLE, body: `${why}, so your take is saved. Open murmur and press Retry on Home.` }
}
