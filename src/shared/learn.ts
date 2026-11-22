// SPDX-License-Identifier: GPL-3.0-only
// Learning a spelling from a fix (US-184, US-185). Pure and free of
// Electron, so every rule here is unit tested.
//
// murmur writes a take, and the person changes a word of it. This file
// answers 1 question: is that change a spelling murmur should remember,
// and if so, which words would the dictionary have to hear next time?
// Every rule fails closed: a change that is not plainly a small spelling
// fix inside murmur's own words is no fix at all, and nothing here ever
// adds a word by itself. A fix seen in enough takes becomes a suggestion
// the person says yes or no to.
import { type DictionaryEntry, applyDictionary, boundaryPattern } from './dictionary'
import { KEEP_FOREVER, KEEP_NO_TEXT } from './history'

/** How many takes must show the same fix before murmur suggests it. */
export const LEARN_REPEATS = 2
/** A fix is a name or a term, never a rewrite: this many words a side. */
export const MAX_FIX_WORDS = 3
/** And this many characters a side. */
export const MAX_FIX_CHARS = 40
/** The longest take murmur looks for fixes in, in words. */
export const MAX_TAKE_WORDS = 400
/** The most fixes 1 take can teach: more than this is a rewrite. */
export const MAX_FIXES_PER_TAKE = 3
/** How long murmur looks at the box it typed into, in seconds. */
export const LEARN_WATCH_SECONDS = 60
/** The most fixes murmur remembers while it counts them. */
export const MAX_CANDIDATES = 300

/** What counts as a change to a take. The watcher script is built from
 *  these same numbers (src/main/learn/watch-script.ts), so the script
 *  that reads the box and the code that reads its answer cannot drift. */
export const CHANGE_RULES = {
  /** A change is this many words a side at most, */
  maxWords: MAX_FIX_WORDS,
  /** and this many characters. */
  maxChars: MAX_FIX_CHARS,
  /** This many of the take's words must still be there, */
  minStay: 3,
  /** and this share of them: less, and the text is a different one. */
  stayShare: 0.6,
  /** More changes than this in 1 take is a rewrite, and teaches nothing. */
  maxChanges: MAX_FIXES_PER_TAKE,
  /** The words in a change's place are about as long as the words that
   *  went: at most this many times their length, or this many characters
   *  more, whichever is longer. A clause where a name stood is no fix. */
  growTimes: 2,
  growBy: 8
} as const

/** Whether what stands in a change's place is short enough to be a fix. */
export const fitsInPlace = (heard: string, written: string): boolean =>
  written.length <= Math.max(heard.length * CHANGE_RULES.growTimes, heard.length + CHANGE_RULES.growBy)

export interface Fix {
  /** What the dictionary would hear in the transcript. */
  heard: string
  /** What the person wrote in its place. */
  written: string
}

interface Token {
  text: string
  start: number
  end: number
}

// A word: letters and digits, with marks inside it that belong to a
// name or a term (O'Brien, node.js, re-do) and a tail of + or # (c++).
// Punctuation around a word is never part of it, so "today." and
// "today" are the same word.
// Marks that ride on a letter (an accent typed as its own character, a
// vowel sign) belong to the word: without them a fixed name is cut short.
export const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’._+#&/-]+[\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*[+#]*/gu

function tokens(text: string): Token[] {
  const out: Token[] = []
  for (const match of text.matchAll(WORD)) {
    out.push({ text: match[0], start: match.index, end: match.index + match[0].length })
  }
  return out
}

/** Pairs of indexes (a, b) where the 2 lists hold the same word, in
 *  order: the longest such run of pairs. */
function align(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint16Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  const pairs: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i++
    else j++
  }
  return pairs
}

interface Gap {
  /** Words of the first text between 2 matches: [from, to). */
  a: [number, number]
  /** Words of the second text in the same place. */
  b: [number, number]
}

function gaps(pairs: ReadonlyArray<[number, number]>, aLength: number, bLength: number): Gap[] {
  const out: Gap[] = []
  let ai = 0
  let bi = 0
  for (const [pa, pb] of [...pairs, [aLength, bLength] as [number, number]]) {
    if (pa > ai || pb > bi) out.push({ a: [ai, pa], b: [bi, pb] })
    ai = pa + 1
    bi = pb + 1
  }
  return out
}

