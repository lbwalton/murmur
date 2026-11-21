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
import { type BrowserWindow, Notification, app, shell } from 'electron'
import { ipc } from '../ipc'
import {
  type LastNote,
  parseLastNote,
  receiptBody,
  receiptLine,
  receiptTarget,
  receiptTitle,
  revealLabel
} from '../../shared/receipt'
import { KEEP_NO_TEXT } from '../../shared/history'
import { sortTrouble, sortTroubleBody, sortTroubleTitle } from '../../shared/sort-notice'
import { IpcChannels } from '../../shared/ipc'
import { DEFAULT_NOTE_ENTRY_TEMPLATE, DEFAULT_NOTE_PATH_TEMPLATE } from '../../shared/notes'
import { getSettings, updateSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { writeAppLog } from '../window-watch'
import { errorCode } from './files'
import { openableNote, replaceViaTemp } from './safe-fs'
import {
  type SortInput,
  type SortOptions,
  type SortReport,
  canSortAgain,
  rememberForSort,
  sortNote,
  sortQueuedFor,
  sortWaiting
} from './sorter'

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
// The notice that a sort could not finish (US-180) has its own fixed id:
// it is about lines still waiting, so it stays beside the newest note's
// receipt until Sort again files them, and a note saved meanwhile keeps
// its own receipt.
const UNFINISHED_ID = 'murmur-sort-unfinished'

let lastNote: LastNote | null | undefined
let current: Notification | null = null
let lastShown: ShownReceipt | null = null
let unfinished: Notification | null = null
let unfinishedFor: SortInput | null = null
let lastUnfinished: ShownReceipt | null = null
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
    // Don't keep holds no words on disk, here included (US-137).
    const keepsText = getSettings().history.retentionDays !== KEEP_NO_TEXT
    replaceViaTemp(storeFile(), `${JSON.stringify(keepsText ? note : { ...note, line: '' })}\n`)
  } catch (error) {
    // The record is a convenience; the note itself is already safe.
    say(`remember failed reason=${errorCode(error)}`)
  }
  notify(note)
}

/** Takes the words out of the stored receipt once it is past the limit.
 *  The note itself is the person's own file and stays. */
export function scrubLastNoteLine(cutoff: number): void {
  const note = getLastNote()
  if (note === null || note.at >= cutoff || note.line === '') return
  setLastNote({ ...note, line: '' })
}

