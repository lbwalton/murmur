// SPDX-License-Identifier: GPL-3.0-only
// Hands-free (US-117): everything that happens while a take is locked.
// The gesture machine (hotkeys/machines.ts) decides when a double-tap
// locks a take and when a press stops it; this module holds the locked
// take: the 12 minute limit and the silence watch, Escape and the tray's
// Discard, the auto-stops that save without pasting (the app in front
// may have changed), and parking the audio for Retry when the computer
// sleeps or murmur quits. While a take is locked the display stays
// awake: hands-free invites no keyboard or mouse input, and a display
// that sleeps on idle can lock the screen mid-sentence; the silence and
// 12 minute stops still bound the hold. Every way a take ends lets go
// of it at once, so whichever comes first wins and the rest do nothing.
// Logs carry numbers and outcomes, never words.
import { Notification, app, powerMonitor, powerSaveBlocker } from 'electron'
import { onAudioSessionEnd, playCue, setKeepAudioOnQuit } from './audio'
import { dictationCancelTake, dictationDiscard, dictationPark, dictationStop, liveSessionKind } from './dictation'
import {
  LOCK_SCREEN_WAIT_MS,
  type ParkReason,
  SILENCE_WINDOW_MS,
  SilenceWatch,
  type StopReason,
  TAKE_LIMIT_MS,
  parkNotice,
  retryNotice,
  stopNotice
} from './handsfree-rules'
import { resetHandsFreeGestures } from './hotkeys'
import { getOverlayState, setAudioLevelListener, setOverlayLocked } from './overlay'
import { isSmoke } from './smoke'
import { setTrayHandsFree } from './tray'
import { writeAppLog } from './window-watch'

type LockedKind = 'dictation' | 'note'

/** A park that has not finished by now is given up, so a quit or a
 *  sleep is never held hostage by a stuck capture window. */
const PARK_GIVE_UP_MS = 1_500
/** How often the silence watch is asked whether the take went quiet. */
const SILENCE_CHECK_MS = 1_000

interface LockedTake {
  kind: LockedKind
  /** The take's first press: its length counts from here, as the pill's
   *  timer does. */
  startedAt: number
  lockedAt: number
  limitTimer: NodeJS.Timeout
  silenceTimer: NodeJS.Timeout
  /** A screen lock waiting out LOCK_SCREEN_WAIT_MS before it stops the
   *  take; a sleep inside the wait parks the take instead. */
  lockScreenTimer: NodeJS.Timeout | null
  /** The powerSaveBlocker id keeping the display awake, if one started. */
  displayBlocker: number | null
}

let locked: LockedTake | null = null
let parking = false
// A quit that arrived while a take was locked or parking: the park
// quits again once it is done.
let quitAfterPark = false
let limitMs = TAKE_LIMIT_MS
let silenceWindowMs = SILENCE_WINDOW_MS
let parkGiveUpMs = PARK_GIVE_UP_MS
let lastNotice: { title: string; body: string } | null = null

function log(line: string): void {
  try {
    writeAppLog(`[hands-free] ${line}`)
  } catch {
    // Diagnostics stay best-effort.
  }
}

function notify(notice: { title: string; body: string }): void {
  lastNotice = notice
  // Smoke words the notice and stops short of the desktop.
  if (isSmoke || !Notification.isSupported()) return
  try {
    // The cues already spoke for a stop; a park happens as the computer
    // sleeps or murmur quits, when a sound helps no one.
    new Notification({ title: notice.title, body: notice.body, silent: true }).show()
  } catch {
    log('notification failed')
  }
}

/** Let go of the locked take: its timers, the silence watch, the
 *  display's wake hold, and the tray items. Synchronous, so a second way
 *  out finds nothing. */
function release(): LockedTake | null {
  const take = locked
  if (!take) return null
  locked = null
  clearTimeout(take.limitTimer)
  clearInterval(take.silenceTimer)
  if (take.lockScreenTimer) clearTimeout(take.lockScreenTimer)
  if (take.displayBlocker !== null) powerSaveBlocker.stop(take.displayBlocker)
  setAudioLevelListener(null)
  setTrayHandsFree(false)
  return take
}

/** Hold the display awake; null when the system would not. */
function keepDisplayAwake(): number | null {
  try {
    return powerSaveBlocker.start('prevent-display-sleep')
  } catch {
    log('display wake hold failed')
    return null
  }
}

/** The screen locked: stop the take after LOCK_SCREEN_WAIT_MS, unless a
 *  sleep comes first (a closing lid locks, then sleeps) and parks it. */
function onLockScreen(): void {
  const take = locked
  if (!take || take.lockScreenTimer) return
  take.lockScreenTimer = setTimeout(() => {
    take.lockScreenTimer = null
    if (locked === take) void handsFreeAutoStop('lock')
  }, LOCK_SCREEN_WAIT_MS)
}

/** The second press locked the take: the mic stays open until a tap,
 *  Escape, the tray, or an auto-stop ends it. */
export function handsFreeLock(kind: LockedKind): void {
  if (locked || liveSessionKind() !== kind) return
  const now = Date.now()
  const startedAt = getOverlayState().startedAt ?? now
  const watch = new SilenceWatch(silenceWindowMs)
  const take: LockedTake = {
    kind,
    startedAt,
    lockedAt: now,
    // A timer that fires after its take ended does nothing.
    limitTimer: setTimeout(
      () => {
        if (locked === take) void handsFreeAutoStop('limit')
      },
      Math.max(0, limitMs - (now - startedAt))
    ),
    silenceTimer: setInterval(
      () => {
        if (locked === take && watch.quiet(Date.now(), take.lockedAt)) void handsFreeAutoStop('silence')
      },
      Math.min(SILENCE_CHECK_MS, silenceWindowMs)
    ),
    lockScreenTimer: null,
    displayBlocker: keepDisplayAwake()
  }
  locked = take
  setAudioLevelListener((level) => watch.push(level, Date.now()))
  setOverlayLocked(true)
  playCue('lock')
  setTrayHandsFree(true)
  log(`lock kind=${kind}`)
}

