// SPDX-License-Identifier: GPL-3.0-only
// The sorter's main-process half (US-051): resolve a connection, ask
// the model to label the note's numbered sentences, validate the reply
// strictly, and copy tasks and ideas into their files with links back.
// It runs after the note is already on disk and touches no file unless
// the whole labeling is valid, so a rejected sort costs nothing: the
// note is in the inbox, where it already was. Nothing here logs the
// note's text.
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import {
  type ContextFile,
  type ContextItem,
  type HeldReason,
  type RelationVotes,
  SORT_RELATIONS_PROMPT,
  buildCompareContext,
  contextPrompt,
  heldReasonFor,
  pickRelated
} from '../../shared/compare'
import { type FiledPiece, type HeldPiece, assignPieceVotes, flattenPieces, piecesToCompare } from '../../shared/pieces'
import { parseTodo, tickLine } from '../../shared/todo'
import {
  DEFAULT_IDEAS_TEMPLATE,
  DEFAULT_NOTE_ENTRY_TEMPLATE,
  DEFAULT_NOTE_PATH_TEMPLATE,
  DEFAULT_TASKS_TEMPLATE,
  appendSeparator,
  noteMoment
} from '../../shared/notes'
import type { Settings } from '../../shared/settings'
import {
  DEFAULT_FILED_HEADING_TEMPLATE,
  type LeadIn,
  SORT_LEADS_PROMPT,
  SORT_SEAMS_PROMPT,
  SORT_SYSTEM_PROMPT,
  SORT_TOPIC_PROMPT,
  applySplits,
  findSeams,
  headingPrefix,
  holdBelow,
  leadPrompt,
  leadWords,
  numberedList,
  planFiling,
  remainingSentences,
  renderFiledHeading,
  seamPrompt,
  settle,
  splitSentences,
  splitUnits,
  validateSort
} from '../../shared/sorter'
import { buildDecisionRequest, readDecisionAnswers } from '../../shared/decide'
import type { SortLabel, SortVerdict } from '../../shared/sorter'
import { resolvePolishConnection } from '../formatter'
import type { PolishConfig } from '../formatter/llm'
import { askDecision } from './decide'
import { getApiKeyFor, getSettings, ringClearKey, ringSetKey, updateSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { writeAppLog } from '../window-watch'
import { errorCode, fileTail, fileText, resolveTemplateOrDefault } from './files'

export interface SortInput {
  /** The note as written to the inbox. Held in memory for Sort again,
   *  never logged. */
  text: string
  /** The base folder the note landed in: the notes folder, or the data
   *  folder after a redirect. Filed lines go to the same base. */
  base: string
  /** The inbox file relative to that base, for the links back. */
  inboxRelative: string
  when: Date
}

export type SortOutcome = 'filed' | 'rejected' | 'failed' | 'skipped'

/** A line a sort held in the inbox instead of filing (US-058 unsure,
 *  US-055 related), with what it was tied to, for the panel's actions.
 *  The text travels to the settings window only, like history does. */
export interface HeldLine {
  /** The key the panel's buttons use: unique per held line, since two
   *  pieces of one sentence can be held side by side. */
  id: number
  /** The sentence's position in the note, for the per-line settle. */
  position: number
  text: string
  label: SortLabel
  reason: HeldReason
  /** Set only when a cut sentence had to be held whole because the
   *  piece-by-piece look could not be answered: File it anyway then
   *  lands one line per piece. */
  pieces?: string[]
  /** The lead-in of the run this line came from (US-062): File it
   *  anyway nests the line under it. */
  lead?: LeadIn
  match?: {
    number: number
    file: ContextFile
    nth: number
    text: string
    done: boolean
    checkbox: boolean
  }
}

export interface SortReport {
  at: number
  outcome: SortOutcome
  tasks: number
  ideas: number
  notes: number
  /** Lines left in the inbox because a decision model was unsure of
   *  their label (US-058). Always zero on a chat connection. */
  held: number
  reason?: string
}

/** What the sort connection speaks: an OpenAI-compatible chat model,
 *  or a decision model that answers typed questions (US-057). */
export type SortProtocol = 'chat' | 'decide'

export interface SortOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Smoke only: a connection that bypasses the ring and settings. */
  connection?: PolishConfig
  /** Smoke only: the protocol for that connection. */
  protocol?: SortProtocol
  /** Smoke only: the chat connection a failed decision falls back to. */
  fallback?: PolishConfig
}

let lastSort: SortReport | null = null
let lastInput: SortInput | null = null
// Which sentence positions of the newest note a sort has settled (filed
// as a task or idea, or kept as a note). Sort again re-runs only the
// rest, so a landed line is never filed twice (review gate 2026-09-20,
// made per-line by US-058 so a held line can be retried on its own).
let settledFor: SortInput | null = null
let settled = new Set<number>()

// Invariant that keeps this one-slot memory honest: sorts run one at a
// time (inFlight), and every input that reaches here is the current or
// a former lastInput, so a read for another note resetting the slot can
// never race a sort that is still settling lines.
function settledSetFor(input: SortInput): Set<number> {
  if (settledFor !== input) {
    settledFor = input
    settled = new Set()
  }
  return settled
}

function settleFor(input: SortInput, positions: readonly number[], keptLocal: readonly number[]): void {
  settled = settle(settledSetFor(input), positions, keptLocal)
}

// Held lines belong to the note they came from, like the settled set.
let heldFor: SortInput | null = null
let heldLines: HeldLine[] = []
let nextHeldId = 1
// The tasks file exactly as it was when a held line's match was read,
// keyed by the held line's id. The one in-place edit accepts the file
// only when it still starts with that text: murmur's own appends pass,
// any edit in place refuses (review gate 2026-09-22: a hash refreshed
// by a later append could launder a hand edit between two clicks).
const heldSnapshots = new Map<number, { file: string; text: string }>()
// The heading topic of the newest sort, so a line filed later by hand
// lands under the same heading.
let lastTopic = ''
// What the newest held-line action did, for the panel; cleared when a
// sort starts so a stale refusal never outlives the lines it was about.
let lastAction: { ok: boolean; reason?: string } | null = null

export function getHeldLines(): HeldLine[] {
  return heldLines.map((h) => ({ ...h, match: h.match ? { ...h.match } : undefined }))
}

export function getLastAction(): { ok: boolean; reason?: string } | null {
  return lastAction
}

function setAction(result: { ok: boolean; reason?: string }): { ok: boolean; reason?: string } {
  lastAction = result
  return result
}

function filedPaths(when: Date): {
  tasksPath: ReturnType<typeof resolveTemplateOrDefault>
  ideasPath: ReturnType<typeof resolveTemplateOrDefault>
} {
  const settings = getSettings().notes
  return {
    tasksPath: resolveTemplateOrDefault(settings.tasksTemplate, DEFAULT_TASKS_TEMPLATE, when, 'tasks'),
    ideasPath: resolveTemplateOrDefault(settings.ideasTemplate, DEFAULT_IDEAS_TEMPLATE, when, 'ideas')
  }
}

type WriteOutcome =
  | { ok: true; counts: { tasks: number; ideas: number; notes: number } }
  | { ok: false; reason: string; landed: { tasks: number; ideas: number; notes: number } }

/**
 * File sentences under their labels: tasks and ideas as lines with a
 * link back, notes nowhere. Both files open before either is written,
 * the heading is written once per file, and the files' state is
 * remembered afterward for the one in-place edit.
 */
function writeEntries(
  input: SortInput,
  sentences: readonly string[],
  labels: readonly SortLabel[],
  topic: string,
  paths: ReturnType<typeof filedPaths> = filedPaths(input.when),
  leads: ReadonlyArray<LeadIn | null> = []
): WriteOutcome {
  const settings = getSettings()
  const { tasksPath, ideasPath } = paths
  const plan = planFiling(
    [...sentences],
    [...labels],
    {
      time: noteMoment(input.when).time,
      inboxFile: input.inboxRelative,
      tasksFile: tasksPath.relative,
      ideasFile: ideasPath.relative
    },
    leads
  )
  const counts = { tasks: plan.tasks.length, ideas: plan.ideas.length, notes: plan.notes.length }
  const tasksFile = join(input.base, ...tasksPath.segments)
  const ideasFile = join(input.base, ...ideasPath.segments)
  const writes: Array<{ file: string; lines: string[]; kind: 'tasks' | 'ideas' }> = []
  if (plan.tasks.length > 0) writes.push({ file: tasksFile, lines: plan.tasks, kind: 'tasks' })
  if (plan.ideas.length > 0) writes.push({ file: ideasFile, lines: plan.ideas, kind: 'ideas' })
  let targets: ReturnType<typeof openTargets>
  try {
    targets = openTargets(writes.map((w) => w.file))
  } catch (error) {
    writeAppLog(`[sort] write failed reason=${errorCode(error)} before any line landed`)
    return { ok: false, reason: `write ${errorCode(error)}`, landed: { tasks: 0, ideas: 0, notes: counts.notes } }
  }
  const landed = { tasks: 0, ideas: 0, notes: counts.notes }
  const heading = renderFiledHeading(settings.notes.filedHeadingTemplate, input.when, topic)
  try {
    writes.forEach((write, i) => {
      const existing = targets.texts[i]
      const prefix = headingPrefix(heading, existing)
      // A blank line sets a new heading apart from what came before it.
      const gap = prefix !== '' && existing.trim().length > 0 ? '\n' : ''
      writeSync(
        targets.fds[i],
        `${appendSeparator(targets.tails[i])}${gap}${prefix}${write.lines.join('\n')}\n`
      )
      landed[write.kind] = write.lines.length
    })
  } catch (error) {
    writeAppLog(
      `[sort] write failed reason=${errorCode(error)} landed tasks=${landed.tasks} ideas=${landed.ideas}`
    )
    for (const fd of targets.fds) closeSync(fd)
    return { ok: false, reason: `write ${errorCode(error)}`, landed }
  }
  for (const fd of targets.fds) closeSync(fd)
  return { ok: true, counts }
}

