// SPDX-License-Identifier: GPL-3.0-only
// Notes reminders (US-052): at times the user picks, read the tasks
// file as it stands right now and say how many items are still open.
// Read-only and honest: a file that is not there fires nothing and
// says why in the log, and a ticked checkbox is the only thing that
// closes an item. Counts reach the log, never task text.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Notification, app, ipcMain, shell } from 'electron'
import { IpcChannels } from '../../shared/ipc'
import { DEFAULT_TASKS_TEMPLATE } from '../../shared/notes'
import { alreadyPast, dueReminders, markFired, openItems, parseTodo, reminderBody } from '../../shared/todo'
import { getSettings, onSettingsChanged, updateSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { writeAppLog } from '../window-watch'
import { notesBases, notesFolder, resolveTemplateOrDefault } from './files'

let stateFile = ''

function readFired(): Record<string, string> {
  try {
    if (existsSync(stateFile)) {
      const parsed: unknown = JSON.parse(readFileSync(stateFile, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, string> = {}
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'string') out[key] = value
        }
        return out
      }
    }
  } catch {
    // A corrupt state file costs one repeated reminder at worst.
  }
  return {}
}

function writeFired(fired: Record<string, string>): void {
  try {
    writeFileSync(stateFile, JSON.stringify(fired))
  } catch {
    // Never let bookkeeping break a reminder.
  }
}

export interface TasksLookup {
  file: string | null
  relative: string
  /** The notes folder is set but not there right now: an unplugged
   *  drive reads differently from a file never written. */
  folderMissing: boolean
}

/** Today's tasks file where it actually is: the notes folder first,
 *  then the copy a redirect left in the data folder. */
export function findTasksFile(when: Date = new Date()): TasksLookup {
  const target = resolveTemplateOrDefault(
    getSettings().notes.tasksTemplate,
    DEFAULT_TASKS_TEMPLATE,
    when,
    'tasks'
  )
  const folder = notesFolder()
  let folderMissing = false
  if (folder !== '') {
    try {
      folderMissing = !statSync(folder).isDirectory()
    } catch {
      folderMissing = true
    }
  }
  for (const base of notesBases()) {
    const file = join(base, ...target.segments)
    if (existsSync(file)) return { file, relative: target.relative, folderMissing }
  }
  return { file: null, relative: target.relative, folderMissing }
}

export type ReminderOutcome = 'shown' | 'empty' | 'missing' | 'suppressed'

export interface ReminderResult {
  outcome: ReminderOutcome
  body: string
  open: number
}

/** Build and show one reminder. Returns what happened so the settings
 *  Test button and the smoke check can read it without a notification. */
export function runReminder(options: { show?: boolean; due?: string } = {}): ReminderResult {
  const due = options.due ?? 'test'
  const say = (line: string): void => writeAppLog(`[reminder] due=${due} ${line}`)
  const { file, relative, folderMissing } = findTasksFile()
  if (!file) {
    say(`outcome=missing reason=${folderMissing ? 'folder-unreachable' : 'no-file'} path=${relative}`)
    return { outcome: 'missing', body: '', open: 0 }
  }
  let items: ReturnType<typeof parseTodo>
  try {
    items = parseTodo(readFileSync(file, 'utf8'))
  } catch (error) {
    const code = (error as { code?: unknown })?.code
    say(`outcome=missing reason=${typeof code === 'string' ? code : 'unreadable'} path=${relative}`)
    return { outcome: 'missing', body: '', open: 0 }
  }
  const open = openItems(items).length
  const body = reminderBody(items)
  if (body === '') {
    say('outcome=empty')
    return { outcome: 'empty', body: '', open: 0 }
  }
  if (options.show === false || isSmoke) return { outcome: 'shown', body, open }
  // An OS that cannot show notifications must not be logged as if it
  // did: that line is the one a silent reminder gets debugged from.
  if (!Notification.isSupported()) {
    say(`outcome=suppressed reason=unsupported open=${open}`)
    return { outcome: 'suppressed', body, open }
  }
  const notification = new Notification({ title: 'murmur tasks', body })
  // Clicking opens the list itself, which is where the work is.
  notification.on('click', () => {
    void shell.openPath(file)
  })
  notification.show()
  say(`outcome=shown open=${open}`)
  return { outcome: 'shown', body, open }
}

