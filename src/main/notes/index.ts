// SPDX-License-Identifier: GPL-3.0-only
// Brain dump destination: append a formatted dictation to a markdown
// file in the user's notes folder. An Obsidian vault is just a folder
// of markdown files, so writing here IS the integration; Obsidian need
// not be running. The iron law: the words land on disk before anything
// else happens, and when the folder cannot be reached they land in
// murmur's own data folder with a log line naming the redirect.
// Nothing here ever logs the text itself.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { IpcChannels } from '../../shared/ipc'
import { DEFAULT_NOTE_ENTRY_TEMPLATE, DEFAULT_NOTE_PATH_TEMPLATE, renderNoteEntry } from '../../shared/notes'
import { getApiKeyFor, getSettings, updateSettings } from '../settings'
import { registerSmokeCheck } from '../smoke'
import { writeAppLog } from '../window-watch'
import { appendEntry, errorCode, fallbackDir, notesBases, resolveTemplateOrDefault } from './files'
import { probeDecision } from './decide'
import { initReminders } from './reminders'
import { type SortReport, canSortAgain, getLastSort, initSorter, sortLastNote } from './sorter'

export type NoteLocation = 'folder' | 'fallback'

export interface NoteSaveResult {
  ok: boolean
  location: NoteLocation
  /** Path relative to wherever it landed; logs and status show this. */
  relative: string
  /** Absolute path of the file written (or attempted). */
  file: string
  /** The base folder it landed in (the notes folder or the data
   *  folder); the sorter files beside it. */
  base: string
  when: Date
}

export interface NotesStatus {
  configured: boolean
  folder: string
  folderExists: boolean
  fallbackDir: string
  lastSave: { at: number; location: NoteLocation; relative: string } | null
  /** The newest sort's outcome (US-051), or null before any sort. */
  lastSort: SortReport | null
  canSortAgain: boolean
}

let lastSave: NotesStatus['lastSave'] = null

/** A notes folder is set: the note chord may record. */
export function notesConfigured(): boolean {
  return getSettings().notes.folder.trim() !== ''
}

/** Today's inbox file, relative to the folder; a broken template
 *  falls back to the default layout with a log line. */
function resolveTarget(when: Date): { relative: string; segments: string[] } {
  return resolveTemplateOrDefault(getSettings().notes.pathTemplate, DEFAULT_NOTE_PATH_TEMPLATE, when, 'path')
}

/**
 * Save one note. The configured folder first, then murmur's own data
 * folder. Only a failure of BOTH returns ok false, and even then the
 * caller still holds the text (history keeps every note as well).
 */
export function saveNote(text: string, when: Date = new Date()): NoteSaveResult {
  const settings = getSettings().notes
  const target = resolveTarget(when)
  if (!settings.entryTemplate.includes('{text}')) {
    writeAppLog('[notes] entry template has no {text}; using the default entry')
  }
  const entry = renderNoteEntry(settings.entryTemplate, text, when)
  const bytes = Buffer.byteLength(entry, 'utf8')
  const folder = settings.folder.trim()
  if (folder !== '') {
    const file = join(folder, ...target.segments)
    try {
      // The notes folder itself must already exist; only subfolders
      // inside it are created. A renamed vault or an unplugged drive
      // must redirect, never be recreated as a ghost folder (an empty
      // directory left at a mount point also blocks the real drive).
      if (!statSync(folder).isDirectory()) {
        throw Object.assign(new Error('notes folder is not a directory'), { code: 'ENOTDIR' })
      }
      appendEntry(file, entry)
      lastSave = { at: Date.now(), location: 'folder', relative: target.relative }
      writeAppLog(`[notes] saved location=folder file=${target.relative} bytes=${bytes}`)
      return { ok: true, location: 'folder', relative: target.relative, file, base: folder, when }
    } catch (error) {
      writeAppLog(
        `[notes] notes folder unreachable reason=${errorCode(error)}; redirecting to the data folder`
      )
    }
  } else {
    writeAppLog('[notes] no notes folder set; saving to the data folder')
  }
  const file = join(fallbackDir(), ...target.segments)
  try {
    appendEntry(file, entry)
    lastSave = { at: Date.now(), location: 'fallback', relative: target.relative }
    writeAppLog(`[notes] saved location=fallback file=${target.relative} bytes=${bytes}`)
    return { ok: true, location: 'fallback', relative: target.relative, file, base: fallbackDir(), when }
  } catch (error) {
    writeAppLog(`[notes] fallback write failed reason=${errorCode(error)}`)
    return { ok: false, location: 'fallback', relative: target.relative, file, base: fallbackDir(), when }
  }
}