/** The machine's stop: a press ended a hold, or a tap ended a locked
 *  take. Either way the words go through the normal pipeline. */
export function handsFreeStop(kind: LockedKind): void {
  if (locked?.kind === kind) {
    const take = release()
    setOverlayLocked(false)
    if (take) log(`stop ms=${Date.now() - take.startedAt}`)
  }
  void dictationStop(kind)
}

/** A lone tap with no second press in time: thrown away quietly. */
export function handsFreeDiscard(kind: LockedKind): void {
  if (locked?.kind === kind) return
  if (dictationDiscard(kind)) log('discard')
}

/** Escape, or Discard in the tray: throw the locked take away. False,
 *  and nothing happens, when no take is locked. */
export function handsFreeCancel(): boolean {
  const take = release()
  if (!take) return false
  // Escape still reaches the hotkey dispatcher as a joining key; the
  // machines must already have forgotten this take by then.
  resetHandsFreeGestures()
  // Cancelled first: leaving the recording clears the lock itself, so
  // the loop fades under the scrape instead of vanishing before it.
  dictationCancelTake()
  setOverlayLocked(false)
  log(`cancel ms=${Date.now() - take.startedAt}`)
  return true
}

/** The take stopped on its own (quiet, a screen lock, the limit, the
 *  tray, a hotkey change): transcribed and saved, never pasted, and a
 *  notification says why and where the words went. */
export async function handsFreeAutoStop(reason: StopReason): Promise<void> {
  const take = release()
  if (!take) return
  resetHandsFreeGestures()
  setOverlayLocked(false)
  log(`auto-stop reason=${reason} ms=${Date.now() - take.startedAt}`)
  const outcome = await dictationStop(take.kind, { save: reason })
  // A take with no speech in it says nothing: the pill already did.
  if (outcome === 'delivered') notify(stopNotice(reason, take.kind))
  else if (outcome === 'retry') notify(retryNotice(reason))
}

/** No time or network to transcribe (sleep, shutdown, quit): the audio
 *  goes on the Retry list, untranscribed, and a notification says so.
 *  Gives up waiting after PARK_GIVE_UP_MS; a park that still lands
 *  later (timers pause across a sleep) says so then, once. */
export async function handsFreePark(reason: ParkReason): Promise<void> {
  const take = release()
  if (!take) return
  parking = true
  try {
    resetHandsFreeGestures()
    setOverlayLocked(false)
    let giveUp: NodeJS.Timeout | undefined
    const park = dictationPark(reason).catch(() => false)
    const onTime = await Promise.race([
      park.then((saved) => ({ saved })),
      new Promise<null>((resolve) => {
        giveUp = setTimeout(() => resolve(null), parkGiveUpMs)
      })
    ])
    clearTimeout(giveUp)
    log(`park reason=${reason} ms=${Date.now() - take.startedAt} saved=${onTime?.saved ?? false}`)
    if (onTime?.saved) notify(parkNotice(reason))
    if (!onTime) {
      // Only this path can still notify, so a take never gets 2 notices.
      void park.then((saved) => {
        if (!saved) return
        log(`park reason=${reason} saved=true late=true`)
        notify(parkNotice(reason))
      })
    }
  } finally {
    parking = false
    if (quitAfterPark) {
      quitAfterPark = false
      app.quit()
    }
  }
}

/**
 * For murmur's quit (and a shutdown): true when the quit must wait,
 * because a locked take is parked first. The park quits again when it
 * is done or gives up, so murmur always quits. An update installs only
 * on quit, so it never installs over a locked take either.
 */
export function deferQuitForPark(): boolean {
  if (!locked && !parking) return false
  quitAfterPark = true
  if (locked) void handsFreePark('quit')
  return true
}

export function isHandsFreeLocked(): boolean {
  return locked !== null
}

export function isParking(): boolean {
  return parking
}

/** The newest hands-free notice, for the smoke run. */
export function lastHandsFreeNotice(): { title: string; body: string } | null {
  return lastNotice
}

/** Smoke shortens the limit, the silence window, and the park's
 *  give-up; {} restores all three. No-op outside smoke. */
export function setHandsFreeTimesForSmoke(t: {
  limitMs?: number
  silenceWindowMs?: number
  parkGiveUpMs?: number
}): void {
  if (!isSmoke) return
  limitMs = t.limitMs ?? TAKE_LIMIT_MS
  silenceWindowMs = t.silenceWindowMs ?? SILENCE_WINDOW_MS
  parkGiveUpMs = t.parkGiveUpMs ?? PARK_GIVE_UP_MS
}

export function initHandsFree(): void {
  // The capture window holds a locked take's audio, so it outlives the
  // first quit long enough for the park.
  setKeepAudioOnQuit(() => isHandsFreeLocked() || isParking())
  powerMonitor.on('lock-screen', onLockScreen)
  powerMonitor.on('suspend', () => {
    void handsFreePark('sleep')
  })
  // macOS: a shutdown can be held back just long enough to park.
  powerMonitor.on('shutdown', (event?: Electron.Event) => {
    if (deferQuitForPark()) event?.preventDefault()
  })
  // Windows sends no quit on a shutdown, and the end of a session cannot
  // be held back: start the park and hope it lands. Best effort.
  onAudioSessionEnd(() => {
    deferQuitForPark()
  })
}