function notify(note: LastNote | null): void {
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

/** Take back a receipt still on screen or in Notification Center. */
export function withdrawReceipt(): void {
  current?.close()
  current = null
  // A receipt left from before a restart has no object here; macOS can
  // still take it out of Notification Center by its id.
  if (process.platform === 'darwin' && !isSmoke) Notification.remove(RECEIPT_ID)
}

/** Forget the last note: the record, its file, and a receipt still
 *  sitting in Notification Center. Clear all in Settings, History calls it;
 *  the note file itself is never touched. */
export function forgetLastNote(): void {
  lastNote = null
  try {
    rmSync(storeFile(), { force: true })
  } catch (error) {
    say(`forget failed reason=${errorCode(error)}`)
  }
  withdrawReceipt()
  withdrawUnfinished()
  lastShown = null
  say('forgotten')
  notify(null)
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
    body: receiptBody(note, getSettings().history.hideWords),
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
  // Logged when the system says it showed, so a failure is never
  // written down as a success.
  notification.on('show', () => {
    say(`outcome=shown kind=${kind} location=${note.location} places=${note.sorted.length}`)
  })
  current = notification
  notification.show()
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

/** A sort filed lines out of the note: the receipt follows them. A
 *  write that failed after earlier parts filed still names their files;
 *  Sort again adds to the files the note already filed into. */
export function noteSorted(token: LastNote, report: SortReport): void {
  if (getLastNote() !== token) return
  const places = report.places ?? []
  if (places.length === 0) return
  const sorted = [...token.sorted, ...places.filter((p) => !token.sorted.some((s) => s.file === p.file))].sort(
    (a, b) => (a.kind === b.kind ? 0 : a.kind === 'tasks' ? -1 : 1)
  )
  const note: LastNote = { ...token, sorted }
  setLastNote(note)
  showReceipt(note)
}

/** Take back the notice that a sort could not finish. */
function withdrawUnfinished(): void {
  unfinished?.close()
  unfinished = null
  unfinishedFor = null
  lastUnfinished = null
}

/** Say that a sort of this note left lines in the inbox (US-180): why,
 *  in plain words, and where Sort again is. A click opens that note's
 *  inbox file, where every word still is. Never any of the note's words,
 *  so Hide words has nothing to take out; Note receipts off silences it. */
function showUnfinished(input: SortInput, report: SortReport): void {
  if (!getSettings().notes.receipts) {
    say('outcome=off kind=unsorted')
    return
  }
  const file = join(input.base, ...input.inboxRelative.split(/[\\/]/).filter((s) => s !== ''))
  const notice: ShownReceipt = { title: sortTroubleTitle(report), body: sortTroubleBody(report), file, actions: ['reveal'] }
  lastUnfinished = notice
  unfinishedFor = input
  if (isSmoke) return
  if (!Notification.isSupported()) {
    say('outcome=suppressed reason=unsupported kind=unsorted')
    return
  }
  unfinished?.close()
  const notification = new Notification({
    id: UNFINISHED_ID,
    title: notice.title,
    body: notice.body,
    silent: true,
    actions: [{ type: 'button' as const, text: revealLabel(process.platform) }]
  })
  notification.on('click', () => {
    void openNote(file, 'unfinished')
  })
  notification.on('action', () => {
    revealNote(file, 'unfinished')
  })
  notification.on('failed', (_event, error) => {
    say(`outcome=failed kind=unsorted reason=${error.replace(/\s+/g, ' ').slice(0, 80)}`)
  })
  notification.on('show', () => {
    say(`outcome=shown kind=unsorted lines=${report.unsorted ?? 0}`)
  })
  unfinished = notification
  notification.show()
}

/**
 * After a sort of a note: the receipt follows what it filed (for the
 * newest note only), and the unfinished notice says whether lines are
 * still waiting. A sort that leaves none takes back a notice about the
 * same note, or any notice once nothing waits anywhere.
 */
function followSort(input: SortInput, token: LastNote | null, report: SortReport): void {
  if (token) noteSorted(token, report)
  if (sortTrouble(report)) showUnfinished(input, report)
  else if (unfinishedFor === input || !canSortAgain()) withdrawUnfinished()
}

/**
 * Sort again (Settings, Notes, Last note), with the receipts following
 * it (US-180): every note with lines waiting sorts in turn, and once a
 * note's lines file its notice gives way to the usual receipt.
 */
export async function sortAgainWithReceipt(options?: SortOptions): Promise<void> {
  const token = getLastNote()
  for (const run of await sortWaiting(options)) {
    if (run.joined) continue
    const mine = token !== null && token.at === run.input.when.getTime() && token.inbox.relative === run.input.inboxRelative
    followSort(run.input, mine ? token : null, run.report)
  }
}

/**
 * Sort a note and let its receipt follow. A sort of another note still
 * running makes this one wait its turn and get its own report (US-180);
 * asking again for a note already sorting joins that sort, whose owner
 * the receipt follows.
 */
export async function sortWithReceipt(input: SortInput, token: LastNote | null, options?: SortOptions): Promise<SortReport> {
  const joined = sortQueuedFor(input)
  const report = await sortNote(input, options)
  if (!joined) followSort(input, token, report)
  return report
}

/**
 * Smoke: a real (mocked) sort of note A is still running when note B is
 * saved and asks to sort. B waits its turn and gets its own sort and
 * report (US-180; it used to join A's and never be sorted). A's report
 * arrives after B took over, so it is stale and leaves B's receipt be;
 * B's receipt then names the file B filed into.
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
  let staleLeftB = false
  void sortA.then(() => {
    // A finished first: its stale report left B's record and receipt be.
    staleLeftB = getLastNote() === tokenB && lastShown?.title === titleB
  })
  const own = await sortWithReceipt(inputOf(savedB, 'Maybe a darker pill.', whenB), tokenB, {
    fetchImpl: slowReply('{"1":"idea"}', 10),
    connection: cfg
  })
  const reportA = await sortA
  const after = getLastNote()
  return {
    queuedOwnReport:
      own !== reportA && reportA.outcome === 'filed' && reportA.places?.[0]?.kind === 'tasks' && own.places?.[0]?.kind === 'ideas',
    staleLeftB,
    ownSortFollowed:
      own.outcome === 'filed' &&
      after?.inbox.file === savedB.file &&
      after.line === 'Maybe a darker pill.' &&
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
  ipc.handle(IpcChannels.notesLast, () => getLastNote())
  ipc.handle(IpcChannels.notesOpenLast, () => openLastNote('home'))
  ipc.handle(IpcChannels.notesRevealLast, () => revealLastNote('home'))
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
      const offStaysQuiet = shownCount === countOff && quietNote !== null && getLastNote() === quietNote
      const stored = parseLastNote(JSON.parse(readFileSync(storeFile(), 'utf8')))
      // Hide words (US-145): the receipt says where the note went and
      // keeps none of its words, and the record still holds them.
      updateSettings({ notes: { receipts: true }, history: { hideWords: true } })
      const hiddenLine = 'A hidden note about the dentist.'
      const hiddenNote = noteSaved(saveNote(hiddenLine, new Date(2026, 9, 2, 9, 17)), hiddenLine)
      const hiddenReceipt = lastShown
      updateSettings({ history: { hideWords: false } })
      const wordsHidden =
        hiddenReceipt?.body === 'Click to open the note.' &&
        hiddenReceipt.title === 'Noted to inbox/2026-10-02.md' &&
        hiddenNote?.line === hiddenLine
      // A sort that could not finish (US-180) says so, points at the
      // inbox, and names where Sort again is, with none of the note's
      // words; a sort that filed part of the note keeps the files it
      // filed into for Home and the tray.
      const troubleText = 'Call the plumber about the leak.'
      const troubleWhen = new Date(2026, 9, 2, 9, 18)
      const troubleSaved = saveNote(troubleText, troubleWhen)
      const troubleToken = noteSaved(troubleSaved, troubleText)
      const troubleReceipt = lastShown
      const troubleInput: SortInput = { text: troubleText, base: vault, inboxRelative: troubleSaved.relative, when: troubleWhen }
      followSort(troubleInput, troubleToken, {
        ...filed,
        outcome: 'failed',
        tasks: 0,
        ideas: 0,
        places: undefined,
        reason: 'http 429',
        unsorted: 3
      })
      const unfinishedNotice = lastUnfinished
      const receiptKept = getLastNote() === troubleToken && lastShown === troubleReceipt
      followSort(troubleInput, troubleToken, { ...filed, reason: 'http 413', unsorted: 2 })
      const partialNotice = lastUnfinished
      const unfinishedOk =
        receiptKept &&
        unfinishedNotice?.title === 'Sort did not finish' &&
        unfinishedNotice.file === troubleSaved.file &&
        unfinishedNotice.body ===
          "Your note is safe in the inbox. The provider's rate limit ran out for now. Sort again is under Settings, Notes, Last note." &&
        !unfinishedNotice.body.includes('plumber')
      const partialOk =
        partialNotice?.title === 'Sorted part of your note' &&
        partialNotice.file === troubleSaved.file &&
        partialNotice.body.startsWith('2 lines are still only in the inbox.') &&
        // The receipt itself names the files the part filed into.
        lastShown?.title === 'Sorted into todo.md and 1 more' &&
        getLastNote()?.inbox.file === troubleSaved.file &&
        getLastNote()?.sorted.length === 2
      // Sort again lets the receipts follow: a sort that stopped says so,
      // and once Sort again files the rest the notice is taken back and
      // the usual receipt names the file.
      updateSettings({ notes: { sort: true } })
      const againText = 'Email the landlord about the lease. Book the plumber.'
      const againWhen = new Date(2026, 9, 2, 9, 19)
      const againSaved = saveNote(againText, againWhen)
      const againToken = noteSaved(againSaved, againText)
      const againInput: SortInput = { text: againText, base: vault, inboxRelative: againSaved.relative, when: againWhen }
      rememberForSort(againInput)
      const againCfg = { baseUrl: 'https://mock-again.local/v1', model: 'smoke-again', apiKey: 'k' }
      await sortWithReceipt(againInput, againToken, {
        fetchImpl: (async () => new Response('{}', { status: 503 })) as typeof fetch,
        connection: againCfg
      })
      const stoppedNotice = lastUnfinished
      await sortAgainWithReceipt({
        fetchImpl: (async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"task","2":"task"}' } }] }), {
            status: 200
          })) as typeof fetch,
        connection: againCfg
      })
      const againOk =
        stoppedNotice?.title === 'Sort did not finish' &&
        stoppedNotice.file === againSaved.file &&
        lastUnfinished === null &&
        lastShown?.title === 'Sorted into todo.md' &&
        lastShown.file === tasks &&
        getLastNote()?.inbox.file === againSaved.file &&
        getLastNote()?.sorted[0]?.kind === 'tasks'
      const joined = await joinedSortStep(vault)
      forgetLastNote()
      const forgotten = getLastNote() === null && !existsSync(storeFile()) && !trayMenuLabels().includes('Open last note')
      lastNote = undefined
      const staysForgotten = getLastNote() === null
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
        offStaysQuiet,
        wordsHidden,
        unfinishedOk,
        partialOk,
        againOk,
        stored: stored?.inbox.file === quiet.file && stored.line === 'A quiet note.' && stored.at === quiet.when.getTime(),
        ...joined,
        forgotten,
        staysForgotten
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
