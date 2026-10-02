// SPDX-License-Identifier: GPL-3.0-only
// The note receipt (US-082): what a saved note's notification, the
// tray's Open last note, and Home's last note row say, and where they
// point. Pure, so every surface words it the same way and tests can
// pin it without Electron.

/** Where a note or a sorted line landed: the inbox file it was spoken
 *  into, or the tasks and ideas files a sort copied lines to. */
export interface ReceiptPlace {
  kind: 'inbox' | 'tasks' | 'ideas'
  /** Absolute path; the opener checks it is a real note before use. */
  file: string
  /** Relative to the folder it landed in, for the words. */
  relative: string
}

/** The newest note, as the receipt surfaces show it. */
export interface LastNote {
  at: number
  /** The note's first line, cut to fit a notification. */
  line: string
  /** The notes folder, or murmur's data folder after a redirect. */
  location: 'folder' | 'fallback'
  inbox: ReceiptPlace
  /** Files a sort copied lines into, tasks first; empty until one does. */
  sorted: ReceiptPlace[]
}

export const RECEIPT_LINE_MAX = 80
// The pill's window is 340 px; noted to plus ten characters of mono
// leaves the bars their room in every look (overlayLooks proves it).
const PILL_PLACE_MAX = 10

// List markers, checkboxes, headings, and quotes say nothing about the
// note, so the first line starts after them.
const MARKUP = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,6}\s+|>\s*)/

/** The note's first line with any markdown lead stripped, cut near
 *  `max` characters at a word when one is close. */
export function receiptLine(text: string, max = RECEIPT_LINE_MAX): string {
  const first =
    text
      .split(/\r?\n/)
      .map((line) => line.replace(MARKUP, '').replace(/\s+/g, ' ').trim())
      .find((line) => line !== '') ?? ''
  if (first.length <= max) return first
  const cut = first.slice(0, max)
  // A cut that already ends a word keeps that word.
  const space = first[max] === ' ' ? max : cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`
}

const segmentsOf = (relative: string): string[] => relative.split(/[\\/]/).filter((s) => s !== '')
const dateLike = (name: string): boolean => /^\d[\d._-]*$/.test(name.replace(/\.[^.]+$/, ''))

/** A file named for a place a person recognizes: todo.md, or
 *  inbox/2026-10-02.md when the file is named only by its date. */
export function placeName(relative: string): string {
  const parts = segmentsOf(relative)
  const name = parts[parts.length - 1] ?? relative
  return dateLike(name) && parts.length >= 2 ? `${parts[parts.length - 2]}/${name}` : name
}

/** The word the pill says after noted to: the folder for a dated
 *  daily file (inbox), else the file's name without .md, and murmur
 *  for murmur's own data folder (the receipt spells that one out). */
export function pillPlace(relative: string, location: LastNote['location']): string {
  if (location === 'fallback') return 'murmur'
  const parts = segmentsOf(relative)
  const name = parts[parts.length - 1] ?? ''
  const word = dateLike(name) && parts.length >= 2 ? parts[parts.length - 2] : name.replace(/\.(md|txt)$/i, '')
  return word.length > PILL_PLACE_MAX ? `${word.slice(0, PILL_PLACE_MAX - 1)}…` : word
}

/** Where a click goes: the first file a sort filed into, else the inbox. */
export function receiptTarget(note: LastNote): ReceiptPlace {
  return note.sorted[0] ?? note.inbox
}

export function receiptTitle(note: LastNote): string {
  if (note.sorted.length > 0) {
    const more = note.sorted.length - 1
    return `Sorted into ${placeName(note.sorted[0].relative)}${more > 0 ? ` and ${more} more` : ''}`
  }
  if (note.location === 'fallback') return "Noted to murmur's data folder"
  return `Noted to ${placeName(note.inbox.relative)}`
}

/** Home's words for where the note is: the inbox, then what a sort filed. */
export function receiptWhere(note: LastNote): string {
  const inbox = note.location === 'fallback' ? `murmur's data folder, ${placeName(note.inbox.relative)}` : placeName(note.inbox.relative)
  if (note.sorted.length === 0) return inbox
  const filed = note.sorted.map((p) => placeName(p.relative))
  return `${inbox}, filed to ${filed.length === 1 ? filed[0] : `${filed.slice(0, -1).join(', ')} and ${filed[filed.length - 1]}`}`
}

/** The reveal action names the platform's file manager. */
export function revealLabel(platform: string): string {
  return platform === 'darwin' ? 'Show in Finder' : 'Open folder'
}

function parsePlace(raw: unknown): ReceiptPlace | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  if (p.kind !== 'inbox' && p.kind !== 'tasks' && p.kind !== 'ideas') return null
  if (typeof p.file !== 'string' || p.file === '' || typeof p.relative !== 'string') return null
  return { kind: p.kind, file: p.file, relative: p.relative }
}

/** A last note read back from disk, or null when any part is off. */
export function parseLastNote(raw: unknown): LastNote | null {
  if (typeof raw !== 'object' || raw === null) return null
  const n = raw as Record<string, unknown>
  if (typeof n.at !== 'number' || !Number.isFinite(n.at) || typeof n.line !== 'string') return null
  if (n.location !== 'folder' && n.location !== 'fallback') return null
  const inbox = parsePlace(n.inbox)
  if (!inbox || inbox.kind !== 'inbox' || !Array.isArray(n.sorted)) return null
  const sorted = n.sorted.map(parsePlace)
  if (sorted.some((p) => p === null || p.kind === 'inbox')) return null
  return { at: n.at, line: n.line, location: n.location, inbox, sorted: sorted as ReceiptPlace[] }
}
