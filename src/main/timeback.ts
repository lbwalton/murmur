// SPDX-License-Identifier: GPL-3.0-only
// Time back arrivals (US-060): the 30-minute nod after a take that
// crosses a mark, and the tray tooltip carrying today's number. The
// number itself is shared/timeback over the history log; this module
// only remembers which marks were celebrated today and hands them to
// the OS. Never shows UI in smoke.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Notification, app } from 'electron'
import { type SessionEvent, countsTowardStats, dayKey } from '../shared/history'
import {
  crossedMilestone,
  dayMinutesBack,
  milestoneBody,
  milestoneToAnnounce,
  minutesBack,
  shownMinutes,
  trayTooltip
} from '../shared/timeback'
import { readStatsHistory } from './history'
import { getSettings, onSettingsChanged } from './settings'
import { isSmoke, registerSmokeCheck } from './smoke'
import { getTray } from './tray'
import { writeAppLog } from './window-watch'

interface MilestoneState {
  day: string
  shown: number[]
}

let stateFile = ''
let onOpenWrapup: (() => void) | null = null
let tooltipDay = ''

/** The marks already celebrated on the given day; any other day, or a
 *  corrupt file, starts clean (a mark could repeat once at worst). */
function readState(file: string, day: string): MilestoneState {
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<MilestoneState> | null
      if (parsed && parsed.day === day && Array.isArray(parsed.shown)) {
        return { day, shown: parsed.shown.filter((m): m is number => typeof m === 'number') }
      }
    }
  } catch {
    // Corrupt state file: see above.
  }
  return { day, shown: [] }
}

/** Record a celebrated mark. Bookkeeping must never undo a nod already
 *  handed to the OS: a mark that cannot be written can repeat once
 *  today at worst, and the log says why. */
function remember(file: string, state: MilestoneState, mark: number): void {
  try {
    writeFileSync(file, JSON.stringify({ day: state.day, shown: [...state.shown, mark] }))
  } catch (error) {
    writeAppLog(
      `[timeback] milestone state write failed reason=${error instanceof Error ? error.name : 'unknown'}`
    )
  }
}

export type MilestoneOutcome = 'none' | 'repeat' | 'off' | 'shown' | 'suppressed'

/**
 * Decide the nod for a take that moved today's total from before to
 * after, and show it unless show is false or this is smoke. A mark is
 * recorded only when it was handed to the OS (or deliberately not
 * displayed), so an OS that cannot show notifications leaves it for a
 * day that can, and the switch off records nothing.
 */
export function celebrateMilestone(input: {
  before: number
  after: number
  now?: number
  show?: boolean
  file?: string
  enabled?: boolean
}): { outcome: MilestoneOutcome; mark: number | null } {
  const now = input.now ?? Date.now()
  const day = dayKey(now)
  const file = input.file ?? stateFile
  const enabled = input.enabled ?? getSettings().timeBack.milestones
  const crossed = crossedMilestone(input.before, input.after)
  if (crossed === null) return { outcome: 'none', mark: null }
  const state = readState(file, day)
  const mark = milestoneToAnnounce(input.before, input.after, state.shown)
  const say = (outcome: MilestoneOutcome, extra = ''): void => {
    writeAppLog(`[timeback] milestone mark=${crossed} outcome=${outcome}${extra}`)
  }
  if (mark === null) {
    say('repeat')
    return { outcome: 'repeat', mark: crossed }
  }
  if (!enabled) {
    say('off')
    return { outcome: 'off', mark }
  }
  if (input.show === false || isSmoke) {
    remember(file, state, mark)
    say('shown', ' displayed=no')
    return { outcome: 'shown', mark }
  }
  // An OS that cannot show notifications must not be logged as if it
  // did, and must not consume the mark.
  if (!Notification.isSupported()) {
    say('suppressed', ' reason=unsupported')
    return { outcome: 'suppressed', mark }
  }
  const notification = new Notification({ title: 'time back', body: milestoneBody(mark) })
  notification.on('click', () => onOpenWrapup?.())
  notification.show()
  remember(file, state, mark)
  say('shown')
  return { outcome: 'shown', mark }
}

