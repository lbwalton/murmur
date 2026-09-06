// SPDX-License-Identifier: GPL-3.0-only
// Text expansions: spoken trigger phrases become saved snippets. Runs
// LAST in the pipeline so triggers match clean formatted text, and the
// snippet inserts exactly as written (emails and sign-offs keep their
// casing and line breaks). Single-pass: snippet content is never
// rescanned, so an expansion can never trigger another expansion.
import { boundaryPattern } from './dictionary'

export interface ExpansionEntry {
  trigger: string
  text: string
}

/** Entries may come from a hand-edited settings file: trust nothing. */
function isUsableEntry(e: unknown): e is ExpansionEntry {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as ExpansionEntry).trigger === 'string' &&
    typeof (e as ExpansionEntry).text === 'string' &&
    (e as ExpansionEntry).trigger.trim().length > 0 &&
    (e as ExpansionEntry).text.trim().length > 0
  )
}

interface Match {
  start: number
  end: number
  replacement: string
}

/**
 * Replace each spoken trigger (case-insensitive, whole phrase) with its
 * snippet, verbatim. At the same position the longest trigger wins, and
 * matches never overlap: one expansion per utterance position.
 */
export function applyExpansions(text: string, entries: readonly unknown[]): string {
  const usable = entries.filter(isUsableEntry)
  if (usable.length === 0) return text

  const matches: Match[] = []
  for (const entry of usable) {
    for (const m of text.matchAll(boundaryPattern(entry.trigger.trim()))) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        replacement: entry.text
      })
    }
  }
  if (matches.length === 0) return text

  // Earliest first; at the same start the longest match wins.
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const parts: string[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start < cursor) continue // overlapped by an earlier winner
    parts.push(text.slice(cursor, match.start), match.replacement)
    cursor = match.end
  }
  parts.push(text.slice(cursor))
  return parts.join('')
}
