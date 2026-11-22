// SPDX-License-Identifier: GPL-3.0-only
// The dictionary as a file (US-183): read a list of words from CSV or
// JSON, fold it into the list in Settings, and write the list back out.
// Pure and free of Electron, so every rule here is unit tested. A file
// comes from somewhere else, so nothing in it is trusted: sizes are
// capped, odd rows are counted and skipped, and nothing is ever thrown.
import type { DictionaryEntry } from './dictionary'

/** The largest file murmur opens as a word list. */
export const MAX_DICTIONARY_FILE_BYTES = 1_000_000
/** The most words an import may grow the dictionary to. */
export const MAX_DICTIONARY_ENTRIES = 2_000
/** The longest word or phrase an import takes, on either side. */
export const MAX_ENTRY_CHARS = 120

export type ParsedDictionary =
  | {
      ok: true
      entries: DictionaryEntry[]
      /** Rows or items that held something, but not a word murmur can use. */
      unread: number
      /** A first row read as headings and left out, when it is not the
       *  heading murmur's own export writes: said in the question, so a
       *  real word taken for a heading is never lost unseen. */
      heading: string | null
    }
  | { ok: false }

export interface MergePlan {
  next: DictionaryEntry[]
  added: number
  /** Up to 3 of the new words, as heard and written, to show in the
   *  question: a heading row or a wrong column split shows up here. */
  addedWords: string[]
  /** Words already in the list whose spelling the file changes. */
  changed: number
  /** Up to 3 of those words, as heard, to name in the question. */
  changedWords: string[]
  /** Words already in the list, spelled the same. */
  same: number
  /** New words left out because the list is full. */
  left: number
}

/** What the settings window learns about a picked file: counts and up
 *  to 3 words of each kind. The rest of the file's words stay in the
 *  main process until the person says import. */
export type DictionaryPick =
  | { status: 'cancelled' }
  | { status: 'too-big' }
  | { status: 'unreadable' }
  | {
      status: 'ready'
      token: string
      name: string
      added: number
      addedWords: string[]
      changed: number
      changedWords: string[]
      same: number
      left: number
      unread: number
      heading: string | null
    }

export type DictionaryImported = { status: 'done'; added: number; changed: number } | { status: 'stale' }

export type DictionaryExported =
  | { status: 'cancelled' }
  | { status: 'empty' }
  | { status: 'failed' }
  | { status: 'saved'; count: number }

/**
 * A file's bytes as text. Most lists are UTF-8, but a spreadsheet's
 * plain CSV save on Windows is the older Western encoding, and its
 * Unicode Text save is UTF-16, and read as UTF-8 either one would turn
 * an accented name into the wrong letters. Any other encoding is read
 * as the Western one, wrongly: the words the question shows are how a
 * person sees that before anything is imported.
 */
export function decodeWordList(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

// Any control character, the 2 ranges of them: a word list holds
// words, never line breaks or bytes with no letter.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

/** One side of a pair, trimmed, or null when it is not a usable word. */
function word(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_ENTRY_CHARS || CONTROL.test(trimmed)) return null
  return trimmed
}

function pair(from: unknown, to: unknown): DictionaryEntry | null {
  const heard = word(from)
  const written = word(to)
  return heard !== null && written !== null ? { from: heard, to: written } : null
}

/** How 2 spellings of the heard side are told apart: matching ignores
 *  case, so the list must too. */
const keyOf = (from: string): string => from.trim().toLowerCase()

/** The first row wins for a heard word said twice, as the first entry
 *  does when murmur applies the list, so a list with a repeat exports
 *  and imports back as it was. */
function collapse(rows: DictionaryEntry[]): DictionaryEntry[] {
  const byKey = new Map<string, DictionaryEntry>()
  for (const row of rows) {
    if (!byKey.has(keyOf(row.from))) byKey.set(keyOf(row.from), row)
  }
  return [...byKey.values()]
}

// ---- JSON ----------------------------------------------------------

function field(item: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(item, name)) return item[name]
  }
  return undefined
}

const FROM_KEYS = ['from', 'heard', 'heardAs'] as const
const TO_KEYS = ['to', 'written', 'writtenAs'] as const