/** Paint the tooltip for a raw total, read the way the card reads it. */
function applyTooltip(raw: number): void {
  const tray = getTray()
  if (!tray) return
  tray.setToolTip(trayTooltip(shownMinutes(raw)))
  tooltipDay = dayKey(Date.now())
}

/** Restate the tray tooltip from the log at the current typing speed. */
export function refreshTrayTooltip(): void {
  if (!getTray()) return
  const today = dayKey(Date.now())
  applyTooltip(dayMinutesBack(readStatsHistory(), today, getSettings().timeBack.typingWpm))
}

/** A take just landed in the log: the tooltip restates from the one
 *  read of the log, then the take's own movement of today's total is
 *  checked for a mark. Decided on the minutes the card shows, so the
 *  nod lands on the take where the card first reads the mark. */
export function sessionLanded(event: SessionEvent): void {
  // A transform moves no speech total, so it has nothing to announce.
  if (!countsTowardStats(event)) return
  const typingWpm = getSettings().timeBack.typingWpm
  const today = dayKey(Date.now())
  const after = dayMinutesBack(readStatsHistory(), today, typingWpm)
  const before = after - minutesBack(event.words, event.durationMs, typingWpm)
  applyTooltip(after)
  celebrateMilestone({ before: shownMinutes(before), after: shownMinutes(after) })
}

export function initTimeBack(handlers: { openWrapup: () => void }): void {
  onOpenWrapup = handlers.openWrapup
  stateFile = join(app.getPath('userData'), 'timeback-milestones.json')

  refreshTrayTooltip()
  // A speed edit restates the number; midnight turns it back to plain
  // murmur until the first take of the new day.
  let lastWpm = getSettings().timeBack.typingWpm
  onSettingsChanged((settings) => {
    if (settings.timeBack.typingWpm === lastWpm) return
    lastWpm = settings.timeBack.typingWpm
    refreshTrayTooltip()
  })
  const timer = setInterval(() => {
    if (dayKey(Date.now()) !== tooltipDay) refreshTrayTooltip()
  }, 60_000)
  timer.unref()
  app.on('before-quit', () => clearInterval(timer))

  registerSmokeCheck('timeBackMilestone', () => {
    // The state round trip on a scratch file, no notifications: a mark
    // crossed is recorded once; the same crossing again, or the total
    // falling under and back over it, shows nothing; a higher mark past
    // one already shown still shows; the switch off shows nothing and
    // records nothing; a new day starts clean; a state file that cannot
    // be written never takes the nod down with it.
    const file = join(app.getPath('userData'), 'smoke-timeback-milestones.json')
    const now = Date.now()
    const day = 86_400_000
    try {
      const on = { now, show: false, file, enabled: true }
      const first = celebrateMilestone({ before: 28, after: 31, ...on })
      const again = celebrateMilestone({ before: 28, after: 31, ...on })
      const fellRose = celebrateMilestone({ before: 25, after: 40, ...on })
      const higher = celebrateMilestone({ before: 55, after: 62, ...on })
      const nothing = celebrateMilestone({ before: 62, after: 70, ...on })
      const stored = JSON.parse(readFileSync(file, 'utf8')) as MilestoneState
      const off = celebrateMilestone({ before: 85, after: 91, ...on, enabled: false })
      const storedAfterOff = JSON.parse(readFileSync(file, 'utf8')) as MilestoneState
      const tomorrow = celebrateMilestone({ before: 28, after: 31, ...on, now: now + day })
      const unwritable = celebrateMilestone({
        before: 28,
        after: 31,
        ...on,
        now: now + 2 * day,
        file: join(app.getPath('userData'), 'no-such-dir', 'milestones.json')
      })
      refreshTrayTooltip()
      return (
        first.outcome === 'shown' &&
        first.mark === 30 &&
        again.outcome === 'repeat' &&
        fellRose.outcome === 'repeat' &&
        higher.outcome === 'shown' &&
        higher.mark === 60 &&
        nothing.outcome === 'none' &&
        stored.day === dayKey(now) &&
        stored.shown.join(',') === '30,60' &&
        off.outcome === 'off' &&
        storedAfterOff.shown.join(',') === '30,60' &&
        tomorrow.outcome === 'shown' &&
        tomorrow.mark === 30 &&
        unwritable.outcome === 'shown'
      )
    } finally {
      rmSync(file, { force: true })
    }
  })
}
