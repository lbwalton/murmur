// SPDX-License-Identifier: GPL-3.0-only
// A long note sorts in parts (US-180), pure half. One request used to
// carry every sentence of a note, each again per comma seam, in the
// lead words and the word list, beside up to 60 filed items per file,
// so a 4 KB brain dump asked for more tokens than a free Groq key may
// send in a minute and came back 413 with nothing filed. The sorter
// now packs the note's sentences into parts by an estimated token
// budget, each part settling on its own. These helpers size the parts,
// read what a provider says when it refuses one (how long to wait, its
// stated limit, its message), and make that message safe for the log.
// Groq's own pages, checked 2026-11-21: console.groq.com/docs/errors
// (413 "Request Entity Too Large", 429 "Too Many Requests", an error
// body of {"error":{"message","type"}}) and console.groq.com/docs/
// rate-limits (openai/gpt-oss-120b at 8K tokens per minute on the base
// limits, retry-after in seconds on a 429 only, x-ratelimit-limit-tokens
// and x-ratelimit-reset-tokens always referring to tokens per minute).
import { COMPARE_CAP, buildCompareContext, contextPrompt } from './compare'
import { type LeadIn, type Seam, keepPrompt, leadPrompt, seamPrompt } from './sorter'

/** A cautious characters-per-token rate. Prose runs nearer 4, but the
 *  numbered word lists ("1 Oh, | 2 and") cost a token for every few
 *  characters, and an estimate that runs high only means 1 more part. */
export const CHARS_PER_TOKEN = 3
/** A part's budget, in estimated tokens, before the provider has said
 *  what its limit is: under the 8K tokens a minute of Groq's base limits
 *  for gpt-oss, with room left for the answer. */
export const DEFAULT_PART_TOKENS = 6000
export const MIN_PART_TOKENS = 1000
/** The most 1 part carries even on a generous plan: a part this size is
 *  a long note already, and models' context windows stay far above it. */
export const MAX_PART_TOKENS = 24000
/** A part's share of a per-minute limit the provider stated. */
export const PART_SHARE_OF_LIMIT = 0.75
/** The share of a part the filed items may take once a note needs more
 *  than 1 part: every part carries them again, and its piece look once
 *  more. On the default budget that is the most recent 15 of each file,
 *  which kept a simulated 4 KB note on Groq's free plan inside the
 *  sort's 2 minutes of waiting (25% left it 3 seconds short). */
export const ITEMS_SHARE = 0.15
/** The JSON and message framing around the prompts. */
export const REQUEST_OVERHEAD_CHARS = 200
const ITEM_CAPS = [COMPARE_CAP, 40, 30, 20, 15, 10]

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

/** The budget for 1 part: a share of the per-minute token limit the
 *  provider stated, or the default before it has stated one. */
export function partBudget(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return DEFAULT_PART_TOKENS
  return Math.min(MAX_PART_TOKENS, Math.max(MIN_PART_TOKENS, Math.floor(limit * PART_SHARE_OF_LIMIT)))
}

/** What each sentence adds to a request, in characters: its numbered
 *  line, its seams, its lead words, and its word list. */
export function sentenceCosts(sentences: readonly string[], seamsBySentence: readonly Seam[][]): number[] {
  return sentences.map((sentence, i) => {
    const seams = [seamsBySentence[i] ?? []]
    const number = String(i + 1).length
    return (
      `${i + 1}. ${sentence}\n`.length +
      seamPrompt([sentence], seams).length +
      leadPrompt([sentence], seams).length +
      keepPrompt([sentence]).length +
      // Each list numbers the sentence again, and each line ends.
      3 * (number + 1)
    )
  })
}

/** What lies before a unit: a paragraph break, a plain sentence end, or
 *  a list line under the same heading as the one before it (joined),
 *  which should file under 1 lead line and so stay in 1 part. */
export type Boundary = 'paragraph' | 'plain' | 'joined'

/**
 * The boundary before each unit (the first is a paragraph). The units
 * come from the sorter's own split and are only located here, in order;
 * a unit that cannot be found (an abbreviation rejoined over 2 spaces)
 * stops the search, and the rest read as plain, which costs nothing but
 * a less tidy cut.
 */
export function unitBoundaries(
  text: string,
  sentences: readonly string[],
  leads: ReadonlyArray<LeadIn | null>
): Boundary[] {
  const out: Boundary[] = []
  let cursor = 0
  let located = true
  sentences.forEach((sentence, i) => {
    let gap = ''
    if (located) {
      const at = text.indexOf(sentence, cursor)
      if (at < 0) located = false
      else {
        gap = text.slice(cursor, at)
        cursor = at + sentence.length
      }
    }
    const lead = leads[i] ?? null
    const before = leads[i - 1] ?? null
    if (i === 0) out.push('paragraph')
    else if (lead !== null && before !== null && lead.group === before.group) out.push('joined')
    else if (located && gap.includes('\n')) out.push('paragraph')
    else out.push('plain')
  })
  return out
}

/**
 * How many of the next units go in 1 part: as many as the room holds,
 * and always at least 1. When the note goes on past the part, the cut
 * moves back to the last paragraph break in the part's later half, else
 * to the last place that is not inside a list under 1 heading.
 * `boundaries[k]` is what lies before unit k of this same list.
 */
export function nextPart(costs: readonly number[], boundaries: readonly Boundary[], roomChars: number): number {
  let fit = 0
  let used = 0
  while (fit < costs.length && (fit === 0 || used + costs[fit] <= roomChars)) {
    used += costs[fit]
    fit += 1
  }
  if (fit >= costs.length) return costs.length
  const floor = Math.max(1, Math.ceil(fit / 2))
  for (let k = fit; k >= floor; k--) if (boundaries[k] === 'paragraph') return k
  for (let k = fit; k >= floor; k--) if (boundaries[k] !== 'joined') return k
  return fit
}

