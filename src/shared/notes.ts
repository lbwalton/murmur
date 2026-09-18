// SPDX-License-Identifier: GPL-3.0-only
// Note templates and the path guard, pure and shared: main renders and
// writes, the settings page previews, tests cover both. A note is a
// dictation whose destination is a markdown file instead of the cursor,
// so the one rule that matters here is that the words always land.

export const DEFAULT_NOTE_PATH_TEMPLATE = 'murmur/inbox/{date}.md'
export const DEFAULT_NOTE_ENTRY_TEMPLATE = '## {time}\n\n{text}\n\n'

/** What the pill says when the note chord fires with no folder set.
 *  One constant, so the overlay smoke check measures the real text. */
export const NOTE_FOLDER_HINT = 'set a notes folder in settings'

/** Tokens a template may use. {text} is the dictation itself and only
 *  makes sense in the entry template; inside a path it stays literal. */
export const NOTE_TOKENS = ['date', 'time', 'datetime', 'year', 'month', 'day', 'text'] as const

export interface NoteMoment {
  date: string
  time: string
  datetime: string
  year: string
  month: string
  day: string
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local, zero-padded time tokens: the file is for a human, so the
 *  day boundary is the user's own, never UTC. */
export function noteMoment(when: Date): NoteMoment {
  const year = String(when.getFullYear())
  const month = pad(when.getMonth() + 1)
  const day = pad(when.getDate())
  const date = `${year}-${month}-${day}`
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}`
  return { date, time, datetime: `${date} ${time}`, year, month, day }
}

/** Replace {token} for every key in values; unknown tokens stay literal
 *  so a typo is visible in the preview instead of silently vanishing. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z]+)\}/g, (whole, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole
  })
}

export type NotePathProblem = 'empty' | 'absolute' | 'escapes' | 'extension' | 'characters' | 'reserved'

export type NotePathResult =
  | { ok: true; relative: string; segments: string[] }
  | { ok: false; reason: NotePathProblem }

// Windows refuses these in any file name; macOS only refuses the slash
// and NUL, so the stricter set applies everywhere and a vault synced
// across both platforms never holds a name one side cannot read.
// eslint-disable-next-line no-control-regex
const BAD_SEGMENT_CHARS = /[<>:"|?*\x00-\x1f]/
// Windows device names: CON.md opens the console, and an append into it
// "succeeds" into nowhere, so the fallback would never fire.
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const ALLOWED_EXTENSION = /^(.+)\.(md|txt)$/i

/**
 * Resolve a path template (relative to the notes folder) for a moment
 * in time. Time tokens render filename-safe here (10-32, not 10:32).
 * The result is a list of clean segments the writer joins with the
 * platform separator, and it can only ever point inside the folder.
 */
export function resolveNotePath(template: string, when: Date): NotePathResult {
  const moment = noteMoment(when)
  const safe: Record<string, string> = {
    ...moment,
    time: moment.time.replace(':', '-'),
    datetime: moment.datetime.replace(':', '-')
  }
  const rendered = renderTemplate(template, safe).trim().replace(/\\/g, '/')
  if (rendered.length === 0) return { ok: false, reason: 'empty' }
  if (rendered.startsWith('/') || rendered.startsWith('~') || /^[a-zA-Z]:/.test(rendered)) {
    return { ok: false, reason: 'absolute' }
  }
  const segments = rendered.split('/').filter((s) => s.length > 0)
  if (segments.some((s) => s === '.' || s === '..')) return { ok: false, reason: 'escapes' }
  if (segments.some((s) => BAD_SEGMENT_CHARS.test(s) || /[. ]$/.test(s))) {
    return { ok: false, reason: 'characters' }
  }
  if (segments.some((s) => RESERVED_NAME.test(s))) return { ok: false, reason: 'reserved' }
  const last = segments[segments.length - 1]
  if (!last || !ALLOWED_EXTENSION.test(last)) return { ok: false, reason: 'extension' }
  return { ok: true, relative: segments.join('/'), segments }
}

/**
 * Render one entry. The dictated text is substituted last and only
 * once, so tokens spoken aloud never expand, and a template that lost
 * its {text} token (or is empty) falls back to the default: the words
 * always land. The result ends in one newline, or two when the template
 * asks for a blank line after the entry (the default does, so headed
 * entries breathe; a list-line template keeps its items tight).
 */
export function renderNoteEntry(template: string, text: string, when: Date): string {
  const usable = template.includes('{text}') ? template : DEFAULT_NOTE_ENTRY_TEMPLATE
  const values: Record<string, string> = { ...noteMoment(when) }
  const withTime = renderTemplate(usable, values)
  const body = withTime.split('{text}').join(text)
  const trailing = /\n\n$/.test(body) ? '\n\n' : '\n'
  return `${body.replace(/\n+$/, '')}${trailing}`
}

/** What to write before an entry so it starts on its own line: nothing
 *  for a new or empty file, a newline for one whose tail lacks it. */
export function appendSeparator(existingTail: string | null): string {
  if (existingTail === null || existingTail.length === 0) return ''
  return existingTail.endsWith('\n') ? '' : '\n'
}