function fromJsonItem(item: unknown): DictionaryEntry | null {
  // A bare word keeps its own spelling and casing.
  if (typeof item === 'string') return pair(item, item)
  if (Array.isArray(item)) return item.length >= 2 ? pair(item[0], item[1]) : pair(item[0], item[0])
  if (typeof item === 'object' && item !== null) {
    const record = item as Record<string, unknown>
    return pair(field(record, FROM_KEYS), field(record, TO_KEYS))
  }
  return null
}

/** An object whose every key is a heard or a written key, with 1 of
 *  each: an item, whatever its values hold. A map has other keys. */
function isLoneItem(record: Record<string, unknown>): boolean {
  const keys = Object.keys(record)
  const known: readonly string[] = [...FROM_KEYS, ...TO_KEYS]
  return (
    keys.every((key) => known.includes(key)) &&
    keys.some((key) => (FROM_KEYS as readonly string[]).includes(key)) &&
    keys.some((key) => (TO_KEYS as readonly string[]).includes(key))
  )
}

function fromJson(text: string): ParsedDictionary {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false }
  }
  if (typeof value !== 'object' || value === null) return { ok: false }
  const record = value as Record<string, unknown>
  // murmur's own settings file, or any file shaped { dictionary: [...] }.
  const inner = Array.isArray(value) ? value : record.dictionary
  const entries: DictionaryEntry[] = []
  let unread = 0
  const take = (entry: DictionaryEntry | null): void => {
    if (entry) entries.push(entry)
    else unread += 1
  }
  if (Array.isArray(inner)) {
    for (const item of inner) take(fromJsonItem(item))
  } else if (isLoneItem(record)) {
    // 1 item on its own, { "from": ..., "to": ... }: never a map that
    // would turn the words from and to into entries.
    take(fromJsonItem(record))
  } else {
    // A plain map: { "heard": "written" }.
    for (const [from, to] of Object.entries(record)) take(pair(from, to))
  }
  return { ok: true, entries: collapse(entries), unread, heading: null }
}

// ---- CSV -----------------------------------------------------------

// In the order that wins a tie: a tab is rarest inside a word, then a
// semicolon, then a comma.
const DELIMITERS = ['\t', ';', ','] as const

const isSpace = (char: string): boolean => char === ' ' || char === '\t' || char.trim() === ''

/**
 * The separator of a file. A spreadsheet in some languages saves with
 * semicolons, and a list copied from a table comes with tabs. It is the
 * one found on the most lines, outside quotes: a notes column may hold
 * a stray comma, but the real separator is on every line. Between 2
 * found on as many lines, it is the one found exactly once on more of
 * them, since a word list has 2 columns: "smith, jon;Smith, John" is 2
 * cells by its semicolon, 3 by its commas. A .tsv is tabs, and a file
 * with none of them is 1 column.
 */
function delimiterOf(lines: readonly string[], extension: string): string {
  if (extension === 'tsv') return '\t'
  const onLines = new Map<string, number>(DELIMITERS.map((d) => [d, 0]))
  const once = new Map<string, number>(DELIMITERS.map((d) => [d, 0]))
  let seen = 0
  for (const line of lines) {
    if (line.trim() === '') continue
    seen += 1
    if (seen > 200) break
    const here = new Map<string, number>()
    let quoted = false
    for (const char of line) {
      if (char === '"') quoted = !quoted
      else if (!quoted && onLines.has(char)) here.set(char, (here.get(char) ?? 0) + 1)
    }
    for (const [d, n] of here) {
      onLines.set(d, (onLines.get(d) ?? 0) + 1)
      if (n === 1) once.set(d, (once.get(d) ?? 0) + 1)
    }
  }
  let best: string = ','
  let bestLines = 0
  let bestOnce = 0
  for (const d of DELIMITERS) {
    const n = onLines.get(d) ?? 0
    const o = once.get(d) ?? 0
    if (n > bestLines || (n === bestLines && n > 0 && o > bestOnce)) {
      best = d
      bestLines = n
      bestOnce = o
    }
  }
  return best
}

/**
 * The cells of 1 line, or null when a quote opens and never closes. A
 * quoted cell may hold the separator and a doubled quote; a quote that
 * is not the first thing in its cell is a plain character (5"). 1 pass
 * over the line: whether a cell is still blank is kept as a flag, never
 * measured again, so a line of 900,000 quotes costs 900,000 steps.
 */