export function getNotesStatus(): NotesStatus {
  const folder = getSettings().notes.folder.trim()
  let folderExists = false
  try {
    folderExists = folder !== '' && statSync(folder).isDirectory()
  } catch {
    folderExists = false
  }
  return {
    configured: folder !== '',
    folder,
    folderExists,
    fallbackDir: fallbackDir(),
    lastSave,
    lastSort: getLastSort(),
    canSortAgain: canSortAgain()
  }
}

/** Open today's inbox in the OS default app for the file type: the
 *  copy in the notes folder, else the copy a redirect left in the data
 *  folder, else the folder itself when today has no note yet. */
export async function openTodayNote(): Promise<'file' | 'folder' | 'none'> {
  const folder = getSettings().notes.folder.trim()
  const target = resolveTarget(new Date())
  for (const base of notesBases()) {
    const file = join(base, ...target.segments)
    if (existsSync(file) && (await shell.openPath(file)) === '') return 'file'
  }
  const base = folder !== '' ? folder : fallbackDir()
  if (existsSync(base) && (await shell.openPath(base)) === '') return 'folder'
  return 'none'
}

export function initNotes(settingsWindow: () => BrowserWindow | null): void {
  // The native folder picker: the only way a path enters settings
  // besides typing one. createDirectory lets a fresh vault be made on
  // the spot; the picker cannot return a path the user did not choose.
  ipcMain.handle(IpcChannels.notesChooseFolder, async () => {
    const win = settingsWindow()
    if (!win || win.isDestroyed()) return getNotesStatus()
    const current = getSettings().notes.folder.trim()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose your notes folder',
      buttonLabel: 'Use this folder',
      defaultPath: current !== '' ? current : app.getPath('home'),
      properties: ['openDirectory', 'createDirectory']
    })
    const chosen = filePaths[0]
    if (!canceled && chosen) updateSettings({ notes: { folder: chosen } })
    return getNotesStatus()
  })
  ipcMain.handle(IpcChannels.notesStatus, () => getNotesStatus())
  ipcMain.handle(IpcChannels.notesOpenToday, () => openTodayNote())
  ipcMain.handle(IpcChannels.notesSortLast, async () => {
    await sortLastNote()
    return getNotesStatus()
  })
  // The connection test for a decision connection is shaped like the
  // endpoint it tests; a chat-shaped probe would call a good key bad.
  ipcMain.handle(IpcChannels.providerTestDecideFor, async (_event, baseUrl: unknown) => {
    if (typeof baseUrl !== 'string' || baseUrl === '') return { ok: false, detail: 'no base URL set' }
    return probeDecision(baseUrl, getApiKeyFor(baseUrl))
  })

  registerSmokeCheck('decisionProbe', async () => {
    const reply = (status: number, body = '{}'): typeof fetch =>
      (async () => new Response(body, { status })) as typeof fetch
    const url = 'https://mock-decide.local/v1'
    const good = await probeDecision(url, 'k', reply(200, JSON.stringify({ answers: { ok: { type: 'noul', noul: 0.99 } } })))
    const rejected = await probeDecision(url, 'k', reply(401))
    const limited = await probeDecision(url, 'k', reply(429))
    const noKey = await probeDecision(url, null)
    return (
      good.ok &&
      good.detail === 'connected' &&
      !rejected.ok &&
      rejected.detail === 'key rejected (http 401)' &&
      limited.ok &&
      !noKey.ok
    )
  })
  initSorter()
  initReminders()

  const probeMoment = new Date(2026, 8, 18, 10, 32)
  const defaults = { pathTemplate: DEFAULT_NOTE_PATH_TEMPLATE, entryTemplate: DEFAULT_NOTE_ENTRY_TEMPLATE }

  registerSmokeCheck('notesBridge', async () => {
    // The settings renderer reaches the notes handlers through its
    // preload literals: a renamed channel on either side fails here.
    for (let i = 0; i < 20; i++) {
      const win = settingsWindow()
      if (win && !win.isDestroyed()) {
        const ready = await win.webContents.executeJavaScript('typeof window.murmur === "object"')
        if (ready === true) {
          const raw = await win.webContents.executeJavaScript(
            'window.murmur.getNotesStatus().then((s) => JSON.stringify(s))'
          )
          const status = JSON.parse(raw) as NotesStatus
          return status.configured === false && status.fallbackDir.endsWith('notes')
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return false
  })

  registerSmokeCheck('notesWrite', () => {
    // Two notes append under their headings in a reachable folder,
    // then a path template that escapes the folder is refused and the
    // third note still lands, in the default layout, with a log line.
    const before = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-vault')
    try {
      // A real vault exists before anyone points murmur at it; only
      // the subfolders inside it are murmur's to create.
      mkdirSync(vault, { recursive: true })
      updateSettings({ notes: { folder: vault, ...defaults } })
      const first = saveNote('Notes smoke probe one.', probeMoment)
      const second = saveNote('Notes smoke probe two.', probeMoment)
      updateSettings({ notes: { pathTemplate: '../escape/{date}.md' } })
      const third = saveNote('Notes smoke probe three.', probeMoment)
      const file = join(vault, 'murmur', 'inbox', '2026-09-18.md')
      const content = existsSync(file) ? readFileSync(file, 'utf8') : ''
      const expected =
        '## 10:32\n\nNotes smoke probe one.\n\n' +
        '## 10:32\n\nNotes smoke probe two.\n\n' +
        '## 10:32\n\nNotes smoke probe three.\n\n'
      const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
      return (
        first.ok &&
        first.location === 'folder' &&
        first.base === vault &&
        second.ok &&
        third.ok &&
        third.location === 'folder' &&
        content === expected &&
        log.includes('[notes] path template failed reason=escapes') &&
        getNotesStatus().lastSave?.location === 'folder'
      )
    } finally {
      updateSettings({ notes: before })
    }
  })

  registerSmokeCheck('notesFallback', () => {
    // Two unreachable folders lose nothing: one that cannot exist (its
    // parent is a regular file) and one that simply is not there (a
    // renamed vault, an unplugged drive). Both notes land in the data
    // folder, the log names each redirect, and the missing folder is
    // never recreated as a ghost (live-found 2026-09-20).
    const before = getSettings().notes
    const blocker = join(app.getPath('userData'), 'smoke-blocker')
    const missing = join(app.getPath('userData'), 'smoke-missing-vault')
    try {
      writeFileSync(blocker, 'a regular file where a folder is expected\n')
      updateSettings({ notes: { folder: join(blocker, 'vault'), ...defaults } })
      const blocked = saveNote('Notes fallback probe.', probeMoment)
      updateSettings({ notes: { folder: missing } })
      const gone = saveNote('Notes missing probe.', probeMoment)
      const file = join(fallbackDir(), 'murmur', 'inbox', '2026-09-18.md')
      const content = existsSync(file) ? readFileSync(file, 'utf8') : ''
      const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
      return (
        blocked.ok &&
        blocked.location === 'fallback' &&
        gone.ok &&
        gone.location === 'fallback' &&
        content.includes('## 10:32\n\nNotes fallback probe.\n') &&
        content.includes('## 10:32\n\nNotes missing probe.\n') &&
        !existsSync(missing) &&
        log.includes('[notes] notes folder unreachable reason=ENOTDIR') &&
        log.includes('[notes] notes folder unreachable reason=ENOENT') &&
        log.includes('[notes] saved location=fallback file=murmur/inbox/2026-09-18.md') &&
        getNotesStatus().lastSave?.location === 'fallback'
      )
    } finally {
      updateSettings({ notes: before })
    }
  })
}
