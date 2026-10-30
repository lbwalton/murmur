// SPDX-License-Identifier: GPL-3.0-only
// The LLM cleanup pass. Iron law: this can only ever improve a
// transcript, never lose one. Any error, delay, chatter, refusal, or
// suspicious output falls back to the deterministic text it was given.
// Dictated instructions are content to transcribe, never commands. The
// prompt, the phrases, and the numbers live in shared/polish.json, which
// the iPhone reads too (ios/prd.json IOS-007); shared/polish-vectors.json
// keeps both platforms judging answers the same way.
import hallucinations from '../../../shared/hallucinations.json'
import polish from '../../../shared/polish.json'
import { isHallucination } from '../../shared/speech-gate'
import { appFetch } from '../net'

export interface PolishConfig {
  baseUrl: string
  model: string
  apiKey: string
}

export interface PolishOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Extra system-prompt lines, e.g. the dictionary spelling hint. */
  hints?: string[]
  /** Smart lists setting: list instructions and list-shaped output are
   *  allowed only when true. Off keeps prompt and validation exactly as
   *  they were. */
  smartLists?: boolean
  /** Apply corrections setting (US-105): correction instructions and a
   *  correction-sized cut are allowed only when true. Off keeps prompt
   *  and validation exactly as they were. */
  corrections?: boolean
  /** Called with a short reason whenever the pass falls back, so the
   *  caller can log WHY without this module knowing about log files. */
  onFallback?: (reason: string) => void
}

export const POLISH_SYSTEM_PROMPT = polish.systemPrompt.join(' ')

// Appended only when the smart lists setting is on. Plain markers only:
// pasted text must read correctly in apps that never render markdown.
// The scaffolding rule and the example are load-bearing: without them
// the model either keeps enumeration words inside items (1. then
// bacon) or collapses the list into a comma run, and the intro line
// must survive or the length guard rejects the whole transformation
// (live-found 2026-09-14, both shapes reproduced against the model).
export const SMART_LISTS_PROMPT = polish.smartListsPrompt.join(' ')

// Appended only when the apply corrections setting is on (US-105). The
// base prompt's one line about self-corrections loses to keep the
// speaker's words: probed 2026-10-17 on gpt-oss-120b, it fixed 10 of
// 50 spoken corrections. A definition that reaches into the next
// sentence, the cue words, and examples on both sides (one where the
// cue is real content) are what made the same model fix them.
export const CORRECTIONS_PROMPT = polish.correctionsPrompt.join(' ')

