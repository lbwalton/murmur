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
import { Notification, app, clipboard, powerMonitor, powerSaveBlocker } from 'electron'
import { UiohookKey } from 'uiohook-napi'
import type { FormatSpec } from '../shared/formatter'
import { onAudioSessionEnd, playCue, setKeepAudioOnQuit, stallCaptureForSmoke } from './audio'
import { dictationCancelTake, dictationDiscard, dictationPark, dictationStop, liveSessionKind } from './dictation'
import {
  LOCK_SCREEN_WAIT_MS,
  type ParkReason,
  SILENCE_WINDOW_MS,
  SilenceWatch,
  type StopReason,
  TAKE_LIMIT_MS,
  failedNotice,
  parkNotice,
  retryNotice,
  stopNotice
} from './handsfree-rules'
import { resetHandsFreeGestures, smokeHotkeyEvent } from './hotkeys'
import type { KeyEventLike } from './hotkeys/binding'
import { LOCK_GUARD_MS, SECOND_TAP_MS } from './hotkeys/machines'
import { getOverlayPhase, getOverlayState, setAudioLevelListener, setOverlayLocked, setOverlayPhase } from './overlay'
import { isSmoke, registerSmokeCheck } from './smoke'
import { setTrayHandsFree, trayMenuLabels } from './tray'
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
// How many notices were raised; the smoke run counts them.
let noticeCount = 0

function log(line: string): void {
  try {
    writeAppLog(`[hands-free] ${line}`)
  } catch {
    // Diagnostics stay best-effort.
  }
}

function notify(notice: { title: string; body: string }): void {
  lastNotice = notice
  noticeCount += 1
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
  // Stamped now, so the log shows how long a lid close takes to sleep.
  log(`screen-lock wait=${LOCK_SCREEN_WAIT_MS}`)
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
  // A take with no speech in it says nothing: the pill already did. A
  // lost take says so, since nobody was watching the pill.
  if (outcome === 'delivered') notify(stopNotice(reason, take.kind))
  else if (outcome === 'retry') notify(retryNotice(reason))
  else if (outcome === 'failed') notify(failedNotice(reason))
}

/** No time or network to transcribe (sleep, shutdown, quit): the audio
 *  goes on the Retry list, untranscribed, and a notification says so.
 *  Gives up waiting after PARK_GIVE_UP_MS; a park that still lands
 *  later (timers pause across a sleep) says so then, once. */
export async function handsFreePark(reason: ParkReason): Promise<void> {
  const take = release()
  if (!take) return
  // Stamped as the sleep or quit arrives; the park's own line follows
  // once the audio is saved, which a sleep can delay past the wake.
  log(`parking reason=${reason}`)
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
  registerHandsFreeSmoke()
}

/**
 * The handsFree smoke check: locked takes end to end through the real
 * hotkey dispatch, fed synthetic presses of Ctrl+Space on the smoke
 * run's own profile, with short real sleeps and the limit and the park
 * give-up shortened. The screen lock and the sleep are emitted on
 * powerMonitor, so initHandsFree's own wiring answers them. Each case
 * reads only the log lines written since it began. Every setting, time,
 * Retry entry, and the clipboard are put back afterwards.
 */
