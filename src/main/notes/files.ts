// SPDX-License-Identifier: GPL-3.0-only
// Append-only file writes for the notes folder, shared by the inbox
// writer and the sorter. A vault synced by iCloud, Dropbox, or Obsidian
// Sync never sees a whole-file rewrite it could conflict on.
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { type NotePathResult, appendSeparator, resolveNotePath } from '../../shared/notes'
import { getSettings } from '../settings'
import { writeAppLog } from '../window-watch'

/** Where a note lands when the notes folder cannot be written. */
export function fallbackDir(): string {
  return join(app.getPath('userData'), 'notes')
}

/** The configured notes folder, trimmed; '' when note mode is off. */
export function notesFolder(): string {
  return getSettings().notes.folder.trim()
}

/** Where notes live, in the order anything reading them should look:
 *  the configured folder first, then the data folder a redirect uses. */
export function notesBases(): string[] {
  const folder = notesFolder()
  return folder !== '' ? [folder, fallbackDir()] : [fallbackDir()]
}

/** A file's text, or '' when it does not exist yet. */
export function fileText(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** The last byte of a file as text; null when missing, '' when empty. */
export function fileTail(file: string): string | null {
  if (!existsSync(file)) return null
  const size = statSync(file).size
  if (size === 0) return ''
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(1)
    readSync(fd, buf, 0, 1, size - 1)
    return buf.toString('utf8')
  } finally {
    closeSync(fd)
  }
}

/** Append an entry so it starts on its own line, creating the file's
 *  own subfolders (never the notes folder itself: callers check that). */
export function appendEntry(file: string, entry: string): void {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${appendSeparator(fileTail(file))}${entry}`, 'utf8')
}

/** A path template resolved for a moment, or the default layout with a
 *  log line when the template fails: a typo in settings never costs a
 *  note or a filed line. */
export function resolveTemplateOrDefault(
  template: string,
  fallback: string,
  when: Date,
  what: string
): Extract<NotePathResult, { ok: true }> {
  const attempt = resolveNotePath(template, when)
  if (attempt.ok) return attempt
  writeAppLog(`[notes] ${what} template failed reason=${attempt.reason}; using the default layout`)
  const safe = resolveNotePath(fallback, when)
  if (!safe.ok) throw new Error(`default ${what} template failed to resolve`)
  return safe
}

export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string') return code
  return error instanceof Error ? error.name : 'unknown'
}
