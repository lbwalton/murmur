// SPDX-License-Identifier: GPL-3.0-only
// The sorter's pure half. The model classifies numbered sentences and
// murmur copies the originals into the right files, so nothing on this
// path can reword a note. Strict by design: when a reply is anything
// other than a complete labeling, the whole sort is rejected and the
// note simply stays in the inbox, where it already is.

import rules from '../../shared/sorter.json'
import { type RelationVotes, readRelationVotes } from './compare'
import { noteMoment, renderTemplate } from './notes'

/** Filed lines sit under a heading so a long list stays navigable.
 *  {topic} renders empty unless topic headings are on, so the default
 *  reads as a date alone until the user asks for names. Empty turns
 *  headings off and the file is one flat list. */
export const DEFAULT_FILED_HEADING_TEMPLATE = rules.layout.heading

export type SortLabel = 'task' | 'idea' | 'note'
export const SORT_LABELS: readonly SortLabel[] = ['task', 'idea', 'note']

// A list line as the formatter emits it: dash, checkbox, or number.
const LIST_LINE = /^(?:- \[[ xX]\] |- |\d+\. )/
const SENTENCE_END = /(?<=[.!?]["”')\]]?)\s+/
// A fragment ending in one of these is a title or a Latin shorthand,
// not a sentence: it rejoins the piece after it (review gate
// 2026-09-20: "Dr." alone would have become a task line).
const ABBREVIATION = /(?:^|\s)(?:Dr|Mr|Mrs|Ms|Prof|Jr|Sr|St|vs|etc|approx|e\.g|i\.e)\.$/i

/** A lead-in (US-062): the words that introduce a run of items, such
 *  as "I need to buy". Filed once as a plain line with the items nested
 *  under it. group tells two runs with the same words apart. */
export interface LeadIn {
  text: string
  group: string
}

/**
 * The units the model labels: one per line, and a prose line further
 * split at sentence ends. List lines stay whole, so a list the speaker
 * dictated is never torn into fragments. A list's heading (the piece
 * ending in a colon right above list lines, the shape smart lists
 * writes) is never a unit: it names the items and is no task or idea
 * of its own (live-found 2026-09-23, the decision model filed "I need
 * to buy:" as a task). It becomes the lead-in of the list lines under
 * it (US-062), and it stays in the inbox like everything else.
 */
export function splitUnits(text: string): { sentences: string[]; leads: Array<LeadIn | null> } {
  const sentences: string[] = []
  const leads: Array<LeadIn | null> = []
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  let heading: LeadIn | null = null
  for (const [index, line] of lines.entries()) {
    if (LIST_LINE.test(line)) {
      sentences.push(line)
      leads.push(heading)
      continue
    }
    heading = null
    const headsList = index + 1 < lines.length && LIST_LINE.test(lines[index + 1])
    const pieces = line.split(SENTENCE_END).map((p) => p.trim()).filter((p) => p.length > 0)
    let carry = ''
    const out: string[] = []
    for (const piece of pieces) {
      const joined = carry.length > 0 ? `${carry} ${piece}` : piece
      if (ABBREVIATION.test(joined)) {
        carry = joined
        continue
      }
      out.push(joined)
      carry = ''
    }
    if (carry.length > 0) out.push(carry)
    if (headsList && out.length > 0 && out[out.length - 1].endsWith(':')) {
      heading = { text: out.pop() as string, group: `heading-${index}` }
    }
    for (const sentence of out) {
      sentences.push(sentence)
      leads.push(null)
    }
  }
  return { sentences, leads }
}

/** The units alone, for every caller that only needs positions. */
export function splitSentences(text: string): string[] {
  return splitUnits(text).sentences
}

/** What the model receives: the sentences, numbered from one. */
export function numberedList(sentences: string[]): string {
  return sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')
}

// The prompts live in shared/sorter.json, the iPhone's too (IOS-023).
export const SORT_SYSTEM_PROMPT = rules.systemPrompt.join(' ')

export type SortVerdict =
  | {
      ok: true
      labels: SortLabel[]
      topic: string
      seams: SeamVotes
      /** Per-sentence certainty behind each label, present only from a
       *  backend that reports one (US-057); the chat path has none. */
      confidence?: number[]
      /** Relation votes against the items already filed (US-055);
       *  empty when there was nothing to compare against. */
      relations: RelationVotes
      /** Where each cut run's first item begins (US-062); absent or
       *  empty means no lead-in anywhere. */
      starts?: LeadStarts
      /** The words worth filing per task or idea sentence (US-115);
       *  absent or empty means every sentence files whole. */
      keep?: KeepSpans
      /** How sure a decision model was of each keep end, first and
       *  last, by sentence number; null where it gave no answer
       *  (US-116). For the log only; the chat path has none. */
      keepConfidence?: Record<number, [number | null, number | null]>
    }
  | { ok: false; reason: string }

/** Confirmed seam numbers per sentence number (US-056). Produced by
 *  whichever connection voted and consumed by the cutter, so a second
 *  backend supplies votes without touching the cutter. */
export type SeamVotes = Record<number, number[]>

/** Where each sentence's first item begins, by sentence number: a word
 *  number among leadWords (US-062). Absent means no lead-in. */
export type LeadStarts = Record<number, number>

/** The first and last word worth filing, by sentence number: word
 *  numbers among keepWords (US-115). Absent means the whole sentence. */
export type KeepSpans = Record<number, [number, number]>

/** Asked for only when topic headings are on. */
export const SORT_TOPIC_PROMPT = rules.topicPrompt.join(' ')

// A heading has to stay one clean line, and it is the one place a
// model's own words reach a file, so the topic is stripped of anything
// that could break a heading or a link and capped before it is used.
const TOPIC_MAX_CHARS = rules.topicMaxChars
const TOPIC_MAX_WORDS = rules.topicMaxWords

/**
 * A model-written topic reduced to something safe to put in a heading,
 * or '' when it cannot be used. Unusable never means a failed sort: the
 * heading simply falls back to the rest of its template.
 */
export function sanitizeTopic(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const flat = raw.replace(/[#[\]()|`*_<>\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim()
  const trimmed = flat.replace(/[.,:;!?]+$/, '').trim()
  if (trimmed.length === 0 || trimmed.length > TOPIC_MAX_CHARS) return ''
  if (trimmed.split(' ').length > TOPIC_MAX_WORDS) return ''
  return trimmed
}

/** The first balanced-looking JSON object in a reply, fences and
 *  chatter around it stripped; null when there is none. */
function extractObject(candidate: string): string | null {
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return candidate.slice(start, end + 1)
}

/**
 * Decide whether a reply is a complete labeling of `count` sentences.
 * Pure and strict: every number exactly once, only the three labels.
 */
export function validateSort(
  count: number,
  candidate: string,
  opts: {
    topic?: boolean
    seamCounts?: readonly number[]
    items?: number
    leadCounts?: readonly number[]
    keepCounts?: readonly number[]
  } = {}
): SortVerdict {
  const text = candidate.trim()
  if (text.length === 0) return { ok: false, reason: 'empty' }
  const raw = extractObject(text) ?? text
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'not json' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'not an object' }
  }
  const entries = Object.entries(parsed as Record<string, unknown>)
  const expected = new Set(Array.from({ length: count }, (_, i) => String(i + 1)))
  // The topic and the seam votes ride the same object under reserved
  // keys; every other key still has to be a sentence number.
  const offeredSeams = (opts.seamCounts ?? []).some((n) => n > 0)
  const offeredItems = (opts.items ?? 0) > 0
  const offeredLeads = (opts.leadCounts ?? []).some((n) => n > 0)
  const offeredKeep = (opts.keepCounts ?? []).some((n) => n > 0)
  const reserved = new Set<string>([
    ...(opts.topic ? ['topic'] : []),
    ...(offeredSeams ? ['seams'] : []),
    ...(offeredItems ? ['relations'] : []),
    ...(offeredLeads ? ['starts'] : []),
    ...(offeredKeep ? ['keep'] : [])
  ])
  const numbered = entries.filter(([key]) => !reserved.has(key))
  for (const [key] of numbered) {
    if (!expected.has(key)) return { ok: false, reason: 'extra sentences' }
  }
  if (numbered.length < count) return { ok: false, reason: 'missing sentences' }
  const labels: SortLabel[] = []
  for (let i = 1; i <= count; i++) {
    const value = (parsed as Record<string, unknown>)[String(i)]
    const label = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (!SORT_LABELS.includes(label as SortLabel)) return { ok: false, reason: 'bad label' }
    labels.push(label as SortLabel)
  }
  const topic = opts.topic ? sanitizeTopic((parsed as Record<string, unknown>).topic) : ''
  const seams = offeredSeams
    ? readSeamVotes((parsed as Record<string, unknown>).seams, opts.seamCounts ?? [])
    : {}
  const relations = offeredItems
    ? readRelationVotes((parsed as Record<string, unknown>).relations, count, opts.items ?? 0)
    : {}
  const starts = offeredLeads
    ? { starts: readLeadStarts((parsed as Record<string, unknown>).starts, opts.leadCounts ?? []) }
    : {}
  const keep = offeredKeep
    ? { keep: readKeepSpans((parsed as Record<string, unknown>).keep, opts.keepCounts ?? []) }
    : {}
  return { ok: true, labels, topic, seams, relations, ...starts, ...keep }
}

// ------------------------------------------------------------ seams ---
// A comma run spoken in one breath is one sentence, and the sorter's
// unit is the sentence, so it would file as one checkbox. The code finds
// the places a sentence could be cut and the model only votes yes or no
// per seam; it never returns text, so every word the speaker said lands
// on exactly one line by construction (US-056).

export interface Seam {
  /** The seam text's span in the sentence: what cutting removes. */
  start: number
  end: number
}

const CONNECTOR = '(?:and then|and also|and|then|also)'
// A punctuation seam may carry a connector after it (", and then ");
// a bare connector between word runs is a seam on its own.
const SEAM = new RegExp(`[,;]\\s+(?:${CONNECTOR}\\s+)?|\\s+${CONNECTOR}\\s+`, 'gi')

// A side that is nothing but joining words ("And", "then") is not an
// item, and a cut inside an open quote or parenthesis would leave both
// lines with half of it; neither is offered (review gate 2026-09-21).
// Nor is a side of spoken fillers alone: "Oh, and an idea: ..." filed
// "Oh" as an idea of its own (US-114, live-found 2026-10-27). Every
// separator belongs to one quantifier only, so a long run of repeated
// fillers is matched in linear time (review gate 2026-10-27: leading
// whitespace inside the repeat backtracked 2^n on "okay, okay, ...").
const NOT_AN_ITEM =
  /^[\s.,;!?]*(?:(?:and|then|also|oh|ah|um|uhm|uh|uhh|erm|hmm|mhm|well|so|okay|ok|yeah|anyway|actually)\b[\s.,;!?]*)+$/i

function hasWords(side: string): boolean {
  return /\w/.test(side) && !NOT_AN_ITEM.test(side)
}

function insideQuoteOrParen(left: string): boolean {
  const opens = (left.match(/\(/g) ?? []).length
  const closes = (left.match(/\)/g) ?? []).length
  const quotes = (left.match(/"/g) ?? []).length
  return opens > closes || quotes % 2 === 1
}

/** Candidate seams, in order. None inside a list line (its items are
 *  already lines), none where either side has no words of its own, and
 *  none inside a quote or parenthesis. A comma inside a number never
 *  matches because it has no space after it. */
export function findSeams(sentence: string): Seam[] {
  if (LIST_LINE.test(sentence)) return []
  const seams: Seam[] = []
  for (const match of sentence.matchAll(SEAM)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const left = sentence.slice(0, start)
    const right = sentence.slice(end)
    if (!hasWords(left) || !hasWords(right) || insideQuoteOrParen(left)) continue
    seams.push({ start, end })
  }
  return seams
}

/** The two sides of a seam, for a prompt or a decision question. */
export function seamSides(sentence: string, seam: Seam): { left: string; right: string } {
  return { left: sentence.slice(0, seam.start).trim(), right: sentence.slice(seam.end).trim() }
}

/** Cut at the confirmed seams only, removing the seam text and nothing
 *  else; a sentence with no confirmed seam comes back whole. The cutter
 *  is the boundary every backend's votes cross, so it enforces the rule
 *  itself: a vote naming a seam that does not exist leaves the whole
 *  sentence as one line, never a partial cut. A joining comma left at
 *  the end of a piece by doubled punctuation is trimmed. */
export function cutAtSeams(sentence: string, seams: readonly Seam[], confirmed: readonly number[]): string[] {
  if (confirmed.some((n) => !Number.isInteger(n) || n < 1 || n > seams.length)) return [sentence]
  let chosen = [...new Set(confirmed)].map((n) => seams[n - 1]).sort((a, b) => a.start - b.start)
  // Fillers alone between two cuts ("buy milk, oh well, call Bob") are
  // no item either: the cut after them goes, so they ride with the
  // next piece (US-114). findSeams already keeps the first and last
  // pieces from being fillers alone.
  for (let k = fillerPiece(sentence, chosen); k !== -1 && chosen.length > 0; k = fillerPiece(sentence, chosen)) {
    const drop = Math.min(k, chosen.length - 1)
    chosen = chosen.filter((_, j) => j !== drop)
  }
  const pieces: string[] = []
  let cursor = 0
  for (const seam of chosen) {
    pieces.push(sentence.slice(cursor, seam.start))
    cursor = seam.end
  }
  pieces.push(sentence.slice(cursor))
  return pieces.map((p) => p.trim().replace(/[,;]+$/, '').trim()).filter((p) => p.length > 0)
}

/** The first piece between chosen cuts that holds words but no item
 *  (fillers or joining words alone), or -1. An empty piece is left to
 *  the cutter's own trim, as before. */
function fillerPiece(sentence: string, chosen: readonly Seam[]): number {
  for (let k = 0; k <= chosen.length; k++) {
    const from = k === 0 ? 0 : chosen[k - 1].end
    const to = k === chosen.length ? sentence.length : chosen[k].start
    const piece = sentence.slice(from, to)
    if (piece.trim().length > 0 && !hasWords(piece)) return k
  }
  return -1
}

/** A vote as a clean list of seam numbers, or null when it is not a
 *  list of numbers or names a seam that does not exist: either way
 *  that sentence files whole. */
export function confirmedSeams(vote: unknown, seamCount: number): number[] | null {
  if (!Array.isArray(vote)) return null
  const numbers: number[] = []
  for (const value of vote) {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null
    if (value < 1 || value > seamCount) return null
    if (!numbers.includes(value)) numbers.push(value)
  }
  return numbers.sort((a, b) => a - b)
}

function readSeamVotes(raw: unknown, seamCounts: readonly number[]): SeamVotes {
  const votes: SeamVotes = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return votes
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const sentence = Number(key)
    if (!Number.isInteger(sentence) || sentence < 1 || sentence > seamCounts.length) continue
    const count = seamCounts[sentence - 1]
    if (count === 0) continue
    const confirmed = confirmedSeams(value, count)
    if (confirmed !== null && confirmed.length > 0) votes[sentence] = confirmed
  }
  return votes
}

/** Appended to the system prompt only when a sentence has seams. */
export const SORT_SEAMS_PROMPT = rules.seamsPrompt.join(' ')

/** The seams as the chat model sees them, numbered under their
 *  sentence; empty when no sentence has a seam. */
/** Asked for only when some sentence offers lead words (US-062). */
export const SORT_LEADS_PROMPT = rules.leadsPrompt.join(' ')

/** The lead words as the chat model sees them, numbered under their
 *  sentence; empty when no sentence offers any. */
export function leadPrompt(sentences: readonly string[], seamsBySentence: readonly Seam[][]): string {
  const lines: string[] = []
  sentences.forEach((sentence, i) => {
    const words = leadWords(sentence, seamsBySentence[i] ?? [])
    if (words.length > 0) lines.push(`${i + 1}: ${words.map((w, j) => `${j + 1} ${w}`).join(' | ')}`)
  })
  return lines.join('\n')
}

/** Read a starts vote: per sentence, a word number from 2 to the count
 *  offered. Anything else means no lead-in for that sentence only. */
export function readLeadStarts(raw: unknown, leadCounts: readonly number[]): LeadStarts {
  const starts: LeadStarts = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return starts
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const sentence = Number(key)
    if (!Number.isInteger(sentence) || sentence < 1 || sentence > leadCounts.length) continue
    const word = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
    if (typeof word !== 'number' || !Number.isInteger(word)) continue
    if (word >= 2 && word <= leadCounts[sentence - 1]) starts[sentence] = word
  }
  return starts
}

export function seamPrompt(sentences: readonly string[], seamsBySentence: readonly Seam[][]): string {
  const lines: string[] = []
  sentences.forEach((sentence, i) => {
    seamsBySentence[i]?.forEach((seam, j) => {
      const { left, right } = seamSides(sentence, seam)
      lines.push(`${i + 1}.${j + 1}: "${left}" | "${right}"`)
    })
  })
  return lines.join('\n')
}

/** Expand task and idea sentences with a confirmed vote into their
 *  pieces, each piece keeping the label; everything else passes through. */
export function applySplits(
  sentences: readonly string[],
  labels: readonly SortLabel[],
  seamsBySentence: readonly Seam[][],
  votes: SeamVotes,
  starts: LeadStarts = {},
  group = 'run'
): { sentences: string[]; labels: SortLabel[]; leads: Array<LeadIn | null> } {
  const out: { sentences: string[]; labels: SortLabel[]; leads: Array<LeadIn | null> } = {
    sentences: [],
    labels: [],
    leads: []
  }
  sentences.forEach((sentence, i) => {
    const label = labels[i]
    const confirmed = votes[i + 1]
    if ((label === 'task' || label === 'idea') && confirmed && confirmed.length > 0) {
      const run = cutRun(sentence, seamsBySentence[i] ?? [], confirmed, starts[i + 1])
      const lead: LeadIn | null = run.lead ? { text: run.lead, group: `${group}-${i + 1}` } : null
      for (const piece of run.pieces) {
        out.sentences.push(piece)
        out.labels.push(label)
        out.leads.push(lead)
      }
      return
    }
    out.sentences.push(sentence)
    out.labels.push(label)
    out.leads.push(null)
  })
  return out
}

/**
 * A markdown link path from the directory holding `fromFile` to
 * `toFile`, both given relative to the same base folder. Every segment
 * is percent-encoded (spaces, hashes, and the rest) so the link
 * survives strict markdown readers and never reads as a fragment.
 */
export function relativeLink(fromFile: string, toFile: string): string {
  const fromDir = fromFile.split('/').filter((s) => s.length > 0).slice(0, -1)
  const to = toFile.split('/').filter((s) => s.length > 0)
  let common = 0
  while (common < fromDir.length && common < to.length - 1 && fromDir[common] === to[common]) common++
  const ups = fromDir.length - common
  return [...Array.from({ length: ups }, () => '..'), ...to.slice(common).map(encodeURIComponent)].join('/')
}

/** The sentence without any list marker it already carried, so a copied
 *  line never reads "- - buy eggs". */
function bare(sentence: string): string {
  return sentence.replace(LIST_LINE, '').trim()
}

export function taskLine(sentence: string, time: string, link: string): string {
  return `- [ ] ${bare(sentence)} ([${time}](${link}))`
}

export function ideaLine(sentence: string, time: string, link: string): string {
  return `- ${bare(sentence)} ([${time}](${link}))`
}

export interface FiledLines {
  tasks: string[]
  ideas: string[]
  notes: string[]
}

/**
 * The heading this filing sits under, or '' when headings are off.
 * A heading is one line, so whatever the tokens render collapses to
 * single spaces: an empty {topic} leaves the date standing alone.
 */
export function renderFiledHeading(template: string, when: Date, topic = ''): string {
  if (template.trim().length === 0) return ''
  const rendered = renderTemplate(template, { ...noteMoment(when), topic })
  return rendered.replace(/\s+/g, ' ').trim()
}

/**
 * What to write before the entries: the heading and a newline when the
 * file does not already carry that exact line, nothing when it does.
 * A day's dumps therefore gather under one heading, appended in order,
 * and a file the user has reordered by hand is never rewritten.
 */
export function headingPrefix(heading: string, existing: string): string {
  if (heading === '') return ''
  const carried = existing.split('\n').some((line) => line.trim() === heading)
  return carried ? '' : `${heading}\n`
}

// ------------------------------------------------------- held lines ---
// A decision model reports how sure it is of each label (US-057), and a
// flat distribution is what an ambiguous line looks like from the
// inside. US-058 spends that: lines at or above a threshold file, lines
// below stay in the inbox, and Sort again re-runs only what is still
// unsettled, so a landed line is never filed twice.

/** Which sentences a threshold keeps and which it holds. No confidence
 *  (the chat path) keeps everything: it has no honest doubt to report. */
export function holdBelow(
  count: number,
  confidence: readonly number[] | undefined,
  threshold: number
): { kept: number[]; held: number[] } {
  const kept: number[] = []
  const held: number[] = []
  for (let i = 0; i < count; i++) {
    const c = confidence?.[i]
    if (c !== undefined && c < threshold) held.push(i)
    else kept.push(i)
  }
  return { kept, held }
}

/** Sentence positions a sort of this note has not settled yet, in
 *  order: what Sort again sends and nothing else. */
export function remainingSentences(count: number, settled: ReadonlySet<number>): number[] {
  return Array.from({ length: count }, (_, i) => i).filter((i) => !settled.has(i))
}

/**
 * Record which sentences a sort settled. `positions` are the original
 * positions that were SENT (a fresh note sends them all, Sort again
 * sends the remainder) and `keptLocal` the indexes among those the sort
 * kept, so a landed line is remembered under its original position and
 * can never be sent again.
 */
export function settle(
  settled: ReadonlySet<number>,
  positions: readonly number[],
  keptLocal: readonly number[]
): Set<number> {
  const next = new Set(settled)
  for (const i of keptLocal) {
    const position = positions[i]
    if (position !== undefined) next.add(position)
  }
  return next
}

/** Seam votes keyed by position among the sentences sent, re-keyed to
 *  positions among the sentences kept, so the cutter sees a contiguous
 *  list after held lines drop out. */
export function rekeyVotes(votes: SeamVotes, kept: readonly number[]): SeamVotes {
  const out: SeamVotes = {}
  kept.forEach((sentenceIndex, newIndex) => {
    const vote = votes[sentenceIndex + 1]
    if (vote && vote.length > 0) out[newIndex + 1] = vote
  })
  return out
}

/**
 * Copy each sentence into its bucket, in spoken order, untouched. An
 * item with a lead-in (US-062) nests under it: the first item of a run
 * in a file carries the lead line in front of it, so the plan stays one
 * entry per item and every count downstream stays an item count.
 */
export function planFiling(
  sentences: string[],
  labels: SortLabel[],
  link: { time: string; inboxFile: string; tasksFile: string; ideasFile: string },
  leads: ReadonlyArray<LeadIn | null> = []
): FiledLines {
  const plan: FiledLines = { tasks: [], ideas: [], notes: [] }
  const taskLink = relativeLink(link.tasksFile, link.inboxFile)
  const ideaLink = relativeLink(link.ideasFile, link.inboxFile)
  const open: Record<'task' | 'idea', string | null> = { task: null, idea: null }
  sentences.forEach((sentence, i) => {
    const label = labels[i]
    if (label !== 'task' && label !== 'idea') {
      plan.notes.push(sentence)
      return
    }
    const line = label === 'task' ? taskLine(sentence, link.time, taskLink) : ideaLine(sentence, link.time, ideaLink)
    const lead = leads[i] ?? null
    let entry = line
    if (lead === null) {
      open[label] = null
    } else {
      entry = `  ${line}`
      if (open[label] !== lead.group) {
        entry = `- ${leadLine(lead.text)}\n${entry}`
        open[label] = lead.group
      }
    }
    if (label === 'task') plan.tasks.push(entry)
    else plan.ideas.push(entry)
  })
  return plan
}

/** A lead-in as it is filed: its words, closed with one colon. */
export function leadLine(text: string): string {
  return `${text.replace(/[\s,;:.]+$/, '')}:`
}

// A word as the lead-in question numbers it: any run of non-spaces.
const WORD = /\S+/g

// A sentence longer than this before its last seam is not a list
// intro worth asking about; the question stays a sane size.
const LEAD_WORDS_MAX = rules.leadWordsMax

/**
 * The words the lead-in question offers for a sentence (US-062): every
 * word before its LAST candidate seam, numbered from one and shown bare
 * of trailing commas. Not just the first side: a clause comma the model
 * will not cut ("For the party, I need to buy chips, salsa") sits before
 * the first item, and stopping at it left the right answer off the list
 * (live-found 2026-09-23). The numbering is the same /\S+/ tokens the
 * cutter counts, so a number means the same word on both sides. Empty
 * when there is no seam, a single word, or too many to be an intro.
 */
export function leadWords(sentence: string, seams: readonly Seam[]): string[] {
  if (seams.length === 0) return []
  const words = sentence.slice(0, seams[seams.length - 1].start).match(WORD) ?? []
  if (words.length < 2 || words.length > LEAD_WORDS_MAX) return []
  return words.map((word) => word.replace(/[,;:]+$/, '') || word)
}

/**
 * Split a run's first piece where the first item begins: the words
 * before word `start` are the lead-in. Null when there is no lead-in
 * to take (start 1, out of range, or either side left empty).
 */
export function splitLeadIn(piece: string, start: number): { lead: string; item: string } | null {
  if (!Number.isInteger(start) || start <= 1) return null
  const words = [...piece.matchAll(WORD)]
  if (start > words.length) return null
  const at = words[start - 1].index ?? 0
  const lead = piece.slice(0, at).trim().replace(/[\s,;:]+$/, '')
  const item = piece.slice(at).trim()
  if (lead.length === 0 || item.length === 0) return null
  return { lead, item }
}

/**
 * Cut a sentence at its confirmed seams and, when that makes a run of
 * two or more items, take the lead-in the model pointed at and trim the
 * run's final period so the items match. Every word lands once: in the
 * lead-in or in an item. A sentence left whole is returned as it was.
 */
export function cutRun(
  sentence: string,
  seams: readonly Seam[],
  confirmed: readonly number[],
  start?: number
): { lead: string | null; pieces: string[] } {
  const pieces = cutAtSeams(sentence, seams, confirmed)
  if (pieces.length < 2) return { lead: null, pieces }
  // The run's final period goes, unless it belongs to an ellipsis or
  // an abbreviation ("etc.", "Dr."): that period is part of the word
  // (review gate 2026-09-23, the same class as the 2026-09-20 "Dr." fix).
  const last = pieces.length - 1
  if (!ABBREVIATION.test(pieces[last])) {
    const trimmed = pieces[last].replace(/(?<!\.)\.$/, '').trim()
    if (trimmed.length > 0) pieces[last] = trimmed
  }
  const offered = leadWords(sentence, seams).length
  const split = start !== undefined && start <= offered ? splitLeadIn(pieces[0], start) : null
  if (split) pieces[0] = split.item
  return { lead: split ? split.lead : null, pieces }
}

// ------------------------------------------------------------- keep ---
// File only the item (US-115; LaBroi, 2026-10-27: pull out only what is
// a to-do or an idea, and the commentary stays in the brain dump). A
// task or idea sentence often carries words that only announce or
// comment on it: "Oh, and an idea: a rooftop launch party." The model
// points at the first and last word worth filing, by number as for a
// lead-in, and murmur files exactly those words. The rest stays in the
// inbox, where every word already is; nothing is ever reworded.

/** Asked for only when some sentence offers words to keep. */
export const SORT_KEEP_PROMPT = [
  'Some sentences also list all their words, numbered, under Words.',
  'For a sentence you label task or idea that carries words around the item that only comment on it, announce it, or fill (for example Oh, and an idea:, I think, honestly), find the first and last word of the part worth filing: the task or idea itself, keeping any opening words that say when, where, or what the items are for.',
  'Also include the key "keep": an object mapping the sentence number to [first, last] word numbers, for example {"2":[5,12]}. Leave a sentence out when all of its words belong. Word numbers only, never text.'
].join(' ')

// A sentence longer than this is a ramble, not one item with words
// around it; the question stays a sane size.
const KEEP_WORDS_MAX = 60

/** The words the keep question offers for a sentence: every word, as
 *  the same /\S+/ tokens the lead-in counts. Empty for a list line (its
 *  item is the line), a sentence under 3 words, or a ramble. */
export function keepWords(sentence: string): string[] {
  if (LIST_LINE.test(sentence)) return []
  const words = sentence.match(WORD) ?? []
  return words.length >= 3 && words.length <= KEEP_WORDS_MAX ? words : []
}

/** The words as the chat model sees them, numbered under their
 *  sentence; empty when no sentence offers any. */
export function keepPrompt(sentences: readonly string[]): string {
  const lines: string[] = []
  sentences.forEach((sentence, i) => {
    const words = keepWords(sentence)
    if (words.length > 0) lines.push(`${i + 1}: ${words.map((w, j) => `${j + 1} ${w}`).join(' | ')}`)
  })
  return lines.join('\n')
}

/** Read a keep vote: per sentence, [first, last] inside the words
 *  offered. Anything else, or a span that keeps every word, leaves that
 *  sentence whole; the others still trim. */
export function readKeepSpans(raw: unknown, keepCounts: readonly number[]): KeepSpans {
  const spans: KeepSpans = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return spans
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const sentence = Number(key)
    if (!Number.isInteger(sentence) || sentence < 1 || sentence > keepCounts.length) continue
    if (!Array.isArray(value) || value.length !== 2) continue
    const [first, last] = value as unknown[]
    if (typeof first !== 'number' || typeof last !== 'number') continue
    if (!Number.isInteger(first) || !Number.isInteger(last)) continue
    const count = keepCounts[sentence - 1]
    if (first < 1 || last < first || last > count) continue
    if (first === 1 && last === count) continue
    spans[sentence] = [first, last]
  }
  return spans
}

/**
 * A sentence cut down to the words worth filing, carrying its seams,
 * their votes, and its lead-in start over to the shorter text, so the
 * cutter and the lead-in see the words that will land. A seam outside
 * the kept words is gone, and a lead-in that began among the dropped
 * words is no lead-in. The joining punctuation the trim leaves goes,
 * and so does a period when the kept words stop short of the
 * sentence's end. A span that keeps nothing usable changes nothing.
 */
export function applyKeep(
  sentence: string,
  seams: readonly Seam[],
  confirmed: readonly number[] | undefined,
  start: number | undefined,
  span: readonly [number, number]
): { sentence: string; seams: Seam[]; confirmed: number[]; start: number | undefined } {
  const same = { sentence, seams: [...seams], confirmed: [...(confirmed ?? [])], start }
  const words = [...sentence.matchAll(WORD)]
  const [first, last] = span
  if (!Number.isInteger(first) || !Number.isInteger(last)) return same
  if (first < 1 || last < first || last > words.length || (first === 1 && last === words.length)) return same
  const from = words[first - 1].index ?? 0
  const end = words[last - 1]
  let text = sentence.slice(from, (end.index ?? 0) + end[0].length).replace(/[,;:]+$/, '')
  if (last < words.length && !ABBREVIATION.test(text)) text = text.replace(/(?<!\.)\.$/, '')
  text = text.trim()
  // Fillers alone are no item, whichever way they arrive (US-114).
  if (!hasWords(text)) return same
  const offered = findSeams(text)
  const carried = (confirmed ?? [])
    .map((n) => seams[n - 1])
    .filter((seam): seam is Seam => seam !== undefined && seam.start >= from && seam.end <= from + text.length)
    .map((seam) => offered.findIndex((o) => o.start === seam.start - from && o.end === seam.end - from) + 1)
    .filter((n) => n > 0)
  return {
    sentence: text,
    seams: offered,
    confirmed: [...new Set(carried)].sort((a, b) => a - b),
    start: start !== undefined && start > first ? start - (first - 1) : undefined
  }
}