const span = (text: string, list: readonly Token[], range: [number, number]): string =>
  range[1] > range[0] ? text.slice(list[range[0]].start, list[range[1] - 1].end) : ''

// Words so common that hearing them as something else, every time,
// would wreck ordinary sentences: a fix whose heard side is made only
// of these is never a dictionary word (their and there, to and too).
const COMMON = new Set(
  (
    'a an the to too two of off for four in on at by is it its it\'s there their they\'re then than your you\'re ' +
    'were we\'re where here hear and or but so if as be been are was has have had do does did done not no know now ' +
    'new knew i me my we us our you he she him her his they them this that these those with from will would can ' +
    'could should may might must what when who whom which why how all any some one won right write buy bye up ' +
    'out about into over after before again more most very just also only even still back down get got go going ' +
    'went come came make made take took see saw say said tell told think thought want need like time day week ' +
    'year yes yeah ok okay please thanks thank hi hello every everyday everyone anyone someone maybe cannot onto ' +
    'well way part mr ms mrs dr ' +
    // Short forms: a rule on 1 of these would undo a not, or a have.
    'won\'t can\'t don\'t isn\'t aren\'t wasn\'t weren\'t doesn\'t didn\'t hasn\'t haven\'t hadn\'t wouldn\'t ' +
    'couldn\'t shouldn\'t i\'m i\'ve i\'ll i\'d you\'ll you\'ve you\'d he\'s she\'s we\'ve we\'ll they\'ve they\'ll ' +
    'that\'s what\'s let\'s there\'s here\'s ' +
    // Words people mean differently, not spell differently.
    'affect effect accept except lose loose advice advise quite quiet weather whether principal principle past passed'
  ).split(' ')
)

// Words that stand for a day, a month, a number, a time or a
// direction. Changing 1 of these to another changes what was meant
// (Tuesday for Thursday), so a pair that lands on 1, or starts from 1,
// is never a spelling. Casing alone still is (monday, Monday).
const CLOSED = new Set(
  (
    'monday tuesday wednesday thursday friday saturday sunday january february march april june july august ' +
    'september october november december today tomorrow yesterday tonight morning afternoon evening night noon ' +
    'midnight am pm north south east west left up down zero three five six seven eight nine ten eleven twelve ' +
    'thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ' +
    'ninety hundred thousand million billion first second third fourth fifth half quarter true false on off'
  ).split(' ')
)

// A word as these lists hold it: lowercase, a straight apostrophe, and
// without its digits or dots, so 10pm and p.m. are both pm.
const everyday = (word: string): boolean => {
  const plain = word.toLowerCase().replace(/’/g, "'")
  const bare = plain.replace(/[\d.]/g, '')
  return COMMON.has(plain) || CLOSED.has(plain) || (bare !== '' && (COMMON.has(bare) || CLOSED.has(bare)))
}
/** The numbers in a run of words, as written: 1.5 and 15 are 2 numbers. */
const numbers = (text: string): string => (text.match(/\d[\d.,]*\d|\d/g) ?? []).join(' ')

const squash = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
/** A run of words with its casing and spaces taken out, and nothing else. */
const loose = (text: string): string => text.toLowerCase().replace(/\s+/g, '')

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length]
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

const startsUpper = (text: string): boolean => /^\p{Lu}/u.test(text)

/**
 * Does the written side show it is a name or a term, and not 1 plain
 * word put in place of another? What the dictionary is for shows it: a
 * digit, a mark of a term (node.js, C#), a capital inside (GitHub), or
 * a capital the heard side did not have (shiv on, Siobhan), or a heard
 * name written small on purpose (Burma, murmur). 2 sides that both
 * simply start with a capital show nothing at the start of a sentence,
 * which starts that way whatever the word (Enable, Disable). A plain
 * lowercase word in place of another (enable
 * for disable, minutes for hours) is a change of meaning far more often
 * than a spelling, and is left to Fix a word, where the person says so.
 */