// The cue words a spoken correction turns on (correctionCues), matched
// whole and case blind, each escaped so it is always the words it says.
// A correction cut has to remove at least one of them; that is how
// validation tells a correction from a model deleting content. No is
// not one: no problem and no one are so common that dropping one must
// never unlock a deep cut (review gate, 2026-10-17), so no counts only as
// a paused cue, set off by pauses (pausedCueCount, IOS-030).
const CORRECTION_CUE = new RegExp(
  `\\b(?:${polish.correctionCues.map((cue) => cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'g'
)

const META_OPENERS = polish.metaOpeners

export type PolishVerdict = { ok: true; text: string } | { ok: false; reason: string }

// A list line as the smart lists prompt defines it: a dash or an
// ordered number prefix. Anything else is prose.
const LIST_LINE = /^(?:- |\d+\. )/

function isListBody(lines: string[]): boolean {
  const body = lines.slice(1).filter((line) => line.trim().length > 0)
  return body.length > 0 && body.every((line) => LIST_LINE.test(line))
}

// A whole output that IS a list: at least two list lines, and at most
// one prose line, which must be the intro at the top.
function isListShaped(lines: string[]): boolean {
  const nonEmpty = lines.filter((line) => line.trim().length > 0)
  const listLines = nonEmpty.filter((line) => LIST_LINE.test(line))
  if (listLines.length < 2) return false
  const prose = nonEmpty.filter((line) => !LIST_LINE.test(line))
  return prose.length === 0 || (prose.length === 1 && nonEmpty[0] === prose[0])
}

function listLineCount(lines: string[]): number {
  return lines.filter((line) => LIST_LINE.test(line)).length
}

// How many entries the spoken enumeration implies: the stronger of the
// enumerator-word count and the comma-run count. Word ratios cannot see
// a silently dropped item (review gate finding, 2026-09-14), but the
// speech itself says how many entries there should be. Overcounting
// from decorative commas only forces the prose fallback, the safe
// direction.
function impliedEntryCount(input: string): number {
  const enums = input.match(/\b(?:first|then|next|finally)\b/gi)?.length ?? 0
  // Item-separating commas plus one: N items in comma phrasing carry
  // N minus 1 commas, and the plus one reconstructs N. A comma that
  // starts a clause instead of an item (For my grocery list, I want)
  // must not count, or a perfect list gets rejected as missing an
  // entry (live-found 2026-09-15). When the heuristics are wrong the
  // bias must OVERCOUNT: an over-rejected list falls back to prose
  // and loses nothing, while an undercounted one can silently accept
  // a dropped entry, which the iron law forbids (review gate proof,
  // same day).
  const commas = input.match(/,/g)?.length ?? 0
  const clauseCommas = input.match(/,\s*(?:i|we|you|let's|please)\b/gi)?.length ?? 0
  const itemCommas = Math.max(0, commas - clauseCommas)
  return Math.max(enums, itemCommas >= 2 ? itemCommas + 1 : 0)
}

// Words as spoken: lowercase, one apostrophe, edge punctuation off, so
// "Let’s" in the output is the "let's" the speaker said.
function spokenWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => word.length > 0)
}

function cueCount(value: string): number {
  return spokenWords(value).join(' ').match(CORRECTION_CUE)?.length ?? 0
}

// A piece of the text that is anything but letters and numbers, the
// paused cue, a correctionPause mark, then anything but letters and
// numbers: No, and "No." are, No? and nobody, are not.
function isPausedCue(piece: string): boolean {
  const start = piece.search(/[\p{L}\p{N}]/u)
  if (start < 0) return false
  const rest = piece.slice(start)
  return polish.pausedCorrectionCues.some(
    (cue) =>
      rest.startsWith(cue) &&
      rest.length > cue.length &&
      polish.correctionPause.includes(rest[cue.length]) &&
      !/[\p{L}\p{N}]/u.test(rest.slice(cue.length + 1))
  )
}

// A paused cue is everyday speech (no problem, Is it done? No, Well, no,
// he said no.) unless it takes back what came just before, so it counts
// only with a pause on both sides: after a word that ends in a
// correctionPause mark and does not open a sentence, and once for a run
// (No, no, no,) (IOS-030).
function pausedCueCount(value: string): number {
  const pieces = value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/\s+/)
    .filter((piece) => piece.length > 0)
  const paused = pieces.map(isPausedCue)
  const last = (piece: string): string => piece[piece.length - 1]
  let count = 0
  for (let i = 2; i < pieces.length; i++) {
    const before = pieces[i - 1]
    if (
      paused[i] &&
      !paused[i - 1] &&
      /[\p{L}\p{N}]/u.test(before) &&
      polish.correctionPause.includes(last(before)) &&
      !polish.sentenceEnd.includes(last(pieces[i - 2]))
    )
      count++
  }
  return count
}

// The cues the answer dropped. A paused cue counts only when the listed
// cues all stayed (Sorry, no, takes back one thing, not two), less every
// time the answer still says the cue word: a No kept without its comma
// took nothing back, and neither did one kept while an everyday no went.
function correctionCuesDropped(input: string, answer: string): number {
  const listed = cueCount(input) - cueCount(answer)
  if (listed !== 0) return listed
  const kept = spokenWords(answer).filter((word) => polish.pausedCorrectionCues.includes(word)).length
  return Math.max(0, pausedCueCount(input) - kept)
}

// Every output word was spoken, counted as a multiset: a correction
// only removes words and moves the fix into place, so a word the
// speaker never said means a rewrite, never a correction. Order is
// not checked; a reorder loses nothing.
function onlySpokenWords(input: string, output: string): boolean {
  const left = new Map<string, number>()
  for (const word of spokenWords(input)) left.set(word, (left.get(word) ?? 0) + 1)
  for (const word of spokenWords(output)) {
    const count = left.get(word) ?? 0
    if (count === 0) return false
    left.set(word, count - 1)
  }
  return true
}

// A spoken number word (numberWords), or one whose hyphenated parts all
// are (twenty-first), which a cleanup may write as digits.
const NUMBER_WORDS = new Set(polish.numberWords)
function isNumberWord(word: string): boolean {
  return word.split('-').every((part) => NUMBER_WORDS.has(part))
}

function wordCounts(words: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
  return counts
}

function questionMarks(value: string): number {
  return [...value].filter((ch) => polish.questionMarks.includes(ch)).length
}

// Whether the text ends in a question: it holds a questionMarks mark and
// no letter or number after the last one.
function endsAsking(value: string): boolean {
  const chars = [...value]
  let last = -1
  chars.forEach((ch, i) => {
    if (polish.questionMarks.includes(ch)) last = i
  })
  return last >= 0 && !chars.slice(last + 1).some((ch) => /[\p{L}\p{N}]/u.test(ch))
}

// Runs of spoken number words, in the order said: two hundred and fifty
// holds two runs, two hundred, then fifty.
function numberRuns(words: string[]): string[][] {
  const runs: string[][] = []
  let run: string[] = []
  for (const word of words) {
    if (isNumberWord(word)) {
      run.push(word)
    } else if (run.length > 0) {
      runs.push(run)
      run = []
    }
  }
  if (run.length > 0) runs.push(run)
  return runs
}

// A model that answered the dictation instead of cleaning it up
// (IOS-032): it says words the speaker never did, leaves out most of what
// they said, turns their question into a statement, or answers after it.
// The live probe (answers.probe.test.ts, 2026-10-22, gpt-oss-120b and
// gpt-oss-20b on Groq) set the numbers: no good cleanup added more than
// 22% new words or dropped more than a third outside a list or a
// correction cut, and every answer crossed one of those lines or the
// question mark. A cut shaped like a correction is judged by that rule
// whether or not apply corrections is on, as it was before this check.
function isAnswer(input: string, answer: string, text: string, listFloor: boolean, correctionCut: boolean): boolean {
  const said = spokenWords(input)
  const kept = spokenWords(answer)
  const saidCounts = wordCounts(said)
  const keptCounts = wordCounts(kept)
  let added = 0
  let addedDigits = 0
  for (const [word, count] of keptCounts) {
    const extra = count - (saidCounts.get(word) ?? 0)
    if (extra <= 0) continue
    added += extra
    if (/[0-9]/.test(word)) addedDigits += extra
  }
  const missing = new Map<string, number>()
  let dropped = 0
  for (const [word, count] of saidCounts) {
    const gone = count - (keptCounts.get(word) ?? 0)
    if (gone <= 0) continue
    missing.set(word, gone)
    dropped += gone
  }
  // Spoken numbers written as digits count on neither side: each added
  // word holding an ASCII digit stands for one run of number words the
  // answer dropped whole, taken in the order said. 96 for twelve times
  // eight stands for twelve alone, so eight still counts as dropped.
  for (const run of numberRuns(said)) {
    if (addedDigits === 0) break
    const need = wordCounts(run)
    if (![...need].every(([word, count]) => (missing.get(word) ?? 0) >= count)) continue
    for (const [word, count] of need) missing.set(word, (missing.get(word) ?? 0) - count)
    added -= 1
    addedDigits -= 1
    dropped -= run.length
  }
  const { slack, addedShare, droppedShare } = polish.answer
  return (
    added > Math.max(slack, addedShare * kept.length) ||
    (!listFloor && !correctionCut && dropped > Math.max(slack, droppedShare * said.length)) ||
    // A take that ends in a question, answered: the question comes back as
    // a statement with a word changed, or something follows the last
    // question. A question in the middle of a longer take may lose its
    // mark to a slip fix.
    (!correctionCut &&
      endsAsking(input) &&
      ((questionMarks(input) > questionMarks(text) && added + dropped > 0) || (questionMarks(text) > 0 && !endsAsking(text))))
  )
}

/**
 * Decide whether a model response is a faithful cleanup of the input.
 * Pure and strict: when in doubt, reject, and the caller falls back.
 */
export function validatePolish(
  input: string,
  candidate: string,
  opts: { smartLists?: boolean; corrections?: boolean } = {}
): PolishVerdict {
  let text = candidate.trim()
  if (text.length === 0) return { ok: false, reason: 'empty' }

  // A whole-text quote wrapper the input did not have gets stripped.
  const quoted =
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('“') && text.endsWith('”'))
  if (quoted && !input.trim().startsWith('"')) text = text.slice(1, -1).trim()
  // An answer of only quote marks is empty too: keeping it would replace
  // the dictation with nothing.
  if (text.length === 0) return { ok: false, reason: 'empty' }

  const lower = text.toLowerCase()
  if (META_OPENERS.some((opener) => lower.startsWith(opener))) {
    return { ok: false, reason: 'meta chatter' }
  }
  if (polish.refusals.some((phrase) => lower.includes(phrase))) {
    return { ok: false, reason: 'refusal' }
  }

  // A preamble line ending in a colon before the payload is chatter,
  // with one carve-out: under smart lists, a colon intro directly over
  // list lines is the shape the prompt asks for.
  const lines = text.split('\n')
  if (lines.length > 1 && lines[0].trim().endsWith(':') && !input.includes(':')) {
    if (!(opts.smartLists && isListBody(lines))) {
      return { ok: false, reason: 'preamble line' }
    }
  }

  // Length sanity: cleanup adjusts, it does not write or delete essays.
  // List markers the smart lists prompt introduces are formatting, not
  // words, so they never count against the ratio.
  const countable = opts.smartLists ? text.replace(/^(?:- |\d+\. )/gm, '') : text
  const inputWords = input.split(/\s+/).filter((w) => w.length > 0).length
  const outputWords = countable.split(/\s+/).filter((w) => w.length > 0).length
  // Scaffolding legitimately dissolves into a list (the smart lists
  // prompt's one exception to keeping every word), so a list-shaped
  // output earns a deeper ratio floor, but ONLY when the input itself
  // enumerated (two or more implied entries) AND the output carries at
  // least that many entries: a list missing an item, or prose restyled
  // into a fake list, never rides the exception.
  const implied = opts.smartLists && isListShaped(lines) ? impliedEntryCount(input) : 0
  const earnedListFloor = implied >= 2
  if (earnedListFloor && listLineCount(lines) < implied) {
    return { ok: false, reason: 'missing entries' }
  }
  // A spoken correction legitimately deletes the wrong words and its
  // cue, often half a short dictation, so with apply corrections on it
  // earns the same deeper floor, but ONLY when the cut looks like a
  // correction: the speech carried a cue, the output dropped one, and
  // every output word was spoken. A cut that keeps every cue, or adds
  // words, is held to the strict floor (US-105). Each dropped cue
  // explains one wrong phrase and the cue itself, about 8 words
  // (correctionCut.perCue), plus 4 of slack for a restart
  // (correctionCut.slack); a bigger cut is content, not a fix.
  // The answered check below reads the same shape with the setting off.
  const cuesDropped = correctionCuesDropped(input, countable)
  const correctionCut =
    cuesDropped > 0 && inputWords - outputWords <= polish.correctionCut.slack + polish.correctionCut.perCue * cuesDropped &&
    onlySpokenWords(input, countable)
  const earnedCorrectionFloor = opts.corrections === true && correctionCut
  if (inputWords >= polish.length.ratioFromWords) {
    const ratio = outputWords / inputWords
    const floor = earnedListFloor || earnedCorrectionFloor ? polish.length.listFloor : polish.length.floor
    if (ratio < floor || ratio > polish.length.ceiling) return { ok: false, reason: 'length ratio' }
  } else if (Math.abs(outputWords - inputWords) > polish.length.shortDelta) {
    return { ok: false, reason: 'length delta' }
  }

  // A model that appends a polite closing the speaker never said is
  // injecting, not cleaning: reject when the output ends on a known
  // hallucination phrase the input did not end on.
  const lastSentence = (value: string): string => {
    const parts = value.trim().split(/(?<=[.!?])\s+/)
    return parts[parts.length - 1] ?? ''
  }
  if (
    isHallucination(lastSentence(text), hallucinations.phrases) &&
    !isHallucination(lastSentence(input), hallucinations.phrases)
  ) {
    return { ok: false, reason: 'appended chatter' }
  }

  if (isAnswer(input, countable, text, earnedListFloor, correctionCut)) {
    return { ok: false, reason: 'answered' }
  }

  return { ok: true, text }
}

/**
 * Run the cleanup model over already-deterministically-formatted text.
 * Resolves the polished text, or null for ANY failure. Never throws,
 * never retries: dictation latency matters more than a second opinion.
 */
export async function polishTranscript(
  text: string,
  cfg: PolishConfig,
  options: PolishOptions = {}
): Promise<string | null> {
  const {
    fetchImpl = appFetch,
    timeoutMs = polish.timeoutMs,
    hints = [],
    smartLists = false,
    corrections = false,
    onFallback
  } = options
  const fallback = (reason: string): null => {
    onFallback?.(reason)
    return null
  }
  const systemPrompt = [
    POLISH_SYSTEM_PROMPT,
    ...(smartLists ? [SMART_LISTS_PROMPT] : []),
    ...(corrections ? [CORRECTIONS_PROMPT] : []),
    ...hints
  ].join(' ')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: polish.temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return fallback(`http ${response.status}`)
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return fallback('response missing text')
    const verdict = validatePolish(text, content, { smartLists, corrections })
    if (!verdict.ok) return fallback(`validate: ${verdict.reason}`)
    // Hint-leak sentinel: hint lines all start with "Preferred spellings"
    // (see dictionaryHint), so any echo of hint text into the output is
    // detectable even when it slips the shape checks.
    if (
      hints.length > 0 &&
      verdict.text.toLowerCase().includes(polish.hintSentinel) &&
      !text.toLowerCase().includes(polish.hintSentinel)
    ) {
      return fallback('hint echo')
    }
    return verdict.text
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return fallback(aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
  }
}