function cellsOf(line: string, delimiter: string): string[] | null {
  const cells: string[] = []
  let cell = ''
  let blank = true
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char !== '"') cell += char
      else if (line[i + 1] === '"') {
        cell += '"'
        i += 1
      } else quoted = false
    } else if (char === '"' && blank) {
      cell = ''
      blank = false
      quoted = true
    } else if (char === delimiter) {
      cells.push(cell)
      cell = ''
      blank = true
    } else {
      cell += char
      if (blank && !isSpace(char)) blank = false
    }
  }
  if (quoted) return null
  cells.push(cell)
  return cells
}

const HEADS_FROM = new Set([
  'from',
  'heard',
  'heard as',
  'said',
  'spoken',
  'wrong',
  'incorrect',
  'mistake',
  'misspelling',
  'original',
  'word',
  'name',
  'term'
])
const HEADS_TO = new Set([
  'to',
  'written',
  'written as',
  'right',
  'correct',
  'correction',
  'fixed',
  'replacement',
  'spelling',
  'word',
  'name',
  'term'
])
const HEADS_ALONE = new Set(['word', 'words', 'name', 'names', 'term', 'terms', 'vocabulary', 'dictionary', 'word list'])

/** A heading cell as it is compared: Heard_As and heard-as are heard as. */
const headOf = (cell: string | undefined): string =>
  (cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

function isHeader(cells: string[]): boolean {
  const first = headOf(cells[0])
  const second = headOf(cells[1])
  return second === '' ? HEADS_ALONE.has(first) : HEADS_FROM.has(first) && HEADS_TO.has(second)
}

/** Undo the export's guard: a word that starts like a formula is saved
 *  with ' in front (see cell), and comes back without it. */
const unguard = (value: string): string => value.replace(/^(\s*)'(?='*[=+\-@])/, '$1')

function fromCsv(text: string, extension: string): ParsedDictionary {
  // A word never holds a line break, so the file is read a line at a
  // time: a stray quote costs its own line, never the rest of the file.
  const lines = text.split(/\r\n|\n|\r/)
  const delimiter = delimiterOf(lines, extension)
  const entries: DictionaryEntry[] = []
  let unread = 0
  let heading: string | null = null
  let first = true
  // The line before opened a quote and never closed it.
  let open = false
  for (const line of lines) {
    if (line.trim() === '') continue
    if (open) {
      open = false
      // A cell that held a line break ends on the line with the quote
      // that closes it. A real row with 1 quote in it (six inch,6")
      // looks the same, so the line is counted, never dropped unseen.
      if ((line.split('"').length - 1) % 2 === 1) {
        unread += 1
        continue
      }
    }
    const cells = cellsOf(line, delimiter)
    if (cells === null) {
      open = true
      unread += 1
      continue
    }
    if (cells.every((c) => c.trim() === '')) continue
    if (first) {
      first = false
      if (isHeader(cells)) {
        const own = headOf(cells[0]) === 'heard as' && headOf(cells[1]) === 'written as'
        if (!own) heading = shortWord(cells.slice(0, 2).map((c) => c.trim()).filter((c) => c !== '').join(', '))
        continue
      }
    }
    const from = unguard(cells[0] ?? '')
    const to = unguard(cells[1] ?? '')
    // 1 column, or an empty second cell: the word keeps its own spelling.
    const entry = to.trim() === '' ? pair(from, from) : pair(from, to)
    if (entry) entries.push(entry)
    else unread += 1
  }
  return { ok: true, entries: collapse(entries), unread, heading }
}

/**
 * Read a word list. `extension` is the file's, without the dot. A .json
 * file is JSON or nothing. Any other file that parses as JSON is read
 * as JSON, and as rows of cells otherwise (.tsv always by tabs). A file
 * that is not text comes back not ok.
 */
