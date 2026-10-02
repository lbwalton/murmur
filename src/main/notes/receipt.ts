// SPDX-License-Identifier: GPL-3.0-only
// The note receipt (US-082). The pill must stay click-through and never
// take focus, or it would pull the cursor out of the app being typed
// in, so the link to a saved note rides a system notification instead:
// it can be clicked without stealing focus, waits in Notification
// Center, and follows Do Not Disturb. Open last note in the tray menu
// and the last note row on Home are the same link for a missed one.
// Every open and reveal goes through openableNote, so nothing but a
// real .md or .txt file is ever handed to the OS. The note's words
// never reach the log.
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BrowserWindow, Notification, app, ipcMain, shell } from 'electron'
import {
  type LastNote,
  parseLastNote,
  receiptLine,
  receiptTarget,
  receiptTitle,
  revealLabel
} from '../../shared/receipt'
import { IpcChannels } from '../../shared/ipc'
import { DEFAULT_NOTE_ENTRY_TEMPLATE, DEFAULT_NOTE_PATH_TEMPLATE } from '../../shared/notes'
import { getSettings, updateSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { writeAppLog } from '../window-watch'
import { errorCode } from './files'
import { openableNote, replaceViaTemp } from './safe-fs'
import { type SortInput, type SortOptions, type SortReport, sortInFlight, sortNote } from './sorter'

/** What a note save hands the receipt; the shape saveNote returns. */
export interface SavedNote {
  ok: boolean
  location: LastNote['location']
  relative: string
  file: string
  /** When the note was spoken: a retried note files under that time. */
  when: Date
}

type ReceiptAction = 'reveal' | 'choose'

/** The newest receipt as it was worded, for the smoke check. */
interface ShownReceipt {
  title: string
  body: string
  file: string
  actions: ReceiptAction[]
}

// One fixed id: macOS and Windows replace a delivered notification that
// shares it, so Notification Center never fills up with receipts.
const RECEIPT_ID = 'murmur-note-receipt'

let lastNote: LastNote | null | undefined
let current: Notification | null = null
let lastShown: ShownReceipt | null = null
let shownCount = 0
const listeners = new Set<(note: LastNote | null) => void>()
let chooseFolder: () => Promise<void> = async () => undefined

const say = (line: string): void => writeAppLog(`[receipt] ${line}`)
const storeFile = (): string => join(app.getPath('userData'), 'last-note.json')

/** The newest note, read from disk once so a restart keeps it. */
export function getLastNote(): LastNote | null {
  if (lastNote === undefined) {
    try {
      lastNote = existsSync(storeFile()) ? parseLastNote(JSON.parse(readFileSync(storeFile(), 'utf8'))) : null
    } catch {
      lastNote = null
    }
  }
  return lastNote
}

function setLastNote(note: LastNote): void {
  lastNote = note
  try {
    replaceViaTemp(storeFile(), `${JSON.stringify(note)}\n`)
  } catch (error) {
    // The record is a convenience; the note itself is already safe.
    say(`remember failed reason=${errorCode(error)}`)
  }
  for (const listener of listeners) {
    // One listener failing (a window torn down mid-send) must not cost
    // the others, or the receipt itself.
    try {
      listener(note)
    } catch (error) {
      say(`listener failed reason=${errorCode(error)}`)
    }
  }
}

export function onLastNoteChanged(listener: (note: LastNote | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Open a note file in the OS default app, or refuse it. */
export async function openNote(
  file: string,
  via: string,
  opener: (file: string) => Promise<string> = (f) => shell.openPath(f)
): Promise<'opened' | 'refused' | 'failed'> {
  if (!openableNote(file)) {
    say(`open refused via=${via} reason=not-a-note`)
    return 'refused'
  }
  if ((await opener(file)) !== '') {
    say(`open failed via=${via}`)
    return 'failed'
  }
  say(`opened via=${via}`)
  return 'opened'
}

/** Show a note in Finder or Explorer, or refuse it. */
export function revealNote(
  file: string,
  via: string,
  reveal: (file: string) => void = (f) => shell.showItemInFolder(f)
): 'shown' | 'refused' {
  if (!openableNote(file)) {
    say(`reveal refused via=${via} reason=not-a-note`)
    return 'refused'
  }
  reveal(file)
  say(`revealed via=${via}`)
  return 'shown'
}

export async function openLastNote(
  via: string,
  opener?: (file: string) => Promise<string>
): Promise<'opened' | 'refused' | 'failed' | 'none'> {
  const note = getLastNote()
  return note ? openNote(receiptTarget(note).file, via, opener) : 'none'
}

export function revealLastNote(via: string): 'shown' | 'refused' | 'none' {
  const note = getLastNote()
  return note ? revealNote(receiptTarget(note).file, via) : 'none'
}

function showReceipt(note: LastNote): void {
  const target = receiptTarget(note)
  const actions: ReceiptAction[] = note.location === 'fallback' && note.sorted.length === 0 ? ['choose', 'reveal'] : ['reveal']
  const kind = note.sorted.length > 0 ? 'sorted' : 'saved'
  if (!getSettings().notes.receipts) {
    say(`outcome=off kind=${kind}`)
    return
  }
  const receipt: ShownReceipt = {
    title: receiptTitle(note),
    body: note.line !== '' ? note.line : 'Click to open the note.',
    file: target.file,
    actions
  }
  lastShown = receipt
  shownCount += 1
  // Smoke words the receipt and stops short of the desktop.
  if (isSmoke) return
  if (!Notification.isSupported()) {
    say(`outcome=suppressed reason=unsupported kind=${kind}`)
    return
  }
  current?.close()
  const notification = new Notification({
    id: RECEIPT_ID,
    title: receipt.title,
    body: receipt.body,
    // The pill already played the noted cue.
    silent: true,
    actions: actions.map((a) => ({
      type: 'button' as const,
      text: a === 'choose' ? 'Choose folder' : revealLabel(process.platform)
    }))
  })
  // Clicking opens the note and nothing else: murmur's own window stays
  // where it was.
  notification.on('click', () => {
    void openNote(target.file, 'receipt')
  })
  notification.on('action', (details) => {
    if (actions[details.actionIndex] === 'choose') void chooseFolder()
    else revealNote(target.file, 'receipt')
  })
  // A notification that could not be shown says so; the log is where a
  // silent receipt gets debugged from.
  notification.on('failed', (_event, error) => {
    say(`outcome=failed kind=${kind} reason=${error.replace(/\s+/g, ' ').slice(0, 80)}`)
  })
  // Held here until the next receipt replaces it, even after its banner
  // closes: on Windows a banner that times out waits in Action Center,
  // and a click there needs these handlers alive.
  current = notification
  notification.show()
  say(`outcome=shown kind=${kind} location=${note.location} places=${note.sorted.length}`)
}

/**
 * A note is safely written: remember it and hand over the receipt. The
 * returned record is the token a later sort must match, so a sort that
 * finishes after a newer note never relabels the newer one.
 */
export function noteSaved(saved: SavedNote, text: string): LastNote | null {
  if (!saved.ok) return null
  const note: LastNote = {
    at: saved.when.getTime(),
    line: receiptLine(text),
    location: saved.location,
    inbox: { kind: 'inbox', file: saved.file, relative: saved.relative },
    sorted: []
  }
  setLastNote(note)
  showReceipt(note)
  return note
}

/** A sort filed lines out of the note: the receipt follows them. */
export function noteSorted(token: LastNote, report: SortReport): void {
  if (getLastNote() !== token) return
  if (report.outcome !== 'filed' || !report.places || report.places.length === 0) return
  const note: LastNote = { ...token, sorted: report.places }
  setLastNote(note)
  showReceipt(note)
}

/**
 * Sort a note and let its receipt follow. A sort already running when
 * this one is asked for answers with ITS report, which belongs to the
 * note that started it, so the receipt is left alone then.
 */
export async function sortWithReceipt(input: SortInput, token: LastNote | null, options?: SortOptions): Promise<SortReport> {
  const joined = sortInFlight()
  const report = await sortNote(input, options)
  if (token && !joined) noteSorted(token, report)
  return report
}

/**
 * Smoke: a real (mocked) sort of note A is still running when note B is
 * saved and asks to sort. B joins A's sort and gets A's report, so B's
 * receipt must not change; A's own report arrives after B took over, so
 * it is stale. Then a sort of B alone replaces B's receipt with the
 * files it filed into, tasks first.
 */
async function joinedSortStep(vault: string): Promise<Record<string, boolean>> {
  const { saveNote } = await import('./index')
  updateSettings({ notes: { receipts: true, sort: true } })
  const cfg = { baseUrl: 'https://mock.local/v1', model: 'smoke-sorter', apiKey: 'k' }
  const slowReply = (content: string, ms: number): typeof fetch =>
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
    }) as typeof fetch
  const inputOf = (saved: SavedNote, text: string, when: Date): SortInput => ({
    text,
    base: vault,
    inboxRelative: saved.relative,
    when
  })
  const whenA = new Date(2026, 9, 2, 9, 20)
  const whenB = new Date(2026, 9, 2, 9, 21)
  const savedA = saveNote('Email Bob the deck.', whenA)
  const tokenA = noteSaved(savedA, 'Email Bob the deck.')
  const sortA = sortWithReceipt(inputOf(savedA, 'Email Bob the deck.', whenA), tokenA, {
    fetchImpl: slowReply('{"1":"task"}', 300),
    connection: cfg
  })
  const savedB = saveNote('Maybe a darker pill.', whenB)
  const tokenB = noteSaved(savedB, 'Maybe a darker pill.')
  const titleB = lastShown?.title
  const joinedReport = await sortWithReceipt(inputOf(savedB, 'Maybe a darker pill.', whenB), tokenB, {
    fetchImpl: slowReply('{"1":"idea"}', 10),
    connection: cfg
  })
  const reportA = await sortA
  const untouched = getLastNote() === tokenB && lastShown?.title === titleB
  const own = await sortWithReceipt(inputOf(savedB, 'Maybe a darker pill.', whenB), tokenB, {
    fetchImpl: slowReply('{"1":"idea"}', 10),
    connection: cfg
  })
  const after = getLastNote()
  return {
    joinedGotOthersReport: joinedReport === reportA && reportA.outcome === 'filed' && reportA.places?.[0]?.kind === 'tasks',
    joinedLeftReceipt: untouched,
    ownSortFollowed:
      own.outcome === 'filed' &&
      after?.inbox.file === savedB.file &&
      after.sorted.length === 1 &&
      after.sorted[0].kind === 'ideas' &&
      lastShown?.title === 'Sorted into ideas.md' &&
      lastShown.file === after.sorted[0].file
  }
}

export function initReceipts(options: {
  settingsWindow: () => BrowserWindow | null
  chooseFolder: () => Promise<void>
}): void {
  chooseFolder = options.chooseFolder
  ipcMain.handle(IpcChannels.notesLast, () => getLastNote())
  ipcMain.handle(IpcChannels.notesOpenLast, () => openLastNote('home'))
  ipcMain.handle(IpcChannels.notesRevealLast, () => revealLastNote('home'))
  // Only the settings window hears about notes, never the overlay.
  onLastNoteChanged(() => {
    const win = options.settingsWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IpcChannels.notesLastChanged)
  })

  registerSmokeCheck('noteReceipt', async () => {
    // A saved note gets a receipt pointing at its file; a sort that
    // files lines replaces it with one naming the destination and N
    // more; a stale sort changes nothing; the opener opens the target
    // and refuses a script, a folder, and a link to a script; the
    // switch silences the notification but keeps the record; and the
    // record survives on disk.
    const before = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-receipt-vault')
    try {
      mkdirSync(join(vault, 'murmur'), { recursive: true })
      updateSettings({
        notes: {
          folder: vault,
          pathTemplate: DEFAULT_NOTE_PATH_TEMPLATE,
          entryTemplate: DEFAULT_NOTE_ENTRY_TEMPLATE,
          receipts: true
        }
      })
      const { saveNote } = await import('./index')
      const text = '- Call the dentist about moving Tuesday to Thursday, and ask about the night guard while there.\nMore.'
      const saved = saveNote(text, new Date(2026, 9, 2, 9, 15))
      const token = noteSaved(saved, text)
      const savedReceipt = lastShown
      const tasks = join(vault, 'murmur', 'todo.md')
      const ideas = join(vault, 'murmur', 'ideas.md')
      writeFileSync(tasks, '- [ ] Call the dentist\n')
      writeFileSync(ideas, '- A night guard idea\n')
      const filed: SortReport = {
        at: Date.now(),
        outcome: 'filed',
        tasks: 1,
        ideas: 1,
        notes: 0,
        held: 0,
        places: [
          { kind: 'tasks', file: tasks, relative: 'murmur/todo.md' },
          { kind: 'ideas', file: ideas, relative: 'murmur/ideas.md' }
        ]
      }
      if (token) noteSorted(token, filed)
      const sortedReceipt = lastShown
      const sortedNote = getLastNote()
      const { trayMenuLabels } = await import('../tray')
      const trayLabels = trayMenuLabels()
      // The same token again is stale now: a newer record replaced it.
      if (token) noteSorted(token, { ...filed, places: [filed.places![1]] })
      const staleIgnored = sortedNote !== null && getLastNote() === sortedNote
      const opened: string[] = []
      const openOutcome = await openLastNote('smoke', async (f) => {
        opened.push(f)
        return ''
      })
      const script = join(vault, 'run.sh')
      const folderNote = join(vault, 'folder.md')
      const link = join(vault, 'link.md')
      writeFileSync(script, 'echo not a note\n')
      mkdirSync(folderNote, { recursive: true })
      rmSync(link, { force: true })
      // Windows needs a privilege for symbolic links; that case is
      // proven on macOS and Linux.
      let linked = false
      try {
        symlinkSync(script, link)
        linked = true
      } catch {
        linked = false
      }
      const refused = await Promise.all(
        [script, folderNote, ...(linked ? [link] : [])].map((f) =>
          openNote(f, 'smoke', async () => {
            opened.push(f)
            return ''
          })
        )
      )
      const revealRefused = revealNote(script, 'smoke', () => opened.push(script)) === 'refused'
      updateSettings({ notes: { receipts: false } })
      const countOff = shownCount
      const quiet = saveNote('A quiet note.', new Date(2026, 9, 2, 9, 16))
      const quietNote = noteSaved(quiet, 'A quiet note.')
      const stored = parseLastNote(JSON.parse(readFileSync(storeFile(), 'utf8')))
      const conditions = {
        savedOk: saved.ok && saved.location === 'folder',
        savedTitle: savedReceipt?.title === 'Noted to inbox/2026-10-02.md',
        savedLine:
          savedReceipt?.body === 'Call the dentist about moving Tuesday to Thursday, and ask about the night guard…',
        savedTarget: savedReceipt?.file === saved.file && savedReceipt.actions.join() === 'reveal',
        sortedTitle: sortedReceipt?.title === 'Sorted into todo.md and 1 more',
        sortedTarget: sortedReceipt?.file === tasks,
        staleIgnored,
        trayItem: trayLabels.includes('Open last note'),
        openedTarget: openOutcome === 'opened' && opened[0] === tasks,
        refusedNonNotes: refused.every((r) => r === 'refused') && revealRefused && opened.length === 1,
        offStaysQuiet: shownCount === countOff && quietNote !== null && getLastNote() === quietNote,
        stored: stored?.inbox.file === quiet.file && stored.line === 'A quiet note.' && stored.at === quiet.when.getTime(),
        ...(await joinedSortStep(vault))
      }
      const failed = Object.entries(conditions)
        .filter(([, ok]) => !ok)
        .map(([name]) => name)
      if (failed.length > 0) console.error(`smoke noteReceipt: failed=${failed.join(',')} linked=${linked}`)
      return failed.length === 0
    } finally {
      updateSettings({ notes: before })
    }
  })
}