function registerHandsFreeSmoke(): void {
  registerSmokeCheck('handsFree', async () => {
    if (!isSmoke) return false
    const { existsSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { getSettings, updateSettings } = await import('./settings')
    const { readHistory } = await import('./history')
    const { SMOKE_TRANSCRIPT, recoveryDir } = await import('./transcribe')
    const { listRecovery, removeRecovery } = await import('./transcribe/recovery')
    const { formatTranscript } = await import('../shared/formatter')
    const formatSpec = (await import('../../shared/format-spec.json')).default

    const key = (keycode: number, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
      keycode,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      ...mods
    })
    const SPACE = key(UiohookKey.Space, { ctrlKey: true })
    const NOTE = key(UiohookKey.F18, { ctrlKey: true, shiftKey: true })
    const ESCAPE = key(UiohookKey.Escape)
    const CTRL_ESCAPE = key(UiohookKey.Escape, { ctrlKey: true })
    const down = (ev: KeyEventLike): void => smokeHotkeyEvent('keydown', ev)
    const up = (ev: KeyEventLike): void => smokeHotkeyEvent('keyup', ev)
    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
    const until = async (ready: () => boolean, ms = 3_000): Promise<boolean> => {
      const deadline = Date.now() + ms
      while (!ready()) {
        if (Date.now() >= deadline) return false
        await wait(20)
      }
      return true
    }
    const settled = (): boolean => getOverlayPhase() !== 'recording' && getOverlayPhase() !== 'processing'
    const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
    const readLog = (): string => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '')
    let mark = 0
    const lines = (): string => {
      const all = readLog()
      // A rotation mid-case leaves a shorter file: read all of it.
      return all.length >= mark ? all.slice(mark) : all
    }
    const has = (needle: string): boolean => lines().includes(needle)
    const inOrder = (first: string, second: string): boolean => {
      const seen = lines()
      const at = seen.indexOf(first)
      return at >= 0 && seen.indexOf(second, at) > at
    }
    // A clean start: nothing locked, the last take finished, a fresh log mark.
    const begin = async (): Promise<void> => {
      if (isHandsFreeLocked()) handsFreeCancel()
      await until(settled)
      mark = readLog().length
    }
    const dir = recoveryDir()
    const parkedBefore = new Set(listRecovery(dir).map((take) => take.id))
    const parked = (): number => listRecovery(dir).filter((take) => !parkedBefore.has(take.id)).length
    const expected = formatTranscript(SMOKE_TRANSCRIPT, getSettings().formatting, formatSpec as unknown as FormatSpec)
    const heldAwake = (hold: number | null): boolean => hold !== null && powerSaveBlocker.isStarted(hold)

    /** Down, 60 ms, up, 120 ms, down: the second press locks the take.
     *  Returns when it locked and the display's wake hold, or null when
     *  the take did not lock. The locking press's own release follows. */
    const lockTake = async (): Promise<{ at: number; hold: number | null } | null> => {
      down(SPACE)
      await wait(60)
      up(SPACE)
      await wait(120)
      down(SPACE)
      const at = Date.now()
      const isLocked = isHandsFreeLocked() && getOverlayState().locked
      const hold = locked?.displayBlocker ?? null
      await wait(30)
      up(SPACE)
      return isLocked ? { at, hold } : null
    }

    const hotkeyBefore = { ...getSettings().hotkey }
    const noteBindingBefore = getSettings().notes.binding
    const clipboardBefore = await clipboard.readText()
    const ok: Record<string, boolean> = {}
    const seen: Record<string, unknown> = {}
    try {
      updateSettings({
        hotkey: { mode: 'hold', doubleTap: true, binding: 'Ctrl+Space' },
        notes: { binding: 'Ctrl+Shift+F18' }
      })

      // (a) Two quick taps lock the take; one press after the guard stops
      // it and the words go through the normal pipeline (copy in smoke).
      // (j) The display stays awake while locked and is let go after.
      await begin()
      await clipboard.writeText('')
      const a = await lockTake()
      await wait((a?.at ?? 0) + LOCK_GUARD_MS + 100 - Date.now())
      const aHeld = heldAwake(a?.hold ?? null)
      down(SPACE)
      const aStopped = !isHandsFreeLocked()
      await until(settled)
      up(SPACE)
      const aClip = await clipboard.readText()
      ok.a =
        a !== null &&
        aStopped &&
        getOverlayPhase() === 'inserted' &&
        aClip === expected &&
        inOrder('[hands-free] lock', '[hands-free] stop')
      ok.j = aHeld && !heldAwake(a?.hold ?? null)
      seen.a = { locked: a !== null, aStopped, phase: getOverlayPhase(), clip: aClip === expected, aHeld }

      // (b) A lone tap is thrown away quietly: the take records on after
      // the tap, then goes with no upload and no history entry.
      await begin()
      const bHistory = readHistory().length
      down(SPACE)
      await wait(60)
      up(SPACE)
      const bStillRecording = getOverlayPhase() === 'recording'
      const bDiscarded = await until(() => has('[hands-free] discard'), SECOND_TAP_MS + 1_000)
      ok.b =
        bStillRecording &&
        bDiscarded &&
        getOverlayPhase() === 'idle' &&
        readHistory().length === bHistory &&
        !has('[dictation]')
      seen.b = { bStillRecording, bDiscarded, phase: getOverlayPhase(), history: readHistory().length - bHistory }

      // (c) The limit stops a locked take and saves it without a paste.
      setHandsFreeTimesForSmoke({ limitMs: 1_500 })
      await begin()
      await clipboard.writeText('')
      const c = await lockTake()
      const cStopped = await until(() => has('[hands-free] auto-stop reason=limit'), 3_000)
      const cSaved = await until(() => has('[dictation] delivered outcome=saved reason=limit'), 3_000)
      setHandsFreeTimesForSmoke({})
      const cClip = await clipboard.readText()
      ok.c =
        c !== null &&
        cStopped &&
        cSaved &&
        !has('outcome=copied') &&
        cClip === expected &&
        lastNotice?.body === stopNotice('limit', 'dictation').body
      ok.j &&= !heldAwake(c?.hold ?? null)
      seen.c = { locked: c !== null, cStopped, cSaved, clip: cClip === expected, notice: lastNotice?.body }

      // (d) Escape throws a locked take away: the pill scrapes, nothing
      // is uploaded or kept. Ctrl+Escape first (Start on Windows) is a
      // system shortcut, not a cancel: the take stays locked.
      await begin()
      const dHistory = readHistory().length
      const d = await lockTake()
      down(CTRL_ESCAPE)
      up(CTRL_ESCAPE)
      const dKeptOnCtrl = isHandsFreeLocked() && getOverlayState().locked && !has('[hands-free] cancel')
      down(ESCAPE)
      const dPhase = getOverlayPhase()
      up(ESCAPE)
      ok.d =
        d !== null &&
        dKeptOnCtrl &&
        dPhase === 'cancelled' &&
        !isHandsFreeLocked() &&
        has('[hands-free] cancel') &&
        !has('[dictation]') &&
        readHistory().length === dHistory
      ok.j &&= !heldAwake(d?.hold ?? null)
      seen.d = { locked: d !== null, dKeptOnCtrl, dPhase }

      // (e) With Double-tap for hands-free off, two quick taps are 2
      // short holds: each release ends its take, and nothing locks.
      updateSettings({ hotkey: { doubleTap: false } })
      await begin()
      down(SPACE)
      await wait(60)
      up(SPACE)
      const eFirstUp = Date.now()
      const eFirstEnded = getOverlayPhase() !== 'recording'
      await until(settled)
      await wait(eFirstUp + 120 - Date.now())
      down(SPACE)
      const eGap = Date.now() - eFirstUp
      const eSecondStarted = getOverlayPhase() === 'recording'
      const eUnlocked = !isHandsFreeLocked() && !getOverlayState().locked
      await wait(60)
      up(SPACE)
      const eSecondEnded = getOverlayPhase() !== 'recording'
      await until(settled)
      updateSettings({ hotkey: { doubleTap: true } })
      ok.e =
        eFirstEnded &&
        eSecondStarted &&
        eUnlocked &&
        eSecondEnded &&
        !has('[hands-free] lock') &&
        !has('[hands-free] discard')
      seen.e = { eFirstEnded, eSecondStarted, eUnlocked, eSecondEnded, eGap }

      // (f) A settings change while locked saves the take, and the tray
      // items that showed while it was locked go away.
      await begin()
      await clipboard.writeText('')
      const f = await lockTake()
      const fTray = trayMenuLabels()
      updateSettings({ hotkey: { binding: 'Ctrl+Shift+F19' } })
      const fStopped = await until(() => has('[hands-free] auto-stop reason=changed'), 1_000)
      const fSaved = await until(() => has('[dictation] delivered outcome=saved reason=changed'), 3_000)
      const fTrayAfter = trayMenuLabels()
      updateSettings({ hotkey: { binding: 'Ctrl+Space' } })
      const fClip = await clipboard.readText()
      ok.f =
        f !== null &&
        fTray.includes('Stop hands-free') &&
        fTray.includes('Discard') &&
        fStopped &&
        fSaved &&
        !fTrayAfter.includes('Stop hands-free') &&
        !fTrayAfter.includes('Discard') &&
        fClip === expected &&
        lastNotice?.body === stopNotice('changed', 'dictation').body
      seen.f = { locked: f !== null, fTray, fStopped, fSaved, fTrayAfter, clip: fClip === expected }

      // (g) Timers after the take ended do nothing: a tap stops the take
      // at about 700 ms, and the 1,500 ms limit that follows is a no-op.
      setHandsFreeTimesForSmoke({ limitMs: 1_500 })
      await begin()
      const gFirst = Date.now()
      const g = await lockTake()
      await wait(Math.max(gFirst + 700, (g?.at ?? 0) + LOCK_GUARD_MS + 50) - Date.now())
      down(SPACE)
      const gStopAt = Date.now()
      const gStopped = !isHandsFreeLocked()
      await until(settled)
      up(SPACE)
      await wait(gStopAt + 1_500 - Date.now())
      setHandsFreeTimesForSmoke({})
      ok.g = g !== null && gStopped && has('[hands-free] stop') && !has('auto-stop')
      seen.g = { locked: g !== null, gStopped, stopAfterMs: gStopAt - gFirst }

      // (h) The other chord during a locked take changes nothing, even
      // tapped twice after the guard; Escape then cancels the take.
      await begin()
      const h = await lockTake()
      await wait((h?.at ?? 0) + LOCK_GUARD_MS + 100 - Date.now())
      down(NOTE)
      await wait(60)
      up(NOTE)
      await wait(120)
      down(NOTE)
      await wait(30)
      up(NOTE)
      const hStillLocked =
        isHandsFreeLocked() &&
        getOverlayState().locked &&
        getOverlayState().mode === 'dictation' &&
        liveSessionKind() === 'dictation'
      down(ESCAPE)
      up(ESCAPE)
      ok.h =
        h !== null &&
        hStillLocked &&
        !has('lock kind=note') &&
        !has('[hands-free] stop') &&
        has('[hands-free] cancel') &&
        getOverlayPhase() === 'cancelled'
      seen.h = { locked: h !== null, hStillLocked, phase: getOverlayPhase() }

      // (i) Escape outside a locked take is ignored.
      await begin()
      down(ESCAPE)
      up(ESCAPE)
      const iCancelled = handsFreeCancel()
      ok.i = !iCancelled && !has('[hands-free]')
      seen.i = { iCancelled }

      // (k) A lid close: the screen locks, then the computer sleeps inside
      // the wait, so the take parks for Retry and never auto-stops.
      await begin()
      const kParked = parked()
      const k = await lockTake()
      await wait(300)
      powerMonitor.emit('lock-screen')
      const kScreenAt = Date.now()
      await wait(300)
      const kHeldThroughWait = isHandsFreeLocked()
      powerMonitor.emit('suspend')
      const kParkLogged = await until(() => has('[hands-free] park reason=sleep'), 3_000)
      // Past the screen lock's own wait: its timer went with the take.
      await wait(kScreenAt + LOCK_SCREEN_WAIT_MS + 200 - Date.now())
      const kSleep =
        k !== null &&
        kHeldThroughWait &&
        kParkLogged &&
        // Both stamped as they arrive, for the live lid-close timing.
        inOrder('[hands-free] screen-lock', '[hands-free] parking reason=sleep') &&
        has('saved=true') &&
        !has('auto-stop') &&
        parked() === kParked + 1 &&
        getOverlayPhase() === 'idle' &&
        lastNotice?.body === parkNotice('sleep').body
      ok.j &&= !heldAwake(k?.hold ?? null)
      // A screen lock alone stops the take after the wait and saves it.
      await begin()
      await clipboard.writeText('')
      const k2 = await lockTake()
      powerMonitor.emit('lock-screen')
      const k2ScreenAt = Date.now()
      await wait(LOCK_SCREEN_WAIT_MS / 2)
      const k2Waited = isHandsFreeLocked()
      const k2Stopped = await until(() => has('[hands-free] auto-stop reason=lock'), LOCK_SCREEN_WAIT_MS + 1_500)
      const k2After = Date.now() - k2ScreenAt
      const k2Saved = await until(() => has('[dictation] delivered outcome=saved reason=lock'), 3_000)
      const k2Clip = await clipboard.readText()
      const kLockAlone =
        k2 !== null &&
        k2Waited &&
        k2Stopped &&
        k2After >= LOCK_SCREEN_WAIT_MS - 50 &&
        k2Saved &&
        k2Clip === expected &&
        lastNotice?.body === stopNotice('lock', 'dictation').body
      ok.k = kSleep && kLockAlone
      seen.k = { kSleep, kHeldThroughWait, kParkLogged, k2Waited, k2Stopped, k2After, k2Saved }

      // (l) A park that gives up waiting but saves later says so then,
      // exactly once. The capture window is held busy, as a stuck one
      // would be, so the park really is late for the tiny give-up (a
      // quick window can answer before a 1 ms timer runs).
      setHandsFreeTimesForSmoke({ parkGiveUpMs: 1 })
      await begin()
      const lParked = parked()
      const l = await lockTake()
      await wait(300)
      const lNotices = noticeCount
      stallCaptureForSmoke(400)
      // The stall is under way before the park asks for the audio.
      await wait(50)
      await handsFreePark('sleep')
      const lGaveUp = has('saved=false') && noticeCount === lNotices
      const lLate = await until(() => has('saved=true late=true'), 3_000)
      await wait(150)
      setHandsFreeTimesForSmoke({})
      ok.l =
        l !== null &&
        lGaveUp &&
        lLate &&
        inOrder('saved=false', 'late=true') &&
        noticeCount === lNotices + 1 &&
        parked() === lParked + 1 &&
        lastNotice?.body === parkNotice('sleep').body
      seen.l = { locked: l !== null, lGaveUp, lLate, notices: noticeCount - lNotices }

      const passed = Object.values(ok).every(Boolean)
      if (!passed) console.error(`smoke handsFree: ${JSON.stringify({ ok, seen })}`)
      return passed
    } finally {
      if (isHandsFreeLocked()) handsFreeCancel()
      setHandsFreeTimesForSmoke({})
      await until(settled)
      updateSettings({ hotkey: hotkeyBefore, notes: { binding: noteBindingBefore } })
      for (const take of listRecovery(dir)) if (!parkedBefore.has(take.id)) removeRecovery(dir, take.id)
      await clipboard.writeText(clipboardBefore)
      setOverlayPhase('idle')
    }
  })
}