/** Sentence positions of a note a sort has not settled yet. */
function pendingFor(input: SortInput): number[] {
  return remainingSentences(splitSentences(input.text).length, settledSetFor(input))
}
// One sort at a time: a Sort again click during the model round trip
// joins the running sort instead of starting a second one that would
// append every line twice.
let inFlight: Promise<SortReport> | null = null

export function getLastSort(): SortReport | null {
  return lastSort
}

/** Sort again is offered only while the newest note has lines a sort
 *  has not settled: everything after a rejection, the held lines after
 *  a partial filing, nothing after a full one. */
export function canSortAgain(): boolean {
  return lastInput !== null && pendingFor(lastInput).length > 0
}

/** Keep the newest note so Sort again can re-run it after a reject. */
export function rememberForSort(input: SortInput): void {
  lastInput = input
}

export interface ResolvedSortConnection {
  config: PolishConfig
  slot: 'separate' | 'cleanup'
  protocol: SortProtocol
}

/** The connection the sort runs on: the separate slot when complete
 *  (its key served by the ring under its base URL), speaking whatever
 *  protocol it was set to; else whatever the cleanup pass would use
 *  (the cleanup slot, or the speech provider), which is always chat. */
export function resolveSortConnection(settings: Settings): ResolvedSortConnection | null {
  const slot = settings.notes.connection
  if (slot.enabled && slot.baseUrl !== '' && slot.llmModel !== '') {
    const key = getApiKeyFor(slot.baseUrl)
    if (key) {
      return {
        config: { baseUrl: slot.baseUrl, model: slot.llmModel, apiKey: key },
        slot: 'separate',
        protocol: slot.protocol === 'decide' ? 'decide' : 'chat'
      }
    }
    writeAppLog('[sort] separate connection has no key; using the cleanup connection')
  }
  const cleanup = resolvePolishConnection(settings)
  return cleanup ? { config: cleanup, slot: 'cleanup', protocol: 'chat' } : null
}

type ModelReply = { ok: true; content: string } | { ok: false; reason: string }

/** The two target files opened for append before either is written:
 *  a folder that cannot be made or a file that cannot be opened fails
 *  here, with nothing on disk changed. After both opens the only
 *  failure left is a disk filling mid-write, which is reported with
 *  what actually landed. */
function openTargets(files: string[]): {
  fds: number[]
  tails: Array<string | null>
  texts: string[]
} {
  const fds: number[] = []
  const tails: Array<string | null> = []
  const texts: string[] = []
  try {
    for (const file of files) {
      mkdirSync(dirname(file), { recursive: true })
      tails.push(fileTail(file))
      texts.push(fileText(file))
      fds.push(openSync(file, 'a'))
    }
    return { fds, tails, texts }
  } catch (error) {
    for (const fd of fds) closeSync(fd)
    throw error
  }
}

async function askModel(
  systemPrompt: string,
  prompt: string,
  cfg: PolishConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<ModelReply> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return { ok: false, reason: `http ${response.status}` }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { ok: false, reason: 'response not json' }
    }
    // A body that parses but is not an object (null, a list) is a
    // missing-text reply, not a network fault.
    const content =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content
        : undefined
    if (typeof content !== 'string') return { ok: false, reason: 'response missing text' }
    return { ok: true, content }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, reason: aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

function record(
  outcome: SortOutcome,
  counts: { tasks: number; ideas: number; notes: number; held?: number },
  reason?: string
): SortReport {
  lastSort = { at: Date.now(), outcome, held: 0, ...counts, ...(reason ? { reason } : {}) }
  return lastSort
}

const NONE = { tasks: 0, ideas: 0, notes: 0, held: 0 }

/**
 * Sort one note. Never throws; every outcome is a report and a log
 * line with a reason. Files are written only after the whole labeling
 * validated, tasks first, then ideas.
 */
