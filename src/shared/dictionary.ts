// SPDX-License-Identifier: GPL-3.0-only
// The custom dictionary: deterministic replacements applied to the raw
// transcript before formatting, so proper nouns land right even when
// the speech model spells them wrong. Pure and word-boundary safe: a
// dictionary can only ever change words that were actually spoken.

export interface DictionaryEntry {
  from: string
  to: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Entries may come from a hand-edited settings file: trust nothing. */
function isUsableEntry(e: unknown): e is DictionaryEntry {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as DictionaryEntry).from === 'string' &&
    typeof (e as DictionaryEntry).to === 'string' &&
    (e as DictionaryEntry).from.trim().length > 0 &&
    (e as DictionaryEntry).to.trim().length > 0
  )
}

/** Whole-word/phrase matcher shared with expansions. */
export function boundaryPattern(term: string): RegExp {
  // \b only works against word characters; terms ending in symbols
  // (c++) get whitespace-or-edge lookarounds instead.
  const lead = /^\w/.test(term) ? '\\b' : '(?<!\\S)'
  const tail = /\w$/.test(term) ? '\\b' : '(?!\\S)'
  return new RegExp(`${lead}${escapeRegExp(term)}${tail}`, 'gi')
}

/**
 * Replace each entry's `from` (case-insensitive, whole words, multi-word
 * phrases allowed) with its `to`, exactly as written. Longer phrases win
 * over shorter ones. Invalid entries are skipped, never thrown.
 */
export function applyDictionary(text: string, entries: readonly unknown[]): string {
  let out = text
  const usable = entries.filter(isUsableEntry).sort((a, b) => b.from.length - a.from.length)
  for (const entry of usable) {
    out = out.replace(boundaryPattern(entry.from.trim()), entry.to.trim())
  }
  return out
}

/**
 * Re-assert each entry's exact `to` casing wherever it appears, however
 * cased. Runs LAST in the pipeline, after auto-capitalization and the
 * cleanup model, so "exactly your casing" survives a sentence start
 * (an entry written lowercase stays lowercase, brand names included).
 */
export function enforceDictionaryCasing(text: string, entries: readonly unknown[]): string {
  let out = text
  for (const entry of entries.filter(isUsableEntry)) {
    out = out.replace(boundaryPattern(entry.to.trim()), entry.to.trim())
  }
  return out
}

/**
 * One line of cleanup-model hint text, or null for an empty dictionary.
 * The "Preferred spellings" opener is load-bearing: the LLM layer uses
 * it as a sentinel to catch hint text echoed into output.
 */
export function dictionaryHint(entries: readonly unknown[]): string | null {
  const usable = entries.filter(isUsableEntry)
  if (usable.length === 0) return null
  const pairs = usable.map((e) => `"${e.from.trim()}" is written "${e.to.trim()}"`).join('; ')
  return `Preferred spellings, apply ONLY where these words already occur: ${pairs}.`
}