export function parseDictionaryFile(raw: string, extension = ''): ParsedDictionary {
  const text = raw.replace(/^\uFEFF/, '')
  // Binary content read as text: not a word list.
  if (text.includes('\u0000')) return { ok: false }
  const ext = extension.toLowerCase()
  if (ext === 'json') return fromJson(text)
  if (/^\s*[[{]/.test(text)) {
    const asJson = fromJson(text)
    if (asJson.ok) return asJson
  }
  return fromCsv(text, ext)
}

/**
 * Fold a file's words into the list. A word the list already hears
 * takes the file's spelling in place; a new word goes at the end, until
 * the list is full. The list's own order never changes, and entries the
 * file does not name are left exactly as they were.
 */
export function mergeDictionary(
  current: readonly DictionaryEntry[],
  incoming: readonly DictionaryEntry[],
  max = MAX_DICTIONARY_ENTRIES
): MergePlan {
  const next = current.map((entry) => ({ ...entry }))
  const at = new Map<string, number>()
  next.forEach((entry, i) => {
    if (typeof entry.from === 'string' && !at.has(keyOf(entry.from))) at.set(keyOf(entry.from), i)
  })
  const plan: MergePlan = { next, added: 0, addedWords: [], changed: 0, changedWords: [], same: 0, left: 0 }
  for (const entry of incoming) {
    const key = keyOf(entry.from)
    const index = at.get(key)
    if (index === undefined) {
      if (next.length >= max) {
        plan.left += 1
        continue
      }
      at.set(key, next.length)
      next.push({ from: entry.from, to: entry.to })
      plan.added += 1
      if (plan.addedWords.length < 3) {
        plan.addedWords.push(
          entry.from === entry.to ? shortWord(entry.to) : `${shortWord(entry.from)} → ${shortWord(entry.to)}`
        )
      }
    } else if (String(next[index].to ?? '').trim() === entry.to) {
      plan.same += 1
    } else {
      if (plan.changedWords.length < 3) plan.changedWords.push(shortWord(String(next[index].from).trim()))
      next[index] = { from: next[index].from, to: entry.to }
      plan.changed += 1
    }
  }
  return plan
}

/** The entries worth writing to a file: both sides present, trimmed. */
export function exportable(entries: readonly unknown[]): DictionaryEntry[] {
  const out: DictionaryEntry[] = []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue
    const { from, to } = entry as Record<string, unknown>
    if (typeof from !== 'string' || typeof to !== 'string') continue
    if (from.trim() === '' || to.trim() === '') continue
    out.push({ from: from.trim(), to: to.trim() })
  }
  return out
}

/** A CSV cell. A spreadsheet runs a cell that starts with =, +, - or @
 *  as a formula, and a word list can come from someone else's file, so
 *  those get ' in front; parseDictionaryFile takes it off again. A word
 *  that really starts with ' and then one of those gets a second ', so
 *  it comes back whole too. */
function cell(value: string): string {
  const guarded = /^'*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${guarded.replace(/"/g, '""')}"`
}

/** The list as CSV a spreadsheet opens: a header row, quoted cells, and
 *  a byte order mark so accented names read right in Excel. */
export function dictionaryCsv(entries: readonly unknown[]): string {
  const rows = exportable(entries).map((entry) => `${cell(entry.from)},${cell(entry.to)}`)
  return `\uFEFF${['"heard as","written as"', ...rows].join('\r\n')}\r\n`
}

/** The list as JSON: an array of { from, to }, the shape settings use. */
export function dictionaryJson(entries: readonly unknown[]): string {
  return `${JSON.stringify(exportable(entries), null, 2)}\n`
}

/** What goes in the file the person named: JSON for a name ending in
 *  .json, CSV for anything else. */
export function dictionaryFileText(entries: readonly unknown[], fileName: string): { text: string; format: 'csv' | 'json' } {
  return /\.json$/i.test(fileName.trim())
    ? { text: dictionaryJson(entries), format: 'json' }
    : { text: dictionaryCsv(entries), format: 'csv' }
}

// ---- What the settings window says ---------------------------------

const count = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** What a file needs, and where the reader can go wrong: the note a
 *  person opens beside Import, before they pick a file (LB, 2026-11-21:
 *  the limits are said where the feature is used, never only in docs). */
export const FILE_TIPS: readonly string[] = [
  '1 line per word, in 2 columns: heard as, then written as, with a comma, a tab or a semicolon between them. For example: shivon,Siobhan',
  'A word that holds a comma or semicolon, and a note that holds a comma, tab or semicolon, needs double quotes around it, or its line can split in the wrong place. A spreadsheet adds them when it saves as CSV, so never type them into a cell. In a text editor, type them yourself.',
  'Keep every word and note on 1 line. A cell with a line break inside it is skipped, or can come in as stray words.',
  'Accented names read right from a file saved as CSV UTF-8 or as Unicode text, and from plain CSV saved by Excel on a Windows set to English or a Western European language. From any other encoding they come out as wrong letters.',
  `A file can be ${MAX_DICTIONARY_FILE_BYTES / 1_000_000} MB at most, a word ${MAX_ENTRY_CHARS} characters, and the dictionary ${MAX_DICTIONARY_ENTRIES.toLocaleString('en-US')} words. A word cannot hold a tab.`,
  'murmur shows the first 3 new words and asks before it imports. If they are cut in the wrong place, cancel and fix the file. A mistake further down a long file does not show there, and an import has no undo, so look the file over first.'
]

/** A file name short enough for 1 line of a question. */
export function shortName(name: string): string {
  return name.length > 40 ? `${name.slice(0, 37)}...` : name
}

/** A word short enough to name in a question: a typed entry has no
 *  length limit. */
function shortWord(word: string): string {
  return word.length > 30 ? `${word.slice(0, 27)}...` : word
}

type Ready = Extract<DictionaryPick, { status: 'ready' }>

/** Up to 3 words in brackets, with "and more" when there are others.
 *  Semicolons between them, because a word may hold a comma. */
const named = (words: readonly string[], total: number): string =>
  words.length === 0 ? '' : ` (${words.join('; ')}${total > words.length ? '; and more' : ''})`

/** The question asked before a file changes the list, or null when the
 *  file would change nothing. */
export function importQuestion(pick: Ready): string | null {
  if (pick.added + pick.changed === 0) return null
  const parts: string[] = []
  if (pick.added > 0) parts.push(`adds ${count(pick.added, 'word', 'words')}${named(pick.addedWords, pick.added)}`)
  if (pick.changed > 0) {
    parts.push(
      `changes the spelling of ${count(pick.changed, 'word', 'words')} you have${named(pick.changedWords, pick.changed)}`
    )
  }
  const lines = [`Import ${shortName(pick.name)}? It ${parts.join(' and ')}.`]
  const rest = importAsides(pick)
  if (rest !== '') lines.push(rest)
  return lines.join(' ')
}

function importAsides(pick: Ready): string {
  const asides: string[] = []
  if (pick.same > 0) asides.push(`${count(pick.same, 'word is', 'words are')} already here.`)
  if (pick.left > 0) {
    asides.push(
      `${count(pick.left, 'word does', 'words do')} not fit: an import stops at ${MAX_DICTIONARY_ENTRIES.toLocaleString('en-US')} words.`
    )
  }
  if (pick.unread > 0) asides.push(`${count(pick.unread, 'entry', 'entries')} could not be read.`)
  if (pick.heading !== null) asides.push(`The first line (${pick.heading}) was read as a heading.`)
  return asides.join(' ')
}

/** What the row says when a picked file leads to no question. */
export function pickMessage(pick: DictionaryPick): string {
  if (pick.status === 'cancelled') return ''
  if (pick.status === 'too-big') return 'That file is too big for a word list. 1 MB is the most murmur opens.'
  if (pick.status === 'unreadable') return 'murmur could not read that file. It takes a CSV or JSON list of words.'
  if (pick.added + pick.changed > 0) return ''
  const name = shortName(pick.name)
  if (pick.same === 0 && pick.left === 0) {
    const heading = pick.heading === null ? '' : ` The first line (${pick.heading}) was read as a heading.`
    return `No words could be read from ${name}. murmur takes a CSV or JSON list of words.${heading}`
  }
  return `Nothing to import from ${name}. ${importAsides(pick)}`
}

export function importedMessage(result: DictionaryImported): string {
  if (result.status === 'stale') return 'That import is no longer waiting. Pick the file again.'
  const parts: string[] = []
  if (result.added > 0) parts.push(`added ${count(result.added, 'word', 'words')}`)
  if (result.changed > 0) parts.push(`changed ${count(result.changed, 'word', 'words')}`)
  if (parts.length === 0) return 'Nothing changed: the words were already here.'
  const line = parts.join(' and ')
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`
}

export function exportedMessage(result: DictionaryExported): string {
  if (result.status === 'saved') return `Saved ${count(result.count, 'word', 'words')}.`
  if (result.status === 'failed') return 'Could not save the file. Try another folder.'
  if (result.status === 'empty') return 'There are no words to export yet.'
  return ''
}