export async function sortNote(
  input: SortInput,
  options: SortOptions = {},
  only?: readonly number[]
): Promise<SortReport> {
  if (inFlight) return inFlight
  inFlight = runSort(input, options, only).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runSort(input: SortInput, options: SortOptions, only?: readonly number[]): Promise<SortReport> {
  const settings = getSettings()
  if (!settings.notes.sort) return record('skipped', NONE, 'sorting off')
  if (isSmoke && !options.fetchImpl) return record('skipped', NONE, 'smoke')
  const units = splitUnits(input.text)
  const all = units.sentences
  // Sort again sends only the positions still unsettled; a fresh note
  // sends everything. The model sees whatever it gets numbered from 1.
  const positions = only ?? all.map((_, i) => i)
  const sentences = positions.map((i) => all[i])
  // A list line under a heading carries that heading as its lead-in
  // (US-062); the heading itself is never sent.
  const unitLeads = positions.map((i) => units.leads[i] ?? null)
  if (sentences.length === 0) return record('skipped', NONE, 'nothing to sort')
  // Held lines follow the note: a fresh note starts empty, and a line
  // sent again gets a fresh verdict in place of its old one.
  lastAction = null
  if (heldFor !== input) {
    heldFor = input
    heldLines = []
    heldSnapshots.clear()
  } else {
    const dropped = heldLines.filter((h) => positions.includes(h.position))
    heldLines = heldLines.filter((h) => !positions.includes(h.position))
    for (const h of dropped) heldSnapshots.delete(h.id)
  }

  const resolved: ResolvedSortConnection | null = options.connection
    ? { config: options.connection, slot: 'separate', protocol: options.protocol ?? 'chat' }
    : resolveSortConnection(settings)
  if (!resolved) {
    writeAppLog('[sort] failed reason=no connection; save a key for the speech, cleanup, or sort connection')
    return record('failed', NONE, 'no connection')
  }
  let { config, slot, protocol } = resolved
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 12_000
  // Topics only mean something when a heading can carry them, and only
  // a chat model can write one.
  const wantsTopic =
    settings.notes.topicHeadings && settings.notes.filedHeadingTemplate.includes('{topic}')
  // Seams (US-056): the code finds where a sentence could be cut and the
  // model only votes per seam; a note with no seam offers none.
  const seamsBySentence = sentences.map(findSeams)
  const seamCounts = seamsBySentence.map((s) => s.length)
  const offerSeams = seamCounts.some((n) => n > 0)
  // Lead-ins (US-062): for a sentence that could be a run, the model
  // points at the word where its first item begins; numbers only.
  const leadCounts = sentences.map((sentence, i) => leadWords(sentence, seamsBySentence[i] ?? []).length)
  const offerLeads = leadCounts.some((n) => n > 0)
  // Filed items (US-055): what is already in the two files, read from
  // the base this note landed in, so a dump is compared before it files.
  let tasksPath: ReturnType<typeof resolveTemplateOrDefault>
  let ideasPath: ReturnType<typeof resolveTemplateOrDefault>
  try {
    ;({ tasksPath, ideasPath } = filedPaths(input.when))
  } catch (error) {
    writeAppLog(`[sort] failed reason=${errorCode(error)}`)
    return record('failed', NONE, 'paths')
  }
  const tasksFile = join(input.base, ...tasksPath.segments)
  const tasksText = fileText(tasksFile)
  const items = buildCompareContext(tasksText, fileText(join(input.base, ...ideasPath.segments)))

  let verdict: SortVerdict | null = null
  let answeredBy = config.model
  if (protocol === 'decide') {
    // One request: a Choice per sentence, a Noul per seam. Anything
    // short of a complete set of answers falls back to the chat sorter,
    // so choosing the decision model can never be why a sort fails.
    const reply = await askDecision(
      buildDecisionRequest(config.model, sentences, seamsBySentence, items),
      config,
      fetchImpl,
      timeoutMs
    )
    const read = reply.ok
      ? readDecisionAnswers(reply.answers, sentences.length, seamCounts, items.length, leadCounts)
      : null
    if (reply.ok && read?.ok) {
      verdict = read
      answeredBy = reply.model
    } else {
      const reason = reply.ok ? `validate: ${read && !read.ok ? read.reason : 'unknown'}` : reply.reason
      writeAppLog(`[sort] decision failed reason=${reason} model=${config.model}; falling back to the chat sorter`)
      const cleanup = options.fallback ?? resolvePolishConnection(settings)
      if (!cleanup) {
        writeAppLog('[sort] failed reason=no connection; the decision model did not answer and no chat connection has a key')
        return record('failed', NONE, 'no connection')
      }
      config = cleanup
      slot = 'cleanup'
      protocol = 'chat'
      answeredBy = cleanup.model
    }
  }

  if (verdict === null) {
    const systemPrompt = [
      SORT_SYSTEM_PROMPT,
      ...(wantsTopic ? [SORT_TOPIC_PROMPT] : []),
      ...(offerSeams ? [SORT_SEAMS_PROMPT] : []),
      ...(offerLeads ? [SORT_LEADS_PROMPT] : []),
      ...(items.length > 0 ? [SORT_RELATIONS_PROMPT] : [])
    ].join(' ')
    const userPrompt = [
      numberedList(sentences),
      ...(offerSeams ? [`Seams:\n${seamPrompt(sentences, seamsBySentence)}`] : []),
      ...(offerLeads ? [`Lead words:\n${leadPrompt(sentences, seamsBySentence)}`] : []),
      ...(items.length > 0 ? [contextPrompt(items)] : [])
    ].join('\n\n')
    const reply = await askModel(systemPrompt, userPrompt, config, fetchImpl, timeoutMs)
    if (!reply.ok) {
      writeAppLog(`[sort] failed reason=${reply.reason} model=${config.model} slot=${slot}`)
      return record('failed', NONE, reply.reason)
    }
    const chat = validateSort(sentences.length, reply.content, {
      topic: wantsTopic,
      seamCounts,
      items: items.length,
      leadCounts
    })
    if (!chat.ok) {
      writeAppLog(`[sort] rejected reason=${chat.reason} model=${config.model} slot=${slot} sentences=${sentences.length}`)
      return record('rejected', NONE, chat.reason)
    }
    verdict = chat
  }

  // Held lines (US-058): on a decision connection, a line the model is
  // not sure of stays in the inbox, which is already verbatim, so
  // holding writes nothing. The chat path reports no confidence and
  // holds nothing. A note with nothing kept is a rejected sort.
  const threshold = settings.notes.connection.threshold
  const { kept: sure, held: unsure } = holdBelow(
    sentences.length,
    protocol === 'decide' ? verdict.confidence : undefined,
    threshold
  )
  for (const i of unsure) {
    const lead = unitLeads[i]
    heldLines.push({
      id: nextHeldId++,
      position: positions[i],
      text: sentences[i],
      label: verdict.labels[i],
      reason: 'unsure',
      ...(lead ? { lead } : {})
    })
  }
  if (sure.length === 0) {
    writeAppLog(`[sort] held every line reason=low confidence held=${unsure.length} threshold=${threshold} model=${answeredBy}`)
    return record('rejected', { ...NONE, held: unsure.length }, 'low confidence')
  }

  // Related lines (US-055): a line the vote tied to a filed item (a
  // task or idea either way, a note as a completion only) is held with
  // that item quoted, and settled, since the vote resolved it; the
  // buttons under Last note are the way to land or drop it.
  const { related, kept } = pickRelated(sure, verdict.labels, verdict.relations, items)
  // A related sentence the same reply also cut (US-056) is several
  // items, and the vote can only truly belong to one of them: cut it
  // first and ask about the pieces alone, so only the matching piece
  // is held and the rest file. If that second look cannot be answered
  // the whole line is held as before, carrying its pieces.
  const starts = verdict.starts ?? {}
  const { cut, whole } = piecesToCompare(related, sentences, verdict.labels, seamsBySentence, verdict.seams, starts, 'piece')
  let heldPieces: HeldPiece[] = []
  let filedPieces: FiledPiece[] = []
  // Sentences that were really cut and compared; on a failed second
  // look nothing is cut, so the log's split count leaves them out.
  let cutFiled = 0
  if (cut.length > 0) {
    const flat = flattenPieces(cut)
    const second = await askRelations(flat.sentences, items, { config, protocol, fetchImpl, timeoutMs })
    if (second.ok) {
      ;({ held: heldPieces, filed: filedPieces } = assignPieceVotes(cut, second.relations, items))
      cutFiled = cut.length
      writeAppLog(
        `[sort] compared pieces=${flat.sentences.length} of=${cut.length} held=${heldPieces.length} protocol=${protocol} model=${answeredBy}`
      )
    } else {
      writeAppLog(`[sort] piece compare failed reason=${second.reason} model=${answeredBy}; holding the whole line`)
      for (const set of cut) {
        const line = related.find((r) => r.local === set.local)
        if (line) whole.push(line)
      }
    }
  }
  const wholePieces = new Map(cut.map((set) => [set.local, set.pieces]))
  const wholeLeads = new Map(cut.map((set) => [set.local, set.lead]))
  const snapshot = { file: tasksFile, text: tasksText }
  const matchOf = (item: ContextItem): NonNullable<HeldLine['match']> => ({
    number: item.number,
    file: item.file,
    nth: item.nth,
    text: item.text,
    done: item.done,
    checkbox: item.checkbox
  })
  for (const { local, vote, item } of whole) {
    const id = nextHeldId++
    // A line held whole files whole: its heading lead-in, if any (a cut
    // run held whole carries its pieces bare and the run's lead-in).
    const lead = wholeLeads.get(local) ?? unitLeads[local]
    heldLines.push({
      id,
      position: positions[local],
      text: sentences[local],
      label: verdict.labels[local],
      reason: heldReasonFor(vote, item),
      pieces: wholePieces.get(local),
      match: matchOf(item),
      ...(lead ? { lead } : {})
    })
    heldSnapshots.set(id, snapshot)
  }
  for (const piece of heldPieces) {
    const id = nextHeldId++
    heldLines.push({
      id,
      position: positions[piece.local],
      text: piece.text,
      label: piece.label,
      reason: heldReasonFor(piece.vote, piece.item),
      match: matchOf(piece.item),
      ...(piece.lead ? { lead: piece.lead } : {})
    })
    heldSnapshots.set(id, snapshot)
  }
  heldLines.sort((a, b) => a.position - b.position || a.id - b.id)
  settleFor(input, positions, related.map((r) => r.local))
  const relatedHeld = whole.length + heldPieces.length
  const heldCount = unsure.length + relatedHeld

  const keptLabels = kept.map((i) => verdict.labels[i])

  // Filed in spoken order: a kept sentence lands whole or cut at its
  // confirmed seams (only task and idea lines split, and a sentence
  // with no vote stays whole), and a compared sentence lands the
  // pieces no vote tied to an item (review gate 2026-09-22).
  const expanded: { sentences: string[]; labels: SortLabel[]; leads: Array<LeadIn | null> } = {
    sentences: [],
    labels: [],
    leads: []
  }
  let splitCount = cutFiled
  let leadCount = 0
  for (const i of sure) {
    if (kept.includes(i)) {
      const seamVote = verdict.seams[i + 1]
      const start = starts[i + 1]
      const one = applySplits(
        [sentences[i]],
        [verdict.labels[i]],
        [seamsBySentence[i] ?? []],
        seamVote ? { 1: seamVote } : {},
        start !== undefined ? { 1: start } : {},
        `run-${positions[i]}`
      )
      if (one.sentences.length > 1) splitCount += 1
      if (one.leads[0]) leadCount += 1
      expanded.sentences.push(...one.sentences)
      expanded.labels.push(...one.labels)
      // A list line keeps its heading's lead-in; a cut run its own.
      expanded.leads.push(...one.leads.map((lead) => lead ?? unitLeads[i]))
      continue
    }
    for (const piece of filedPieces) {
      if (piece.local !== i) continue
      expanded.sentences.push(piece.text)
      expanded.labels.push(piece.label)
      expanded.leads.push(piece.lead)
    }
  }
  lastTopic = verdict.topic
  const written = writeEntries(
    input,
    expanded.sentences,
    expanded.labels,
    verdict.topic,
    { tasksPath, ideasPath },
    expanded.leads
  )
  if (!written.ok) {
    // Whatever landed is settled so Sort again cannot land it twice;
    // lines whose file failed stay pending in the verbatim inbox
    // (review gate 2026-09-22).
    const landed = written.landed
    settleFor(
      input,
      positions,
      kept.filter((_, k) => {
        const label = keptLabels[k]
        return label === 'note' || (label === 'task' && landed.tasks > 0) || (label === 'idea' && landed.ideas > 0)
      })
    )
    return record('failed', { ...landed, held: heldCount }, written.reason)
  }
  // Everything kept is settled for this note; unsure lines stay
  // pending so Sort again can send them alone.
  settleFor(input, positions, kept)
  const counts = { ...written.counts, held: heldCount }
  const topicNote = wantsTopic && protocol === 'decide' ? ' topic=unavailable' : ''
  const heldNote =
    heldCount > 0 ? ` held=${heldCount} unsure=${unsure.length} related=${relatedHeld} threshold=${threshold}` : ''
  writeAppLog(
    `[sort] filed tasks=${counts.tasks} ideas=${counts.ideas} notes=${counts.notes} split=${splitCount} protocol=${protocol} model=${answeredBy} slot=${slot}${heldNote}${topicNote}${leadCount > 0 ? ` leads=${leadCount}` : ''}`
  )
  return record('filed', counts)
}

/**
 * The second, smaller request of a piece-by-piece comparison: the
 * pieces as numbered sentences against the same items, on the same
 * connection the sort used. No seams are offered and no topic asked;
 * the labels come back but the sentence's own label is kept. Any
 * failure is reported, never thrown; the caller holds the whole line.
 */
async function askRelations(
  pieces: readonly string[],
  items: readonly ContextItem[],
  via: { config: PolishConfig; protocol: SortProtocol; fetchImpl: typeof fetch; timeoutMs: number }
): Promise<{ ok: true; relations: RelationVotes } | { ok: false; reason: string }> {
  const { config, protocol, fetchImpl, timeoutMs } = via
  const noSeams = pieces.map(() => 0)
  if (protocol === 'decide') {
    const reply = await askDecision(
      buildDecisionRequest(config.model, pieces, pieces.map(() => []), items),
      config,
      fetchImpl,
      timeoutMs
    )
    if (!reply.ok) return { ok: false, reason: reply.reason }
    const read = readDecisionAnswers(reply.answers, pieces.length, noSeams, items.length)
    if (!read.ok) return { ok: false, reason: `validate: ${read.reason}` }
    return { ok: true, relations: read.relations }
  }
  const systemPrompt = [SORT_SYSTEM_PROMPT, SORT_RELATIONS_PROMPT].join(' ')
  const userPrompt = [numberedList([...pieces]), contextPrompt(items)].join('\n\n')
  const reply = await askModel(systemPrompt, userPrompt, config, fetchImpl, timeoutMs)
  if (!reply.ok) return { ok: false, reason: reply.reason }
  const chat = validateSort(pieces.length, reply.content, { seamCounts: noSeams, items: items.length })
  if (!chat.ok) return { ok: false, reason: chat.reason }
  return { ok: true, relations: chat.relations }
}

// ------------------------------------------------- held line actions ---
// Every write past the sort itself is a click. File it anyway lands one
// held line through the same writer, Skip drops it, and Tick it is the
// one in-place edit murmur makes to a vault file.

function takeHeld(id: number): HeldLine | null {
  return heldLines.find((h) => h.id === id) ?? null
}

function dropHeld(entry: HeldLine): void {
  heldLines = heldLines.filter((h) => h !== entry)
}

/** Land one held line, with its link, under the newest sort's heading.
 *  A cut sentence held whole lands one line per piece. */
export function fileHeldLine(id: number): { ok: boolean; reason?: string } {
  if (inFlight) return setAction({ ok: false, reason: 'a sort is running; try again in a moment' })
  const input = heldFor
  const entry = takeHeld(id)
  if (!input || !entry) return setAction({ ok: false, reason: 'nothing is held at that line' })
  if (entry.label === 'note') return setAction({ ok: false, reason: 'a note stays in the inbox; tick its match, or skip it' })
  const lines = entry.pieces && entry.pieces.length > 1 ? entry.pieces : [entry.text]
  const written = writeEntries(
    input,
    lines,
    lines.map(() => entry.label),
    lastTopic,
    filedPaths(input.when),
    lines.map(() => entry.lead ?? null)
  )
  if (!written.ok) return setAction({ ok: false, reason: written.reason })
  settleFor(input, [entry.position], [0])
  dropHeld(entry)
  heldSnapshots.delete(id)
  writeAppLog(`[sort] filed held line position=${entry.position} reason=${entry.reason} lines=${lines.length}`)
  return setAction({ ok: true })
}

/** Drop a held line: it stays in the inbox and is not sent again. */
export function skipHeldLine(id: number): { ok: boolean; reason?: string } {
  if (inFlight) return setAction({ ok: false, reason: 'a sort is running; try again in a moment' })
  const input = heldFor
  const entry = takeHeld(id)
  if (!input || !entry) return setAction({ ok: false, reason: 'nothing is held at that line' })
  settleFor(input, [entry.position], [0])
  dropHeld(entry)
  heldSnapshots.delete(id)
  writeAppLog(`[sort] skipped held line position=${entry.position} reason=${entry.reason}`)
  return setAction({ ok: true })
}

const BACKUP_KEEP_MS = 24 * 60 * 60 * 1000

function backupDir(): string {
  return join(app.getPath('userData'), 'notes-backups')
}

/** Keep a copy of a file as it was, and let yesterday's copies go. The
 *  age of a copy is the moment in its name, never its mtime: on Windows
 *  a copy inherits the source's last-write time and would prune itself
 *  in the same call (review gate 2026-09-22). */
function backup(file: string): void {
  const dir = backupDir()
  mkdirSync(dir, { recursive: true })
  const now = Date.now()
  copyFileSync(file, join(dir, `${basename(file, '.md')}.${now}.md`))
  for (const name of readdirSync(dir)) {
    const stamp = Number(/\.(\d{10,})\.md$/.exec(name)?.[1] ?? Number.NaN)
    if (Number.isFinite(stamp) && stamp < now - BACKUP_KEEP_MS) {
      try {
        unlinkSync(join(dir, name))
      } catch {
        // A copy that cannot be removed is left alone.
      }
    }
  }
}

/**
 * Tick the item a held completion matched: the one box becomes [x],
 * every other byte of the file stays as it was, the write goes through
 * a temp file and a rename, a copy of the file as it was is kept for a
 * day, and a file that changed in place since murmur read the match is
 * refused. Only a checkbox in the tasks file can be ticked.
 */
export function tickHeldMatch(id: number): { ok: boolean; reason?: string } {
  if (inFlight) return setAction({ ok: false, reason: 'a sort is running; try again in a moment' })
  const input = heldFor
  const entry = takeHeld(id)
  if (!input || !entry) return setAction({ ok: false, reason: 'nothing is held at that line' })
  const match = entry.match
  if (!match || match.file !== 'tasks' || !match.checkbox) {
    return setAction({ ok: false, reason: 'that line has no box in the tasks file to tick' })
  }
  if (match.done) return setAction({ ok: false, reason: 'that item is already ticked' })
  const snapshot = heldSnapshots.get(id)
  if (!snapshot) return setAction({ ok: false, reason: 'the tasks file has not been read for that line' })
  let raw: Buffer
  try {
    raw = readFileSync(snapshot.file)
  } catch (error) {
    return setAction({ ok: false, reason: `could not read the tasks file (${errorCode(error)})` })
  }
  const current = raw.toString('utf8')
  // Bytes UTF-8 cannot represent would come back changed; refuse rather
  // than rewrite more than one byte.
  if (!Buffer.from(current, 'utf8').equals(raw)) {
    return setAction({ ok: false, reason: 'the tasks file holds bytes murmur cannot preserve; tick it by hand' })
  }
  // murmur's own appends since the read are fine; anything else is not.
  if (!current.startsWith(snapshot.text)) {
    return setAction({ ok: false, reason: 'the tasks file changed since murmur read it; tick it by hand, or dump again' })
  }
  // The line must still be the line the match quoted.
  if (parseTodo(current)[match.nth]?.text !== match.text) {
    return setAction({ ok: false, reason: 'that item is no longer where murmur read it; tick it by hand' })
  }
  const ticked = tickLine(current, match.nth)
  if (!ticked.ok) {
    return setAction({
      ok: false,
      reason: ticked.reason === 'already done' ? 'that item is already ticked' : 'that item is no longer in the file'
    })
  }
  const tmp = `${snapshot.file}.murmur-tmp`
  try {
    backup(snapshot.file)
    writeFileSync(tmp, ticked.text, 'utf8')
    renameSync(tmp, snapshot.file)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      // Nothing to clean, or already gone.
    }
    writeAppLog(`[sort] tick failed reason=${errorCode(error)}`)
    return setAction({ ok: false, reason: `could not write the file (${errorCode(error)})` })
  }
  settleFor(input, [entry.position], [0])
  dropHeld(entry)
  heldSnapshots.delete(id)
  writeAppLog(`[sort] ticked file=tasks nth=${match.nth}`)
  return setAction({ ok: true })
}