function looksLikeATerm(from: string, to: string, startsSentence: boolean): boolean {
  if (/[\p{N}._+#&/]/u.test(to)) return true
  if (/\p{Lu}/u.test(to.slice(1).replace(/\s+\p{Lu}/gu, ' '))) return true
  if (startsUpper(from) !== startsUpper(to)) return true
  // Both start with a capital: in the middle of a sentence that is a
  // name (Coopernetties, Kubernetes), and at its start it is only how
  // sentences begin.
  return startsUpper(to) && !startsSentence
}

/**
 * Is this pair a spelling murmur could remember? The 2 sides differ,
 * each is a short name or term on 1 line, no number changes, neither
 * side is made of everyday words, days, months or numbers alone, the
 * written side shows it is a name or a term, and it reads like the
 * heard one: a different word altogether (meeting for lunch) is an
 * edit of what was meant, never a spelling. This is a guess from the
 * letters, and 2 names that look alike can pass it, which is why a fix
 * is only ever suggested. `where` says whether the heard words begin a
 * sentence of the take, when that is known: a capital there is no sign
 * of a name.
 */
export function isSpellingFix(heard: string, written: string, where: { startsSentence?: boolean } = {}): boolean {
  const from = heard.trim()
  const to = written.trim()
  if (from === '' || to === '' || from === to) return false
  if (from.length > MAX_FIX_CHARS || to.length > MAX_FIX_CHARS) return false
  if (CONTROL.test(from) || CONTROL.test(to)) return false
  const fromWords = tokens(from)
  const toWords = tokens(to)
  if (fromWords.length === 0 || toWords.length === 0) return false
  if (fromWords.length > MAX_FIX_WORDS || toWords.length > MAX_FIX_WORDS) return false
  // The whole of each side is words: "word," or "(word" is a selection
  // that took punctuation with it.
  if (fromWords[0].start !== 0 || fromWords[fromWords.length - 1].end !== from.length) return false
  if (toWords[0].start !== 0 || toWords[toWords.length - 1].end !== to.length) return false
  // A rule on everyday words alone rewrites ordinary sentences, however
  // small the change (every day, everyday).
  if (fromWords.every((word) => COMMON.has(word.text.toLowerCase().replace(/’/g, "'")))) return false
  // A number is what was meant, never how it is spelled: both sides
  // need a letter, and a number the take held may not change (2025
  // for 2026, 1.5M for 15M). A number may appear where a word stood
  // (GPT four, GPT-4).
  if (!/\p{L}/u.test(from) || !/\p{L}/u.test(to)) return false
  if (numbers(from) !== '' && numbers(from) !== numbers(to)) return false
  // Casing and spacing alone (git hub, GitHub; monday, Monday) is
  // always a spelling. Marks are not casing: re-sign is not resign.
  if (loose(from) === loose(to)) return true
  // A pair that starts from, or lands on, nothing but everyday words,
  // days, months, numbers or directions changes what was meant.
  if (fromWords.every((word) => everyday(word.text)) || toWords.every((word) => everyday(word.text))) return false
  if (!looksLikeATerm(from, to, where.startsSentence === true)) return false
  const a = squash(from)
  const b = squash(to)
  if (a === '' || b === '') return false
  // A short word leaves little to go on (Jon for Tom): 1 letter apart
  // at most.
  if (Math.max(a.length, b.length) <= 4) return distance(a, b) <= 1
  return distance(a, b) / Math.max(a.length, b.length) <= 0.75
}

/**
 * The words the dictionary would have to hear for this fix to have
 * changed this take. The dictionary runs on the transcript, before
 * cleanup, and the person fixed the cleaned text: when cleanup left
 * the heard words alone they are the answer, and when it changed them
 * the answer is the transcript's own words in the same place. Null
 * when the transcript holds neither, so no rule is ever suggested
 * that would not have changed the take it came from. `chosen` is a
 * pair the person typed themselves (Fix a word): it is theirs to make,
 * so the spelling guess is not asked of it.
 */
export function heardInTranscript(raw: string, final: string, heard: string, written: string, chosen = false): string | null {
  const works = (from: string): boolean =>
    from.trim() !== '' && applyDictionary(raw, [{ from, to: written }]) !== raw
  if (works(heard)) return heard.trim()
  // Find the heard words in the cleaned text, then the transcript's
  // words between the same neighbours.
  const finalWords = tokens(final)
  const rawWords = tokens(raw)
  if (finalWords.length > MAX_TAKE_WORDS || rawWords.length > MAX_TAKE_WORDS) return null
  const found = [...final.matchAll(boundaryPattern(heard.trim()))]
  if (found.length !== 1) return null
  const from = finalWords.findIndex((word) => word.start >= found[0].index)
  const to = finalWords.findIndex((word) => word.start >= found[0].index + found[0][0].length)
  if (from === -1) return null
  const range: [number, number] = [from, to === -1 ? finalWords.length : to]
  const lower = (list: readonly Token[]): string[] => list.map((word) => word.text.toLowerCase())
  const gap = gaps(align(lower(finalWords), lower(rawWords)), finalWords.length, rawWords.length).find(
    (candidate) => candidate.a[0] <= range[0] && candidate.a[1] >= range[1]
  )
  // The cleaned words must be the whole of what cleanup changed there:
  // a wider change is cleanup's rewrite, and no place to learn from.
  if (!gap || gap.a[0] !== range[0] || gap.a[1] !== range[1]) return null
  const inRaw = span(raw, rawWords, gap.b)
  if (!works(inRaw)) return null
  return chosen || isSpellingFix(inRaw, written) ? inRaw : null
}

/**
 * The places where a take was changed: `final` is what murmur typed
 * and `edited` is how the same words read afterward. Each change is 1
 * to 3 of murmur's words gone and 1 to 3 words in their place; words
 * added or deleted are no change, nor is a longer run, nor a changed
 * number. Null when most of the take is no longer there, which makes
 * the text a different one. The watcher script holds this same rule in
 * its own language, and a unit test runs both on the same texts.
 */
export function changesIn(final: string, edited: string): Array<[string, string]> | null {
  const before = tokens(final)
  const after = tokens(edited)
  if (after.length === 0 || after.length > before.length * 2 + 200) return null
  const pairs = align(
    before.map((word) => word.text),
    after.map((word) => word.text)
  )
  if (pairs.length < CHANGE_RULES.minStay || pairs.length < before.length * CHANGE_RULES.stayShare) return null
  const found: Array<[string, string]> = []
  for (const gap of gaps(pairs, before.length, after.length)) {
    const gone = gap.a[1] - gap.a[0]
    const came = gap.b[1] - gap.b[0]
    if (gone < 1 || gone > CHANGE_RULES.maxWords || came < 1 || came > CHANGE_RULES.maxWords) continue
    const heard = span(final, before, gap.a)
    const written = span(edited, after, gap.b)
    if (heard.length > CHANGE_RULES.maxChars || written.length > CHANGE_RULES.maxChars || CONTROL.test(written)) continue
    if (!fitsInPlace(heard, written)) continue
    if (numbers(heard) !== '' && numbers(heard) !== numbers(written)) continue
    found.push([heard, written])
  }
  return found.length > CHANGE_RULES.maxChanges ? [] : found
}

/** Whether these words begin the take, or a sentence of it. */
function startsSentence(final: string, heard: string): boolean {
  const at = final.indexOf(heard)
  if (at === -1) return false
  const before = final.slice(0, at).trimEnd()
  return before === '' || /[.!?:\n]$/.test(before)
}

/**
 * The spelling fixes among a take's changes, as the dictionary would
 * have to hear them: `raw` is the transcript the dictionary ran on,
 * `final` what murmur typed, and each pair a change the watcher found.
 * A change that is not a spelling, or that no rule on the transcript
 * would have made, is dropped; a fix made twice counts once.
 */
export function fixesFromChanges(rawText: string, finalText: string, pairs: ReadonlyArray<readonly [string, string]>): Fix[] {
  if (pairs.length === 0 || pairs.length > CHANGE_RULES.maxChanges) return []
  // 1 spelling of each letter: an accent typed as its own character
  // is the same letter as the one that carries it.
  const raw = rawText.normalize('NFC')
  const final = finalText.normalize('NFC')
  const found: Fix[] = []
  for (const pair of pairs) {
    const heard = pair[0].normalize('NFC')
    const written = pair[1].normalize('NFC')
    if (!isSpellingFix(heard, written, { startsSentence: startsSentence(final, heard) })) continue
    const inRaw = heardInTranscript(raw, final, heard, written)
    if (inRaw === null) continue
    if (!found.some((fix) => fix.heard.toLowerCase() === inRaw.toLowerCase() && fix.written === written)) {
      found.push({ heard: inRaw, written })
    }
  }
  return found
}

/** The spelling fixes a person made to a take, from the 2 texts whole:
 *  what the watcher and the main process do between them. */
export function fixesIn(raw: string, final: string, edited: string): Fix[] {
  if (final === edited) return []
  if (tokens(final).length > MAX_TAKE_WORDS) return []
  const pairs = changesIn(final.normalize('NFC'), edited.normalize('NFC'))
  return pairs === null ? [] : fixesFromChanges(raw, final, pairs)
}

/** A take worth following: long enough to tell a fix from a new
 *  message (3 words that stay and 1 that changes), and short enough to
 *  read. */
export function worthWatching(final: string): boolean {
  const words = tokens(final).length
  return words > CHANGE_RULES.minStay && words <= MAX_TAKE_WORDS
}

/** What became of a pair handed to the dictionary. */
export type Taught = 'added' | 'changed' | 'same' | 'full'

/** What the pill says when the fix a word chord cannot start (US-184). */
export const FIX_HINTS = {
  /** The copy keystroke itself could not be sent. */
  unreadable: 'could not read the selection',
  /** Nothing came back from the copy: nothing is selected, or the app
   *  does not let a selection be copied. */
  select: 'select a word first',
  long: 'select 1 word or a short phrase',
  /** The panel came up and never got the keyboard. */
  nofocus: 'could not open the fix box'
} as const

/**
 * What the pill says once a spelling was typed: what happened to the
 * word in the app, then what happened to the pair. `inserted` means
 * murmur pressed paste; `copied` means the spelling waits on the
 * clipboard (copy only mode, or the paste key could not be pressed);
 * `error` means neither. `failed` is a pair that could not be saved.
 */
export function fixHint(outcome: 'inserted' | 'copied' | 'error', taught: Taught | 'failed'): string {
  const saved = taught === 'added' || taught === 'changed'
  if (outcome === 'inserted') {
    if (saved) return 'fixed and saved'
    if (taught === 'same') return 'fixed'
    return taught === 'full' ? 'fixed, your dictionary is full' : 'fixed, could not save'
  }
  if (outcome === 'copied') {
    if (saved) return 'saved, paste to fix'
    if (taught === 'same') return 'copied, paste to fix'
    return taught === 'full' ? 'copied, your dictionary is full' : 'copied, could not save'
  }
  if (saved) return 'saved, could not paste'
  return taught === 'full' ? 'could not paste, dictionary is full' : 'could not fix the word'
}

/** The longest selection the fix a word chord takes, in characters. */
export const MAX_SELECTION_CHARS = 80

/**
 * A selection the fix a word chord can teach from (US-184): 1 line, a
 * word or a short phrase. The person picked it, so no other rule
 * applies: they may teach murmur any word they like.
 */
export function selectionToFix(selection: string): string | null {
  const text = selection.trim()
  if (text === '' || text.length > MAX_SELECTION_CHARS) return null
  if (CONTROL.test(text)) return null
  return text
}

/** The spelling typed for a selection, or null when it changes nothing. */
export function typedFix(heard: string, typed: string): Fix | null {
  const written = typed.trim()
  if (written === '' || written === heard || written.length > MAX_SELECTION_CHARS || CONTROL.test(written)) return null
  return { heard, written }
}

// ---- Counting fixes until they are worth a question ----------------

export interface Candidate {
  heard: string
  written: string
  /** How many takes showed this fix. */
  count: number
  /** When it was first and last seen, in milliseconds. */
  first: number
  last: number
  /** The person said no: never suggested again while it is remembered. */
  dismissed?: boolean
}

const same = (candidate: Candidate, fix: Fix): boolean =>
  candidate.heard.toLowerCase() === fix.heard.toLowerCase() && candidate.written === fix.written

/** Candidates may come from a file: trust nothing in it. */
export function usableCandidates(list: unknown): Candidate[] {
  if (!Array.isArray(list)) return []
  const out: Candidate[] = []
  for (const item of list as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const { heard, written, count, first, last, dismissed } = item as Record<string, unknown>
    if (typeof heard !== 'string' || typeof written !== 'string') continue
    // A pair is kept as it would be matched: a stray space on a stored
    // side would make it a pair no answer could name.
    if (heard !== heard.trim() || written !== written.trim()) continue
    if (!isSpellingFix(heard, written)) continue
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) continue
    if (typeof first !== 'number' || typeof last !== 'number' || !Number.isFinite(first) || !Number.isFinite(last)) continue
    out.push({ heard, written, count, first, last, ...(dismissed === true ? { dismissed: true } : {}) })
    if (out.length >= MAX_CANDIDATES) break
  }
  return out
}

/** Count 1 take's fixes: a fix seen before counts 1 more, a new one
 *  starts at 1. The list never grows past its cap: the fixes seen
 *  longest ago go first. */
export function countFixes(list: readonly Candidate[], fixes: readonly Fix[], now: number): Candidate[] {
  const next = list.map((candidate) => ({ ...candidate }))
  for (const fix of fixes) {
    const known = next.find((candidate) => same(candidate, fix))
    if (known) {
      known.count += 1
      known.last = now
    } else if (isSpellingFix(fix.heard, fix.written)) {
      next.push({ heard: fix.heard, written: fix.written, count: 1, first: now, last: now })
    }
  }
  if (next.length <= MAX_CANDIDATES) return next
  // A no is kept before a count: a turned down pair pushed out by newer
  // fixes would be asked about again. Half the room, so that a long
  // list of noes can never keep every new fix out.
  const newest = (list: Candidate[]): Candidate[] => [...list].sort((a, b) => b.last - a.last)
  const noes = newest(next.filter((candidate) => candidate.dismissed === true)).slice(0, MAX_CANDIDATES / 2)
  const counts = newest(next.filter((candidate) => candidate.dismissed !== true)).slice(0, MAX_CANDIDATES - noes.length)
  return [...noes, ...counts]
}

/** Forget fixes on the schedule Keep history for sets for words: none
 *  are kept when it keeps no text, all when it keeps forever, and
 *  otherwise the ones last seen within its days. */
export function keepCandidates(list: readonly Candidate[], now: number, retentionDays: number): Candidate[] {
  if (retentionDays === KEEP_NO_TEXT || !Number.isFinite(retentionDays) || retentionDays < 0) return []
  if (retentionDays === KEEP_FOREVER) return [...list]
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
  return list.filter((candidate) => candidate.last >= cutoff)
}

/**
 * The fixes worth asking about: seen in enough takes, not turned down,
 * and not already what the dictionary does. Newest first.
 */
export function suggestionsFrom(list: readonly Candidate[], dictionary: readonly unknown[]): Candidate[] {
  const known = (candidate: Candidate): boolean =>
    dictionary.some((entry) => {
      const { from, to } = (entry ?? {}) as Partial<DictionaryEntry>
      return (
        typeof from === 'string' &&
        typeof to === 'string' &&
        from.trim().toLowerCase() === candidate.heard.toLowerCase() &&
        to.trim() === candidate.written
      )
    })
  return list
    .filter((candidate) => candidate.count >= LEARN_REPEATS && candidate.dismissed !== true && !known(candidate))
    .sort((a, b) => b.last - a.last)
}

/** Take 1 fix off the list (it was added), or mark it turned down. */
export function settleCandidate(list: readonly Candidate[], fix: Fix, how: 'added' | 'dismissed'): Candidate[] {
  if (how === 'added') return list.filter((candidate) => !same(candidate, fix))
  return list.map((candidate) => (same(candidate, fix) ? { ...candidate, dismissed: true } : candidate))
}

// ---- What the settings window and the notification say -------------

export const pairText = (fix: Fix): string => `${fix.heard} → ${fix.written}`

/** The line under a suggested pair. */
export function seenLine(count: number): string {
  return `You made this fix in ${count.toLocaleString('en-US')} takes.`
}

/** The notification when a fix is ready to ask about. It never holds
 *  the words: a notification stays in the system's list after murmur
 *  quits, where Hide words could not take it back. */
export const SUGGESTION_NOTICE = {
  title: 'murmur noticed a fix',
  body: 'A word you keep fixing is ready to add to your dictionary. Open Dictionary to look.'
} as const
