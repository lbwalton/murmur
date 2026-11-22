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

/** The most hint text 1 cleanup request carries, in characters (about
 *  500 tokens). An imported list can hold hundreds of names (US-183),
 *  and every pair in every request would cost a rate limit, or a 413. */
export const HINT_BUDGET_CHARS = 2_000

/**
 * One line of cleanup-model hint text, or null for an empty dictionary.
 * The "Preferred spellings" opener is load-bearing: the LLM layer uses
 * it as a sentinel to catch hint text echoed into output.
 *
 * A list that fits the budget goes whole, as it always has. A longer
 * one sends the pairs whose words are in this take first, then the
 * rest in list order while they fit. The dictionary has already run
 * over `text` by then, so a pair in use shows by its written side.
 */
export function dictionaryHint(
  entries: readonly unknown[],
  text?: string,
  budget = HINT_BUDGET_CHARS
): string | null {
  const usable = entries.filter(isUsableEntry)
  if (usable.length === 0) return null
  const phrase = (e: DictionaryEntry): string => `"${e.from.trim()}" is written "${e.to.trim()}"`
  const JOIN = '; '
  let phrases = usable.map(phrase)
  const size = phrases.reduce((sum, p) => sum + p.length, 0) + JOIN.length * (phrases.length - 1)
  if (size > budget) {
    const inTake = (e: DictionaryEntry): boolean =>
      text !== undefined && (boundaryPattern(e.to.trim()).test(text) || boundaryPattern(e.from.trim()).test(text))
    const first = new Set(usable.filter(inTake))
    const ordered = [...first, ...usable.filter((e) => !first.has(e))].map(phrase)
    phrases = []
    let used = 0
    for (const p of ordered) {
      const cost = p.length + (phrases.length > 0 ? JOIN.length : 0)
      if (used + cost > budget) continue
      phrases.push(p)
      used += cost
    }
    if (phrases.length === 0) return null
  }
  return `Preferred spellings, apply ONLY where these words already occur: ${phrases.join(JOIN)}.`
}