/** Re-run the sort on the newest note (Sort again in settings): only
 *  the lines no sort has settled, never beside a running sort. */
export async function sortLastNote(options: SortOptions = {}): Promise<SortReport | null> {
  if (inFlight) return inFlight
  if (!lastInput) return lastSort
  const pending = pendingFor(lastInput)
  if (pending.length === 0) return lastSort
  return sortNote(lastInput, options, pending)
}

export function initSorter(): void {
  const probeMoment = new Date(2026, 8, 18, 10, 32)
  const mockReply = (content: string): typeof fetch =>
    (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as typeof fetch
  const cfg: PolishConfig = { baseUrl: 'https://mock.local/v1', model: 'smoke-sorter', apiKey: 'k' }
  const layout = {
    pathTemplate: DEFAULT_NOTE_PATH_TEMPLATE,
    entryTemplate: DEFAULT_NOTE_ENTRY_TEMPLATE,
    tasksTemplate: DEFAULT_TASKS_TEMPLATE,
    ideasTemplate: DEFAULT_IDEAS_TEMPLATE,
    filedHeadingTemplate: DEFAULT_FILED_HEADING_TEMPLATE,
    topicHeadings: false
  }

  registerSmokeCheck('noteSort', async () => {
    // Off writes nothing. On, a valid labeling copies tasks and ideas
    // into their files with links back and leaves the inbox untouched;
    // chatter, a missing sentence, and a failed request each touch no
    // file and report a reason.
    const before = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-vault-sort')
    const inbox = join(vault, 'murmur', 'inbox', '2026-09-18.md')
    const todo = join(vault, 'murmur', 'todo.md')
    const ideas = join(vault, 'murmur', 'ideas.md')
    const read = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '')
    const input: SortInput = {
      text: 'Call the dentist. Maybe the wizard asks for the vault. Nice weather today. Email Bob.',
      base: vault,
      inboxRelative: 'murmur/inbox/2026-09-18.md',
      when: probeMoment
    }
    try {
      mkdirSync(join(vault, 'murmur', 'inbox'), { recursive: true })
      writeFileSync(inbox, '## 10:32\n\nCall the dentist. Maybe the wizard asks for the vault. Nice weather today. Email Bob.\n\n')
      const inboxBefore = read(inbox)
      updateSettings({ notes: { folder: vault, sort: false, ...layout } })
      const off = await sortNote(input, { fetchImpl: mockReply('{"1":"task"}'), connection: cfg })
      const offClean = off.outcome === 'skipped' && !existsSync(todo) && !existsSync(ideas)

      updateSettings({ notes: { sort: true } })
      const filed = await sortNote(input, {
        fetchImpl: mockReply('```json\n{"1":"task","2":"idea","3":"note","4":"task"}\n```'),
        connection: cfg
      })
      const todoText = read(todo)
      const ideasText = read(ideas)
      const filedOk =
        filed.outcome === 'filed' &&
        filed.tasks === 2 &&
        filed.ideas === 1 &&
        filed.notes === 1 &&
        todoText ===
          '## 2026-09-18\n- [ ] Call the dentist. ([10:32](inbox/2026-09-18.md))\n- [ ] Email Bob. ([10:32](inbox/2026-09-18.md))\n' &&
        ideasText === '## 2026-09-18\n- Maybe the wizard asks for the vault. ([10:32](inbox/2026-09-18.md))\n' &&
        read(inbox) === inboxBefore

      // The filed input is remembered: Sort again offers nothing for it.
      rememberForSort(input)
      const noRefile = !canSortAgain()

      const chatter = await sortNote(input, { fetchImpl: mockReply('Sure! {"1":"task","2":"idea"}'), connection: cfg })
      const failed = await sortNote(input, {
        fetchImpl: (async () => new Response('{}', { status: 500 })) as typeof fetch,
        connection: cfg
      })
      // An ideas file that cannot be opened (its parent is a regular
      // file) fails before a single task line lands.
      writeFileSync(join(vault, 'murmur', 'blocker'), 'a file where a folder is expected\n')
      updateSettings({ notes: { ideasTemplate: 'murmur/blocker/ideas.md' } })
      const halfBlocked = await sortNote(input, {
        fetchImpl: mockReply('{"1":"task","2":"idea","3":"note","4":"task"}'),
        connection: cfg
      })
      updateSettings({ notes: { ideasTemplate: DEFAULT_IDEAS_TEMPLATE } })
      // Two overlapping calls share one run: the second joins the first.
      const slow: typeof fetch = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"task","2":"idea"}' } }] }), { status: 200 })
      }) as typeof fetch
      const [first, second] = await Promise.all([
        sortNote(input, { fetchImpl: slow, connection: cfg }),
        sortNote(input, { fetchImpl: slow, connection: cfg })
      ])
      const joined = first === second && first.outcome === 'rejected'
      const untouched = read(todo) === todoText && read(ideas) === ideasText

      // A second dump the same day joins the heading already there.
      const later: SortInput = { ...input, text: 'Book the flight.' }
      const again = await sortNote(later, { fetchImpl: mockReply('{"1":"task"}'), connection: cfg })
      const grouped = read(todo)
      const headings = grouped.split('\n').filter((l) => l.trim() === '## 2026-09-18').length
      const groupedOk =
        again.outcome === 'filed' &&
        headings === 1 &&
        grouped === `${todoText}- [ ] Book the flight. ([10:32](inbox/2026-09-18.md))\n`

      // Topics on: the model's name joins the heading in BOTH files,
      // and a name too long to trust falls back to the date alone
      // while the words still file.
      updateSettings({ notes: { topicHeadings: true } })
      const named: SortInput = { ...input, text: 'Renew the domain. Maybe move the blog.' }
      const withTopic = await sortNote(named, {
        fetchImpl: mockReply('{"1":"task","2":"idea","topic":"Domain and blog"}'),
        connection: cfg
      })
      const unnamed: SortInput = { ...input, text: 'Pay the invoice.' }
      const badTopic = await sortNote(unnamed, {
        fetchImpl: mockReply('{"1":"task","topic":"a topic far too long to ever belong in a heading line"}'),
        connection: cfg
      })
      updateSettings({ notes: { topicHeadings: false } })
      const namedTodo = read(todo)
      const namedIdeas = read(ideas)

      // Seams (US-056): the prompt offers the seams murmur found with
      // both sides shown, a vote of yes on two of them cuts the sentence
      // into three lines with every word kept, and a vote naming a seam
      // that does not exist leaves the sentence whole.
      const run: SortInput = {
        ...input,
        text: 'Tomorrow we are getting groceries, getting tacos, and going to the playground.'
      }
      let captured = { system: '', user: '' }
      const capturing = (content: string): typeof fetch =>
        (async (_url: unknown, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            messages?: Array<{ role: string; content: string }>
          }
          captured = {
            system: body.messages?.find((m) => m.role === 'system')?.content ?? '',
            user: body.messages?.find((m) => m.role === 'user')?.content ?? ''
          }
          return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
        }) as typeof fetch
      const todoBeforeSplit = read(todo)
      const splitVote = await sortNote(run, {
        fetchImpl: capturing('{"1":"task","seams":{"1":[1,2]}}'),
        connection: cfg
      })
      const afterSplit = read(todo)
      const promptOk =
        captured.system.includes('key "seams"') &&
        captured.user.includes(
          '1.1: "Tomorrow we are getting groceries" | "getting tacos, and going to the playground."'
        ) &&
        captured.user.includes('1.2: "Tomorrow we are getting groceries, getting tacos" | "going to the playground."')
      const splitOk =
        splitVote.outcome === 'filed' &&
        splitVote.tasks === 3 &&
        afterSplit ===
          `${todoBeforeSplit}- [ ] Tomorrow we are getting groceries ([10:32](inbox/2026-09-18.md))\n- [ ] getting tacos ([10:32](inbox/2026-09-18.md))\n- [ ] going to the playground ([10:32](inbox/2026-09-18.md))\n`
      // One sentence's bad vote leaves it whole while the other still splits.
      const pair: SortInput = { ...input, text: 'Buy eggs, and buy milk. Call Bob, then call Ann.' }
      const wholeVote = await sortNote(pair, {
        fetchImpl: mockReply('{"1":"task","2":"task","seams":{"1":[1],"2":[9]}}'),
        connection: cfg
      })
      const wholeOk =
        wholeVote.outcome === 'filed' &&
        wholeVote.tasks === 3 &&
        read(todo) ===
          `${afterSplit}- [ ] Buy eggs ([10:32](inbox/2026-09-18.md))\n- [ ] buy milk ([10:32](inbox/2026-09-18.md))\n- [ ] Call Bob, then call Ann. ([10:32](inbox/2026-09-18.md))\n`

      // Decision connection (US-057): the same filing from typed answers
      // (a Choice per sentence, a Noul per seam, in one request), and a
      // decision that fails for any reason falling back to the chat
      // sorter with a log line rather than failing the sort.
      const decideCfg: PolishConfig = { baseUrl: 'https://mock-decide.local/v1', model: 'jev-latest', apiKey: 'k' }
      let decisionBody: { state?: unknown; questions?: Record<string, { type?: string }> } = {}
      const routed = (decision: string | number, chat = '{"1":"task"}'): typeof fetch =>
        (async (url: unknown, init?: RequestInit) => {
          if (String(url).endsWith('/systemone')) {
            decisionBody = JSON.parse(String(init?.body ?? '{}')) as typeof decisionBody
            if (typeof decision === 'number') return new Response('{}', { status: decision })
            return new Response(decision, { status: 200 })
          }
          return new Response(JSON.stringify({ choices: [{ message: { content: chat } }] }), { status: 200 })
        }) as typeof fetch
      const decidedInput: SortInput = { ...input, text: 'Renew the domain, and pay the invoice. Nice day.' }
      const decided = await sortNote(decidedInput, {
        fetchImpl: routed(
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: {
              label_1: { type: 'choice', choice: 'task', confidence: 0.9, probabilities: { task: 0.9, idea: 0.05, note: 0.05 } },
              label_2: { type: 'choice', choice: 'note', confidence: 0.8, probabilities: { task: 0.1, idea: 0.1, note: 0.8 } },
              seam_1_1: { type: 'noul', noul: 0.91 }
            }
          })
        ),
        connection: decideCfg,
        protocol: 'decide'
      })
      const decidedTodo = read(todo)
      const decisionOk =
        decided.outcome === 'filed' &&
        decided.tasks === 2 &&
        decided.notes === 1 &&
        decidedTodo.endsWith(
          '- [ ] Renew the domain ([10:32](inbox/2026-09-18.md))\n- [ ] pay the invoice ([10:32](inbox/2026-09-18.md))\n'
        ) &&
        typeof decisionBody.state === 'object' &&
        decisionBody.questions?.label_1?.type === 'choice' &&
        decisionBody.questions?.label_2?.type === 'choice' &&
        decisionBody.questions?.seam_1_1?.type === 'noul' &&
        // Filed items exist by now, so the relation questions ride along.
        decisionBody.questions?.relation_1?.type === 'choice' &&
        decisionBody.questions?.match_1?.type === 'choice'
      const limited = await sortNote({ ...input, text: 'Book the flight.' }, {
        fetchImpl: routed(429),
        connection: decideCfg,
        protocol: 'decide',
        fallback: cfg
      })
      const limitedOk =
        limited.outcome === 'filed' &&
        limited.tasks === 1 &&
        read(todo).endsWith('- [ ] Book the flight. ([10:32](inbox/2026-09-18.md))\n')
      const unanswered = await sortNote({ ...input, text: 'Water the plants.' }, {
        fetchImpl: routed(JSON.stringify({ model: 'jev-1.13.0', answers: {} })),
        connection: decideCfg,
        protocol: 'decide',
        fallback: cfg
      })
      const unansweredOk = unanswered.outcome === 'filed' && unanswered.tasks === 1
      // The chat path's own two-sentence fixture on the decide path: one
      // seam confirmed, one refused, so the same sentence splits and the
      // same sentence stays whole whichever model voted.
      const sameFixture = await sortNote(pair, {
        fetchImpl: routed(
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: {
              label_1: { type: 'choice', choice: 'task', confidence: 0.9, probabilities: { task: 0.9, idea: 0.05, note: 0.05 } },
              label_2: { type: 'choice', choice: 'task', confidence: 0.9, probabilities: { task: 0.9, idea: 0.05, note: 0.05 } },
              seam_1_1: { type: 'noul', noul: 0.88 },
              seam_2_1: { type: 'noul', noul: 0.12 }
            }
          })
        ),
        connection: decideCfg,
        protocol: 'decide'
      })
      const sameFixtureOk =
        sameFixture.outcome === 'filed' &&
        sameFixture.tasks === 3 &&
        read(todo).endsWith(
          '- [ ] Buy eggs ([10:32](inbox/2026-09-18.md))\n- [ ] buy milk ([10:32](inbox/2026-09-18.md))\n- [ ] Call Bob, then call Ann. ([10:32](inbox/2026-09-18.md))\n'
        )

      // Held lines (US-058): an unsure label stays in the inbox, the sure
      // ones file, Sort again sends only the held line and files it
      // without doubling the landed one, and a note the model is unsure
      // of throughout is a rejected sort with nothing written.
      const heldInput: SortInput = { ...input, text: 'Call the vet. Maybe something. Email Ann.' }
      rememberForSort(heldInput)
      const partial = await sortNote(heldInput, {
        fetchImpl: routed(
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: {
              label_1: { type: 'choice', choice: 'task', confidence: 0.95 },
              label_2: { type: 'choice', choice: 'idea', confidence: 0.2 },
              label_3: { type: 'choice', choice: 'task', confidence: 0.9 }
            }
          })
        ),
        connection: decideCfg,
        protocol: 'decide'
      })
      const afterPartial = read(todo)
      const partialOk =
        partial.outcome === 'filed' &&
        partial.tasks === 2 &&
        partial.held === 1 &&
        afterPartial.endsWith(
          '- [ ] Call the vet. ([10:32](inbox/2026-09-18.md))\n- [ ] Email Ann. ([10:32](inbox/2026-09-18.md))\n'
        ) &&
        !afterPartial.includes('Maybe something') &&
        read(inbox) === inboxBefore &&
        canSortAgain()
      const retried = await sortLastNote({
        fetchImpl: routed(
          JSON.stringify({ model: 'jev-1.13.0', answers: { label_1: { type: 'choice', choice: 'task', confidence: 0.8 } } })
        ),
        connection: decideCfg,
        protocol: 'decide'
      })
      const afterRetry = read(todo)
      const retryOk =
        retried?.outcome === 'filed' &&
        retried.tasks === 1 &&
        retried.held === 0 &&
        afterRetry === `${afterPartial}- [ ] Maybe something. ([10:32](inbox/2026-09-18.md))\n` &&
        afterRetry.split('Call the vet.').length === 2 &&
        read(inbox) === inboxBefore &&
        !canSortAgain()
      const allHeld = await sortNote({ ...input, text: 'Hmm. Well.' }, {
        fetchImpl: routed(
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: {
              label_1: { type: 'choice', choice: 'note', confidence: 0.3 },
              label_2: { type: 'choice', choice: 'task', confidence: 0.1 }
            }
          })
        ),
        connection: decideCfg,
        protocol: 'decide'
      })
      const allHeldOk =
        allHeld.outcome === 'rejected' &&
        allHeld.reason === 'low confidence' &&
        allHeld.held === 2 &&
        read(todo) === afterRetry &&
        read(inbox) === inboxBefore

      // Duplicates and completions (US-055). The model votes numbers
      // against the filed items; a line tied to one is held with the
      // item quoted and nothing is written for it. File it anyway lands
      // exactly that line once; Tick it changes one box and nothing
      // else and keeps a copy; a file that moved underneath is refused.
      const numberOf = (text: string, open = false): number =>
        buildCompareContext(read(todo), read(ideas)).find((i) => i.text === text && (!open || !i.done))?.number ?? 0
      const vetNumber = numberOf('Call the vet.')
      const dupInput: SortInput = { ...input, text: 'Call the vet. Renew the passport.' }
      rememberForSort(dupInput)
      const todoBeforeDup = read(todo)
      const dup = await sortNote(dupInput, {
        fetchImpl: mockReply(`{"1":"task","2":"task","relations":{"1":[1,${vetNumber}]}}`),
        connection: cfg
      })
      const heldDup = getHeldLines()
      const dupOk =
        vetNumber > 0 &&
        dup.outcome === 'filed' &&
        dup.tasks === 1 &&
        dup.held === 1 &&
        read(todo) === `${todoBeforeDup}- [ ] Renew the passport. ([10:32](inbox/2026-09-18.md))\n` &&
        heldDup.length === 1 &&
        heldDup[0].reason === 'same' &&
        heldDup[0].text === 'Call the vet.' &&
        heldDup[0].match?.text === 'Call the vet.' &&
        !canSortAgain() &&
        read(inbox) === inboxBefore
      const anyway = fileHeldLine(heldDup[0]?.id ?? -1)
      const anywayOk =
        anyway.ok &&
        read(todo) ===
          `${todoBeforeDup}- [ ] Renew the passport. ([10:32](inbox/2026-09-18.md))\n- [ ] Call the vet. ([10:32](inbox/2026-09-18.md))\n` &&
        getHeldLines().length === 0 &&
        !fileHeldLine(heldDup[0]?.id ?? -1).ok

      const passportNumber = numberOf('Renew the passport.')
      const doneInput: SortInput = { ...input, text: 'I renewed the passport.' }
      rememberForSort(doneInput)
      const beforeTick = read(todo)
      const done = await sortNote(doneInput, {
        fetchImpl: mockReply(`{"1":"task","relations":{"1":[2,${passportNumber}]}}`),
        connection: cfg
      })
      const heldDone = getHeldLines()
      const completesOk =
        done.outcome === 'filed' &&
        done.tasks === 0 &&
        done.held === 1 &&
        heldDone[0]?.reason === 'completes' &&
        heldDone[0]?.match?.text === 'Renew the passport.' &&
        read(todo) === beforeTick
      const ticked = tickHeldMatch(heldDone[0]?.id ?? -1)
      const afterTick = read(todo)
      const backups = existsSync(backupDir()) ? readdirSync(backupDir()) : []
      const tickOk =
        ticked.ok &&
        afterTick === beforeTick.replace('- [ ] Renew the passport.', '- [x] Renew the passport.') &&
        afterTick.length === beforeTick.length &&
        getHeldLines().length === 0 &&
        backups.length >= 1 &&
        readFileSync(join(backupDir(), backups[backups.length - 1]), 'utf8') === beforeTick

      const openVet = numberOf('Call the vet.', true)
      const changedInput: SortInput = { ...input, text: 'I called the vet.' }
      rememberForSort(changedInput)
      await sortNote(changedInput, {
        fetchImpl: mockReply(`{"1":"task","relations":{"1":[2,${openVet}]}}`),
        connection: cfg
      })
      // An edit in place (a line removed) is refused even after murmur's
      // own append re-baselined the file, and even when it only changes
      // what comes after the read (an append by hand passes).
      const beforeEdit = read(todo)
      const edited = beforeEdit.replace('- [x] Renew the passport. ([10:32](inbox/2026-09-18.md))\n', '')
      writeFileSync(todo, edited)
      const refused = tickHeldMatch(getHeldLines()[0]?.id ?? -1)
      appendFileSync(todo, '- [ ] edited by hand\n')
      const refusedAgain = tickHeldMatch(getHeldLines()[0]?.id ?? -1)
      const refusedOk =
        edited !== beforeEdit &&
        !refused.ok &&
        (refused.reason ?? '').includes('changed') &&
        !refusedAgain.ok &&
        read(todo).endsWith('- [ ] edited by hand\n') &&
        getLastAction()?.ok === false
      const skipped = skipHeldLine(getHeldLines()[0]?.id ?? -1)
      const skipOk = skipped.ok && getHeldLines().length === 0 && !canSortAgain()
      // Put the removed line back so the next case finds the ticked passport.
      writeFileSync(todo, `${beforeEdit}- [ ] edited by hand\n`)

      // The same relation on a decision connection, from typed answers:
      // the passport is ticked now, so the match reads as finished before.
      const passportAgain = numberOf('Renew the passport.')
      const decideDup: SortInput = { ...input, text: 'Renew the passport.' }
      rememberForSort(decideDup)
      const beforeDecideDup = read(todo)
      const dd = await sortNote(decideDup, {
        fetchImpl: routed(
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: {
              label_1: { type: 'choice', choice: 'task', confidence: 0.9 },
              relation_1: { type: 'choice', choice: 'same' },
              match_1: { type: 'choice', choice: String(passportAgain) }
            }
          })
        ),
        connection: decideCfg,
        protocol: 'decide'
      })
      const decideDupOk =
        dd.outcome === 'filed' &&
        dd.held === 1 &&
        // A sort clears the stale action note.
        getLastAction() === null &&
        read(todo) === beforeDecideDup &&
        getHeldLines()[0]?.reason === 'done-before' &&
        skipHeldLine(getHeldLines()[0]?.id ?? -1).ok
      // A duplicate inside a comma run (US-055 meets US-056): the run
      // is cut first and the pieces are compared alone in a second
      // request, so only the matching piece is held and the rest file.
      const vetOpen = numberOf('Call the vet.', true)
      let bodies: string[] = []
      const sequence = (replies: Array<string | number>): typeof fetch => {
        let n = 0
        bodies = []
        return (async (_url: unknown, init?: RequestInit) => {
          bodies.push(String(init?.body ?? ''))
          const reply = replies[Math.min(n++, replies.length - 1)]
          if (typeof reply === 'number') return new Response('{}', { status: reply })
          return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 })
        }) as typeof fetch
      }
      const runInput: SortInput = { ...input, text: 'Pay the gas bill, and call the vet. Email Bob.' }
      rememberForSort(runInput)
      const beforeRun = read(todo)
      const logPath = join(app.getPath('userData'), 'logs', 'murmur.log')
      const logBeforeRun = read(logPath).length
      const comma = await sortNote(runInput, {
        fetchImpl: sequence([
          `{"1":"task","2":"task","seams":{"1":[1]},"relations":{"1":[1,${vetOpen}]}}`,
          `{"1":"task","2":"task","relations":{"2":[1,${vetOpen}]}}`
        ]),
        connection: cfg
      })
      const runTodo = read(todo)
      const heldRun = getHeldLines()
      const secondBody = bodies[1] ?? ''
      const pieceOk =
        comma.outcome === 'filed' &&
        comma.tasks === 2 &&
        comma.held === 1 &&
        bodies.length === 2 &&
        secondBody.includes('1. Pay the gas bill') &&
        secondBody.includes('2. call the vet') &&
        // The later sentence is not among the numbered pieces (it may
        // well sit in the items list, which is the point of the list).
        !/\d+\. Email Bob/.test(secondBody) &&
        secondBody.includes('Items already filed') &&
        !secondBody.includes('Seams:') &&
        // Spoken order: the gas bill before the later sentence.
        runTodo ===
          `${beforeRun}- [ ] Pay the gas bill ([10:32](inbox/2026-09-18.md))\n- [ ] Email Bob. ([10:32](inbox/2026-09-18.md))\n` &&
        read(logPath).slice(logBeforeRun).includes('split=1 ') &&
        heldRun.length === 1 &&
        heldRun[0]?.text === 'call the vet' &&
        heldRun[0]?.reason === 'same' &&
        heldRun[0]?.match?.text === 'Call the vet.' &&
        heldRun[0]?.pieces === undefined &&
        !canSortAgain()
      // File it anyway on the held piece lands that piece alone, once.
      const pieceFiled = fileHeldLine(heldRun[0]?.id ?? -1)
      const pieceFiledOk =
        pieceFiled.ok &&
        read(todo) === `${runTodo}- [ ] call the vet ([10:32](inbox/2026-09-18.md))\n` &&
        getHeldLines().length === 0 &&
        !fileHeldLine(heldRun[0]?.id ?? -1).ok

      // When the second look cannot be answered, the whole line is held
      // as before, carrying its pieces, and File it anyway lands one
      // line per piece.
      const failInput: SortInput = { ...input, text: 'Buy stamps, and call the vet.' }
      rememberForSort(failInput)
      const beforeFail = read(todo)
      const logBeforeFail = read(logPath).length
      const fail = await sortNote(failInput, {
        fetchImpl: sequence([`{"1":"task","seams":{"1":[1]},"relations":{"1":[1,${vetOpen}]}}`, 500]),
        connection: cfg
      })
      const heldFail = getHeldLines()
      const wholeHeldOk =
        fail.outcome === 'filed' &&
        fail.tasks === 0 &&
        fail.held === 1 &&
        read(todo) === beforeFail &&
        heldFail.length === 1 &&
        heldFail[0]?.text === 'Buy stamps, and call the vet.' &&
        heldFail[0]?.pieces?.length === 2 &&
        // Nothing was cut, so the log says so.
        read(logPath).slice(logBeforeFail).includes('split=0 ') &&
        fileHeldLine(heldFail[0]?.id ?? -1).ok &&
        read(todo) ===
          `${beforeFail}- [ ] Buy stamps ([10:32](inbox/2026-09-18.md))\n- [ ] call the vet ([10:32](inbox/2026-09-18.md))\n` &&
        getHeldLines().length === 0

      // Two pieces of one sentence held side by side, each with its own
      // id and buttons: the vet is open, the passport was ticked above.
      const passportDone = numberOf('Renew the passport.')
      const twoInput: SortInput = { ...input, text: 'Call the vet, and renew the passport.' }
      rememberForSort(twoInput)
      const beforeTwo = read(todo)
      const two = await sortNote(twoInput, {
        fetchImpl: sequence([
          `{"1":"task","seams":{"1":[1]},"relations":{"1":[1,${vetOpen}]}}`,
          `{"1":"task","2":"task","relations":{"1":[1,${vetOpen}],"2":[1,${passportDone}]}}`
        ]),
        connection: cfg
      })
      const heldTwo = getHeldLines()
      const twoOk =
        two.outcome === 'filed' &&
        two.tasks === 0 &&
        two.held === 2 &&
        read(todo) === beforeTwo &&
        heldTwo.length === 2 &&
        heldTwo[0]?.position === heldTwo[1]?.position &&
        heldTwo[0]?.id !== heldTwo[1]?.id &&
        heldTwo[0]?.text === 'Call the vet' &&
        heldTwo[0]?.reason === 'same' &&
        heldTwo[1]?.text === 'renew the passport' &&
        heldTwo[1]?.reason === 'done-before' &&
        fileHeldLine(heldTwo[0]?.id ?? -1).ok &&
        read(todo) === `${beforeTwo}- [ ] Call the vet ([10:32](inbox/2026-09-18.md))\n` &&
        getHeldLines().length === 1 &&
        getHeldLines()[0]?.id === heldTwo[1]?.id &&
        skipHeldLine(heldTwo[1]?.id ?? -1).ok &&
        getHeldLines().length === 0

      // A completion is a past-tense statement the model labels a note:
      // it is held all the same and Tick it works; a note voted a
      // duplicate is not held, since a note files nowhere.
      const vetStillOpen = numberOf('Call the vet.', true)
      const noteDone: SortInput = { ...input, text: 'I called the vet this morning.' }
      rememberForSort(noteDone)
      const beforeNoteDone = read(todo)
      const nd = await sortNote(noteDone, {
        fetchImpl: mockReply(`{"1":"note","relations":{"1":[2,${vetStillOpen}]}}`),
        connection: cfg
      })
      const heldNote = getHeldLines()
      const noteHeldOk =
        nd.outcome === 'filed' &&
        nd.notes === 0 &&
        nd.held === 1 &&
        heldNote[0]?.label === 'note' &&
        heldNote[0]?.reason === 'completes' &&
        heldNote[0]?.match?.text === 'Call the vet.' &&
        !fileHeldLine(heldNote[0]?.id ?? -1).ok &&
        read(todo) === beforeNoteDone &&
        tickHeldMatch(heldNote[0]?.id ?? -1).ok &&
        read(todo) === beforeNoteDone.replace('- [ ] Call the vet.', '- [x] Call the vet.') &&
        getHeldLines().length === 0
      const noteSame: SortInput = { ...input, text: 'Nice chat about the vet.' }
      rememberForSort(noteSame)
      const beforeNoteSame = read(todo)
      const ns = await sortNote(noteSame, {
        fetchImpl: mockReply(`{"1":"note","relations":{"1":[1,${vetStillOpen}]}}`),
        connection: cfg
      })
      const noteSameOk = ns.outcome === 'filed' && ns.notes === 1 && ns.held === 0 && read(todo) === beforeNoteSame

      // The same second look on a decision connection: the piece request
      // carries the items in its state, a relation and an item question
      // per piece, and no seam question.
      const decisionBodies: string[] = []
      const routedSeq = (decisions: string[]): typeof fetch => {
        let n = 0
        return (async (url: unknown, init?: RequestInit) => {
          if (String(url).endsWith('/systemone')) {
            decisionBodies.push(String(init?.body ?? ''))
            return new Response(decisions[Math.min(n++, decisions.length - 1)], { status: 200 })
          }
          return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"task"}' } }] }), { status: 200 })
        }) as typeof fetch
      }
      const vetAgain = numberOf('Call the vet.', true)
      const dpInput: SortInput = { ...input, text: 'Order toner, and call the vet.' }
      rememberForSort(dpInput)
      const beforeDp = read(todo)
      const dp = await sortNote(dpInput, {
        fetchImpl: routedSeq([
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: {
              label_1: { type: 'choice', choice: 'task', confidence: 0.9 },
              relation_1: { type: 'choice', choice: 'same' },
              match_1: { type: 'choice', choice: String(vetAgain) },
              seam_1_1: { type: 'noul', noul: 0.9 }
            }
          }),
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: {
              label_1: { type: 'choice', choice: 'task', confidence: 0.9 },
              label_2: { type: 'choice', choice: 'task', confidence: 0.9 },
              relation_1: { type: 'choice', choice: 'new' },
              match_1: { type: 'choice', choice: '1' },
              relation_2: { type: 'choice', choice: 'same' },
              match_2: { type: 'choice', choice: String(vetAgain) }
            }
          })
        ]),
        connection: decideCfg,
        protocol: 'decide'
      })
      const secondDecision = JSON.parse(decisionBodies[1] ?? '{}') as {
        state?: { sentences?: string[]; items?: string[] }
        questions?: Record<string, unknown>
      }
      const secondQuestions = Object.keys(secondDecision.questions ?? {})
      const dpOk =
        dp.outcome === 'filed' &&
        dp.tasks === 1 &&
        dp.held === 1 &&
        decisionBodies.length === 2 &&
        secondDecision.state?.sentences?.[0] === '1. Order toner' &&
        Array.isArray(secondDecision.state?.items) &&
        secondQuestions.includes('relation_2') &&
        secondQuestions.includes('match_2') &&
        secondQuestions.every((k) => !k.startsWith('seam_')) &&
        read(todo) === `${beforeDp}- [ ] Order toner ([10:32](inbox/2026-09-18.md))\n` &&
        getHeldLines()[0]?.text === 'call the vet' &&
        skipHeldLine(getHeldLines()[0]?.id ?? -1).ok

      const topicOk =
        withTopic.outcome === 'filed' &&
        badTopic.outcome === 'filed' &&
        namedTodo.includes('## 2026-09-18 Domain and blog\n- [ ] Renew the domain.') &&
        namedIdeas.includes('## 2026-09-18 Domain and blog\n- Maybe move the blog.') &&
        // The rejected name never reaches a file, and its task joins
        // the plain day heading that is already there.
        !namedTodo.includes('far too long') &&
        namedTodo.includes('- [ ] Pay the invoice.') &&
        namedTodo.split('\n').filter((l) => l.trim() === '## 2026-09-18').length === 1
      const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
      return (
        offClean &&
        filedOk &&
        noRefile &&
        halfBlocked.outcome === 'failed' &&
        halfBlocked.tasks === 0 &&
        (halfBlocked.reason ?? '').startsWith('write ') &&
        joined &&
        groupedOk &&
        topicOk &&
        chatter.outcome === 'rejected' &&
        chatter.reason === 'missing sentences' &&
        failed.outcome === 'failed' &&
        failed.reason === 'http 500' &&
        untouched &&
        // The status surface always shows the newest outcome, which is
        // the last filing above, not the failures before it.
        promptOk &&
        splitOk &&
        wholeOk &&
        decisionOk &&
        limitedOk &&
        unansweredOk &&
        sameFixtureOk &&
        partialOk &&
        retryOk &&
        allHeldOk &&
        dupOk &&
        anywayOk &&
        completesOk &&
        tickOk &&
        refusedOk &&
        skipOk &&
        decideDupOk &&
        pieceOk &&
        pieceFiledOk &&
        wholeHeldOk &&
        twoOk &&
        noteHeldOk &&
        noteSameOk &&
        dpOk &&
        getLastSort() === dp &&
        log.includes('[sort] compared pieces=2 of=1 held=1 protocol=chat') &&
        log.includes('[sort] compared pieces=2 of=1 held=1 protocol=decide') &&
        log.includes('[sort] piece compare failed reason=http 500') &&
        log.includes('related=1') &&
        log.includes('[sort] ticked file=tasks nth=') &&
        log.includes('[sort] filed held line position=') &&
        log.includes('held=1 unsure=1 related=0 threshold=0.5') &&
        log.includes('[sort] held every line reason=low confidence held=2 threshold=0.5') &&
        log.includes('[sort] decision failed reason=rate limit model=jev-latest; falling back to the chat sorter') &&
        log.includes('[sort] decision failed reason=validate: missing sentences model=jev-latest') &&
        log.includes('split=1 protocol=decide model=jev-1.13.0 slot=separate') &&
        log.includes('[sort] filed tasks=2 ideas=1 notes=1 split=0 protocol=chat model=smoke-sorter') &&
        log.includes('[sort] filed tasks=3 ideas=0 notes=0 split=1 protocol=chat model=smoke-sorter') &&
        log.includes('[sort] rejected reason=missing sentences model=smoke-sorter') &&
        log.includes('[sort] failed reason=http 500 model=smoke-sorter') &&
        log.includes('[sort] write failed reason=') &&
        log.includes('before any line landed')
      )
    } finally {
      updateSettings({ notes: before })
    }
  })

  registerSmokeCheck('noteLeadIns', async () => {
    // US-062: a spoken run files under its lead-in on both connections,
    // a cleanup-written list heading becomes the same lead line, and a
    // held piece keeps its lead-in so File it anyway nests it too.
    const before = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-vault-leads')
    const todo = join(vault, 'murmur', 'todo.md')
    const read = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '')
    const link = '([10:32](inbox/2026-09-18.md))'
    const base = { base: vault, inboxRelative: 'murmur/inbox/2026-09-18.md', when: probeMoment }
    const reply = (content: string): Response =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
    try {
      mkdirSync(join(vault, 'murmur', 'inbox'), { recursive: true })
      updateSettings({ notes: { folder: vault, sort: true, ...layout } })

      // Chat: the lead words ride the prompt and "starts" points at the
      // first item; the run nests under one lead line.
      let body = ''
      const run = await sortNote(
        { ...base, text: 'I need to buy apples, rice, and coffee.' },
        {
          fetchImpl: (async (_url: unknown, init?: RequestInit) => {
            body = String(init?.body ?? '')
            return reply('{"1":"task","seams":{"1":[1,2]},"starts":{"1":5}}')
          }) as typeof fetch,
          connection: cfg
        }
      )
      const sent = JSON.parse(body) as { messages: Array<{ content: string }> }
      const chatOk =
        run.outcome === 'filed' &&
        run.tasks === 3 &&
        sent.messages[0].content.includes('key "starts"') &&
        sent.messages[1].content.includes('Lead words:\n1: 1 I | 2 need | 3 to | 4 buy | 5 apples | 6 rice') &&
        read(todo) ===
          `## 2026-09-18\n- I need to buy:\n  - [ ] apples ${link}\n  - [ ] rice ${link}\n  - [ ] coffee ${link}\n`

      // A list heading from cleanup: never sent, filed as the lead line.
      const afterChat = read(todo)
      let listBody = ''
      const listed = await sortNote(
        { ...base, text: 'For the party:\n- chips\n- salsa' },
        {
          fetchImpl: (async (_url: unknown, init?: RequestInit) => {
            listBody = String(init?.body ?? '')
            return reply('{"1":"task","2":"task"}')
          }) as typeof fetch,
          connection: cfg
        }
      )
      const listOk =
        listed.outcome === 'filed' &&
        listed.tasks === 2 &&
        !listBody.includes('For the party') &&
        read(todo) === `${afterChat}- For the party:\n  - [ ] chips ${link}\n  - [ ] salsa ${link}\n`

      // Decision: a Choice over the first side's words, answered 3.
      const afterList = read(todo)
      let decisionBody: { questions?: Record<string, { criteria?: unknown }> } = {}
      const decided = await sortNote(
        { ...base, text: 'We need toner, paper, and ink.' },
        {
          fetchImpl: (async (_url: unknown, init?: RequestInit) => {
            decisionBody = JSON.parse(String(init?.body ?? '{}')) as typeof decisionBody
            return new Response(
              JSON.stringify({
                model: 'jev-1.13.0',
                answers: {
                  label_1: { type: 'choice', choice: 'task', confidence: 0.9 },
                  seam_1_1: { type: 'noul', noul: 0.9 },
                  seam_1_2: { type: 'noul', noul: 0.9 },
                  lead_1: { type: 'choice', choice: '3' }
                }
              }),
              { status: 200 }
            )
          }) as typeof fetch,
          connection: { baseUrl: 'https://mock-decide.local/v1', model: 'jev-latest', apiKey: 'k' },
          protocol: 'decide'
        }
      )
      const criteria = decisionBody.questions?.lead_1?.criteria as Record<string, string> | undefined
      const decideOk =
        decided.outcome === 'filed' &&
        decided.tasks === 3 &&
        criteria?.['1'] === 'We' &&
        criteria?.['3'] === 'toner' &&
        read(todo) === `${afterList}- We need:\n  - [ ] toner ${link}\n  - [ ] paper ${link}\n  - [ ] ink ${link}\n`

      // A held piece keeps its lead-in: apples is already open, so it is
      // held and bread files under the lead line; File it anyway nests
      // apples under its own lead line.
      const afterDecide = read(todo)
      const apples = buildCompareContext(afterDecide, '').find((item) => item.text === 'apples')
      const replies = [
        `{"1":"task","seams":{"1":[1]},"starts":{"1":5},"relations":{"1":[1,${apples?.number ?? 0}]}}`,
        `{"1":"task","2":"task","relations":{"1":[1,${apples?.number ?? 0}]}}`
      ]
      let n = 0
      const heldInput: SortInput = { ...base, text: 'I need to buy apples, and bread.' }
      rememberForSort(heldInput)
      const compared = await sortNote(heldInput, {
        fetchImpl: (async () => reply(replies[Math.min(n++, 1)])) as typeof fetch,
        connection: cfg
      })
      const held = getHeldLines()
      const afterHeld = read(todo)
      const filedAnyway = fileHeldLine(held[0]?.id ?? -1).ok
      const heldOk =
        apples !== undefined &&
        compared.outcome === 'filed' &&
        compared.tasks === 1 &&
        held.length === 1 &&
        held[0]?.text === 'apples' &&
        held[0]?.lead?.text === 'I need to buy' &&
        afterHeld === `${afterDecide}- I need to buy:\n  - [ ] bread ${link}\n` &&
        filedAnyway &&
        read(todo) === `${afterHeld}- I need to buy:\n  - [ ] apples ${link}\n`

      const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
      return chatOk && listOk && decideOk && heldOk && log.includes('split=1 protocol=chat') && log.includes(' leads=1')
    } finally {
      updateSettings({ notes: before })
    }
  })

  registerSmokeCheck('sortConnection', () => {
    // The separate slot wins only when complete with its own key; any
    // less falls through to whatever the cleanup pass would use. The
    // primary base URL gets a throwaway key here: every smoke run has a
    // fresh temp profile, so no real key is ever touched.
    const before = getSettings()
    const sortUrl = 'https://smoke-sort.example/v1'
    try {
      updateSettings({ notes: { connection: { enabled: true, baseUrl: sortUrl, llmModel: 'sort-m', protocol: 'chat' } } })
      ringSetKey(sortUrl, 'smoke-sort-key-1234567890')
      const separate = resolveSortConnection(getSettings())
      const separateOk =
        separate?.slot === 'separate' &&
        separate.protocol === 'chat' &&
        separate.config.baseUrl === sortUrl &&
        separate.config.model === 'sort-m'
      updateSettings({ notes: { connection: { protocol: 'decide', llmModel: 'jev-latest' } } })
      const decide = resolveSortConnection(getSettings())
      const decideOk = decide?.slot === 'separate' && decide.protocol === 'decide' && decide.config.model === 'jev-latest'
      ringClearKey(sortUrl)
      // No sort key, and the primary provider holds one: cleanup path.
      ringSetKey(before.provider.baseUrl, 'smoke-primary-key-1234567890')
      const cleanup = resolveSortConnection(getSettings())
      const cleanupOk =
        cleanup?.slot === 'cleanup' && cleanup.protocol === 'chat' && cleanup.config.baseUrl === before.provider.baseUrl
      updateSettings({ notes: { connection: { enabled: false } } })
      const same = resolveSortConnection(getSettings())
      const sameOk = same?.slot === 'cleanup' && same.config.baseUrl === before.provider.baseUrl
      ringClearKey(before.provider.baseUrl)
      const none = resolveSortConnection(getSettings())
      return separateOk && decideOk && cleanupOk && sameOk && none === null
    } finally {
      ringClearKey(sortUrl)
      updateSettings({ notes: { connection: before.notes.connection } })
    }
  })
}