function tick(): void {
  try {
    const notes = getSettings().notes
    // A cleared notes folder means note mode is dormant; reminders go
    // quiet with it rather than reading a stale data-folder copy.
    if (!notes.reminders.enabled || notesFolder() === '') return
    const now = Date.now()
    const fired = readFired()
    const due = dueReminders(now, notes.reminders.times, fired)
    if (due.length === 0) return
    // Everything missed is settled at once and ONE reminder is shown:
    // a machine that was off all day owes the user a readout, not a
    // pile of notifications a minute apart. Recorded before showing,
    // so a reminder that cannot be shown does not retry all day.
    writeFired(markFired(now, due.map((d) => d.index), fired))
    const latest = due[due.length - 1]
    if (due.length > 1) {
      writeAppLog(`[reminder] settling ${due.length} missed times, showing the last`)
    }
    runReminder({ due: latest.time })
  } catch (error) {
    // A reminder must never be able to take the app down; the tick
    // runs every minute, so a throw here would relaunch it forever.
    writeAppLog(`[reminder] tick failed reason=${error instanceof Error ? error.name : 'unknown'}`)
  }
}

export function initReminders(): void {
  stateFile = join(app.getPath('userData'), 'notes-reminders.json')

  // Switching reminders on records every time already past today, so
  // turning the feature on after lunch does not deliver the morning
  // and midday reminders on the spot (review gate 2026-09-21).
  let wasEnabled = getSettings().notes.reminders.enabled
  onSettingsChanged((settings) => {
    const enabled = settings.notes.reminders.enabled
    if (enabled && !wasEnabled) {
      const now = Date.now()
      writeFired(markFired(now, alreadyPast(now, settings.notes.reminders.times), readFired()))
    }
    wasEnabled = enabled
  })

  const timer = setInterval(tick, 60_000)
  timer.unref()
  app.on('before-quit', () => clearInterval(timer))

  // The Test button reads the real file and shows the real reminder
  // without consuming any of today's scheduled ones.
  ipcMain.handle(IpcChannels.notesTestReminder, () => runReminder())

  registerSmokeCheck('notesReminder', () => {
    // The read path end to end against a real file: open items counted
    // with their ticks honored, a file with nothing open staying quiet,
    // and a missing file firing nothing. No notification in smoke.
    const before = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-vault-reminder')
    const tasks = join(vault, 'murmur', 'todo.md')
    try {
      updateSettings({ notes: { folder: vault, tasksTemplate: DEFAULT_TASKS_TEMPLATE } })
      // A notes folder that is not there at all reads as unreachable,
      // not as a file the user has yet to make.
      const unreachable = runReminder({ show: false, due: '08:30' })

      mkdirSync(vault, { recursive: true })
      const missing = runReminder({ show: false, due: '08:30' })

      mkdirSync(join(vault, 'murmur'), { recursive: true })
      writeFileSync(
        tasks,
        '## 2026-09-18\n- [ ] Call the dentist. ([10:32](inbox/2026-09-18.md))\n- [x] Book the flight. ([10:32](inbox/2026-09-18.md))\n'
      )
      const shown = runReminder({ show: false, due: '08:30' })

      // Windows line endings must read the same as any other file.
      writeFileSync(tasks, '## 2026-09-18\r\n- [ ] Call the dentist.\r\n- [x] Book the flight.\r\n')
      const windows = runReminder({ show: false, due: '08:30' })

      writeFileSync(tasks, '## 2026-09-18\n- [x] Call the dentist.\n')
      const empty = runReminder({ show: false, due: '08:30' })

      const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
      return (
        unreachable.outcome === 'missing' &&
        missing.outcome === 'missing' &&
        shown.outcome === 'shown' &&
        shown.open === 1 &&
        shown.body === '1 open task: Call the dentist.' &&
        windows.outcome === 'shown' &&
        windows.open === 1 &&
        empty.outcome === 'empty' &&
        log.includes('[reminder] due=08:30 outcome=missing reason=folder-unreachable path=murmur/todo.md') &&
        log.includes('[reminder] due=08:30 outcome=missing reason=no-file path=murmur/todo.md') &&
        log.includes('[reminder] due=08:30 outcome=empty')
      )
    } finally {
      updateSettings({ notes: before })
    }
  })
}