/** How many of each file's recent items every part carries when a note
 *  needs more than 1 part: the largest step whose list fits its share of
 *  a part, so the duplicate check never crowds out the sentences. */
export function itemsCapFor(tasksText: string, ideasText: string, budgetTokens: number): number {
  for (const cap of ITEM_CAPS) {
    const prompt = contextPrompt(buildCompareContext(tasksText, ideasText, cap), cap)
    if (estimateTokens(prompt.length) <= budgetTokens * ITEMS_SHARE) return cap
  }
  return ITEM_CAPS[ITEM_CAPS.length - 1]
}

// ------------------------------------------------ what a provider said ---

export interface HeaderReader {
  get(name: string): string | null
}

/** A wait as providers write it (7.66s, 2m59.56s, 1h2m, 450ms, or bare
 *  seconds), in milliseconds; null when it is not one. */
export function parseDuration(raw: string): number | null {
  const text = raw.trim()
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000)
  const part = /(\d+(?:\.\d+)?)(ms|h|m|s)/y
  let total = 0
  let at = 0
  while (at < text.length) {
    part.lastIndex = at
    const match = part.exec(text)
    if (!match) return null
    const n = Number(match[1])
    total += match[2] === 'h' ? n * 3_600_000 : match[2] === 'm' ? n * 60_000 : match[2] === 's' ? n * 1000 : n
    at = part.lastIndex
  }
  return at > 0 ? Math.round(total) : null
}

/**
 * How long a 429 asks the sort to wait, in milliseconds: Retry-After
 * (seconds or a date), else the per-minute token reset, else "try again
 * in 19.41s" in the message. Never the request reset, which on Groq is
 * the per-day count. Null when the reply names no wait.
 */
export function retryDelayMs(headers: HeaderReader | null, message: string, now = Date.now()): number | null {
  const after = headers?.get('retry-after')?.trim()
  if (after) {
    const seconds = /^\d+(?:\.\d+)?$/.test(after) ? Math.round(Number(after) * 1000) : null
    if (seconds !== null) return seconds
    // Only a date still ahead counts; one that parses into the past ("12
    // 1" reads as a year long gone) or not at all is no header.
    const date = Date.parse(after)
    if (Number.isFinite(date) && date > now) return date - now
  }
  const reset = headers?.get('x-ratelimit-reset-tokens')
  if (reset) {
    const ms = parseDuration(reset)
    if (ms !== null) return ms
  }
  const said = /try again in\s+((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)/i.exec(message)
  return said ? parseDuration(said[1]) : null
}

/** The provider's per-minute token limit when it states one: the
 *  x-ratelimit-limit-tokens header, or "Limit 8000" in a message about
 *  tokens per minute. A per-day limit (tokens or requests per day) is
 *  never read as one, or every later part would shrink to a line. */
export function providerLimit(headers: HeaderReader | null, message: string): number | undefined {
  const raw = Number(headers?.get('x-ratelimit-limit-tokens') ?? Number.NaN)
  if (Number.isFinite(raw) && raw > 0) return raw
  if (!/tokens per minute|\bTPM\b/i.test(message)) return undefined
  const said = /\bLimit\s+(\d+)/.exec(message)
  const n = said ? Number(said[1]) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** The message in an OpenAI-shaped error body, as the provider wrote
 *  it. Only for reading numbers out of; the log gets providerSays. */
export function errorMessage(body: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return ''
  }
  if (typeof parsed !== 'object' || parsed === null) return ''
  const top = parsed as { error?: unknown; message?: unknown; detail?: unknown }
  if (typeof top.error === 'object' && top.error !== null) {
    const inner = (top.error as { message?: unknown }).message
    if (typeof inner === 'string') return inner
  }
  if (typeof top.error === 'string') return top.error
  if (typeof top.message === 'string') return top.message
  if (typeof top.detail === 'string') return top.detail
  return ''
}

const SAID_MAX = 200
// A run this long found in the request is the request's own text.
const ECHO_WINDOW = 16
export const SAID_WITHHELD = 'withheld: it repeated the request'

/**
 * A provider's message made fit for the log, on 1 line. Anything in
 * quotes or backticks goes first (a provider quotes the input back in
 * quotes, in pieces too short to recognize), then an organization id
 * (org_… or org-…), the key, and anything shaped like a key or masked
 * with * become [redacted], and it is cut at 200 characters. A message
 * that still repeats any run of the request's text is withheld whole, so
 * no word of a note ever reaches the log.
 */
export function providerSays(message: string, request: string, apiKey = ''): string {
  let line = message.replace(/\s+/g, ' ').trim()
  if (apiKey.length >= 8) line = line.split(apiKey).join('[redacted]')
  line = line.replace(/`[^`]*`|"[^"]*"|“[^”]*”|‘[^’]*’|(?<![A-Za-z])'[^']*'(?![A-Za-z])/g, '…').trim()
  if (line === '') return ''
  const flat = request.replace(/\s+/g, ' ')
  for (let i = 0; i + ECHO_WINDOW <= line.length; i++) {
    if (flat.includes(line.slice(i, i + ECHO_WINDOW))) return SAID_WITHHELD
  }
  const safe = line
    .replace(/\borg[_-][A-Za-z0-9]+/g, 'org_…')
    .replace(/\S*\*\S*/g, '[redacted]')
    .replace(/[A-Za-z0-9_-]{24,}/g, (run) => (/\d/.test(run) && /[A-Za-z]/.test(run) ? '[redacted]' : run))
  return safe.length > SAID_MAX ? `${safe.slice(0, SAID_MAX - 1)}…` : safe
}
