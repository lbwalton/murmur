// SPDX-License-Identifier: GPL-3.0-only
// The sorter's main-process half (US-051): resolve a connection, ask
// the model to label the note's numbered sentences, validate the reply
// strictly, and copy tasks and ideas into their files with links back.
// It runs after the note is already on disk and touches no file unless
// a part's whole labeling is valid, so a rejected sort costs nothing:
// the note is in the inbox, where it already was. A long note goes out
// in parts sized to the provider's token budget (US-180), each settling
// on its own, so a part that fails leaves only its own lines for Sort
// again. Nothing here logs the note's text.
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import {
  COMPARE_CAP,
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
import {
  type FiledPiece,
  type HeldPiece,
  assignPieceVotes,
  flattenPieces,
  piecesToCompare,
  runsToCompare
} from '../../shared/pieces'
import { parseTodo, tickLine } from '../../shared/todo'
import {
  DEFAULT_IDEAS_TEMPLATE,
  DEFAULT_NOTE_ENTRY_TEMPLATE,
  DEFAULT_NOTE_PATH_TEMPLATE,
  DEFAULT_TASKS_TEMPLATE,
  appendSeparator,
  noteMoment
} from '../../shared/notes'
import type { ReceiptPlace } from '../../shared/receipt'
import type { Settings } from '../../shared/settings'
import {
  DEFAULT_FILED_HEADING_TEMPLATE,
  type LeadIn,
  type LeadStarts,
  SORT_KEEP_PROMPT,
  SORT_LEADS_PROMPT,
  SORT_SEAMS_PROMPT,
  SORT_SYSTEM_PROMPT,
  SORT_TOPIC_PROMPT,
  applyKeep,
  applySplits,
  findSeams,
  headingPrefix,
  holdBelow,
  keepPrompt,
  keepWords,
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
import {
  CHARS_PER_TOKEN,
  REQUEST_OVERHEAD_CHARS,
  errorMessage,
  estimateTokens,
  itemsCapFor,
  nextPart,
  partBudget,
  providerLimit,
  providerSays,
  retryDelayMs,
  sentenceCosts,
  unitBoundaries
} from '../../shared/sort-batches'
import type { SeamVotes, SortLabel, SortVerdict } from '../../shared/sorter'
import { resolvePolishConnection } from '../formatter'
import type { PolishConfig } from '../formatter/llm'
import { appFetch } from '../net'
import { askDecision } from './decide'
import { getApiKeyFor, getSettings, ringClearKey, ringSetKey, updateSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { writeAppLog } from '../window-watch'
import { errorCode, fileTail, fileText, resolveTemplateOrDefault } from './files'
import { replaceViaTemp } from './safe-fs'

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
  /** The files a filed sort wrote lines into, tasks first (US-082):
   *  the note receipt names them and opens the first. */
  places?: ReceiptPlace[]
  /** Lines no answer covered (US-180): their part could not reach the
   *  model, failed its checks, or was too large even alone. They stay
   *  unsettled in the inbox, so Sort again sends just those. Absent when
   *  every line was answered. */
  unsorted?: number
  /** Spoken runs filed cut without their piece-by-piece repeat check,
   *  because that second request could not be answered (US-180). */
  unchecked?: number
  /** How many parts a long note went out in, when more than 1. */
  parts?: number
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
  /** Tests and smoke: a part's budget in estimated tokens, in place of
   *  the one the provider's stated limit sets (US-180). */
  partTokens?: number
  /** Tests and smoke: how a rate-limit wait sleeps. */
  sleep?: (ms: number) => Promise<void>
}

let lastSort: SortReport | null = null
let lastInput: SortInput | null = null
// Which sentence positions of each note a sort has settled (filed as a
// task or idea, or kept as a note). Sort again re-runs only the rest, so
// a landed line is never filed twice (review gate 2026-09-20, made
// per-line by US-058 so a held line can be retried on its own). Each
// note keeps its own set (US-180): a long note's sort can wait minutes
// while a newer note is saved, and a status read for the newer note must
// never wipe what the running sort has settled. Weakly held, so a note
// nothing remembers any more takes its set with it.
const settledByNote = new WeakMap<SortInput, Set<number>>()

function settledSetFor(input: SortInput): Set<number> {
  return settledByNote.get(input) ?? new Set()
}

function settleFor(input: SortInput, positions: readonly number[], keptLocal: readonly number[]): void {
  settledByNote.set(input, settle(settledSetFor(input), positions, keptLocal))
}

// Older notes whose newest sort left lines no answer covered (US-180),
// oldest first, so Sort again reaches them after a newer note took the
// newest slot. Their text stays in memory only while lines are waiting,
// and only the most recent few; the words are in the inbox either way.
const WAITING_MAX = 5
let waiting: SortInput[] = []
// Moves on with every Clear all (forgetSortMemory): a sort asked for
// before it puts nothing back.
let memoryGeneration = 0

/** The memory generation now; the receipt compares it around a sort so
 *  a sort asked for before Clear all raises no notice. */
export function sortMemoryGeneration(): number {
  return memoryGeneration
}

function noteWaiting(input: SortInput, report: SortReport): void {
  waiting = waiting.filter((w) => w !== input)
  if ((report.unsorted ?? 0) === 0) return
  waiting = [...waiting, input]
  while (waiting.length > WAITING_MAX) {
    const dropped = waiting.shift() as SortInput
    // Never silent: the log says a note left Sort again, with no words.
    writeAppLog(
      `[sort] dropped an older note from Sort again lines=${pendingFor(dropped).length} kept=${WAITING_MAX}; its lines stay in its inbox file`
    )
  }
}

/** Lines of older notes still waiting for Sort again, and how many
 *  notes they come from: the newest note is not counted, its own line
 *  says what its sort did (US-180). */
export function waitingLines(): { lines: number; notes: number } {
  const older = notesToSortAgain().filter((note) => note !== lastInput)
  return { lines: older.reduce((n, note) => n + pendingFor(note).length, 0), notes: older.length }
}

/** The notes Sort again would send, oldest first, the newest last. */
function notesToSortAgain(): SortInput[] {
  const older = waiting.filter((w) => w !== lastInput)
  return [...older, ...(lastInput ? [lastInput] : [])].filter((note) => pendingFor(note).length > 0)
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
  | { ok: true; counts: { tasks: number; ideas: number; notes: number }; places: ReceiptPlace[] }
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
  const places = writes.map((w) => ({
    kind: w.kind,
    file: w.file,
    relative: w.kind === 'tasks' ? tasksPath.relative : ideasPath.relative
  }))
  return { ok: true, counts, places }
}

/** Sentence positions of a note a sort has not settled yet. */
function pendingFor(input: SortInput): number[] {
  return remainingSentences(splitSentences(input.text).length, settledSetFor(input))
}
// One sort at a time, in the order asked. A second ask for a note that
// is already running or waiting its turn (a Sort again click during the
// model round trip) joins that sort instead of appending every line
// twice. Another note waits its turn and gets its own sort and its own
// report (US-180): a long note's waits used to make a note saved during
// them join the long note's sort and never be sorted at all.
const sortJobs = new Map<SortInput, Promise<SortReport>>()
let sortTail: Promise<unknown> = Promise.resolve()

/** A sort is running or waiting its turn. */
export function sortInFlight(): boolean {
  return sortJobs.size > 0
}

/** A sort of this very note is running or waiting its turn: asking
 *  again joins it and gets its report. */
export function sortQueuedFor(input: SortInput): boolean {
  return sortJobs.has(input)
}

export function getLastSort(): SortReport | null {
  return lastSort
}

/** Sort again is offered only while the newest note, or an older one a
 *  sort left lines of, has lines a sort has not settled: everything after
 *  a rejection, the held lines after a partial filing, nothing after a
 *  full one. */
export function canSortAgain(): boolean {
  return notesToSortAgain().length > 0
}

/** Keep the newest note so Sort again can re-run it after a reject. */
export function rememberForSort(input: SortInput): void {
  lastInput = input
}

/** The note Sort again would sort, so its receipt can follow (US-180). */
export function lastSortInput(): SortInput | null {
  return lastInput
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

type ModelReply =
  | { ok: true; content: string; limit?: number }
  | {
      ok: false
      reason: string
      /** The HTTP status when the provider answered with an error. */
      status?: number
      /** How long a 429 asked to wait, when it named a wait. */
      retryMs?: number | null
      /** The provider's own message, made safe for the log. */
      said?: string
      /** The per-minute token limit the provider stated. */
      limit?: number
    }

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
    if (!response.ok) {
      // What the provider says about it, so a refusal says why (US-180):
      // read for its numbers, logged only through providerSays.
      let text = ''
      try {
        text = (await response.text()).slice(0, 4000)
      } catch {
        text = ''
      }
      const message = errorMessage(text)
      return {
        ok: false,
        reason: `http ${response.status}`,
        status: response.status,
        retryMs: response.status === 429 ? retryDelayMs(response.headers, message) : null,
        // Only a size or rate refusal is logged in the provider's words:
        // other refusals (a malformed request above all) are where a
        // provider quotes the input back.
        said: response.status === 413 || response.status === 429 ? providerSays(message, prompt, cfg.apiKey) : '',
        limit: providerLimit(response.headers, message)
      }
    }
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
    return { ok: true, content, limit: providerLimit(response.headers, '') }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, reason: aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

// The longest 1 rate-limit wait: a full minute covers any per-minute
// window, Groq's tokens per minute included (checked 2026-11-21).
const RATE_WAIT_MAX_MS = 60_000
// A 429 that names no wait gets this one.
const RATE_WAIT_DEFAULT_MS = 5_000
// A little past the wait asked, so the retry lands after the reset.
const RATE_WAIT_MARGIN_MS = 500
// All the waiting 1 sort may do. The sort holds the 1 sort slot while
// it waits, so a long note never holds it for long: past this, the rest
// stays in the inbox for Sort again.
const SORT_WAIT_BUDGET_MS = 120_000

/** Per-minute token limits providers stated (x-ratelimit-limit-tokens,
 *  or Limit N in an error), by base URL and model, for this run of the
 *  app, so the next sort sizes its parts to fit from the start. */
const statedLimits = new Map<string, number>()
const limitKey = (cfg: PolishConfig): string => `${cfg.baseUrl}|${cfg.model}`

function noteLimit(cfg: PolishConfig, limit: number | undefined): void {
  if (limit !== undefined) statedLimits.set(limitKey(cfg), limit)
}

/** What the sort's parts share about waiting. */
interface Pace {
  sleep: (ms: number) => Promise<void>
  leftMs: number
  waitedMs: number
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`
const saidTail = (said: string | undefined): string => (said ? ` said="${said}"` : '')

/**
 * Ask the chat model, with 1 more try after a rate limit (US-180): it
 * waits what the 429 asked (Retry-After, then the token reset, then the
 * message), up to a minute and within the sort's allowance, and logs the
 * wait. Any other failure, a 429 asking for longer, or a second 429 is
 * the caller's to report. Dictation never waits on this: a sort runs
 * after its note is already on disk.
 */
async function askChat(
  systemPrompt: string,
  prompt: string,
  cfg: PolishConfig,
  via: { fetchImpl: typeof fetch; timeoutMs: number; pace: Pace; tag: string },
  what: 'labels' | 'pieces'
): Promise<ModelReply> {
  const first = await askModel(systemPrompt, prompt, cfg, via.fetchImpl, via.timeoutMs)
  noteLimit(cfg, first.limit)
  if (first.ok || first.status !== 429) return first
  const asked = first.retryMs ?? RATE_WAIT_DEFAULT_MS
  const wait = asked + RATE_WAIT_MARGIN_MS
  const base = `[sort] rate limited reason=http 429 for=${what} wait=${seconds(asked)} model=${cfg.model}`
  if (asked > RATE_WAIT_MAX_MS || wait > via.pace.leftMs) {
    const why = asked > RATE_WAIT_MAX_MS ? 'it asks for more than a minute' : 'this sort has waited its share'
    writeAppLog(`${base}; not waiting, ${why}${via.tag}${saidTail(first.said)}`)
    return first
  }
  writeAppLog(`${base}; trying once more${via.tag}${saidTail(first.said)}`)
  via.pace.leftMs -= wait
  via.pace.waitedMs += wait
  await via.pace.sleep(wait)
  const second = await askModel(systemPrompt, prompt, cfg, via.fetchImpl, via.timeoutMs)
  noteLimit(cfg, second.limit)
  return second
}

function record(
  outcome: SortOutcome,
  counts: {
    tasks: number
    ideas: number
    notes: number
    held?: number
    unsorted?: number
    unchecked?: number
    parts?: number
  },
  reason?: string,
  places?: ReceiptPlace[]
): SortReport {
  lastSort = { at: Date.now(), outcome, held: 0, ...counts, ...(reason ? { reason } : {}), ...(places ? { places } : {}) }
  return lastSort
}

const NONE = { tasks: 0, ideas: 0, notes: 0, held: 0 }

/**
 * Sort one note. Never throws; every outcome is a report and a log
 * line with a reason. Files are written only after the whole labeling
 * validated, tasks first, then ideas.
 */
export function sortNote(input: SortInput, options: SortOptions = {}, only?: readonly number[]): Promise<SortReport> {
  const queued = sortJobs.get(input)
  if (queued) return queued
  // A sort asked for before Clear all may still file its lines (their
  // words are on disk already), but puts nothing back in memory.
  const generation = memoryGeneration
  const job: Promise<SortReport> = sortTail
    .then(() => runSort(input, options, only, generation))
    .then((report) => {
      if (generation === memoryGeneration) noteWaiting(input, report)
      return report
    })
    .finally(() => {
      if (sortJobs.get(input) === job) sortJobs.delete(input)
    })
  sortJobs.set(input, job)
  sortTail = job.catch(() => undefined)
  return job
}

/** What 1 sort shares across the parts of its note (US-180). */
interface SortRun {
  input: SortInput
  settings: Settings
  units: ReturnType<typeof splitUnits>
  /** The connection the parts go to. A decision model that fails hands
   *  this to the chat sorter for the rest of the note. */
  via: { config: PolishConfig; slot: ResolvedSortConnection['slot']; protocol: SortProtocol }
  fetchImpl: typeof fetch
  timeoutMs: number
  wantsTopic: boolean
  /** The topic the first part to file named; the parts after it reuse
   *  it, so the whole note sits under 1 heading. Null until 1 files. */
  topic: string | null
  paths: { tasksPath: ReturnType<typeof resolveTemplateOrDefault>; ideasPath: ReturnType<typeof resolveTemplateOrDefault> }
  tasksFile: string
  tasksText: string
  /** The filed items, read once before any part files, so a later part
   *  is never compared against an earlier part's own lines. */
  items: ContextItem[]
  itemsCap: number
  /** Smoke only: the chat connection a failed decision falls back to. */
  fallback?: PolishConfig
  pace: Pace
  /** ` part=N` on the log lines of a note sent in parts, else ''. */
  tag: string
  /** The memory generation the sort was asked for in: once Clear all
   *  moves it on, the sort keeps no held lines or topic in memory. */
  generation: number
}

/** What 1 part of a note came to. */
interface PartResult {
  outcome: SortOutcome
  counts: { tasks: number; ideas: number; notes: number; held: number }
  reason?: string
  places?: ReceiptPlace[]
  /** The status of a request the provider refused. */
  status?: number
  /** Runs filed cut without their piece-by-piece look. */
  unchecked: number
  /** Lines of this part no answer covered: every line when the request
   *  or its checks failed, the lines whose file failed on a write. */
  left: number
}

async function runSort(
  input: SortInput,
  options: SortOptions,
  only: readonly number[] | undefined,
  generation: number
): Promise<SortReport> {
  const settings = getSettings()
  if (!settings.notes.sort) return record('skipped', NONE, 'sorting off')
  if (isSmoke && !options.fetchImpl) return record('skipped', NONE, 'smoke')
  const units = splitUnits(input.text)
  const all = units.sentences
  // Sort again sends only the positions still unsettled; a fresh note
  // sends everything. The plan is fixed here, once: a long note goes out
  // in parts (US-180), each numbered from 1, and no part re-reads what
  // is settled while the sort runs.
  const positions = only ?? all.map((_, i) => i)
  if (positions.length === 0) return record('skipped', NONE, 'nothing to sort')
  // Held lines follow the note: a fresh note starts empty, and a line
  // sent again gets a fresh verdict in place of its old one.
  lastAction = null
  // A sort asked for before Clear all leaves the held lines alone.
  if (generation === memoryGeneration && heldFor !== input) {
    heldFor = input
    heldLines = []
    heldSnapshots.clear()
  } else if (generation === memoryGeneration) {
    const dropped = heldLines.filter((h) => positions.includes(h.position))
    heldLines = heldLines.filter((h) => !positions.includes(h.position))
    for (const h of dropped) heldSnapshots.delete(h.id)
  }

  const resolved: ResolvedSortConnection | null = options.connection
    ? { config: options.connection, slot: 'separate', protocol: options.protocol ?? 'chat' }
    : resolveSortConnection(settings)
  if (!resolved) {
    writeAppLog('[sort] failed reason=no connection; save a key for the speech, cleanup, or sort connection')
    return record('failed', { ...NONE, unsorted: positions.length }, 'no connection')
  }
  // Topics only mean something when a heading can carry them, and only
  // a chat model can write one.
  const wantsTopic =
    settings.notes.topicHeadings && settings.notes.filedHeadingTemplate.includes('{topic}')
  // Filed items (US-055): what is already in the two files, read from
  // the base this note landed in, so a dump is compared before it files.
  let tasksPath: ReturnType<typeof resolveTemplateOrDefault>
  let ideasPath: ReturnType<typeof resolveTemplateOrDefault>
  try {
    ;({ tasksPath, ideasPath } = filedPaths(input.when))
  } catch (error) {
    writeAppLog(`[sort] failed reason=${errorCode(error)}`)
    return record('failed', { ...NONE, unsorted: positions.length }, 'paths')
  }
  const tasksFile = join(input.base, ...tasksPath.segments)
  const tasksText = fileText(tasksFile)
  const ideasText = fileText(join(input.base, ...ideasPath.segments))

  // Parts (US-180): what each sentence and the framing around them cost,
  // so the note goes out in requests the provider will take.
  const seamsAll = all.map(findSeams)
  const costAt = sentenceCosts(all, seamsAll)
  const boundaryAt = unitBoundaries(input.text, all, units.leads)
  const systemChars = [
    SORT_SYSTEM_PROMPT,
    SORT_TOPIC_PROMPT,
    SORT_SEAMS_PROMPT,
    SORT_LEADS_PROMPT,
    SORT_KEEP_PROMPT,
    SORT_RELATIONS_PROMPT
  ].join(' ').length
  const budgetNow = (): number => options.partTokens ?? partBudget(statedLimits.get(limitKey(run.via.config)))
  const framing = (items: readonly ContextItem[], cap: number): number =>
    systemChars + contextPrompt(items, cap).length + REQUEST_OVERHEAD_CHARS
  // A note that fits in 1 request with every recent item goes as it
  // always did. A longer one carries fewer filed items in each part,
  // since every part pays for them again.
  let itemsCap = COMPARE_CAP
  let items = buildCompareContext(tasksText, ideasText)
  const run: SortRun = {
    input,
    settings,
    units,
    via: resolved,
    fetchImpl: options.fetchImpl ?? appFetch,
    timeoutMs: options.timeoutMs ?? 12_000,
    wantsTopic,
    topic: null,
    paths: { tasksPath, ideasPath },
    tasksFile,
    tasksText,
    items,
    itemsCap,
    ...(options.fallback ? { fallback: options.fallback } : {}),
    pace: {
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      leftMs: SORT_WAIT_BUDGET_MS,
      waitedMs: 0
    },
    tag: '',
    generation
  }
  const wholeChars = framing(items, itemsCap) + positions.reduce((n, p) => n + costAt[p], 0)
  if (estimateTokens(wholeChars) > budgetNow()) {
    itemsCap = itemsCapFor(tasksText, ideasText, budgetNow())
    if (itemsCap < COMPARE_CAP) items = buildCompareContext(tasksText, ideasText, itemsCap)
    run.items = items
    run.itemsCap = itemsCap
  }

  let rest = [...positions]
  // Set when the provider refused a part as too large: the smaller size
  // holds for the rest of this sort.
  let shrunk: number | null = null
  let parts = 0
  let multi = false
  let filedAny = false
  let lowConfidence = false
  let writeFailed = false
  let tooLargeInARow = 0
  let unsorted = 0
  let unchecked = 0
  let trouble: { outcome: 'failed' | 'rejected'; reason: string } | null = null
  const totals = { tasks: 0, ideas: 0, notes: 0, held: 0 }
  const placed: ReceiptPlace[] = []
  while (rest.length > 0) {
    const fixed = framing(items, itemsCap)
    // A limit the provider states mid-sort can only make parts smaller
    // than the size a 413 taught.
    const budget = shrunk === null ? budgetNow() : Math.min(shrunk, budgetNow())
    const costs = rest.map((p) => costAt[p])
    // A gap in the positions (Sort again sends what is left) reads as a
    // paragraph break.
    const breaks = rest.map((p, k) => (k > 0 && rest[k - 1] === p - 1 ? boundaryAt[p] : 'paragraph'))
    const take = nextPart(costs, breaks, budget * CHARS_PER_TOKEN - fixed)
    const part = rest.slice(0, take)
    if (parts === 0 && take < rest.length) multi = true
    // A part refused as too large is not a part: its halves are.
    run.tag = multi ? ` part=${parts + 1}` : ''
    const result = await sortPart(run, part)
    if (result.status === 413 && part.length > 1) {
      // Too large for the provider: send it in halves, and keep the
      // smaller size for the rest of this sort.
      const partChars = costs.slice(0, take).reduce((n, c) => n + c, 0)
      shrunk = Math.max(1, Math.floor((fixed + partChars / 2) / CHARS_PER_TOKEN))
      multi = true
      writeAppLog(`[sort] part too large reason=http 413 sentences=${part.length}; sending it in halves${run.tag}`)
      continue
    }
    parts += 1
    rest = rest.slice(take)
    totals.tasks += result.counts.tasks
    totals.ideas += result.counts.ideas
    totals.notes += result.counts.notes
    totals.held += result.counts.held
    unchecked += result.unchecked
    for (const place of result.places ?? []) {
      if (!placed.some((p) => p.kind === place.kind && p.file === place.file)) placed.push(place)
    }
    if (result.outcome === 'filed') {
      filedAny = true
      tooLargeInARow = 0
      continue
    }
    if (result.outcome === 'rejected' && result.reason === 'low confidence') {
      lowConfidence = true
      continue
    }
    unsorted += result.left
    if (trouble === null || result.outcome === 'failed') {
      trouble = { outcome: result.outcome === 'failed' ? 'failed' : 'rejected', reason: result.reason ?? 'unknown' }
    }
    if (result.outcome !== 'failed') continue
    // A line too large even alone stays in the inbox and the rest goes
    // on, unless it happens twice running: then what is too large is
    // what every part carries, and every line would meet the same.
    if (result.status === 413 && ++tooLargeInARow < 2) continue
    // Any other failure (the model unreachable, a key refused, a rate
    // limit that did not pass, a file that would not take its lines)
    // would meet the next part too: the rest stays for Sort again.
    writeFailed = (result.reason ?? '').startsWith('write ')
    if (rest.length > 0) {
      writeAppLog(`[sort] stopped reason=${result.reason ?? 'unknown'} left=${rest.length}; the rest stays in the inbox for Sort again${run.tag}`)
    }
    unsorted += rest.length
    rest = []
  }
  placed.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'tasks' ? -1 : 1))
  const extra = {
    ...(unsorted > 0 ? { unsorted } : {}),
    ...(unchecked > 0 ? { unchecked } : {}),
    ...(parts > 1 ? { parts } : {})
  }
  if (multi || unsorted > 0) {
    writeAppLog(
      `[sort] done parts=${parts} sentences=${positions.length} unsorted=${unsorted} waited=${seconds(run.pace.waitedMs)}${trouble ? ` reason=${trouble.reason}` : ''}`
    )
  }
  // A write that failed after earlier parts filed still names the files
  // they filed into, for the receipt and Home.
  if (writeFailed) return record('failed', { ...totals, ...extra }, trouble?.reason, placed.length > 0 ? placed : undefined)
  if (filedAny) return record('filed', { ...totals, ...extra }, trouble?.reason, placed)
  if (trouble) return record(trouble.outcome, { ...totals, ...extra }, trouble.reason)
  return record('rejected', { ...totals, ...extra }, lowConfidence ? 'low confidence' : 'unknown')
}

/**
 * Sort 1 part of a note: the sentences at these positions, numbered from
 * 1. Never throws. Files are written only after this part's whole
 * labeling validated, tasks first, then ideas, and its lines settle on
 * their own, so a part that fails leaves only its own lines unsettled.
 */
async function sortPart(run: SortRun, positions: readonly number[]): Promise<PartResult> {
  const { input, settings, units, fetchImpl, timeoutMs, items, tasksFile, tasksText, wantsTopic } = run
  const { tasksPath, ideasPath } = run.paths
  let { config, slot, protocol } = run.via
  const sentences = positions.map((i) => units.sentences[i])
  // A list line under a heading carries that heading as its lead-in
  // (US-062); the heading itself is never sent.
  const unitLeads = positions.map((i) => units.leads[i] ?? null)
  const done = (
    outcome: SortOutcome,
    counts: PartResult['counts'],
    reason?: string,
    extra: Partial<PartResult> = {}
  ): PartResult => ({
    outcome,
    counts,
    unchecked: 0,
    left: outcome === 'filed' ? 0 : sentences.length,
    ...(reason ? { reason } : {}),
    ...extra
  })
  // Only the first part to file names the note; the rest reuse its name.
  const askTopic = wantsTopic && run.topic === null
  // Seams (US-056): the code finds where a sentence could be cut and the
  // model only votes per seam; a note with no seam offers none.
  const seamsBySentence = sentences.map(findSeams)
  const seamCounts = seamsBySentence.map((s) => s.length)
  const offerSeams = seamCounts.some((n) => n > 0)
  // Lead-ins (US-062): for a sentence that could be a run, the model
  // points at the word where its first item begins; numbers only.
  const leadCounts = sentences.map((sentence, i) => leadWords(sentence, seamsBySentence[i] ?? []).length)
  const offerLeads = leadCounts.some((n) => n > 0)
  // Keep (US-115, US-116 on a decision connection): for a task or idea
  // sentence the model points at the first and last word worth filing;
  // numbers only.
  const keepCounts = sentences.map((sentence) => keepWords(sentence).length)
  const offerKeep = keepCounts.some((n) => n > 0)
  // False once Clear all ran after this sort was asked for: it still
  // files, but holds no line's words in memory.
  const remembers = (): boolean => run.generation === memoryGeneration

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
      ? readDecisionAnswers(
          reply.answers,
          sentences.length,
          seamCounts,
          items.length,
          leadCounts,
          keepCounts,
          settings.notes.connection.threshold
        )
      : null
    if (reply.ok && read?.ok) {
      verdict = read
      answeredBy = reply.model
    } else {
      const reason = reply.ok ? `validate: ${read && !read.ok ? read.reason : 'unknown'}` : reply.reason
      writeAppLog(`[sort] decision failed reason=${reason} model=${config.model}; falling back to the chat sorter${run.tag}`)
      const cleanup = run.fallback ?? resolvePolishConnection(settings)
      if (!cleanup) {
        writeAppLog('[sort] failed reason=no connection; the decision model did not answer and no chat connection has a key')
        return done('failed', NONE, 'no connection')
      }
      config = cleanup
      slot = 'cleanup'
      protocol = 'chat'
      answeredBy = cleanup.model
      // The rest of the note goes to the chat sorter too.
      run.via = { config, slot, protocol }
    }
  }

  if (verdict === null) {
    const systemPrompt = [
      SORT_SYSTEM_PROMPT,
      ...(askTopic ? [SORT_TOPIC_PROMPT] : []),
      ...(offerSeams ? [SORT_SEAMS_PROMPT] : []),
      ...(offerLeads ? [SORT_LEADS_PROMPT] : []),
      ...(offerKeep ? [SORT_KEEP_PROMPT] : []),
      ...(items.length > 0 ? [SORT_RELATIONS_PROMPT] : [])
    ].join(' ')
    const userPrompt = [
      numberedList(sentences),
      ...(offerSeams ? [`Seams:\n${seamPrompt(sentences, seamsBySentence)}`] : []),
      ...(offerLeads ? [`Lead words:\n${leadPrompt(sentences, seamsBySentence)}`] : []),
      ...(offerKeep ? [`Words:\n${keepPrompt(sentences)}`] : []),
      ...(items.length > 0 ? [contextPrompt(items, run.itemsCap)] : [])
    ].join('\n\n')
    const reply = await askChat(systemPrompt, userPrompt, config, run, 'labels')
    if (!reply.ok) {
      writeAppLog(
        `[sort] failed reason=${reply.reason} model=${config.model} slot=${slot} sentences=${sentences.length}${run.tag}${saidTail(reply.said)}`
      )
      return done('failed', NONE, reply.reason, reply.status !== undefined ? { status: reply.status } : {})
    }
    const chat = validateSort(sentences.length, reply.content, {
      topic: askTopic,
      seamCounts,
      items: items.length,
      leadCounts,
      keepCounts
    })
    if (!chat.ok) {
      writeAppLog(`[sort] rejected reason=${chat.reason} model=${config.model} slot=${slot} sentences=${sentences.length}${run.tag}`)
      return done('rejected', NONE, chat.reason)
    }
    verdict = chat
  }

  // File only the item (US-115): a task or idea sentence the model
  // trimmed is cut down to the words worth filing before anything else
  // reads it, so held lines, cuts, lead-ins, and the files all see the
  // same words. The inbox keeps every word. A chat reply votes keep as
  // [first, last]; a decision answer as two Choices (US-116).
  let trimmed = 0
  if (verdict.keep) {
    const seamVotes: SeamVotes = { ...verdict.seams }
    const leadStarts: LeadStarts = { ...(verdict.starts ?? {}) }
    for (const [key, span] of Object.entries(verdict.keep)) {
      const i = Number(key) - 1
      if (verdict.labels[i] !== 'task' && verdict.labels[i] !== 'idea') continue
      const next = applyKeep(sentences[i], seamsBySentence[i] ?? [], seamVotes[i + 1], leadStarts[i + 1], span)
      if (next.sentence === sentences[i]) continue
      sentences[i] = next.sentence
      seamsBySentence[i] = next.seams
      if (next.confirmed.length > 0) seamVotes[i + 1] = next.confirmed
      else delete seamVotes[i + 1]
      if (next.start !== undefined) leadStarts[i + 1] = next.start
      else delete leadStarts[i + 1]
      trimmed += 1
    }
    verdict = { ...verdict, seams: seamVotes, starts: leadStarts }
  }

  // Held lines (US-058): on a decision connection, a line the model is
  // not sure of stays in the inbox, which is already verbatim, so
  // holding writes nothing. The chat path reports no confidence and
  // holds nothing. A note with nothing kept is a rejected sort.
  const threshold = settings.notes.connection.threshold
  // What the model was sure of, per line: number, label, and confidence,
  // never the words (live-found 2026-09-24: without it, a line held as a
  // repeat and a line held as unsure were indistinguishable, and a
  // confident label could not be told from a lucky one).
  if (protocol === 'decide' && verdict.confidence) {
    const confidence = verdict.confidence
    const perLine = verdict.labels.map((label, i) => `${i + 1}=${label}:${(confidence[i] ?? 1).toFixed(2)}`)
    writeAppLog(`[sort] confidence ${perLine.join(' ')} threshold=${threshold} model=${answeredBy}`)
  }
  // How sure the decision model was of where each item begins and ends
  // (US-116), so a sentence that filed whole can be told from one the
  // gate kept whole. Numbers only, never the words.
  const keepSure = protocol === 'decide' ? Object.entries(verdict.keepConfidence ?? {}) : []
  if (keepSure.length > 0) {
    const ends = keepSure.map(([n, [first, last]]) => `${n}=${first?.toFixed(2) ?? '-'}/${last?.toFixed(2) ?? '-'}`)
    writeAppLog(`[sort] keep ${ends.join(' ')} threshold=${threshold} model=${answeredBy}`)
  }
  const { kept: sure, held: unsure } = holdBelow(
    sentences.length,
    protocol === 'decide' ? verdict.confidence : undefined,
    threshold
  )
  for (const i of unsure) {
    const lead = unitLeads[i]
    if (remembers()) heldLines.push({
      id: nextHeldId++,
      position: positions[i],
      text: sentences[i],
      label: verdict.labels[i],
      reason: 'unsure',
      ...(lead ? { lead } : {})
    })
  }
  if (sure.length === 0) {
    writeAppLog(`[sort] held every line reason=low confidence held=${unsure.length} threshold=${threshold} model=${answeredBy}${run.tag}`)
    return done('rejected', { ...NONE, held: unsure.length }, 'low confidence', { left: 0 })
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
  // Runs the sentence-level vote called new join the same look when
  // there is anything filed to compare against (US-062): a run mixing
  // a filed item with a new one reads as new as a whole. If the look
  // cannot be answered they file exactly as they would have.
  const keptRuns = items.length > 0 ? runsToCompare(kept, sentences, verdict.labels, seamsBySentence, verdict.seams, starts, 'piece') : []
  const compared = [...cut, ...keptRuns].sort((a, b) => a.local - b.local)
  const comparedKept = new Set<number>()
  let comparedLeads = 0
  // Runs filed cut without that look, because it could not be answered:
  // the report carries the count so the degrade is never silent (US-180).
  let unchecked = 0
  if (compared.length > 0) {
    const flat = flattenPieces(compared)
    const second = await askRelations(flat.sentences, items, { config, protocol, run })
    if (second.ok) {
      ;({ held: heldPieces, filed: filedPieces } = assignPieceVotes(compared, second.relations, items))
      cutFiled = compared.length
      for (const set of keptRuns) comparedKept.add(set.local)
      comparedLeads = compared.filter((set) => set.lead !== null).length
      writeAppLog(
        `[sort] compared pieces=${flat.sentences.length} of=${compared.length} held=${heldPieces.length} protocol=${protocol} model=${answeredBy}`
      )
    } else {
      const fallback = cut.length > 0 ? 'holding the whole line' : 'filing the runs as cut'
      unchecked = keptRuns.length
      writeAppLog(
        `[sort] piece compare failed reason=${second.reason} model=${answeredBy}; ${fallback}${unchecked > 0 ? ` unchecked=${unchecked}` : ''}${run.tag}`
      )
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
    if (remembers()) heldLines.push({
      id,
      position: positions[local],
      text: sentences[local],
      label: verdict.labels[local],
      reason: heldReasonFor(vote, item),
      pieces: wholePieces.get(local),
      match: matchOf(item),
      ...(lead ? { lead } : {})
    })
    if (remembers()) heldSnapshots.set(id, snapshot)
  }
  for (const piece of heldPieces) {
    const id = nextHeldId++
    if (remembers()) heldLines.push({
      id,
      position: positions[piece.local],
      text: piece.text,
      label: piece.label,
      reason: heldReasonFor(piece.vote, piece.item),
      match: matchOf(piece.item),
      ...(piece.lead ? { lead: piece.lead } : {})
    })
    if (remembers()) heldSnapshots.set(id, snapshot)
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
  let leadCount = comparedLeads
  for (const i of sure) {
    if (kept.includes(i) && !comparedKept.has(i)) {
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
  // A note sent in parts sits under the name its first filed part got.
  const topic = askTopic ? verdict.topic : (run.topic ?? '')
  if (remembers()) lastTopic = topic
  const written = writeEntries(
    input,
    expanded.sentences,
    expanded.labels,
    topic,
    { tasksPath, ideasPath },
    expanded.leads
  )
  if (!written.ok) {
    // Whatever landed is settled so Sort again cannot land it twice;
    // lines whose file failed stay pending in the verbatim inbox
    // (review gate 2026-09-22).
    const landed = written.landed
    const landedLocal = kept.filter((_, k) => {
      const label = keptLabels[k]
      return label === 'note' || (label === 'task' && landed.tasks > 0) || (label === 'idea' && landed.ideas > 0)
    })
    settleFor(input, positions, landedLocal)
    return done('failed', { ...landed, held: heldCount }, written.reason, {
      unchecked,
      left: kept.length - landedLocal.length
    })
  }
  // Everything kept is settled for this note; unsure lines stay
  // pending so Sort again can send them alone.
  settleFor(input, positions, kept)
  if (askTopic) run.topic = verdict.topic
  const counts = { ...written.counts, held: heldCount }
  const topicNote = wantsTopic && protocol === 'decide' ? ' topic=unavailable' : ''
  const heldNote =
    heldCount > 0 ? ` held=${heldCount} unsure=${unsure.length} related=${relatedHeld} threshold=${threshold}` : ''
  writeAppLog(
    `[sort] filed tasks=${counts.tasks} ideas=${counts.ideas} notes=${counts.notes} split=${splitCount} protocol=${protocol} model=${answeredBy} slot=${slot}${heldNote}${topicNote}${leadCount > 0 ? ` leads=${leadCount}` : ''}${trimmed > 0 ? ` trimmed=${trimmed}` : ''}${unchecked > 0 ? ` unchecked=${unchecked}` : ''}${run.tag}`
  )
  return done('filed', counts, undefined, { places: written.places, unchecked })
}

/**
 * The second, smaller request of a piece-by-piece comparison: the
 * pieces as numbered sentences against the same items, on the same
 * connection the sort used. No seams or keep words are offered and no topic asked;
 * the labels come back but the sentence's own label is kept. Any
 * failure is reported, never thrown; the caller holds the whole line.
 */
async function askRelations(
  pieces: readonly string[],
  items: readonly ContextItem[],
  via: { config: PolishConfig; protocol: SortProtocol; run: SortRun }
): Promise<{ ok: true; relations: RelationVotes } | { ok: false; reason: string }> {
  const { config, protocol, run } = via
  const { fetchImpl, timeoutMs } = run
  const noSeams = pieces.map(() => 0)
  if (protocol === 'decide') {
    const reply = await askDecision(
      buildDecisionRequest(config.model, pieces, pieces.map(() => []), items, false),
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
  const userPrompt = [numberedList([...pieces]), contextPrompt(items, run.itemsCap)].join('\n\n')
  const reply = await askChat(systemPrompt, userPrompt, config, run, 'pieces')
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
  if (sortInFlight()) return setAction({ ok: false, reason: 'a sort is running; try again in a moment' })
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
  if (sortInFlight()) return setAction({ ok: false, reason: 'a sort is running; try again in a moment' })
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
  if (sortInFlight()) return setAction({ ok: false, reason: 'a sort is running; try again in a moment' })
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
  try {
    backup(snapshot.file)
    replaceViaTemp(snapshot.file, ticked.text)
  } catch (error) {
    writeAppLog(`[sort] tick failed reason=${errorCode(error)}`)
    return setAction({ ok: false, reason: `could not write the file (${errorCode(error)})` })
  }
  settleFor(input, [entry.position], [0])
  dropHeld(entry)
  heldSnapshots.delete(id)
  writeAppLog(`[sort] ticked file=tasks nth=${match.nth}`)
  return setAction({ ok: true })
}

/** What Sort again sorted: each note, its report, and whether the ask
 *  joined a sort of that note already running (its owner follows it). */
export interface SortAgainRun {
  input: SortInput
  report: SortReport
  joined: boolean
}

/** Sort again (in settings): the lines no sort has settled, of the
 *  newest note and of any older note a sort left lines of (US-180),
 *  oldest first, each in its turn and never twice at once. */
export async function sortWaiting(options: SortOptions = {}): Promise<SortAgainRun[]> {
  const queued = notesToSortAgain().map((input) => {
    const joined = sortQueuedFor(input)
    return { input, joined, report: sortNote(input, options, joined ? undefined : pendingFor(input)) }
  })
  return Promise.all(queued.map(async (run) => ({ ...run, report: await run.report })))
}

/** Sort again, answering with the newest report. */
export async function sortLastNote(options: SortOptions = {}): Promise<SortReport | null> {
  const runs = await sortWaiting(options)
  return runs.at(-1)?.report ?? lastSort
}

/** Forget every note the sorter holds in memory, and the held lines'
 *  words with them: Clear all in Settings, History calls it. The inbox
 *  files keep every word. */
export function forgetSortMemory(): void {
  memoryGeneration += 1
  lastInput = null
  waiting = []
  heldFor = null
  heldLines = []
  heldSnapshots.clear()
  lastTopic = ''
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
        read(inbox) === inboxBefore &&
        // The receipt (US-082) names these files, tasks first.
        JSON.stringify(filed.places) ===
          JSON.stringify([
            { kind: 'tasks', file: todo, relative: 'murmur/todo.md' },
            { kind: 'ideas', file: ideas, relative: 'murmur/ideas.md' }
          ])

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
      // The sort's own request is the first one; a run can be followed
      // by the piece-by-piece look (US-062), which must not overwrite it.
      const capturing = (content: string): typeof fetch => {
        let first = true
        return (async (_url: unknown, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            messages?: Array<{ role: string; content: string }>
          }
          if (!first) return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
          first = false
          captured = {
            system: body.messages?.find((m) => m.role === 'system')?.content ?? '',
            user: body.messages?.find((m) => m.role === 'user')?.content ?? ''
          }
          return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
        }) as typeof fetch
      }
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
      // Keeps the sort's own decision request; a piece-by-piece look
      // that follows a run (US-062) must not overwrite it.
      const routed = (decision: string | number, chat = '{"1":"task"}'): typeof fetch => {
        let first = true
        return (async (url: unknown, init?: RequestInit) => {
          if (String(url).endsWith('/systemone')) {
            if (first) decisionBody = JSON.parse(String(init?.body ?? '{}')) as typeof decisionBody
            first = false
            if (typeof decision === 'number') return new Response('{}', { status: decision })
            return new Response(decision, { status: 200 })
          }
          return new Response(JSON.stringify({ choices: [{ message: { content: chat } }] }), { status: 200 })
        }) as typeof fetch
      }
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
        log.includes('[sort] confidence 1=task:0.90 2=note:0.80 threshold=0.5 model=jev-1.13.0') &&
        // The seam fixtures run once items are filed, so their runs meet
        // the piece look (US-062). On chat the canned reply cannot answer
        // it and the runs file cut, the output splitOk and wholeOk pin; on
        // the decision fixtures it answers with no relation and every
        // piece files, the output decisionOk and sameFixtureOk pin.
        log.includes('[sort] piece compare failed reason=extra sentences model=smoke-sorter; filing the runs as cut') &&
        log.includes('[sort] compared pieces=2 of=1 held=0 protocol=decide model=jev-1.13.0') &&
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
            // The sort's own request; the piece look that follows is not it.
            if (!decisionBody.questions) decisionBody = JSON.parse(String(init?.body ?? '{}')) as typeof decisionBody
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

      // A mixed run the sentence-level vote calls new (live-found
      // 2026-09-23): its pieces are still compared, so rice is held and
      // bread files under the lead line.
      const afterAnyway = read(todo)
      const rice = buildCompareContext(afterAnyway, '').find((item) => item.text === 'rice')
      const mixedReplies = [
        '{"1":"task","seams":{"1":[1]},"starts":{"1":5}}',
        `{"1":"task","2":"task","relations":{"1":[1,${rice?.number ?? 0}]}}`
      ]
      let m = 0
      const mixedInput: SortInput = { ...base, text: 'I need to buy rice, and bread.' }
      rememberForSort(mixedInput)
      const mixed = await sortNote(mixedInput, {
        fetchImpl: (async () => reply(mixedReplies[Math.min(m++, 1)])) as typeof fetch,
        connection: cfg
      })
      const mixedHeld = getHeldLines()
      const mixedOk =
        rice !== undefined &&
        m === 2 &&
        mixed.outcome === 'filed' &&
        mixed.tasks === 1 &&
        mixed.held === 1 &&
        mixedHeld.length === 1 &&
        mixedHeld[0]?.text === 'rice' &&
        mixedHeld[0]?.lead?.text === 'I need to buy' &&
        read(todo) === `${afterAnyway}- I need to buy:\n  - [ ] bread ${link}\n` &&
        skipHeldLine(mixedHeld[0]?.id ?? -1).ok

      const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
      return (
        chatOk &&
        listOk &&
        decideOk &&
        heldOk &&
        mixedOk &&
        log.includes('split=1 protocol=chat') &&
        log.includes(' leads=1')
      )
    } finally {
      updateSettings({ notes: before })
    }
  })

  registerSmokeCheck('noteKeep', async () => {
    // US-115: a task or idea files only the words the keep vote points
    // at, a run's cut and lead-in follow the kept words, a bad span
    // files the sentence whole, a note's span is ignored, the chat
    // fallback after a failed decision trims too, a decision answer
    // trims from its keep Choices (US-116), and the sort never writes
    // the inbox.
    const before = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-vault-keep')
    const todo = join(vault, 'murmur', 'todo.md')
    const ideas = join(vault, 'murmur', 'ideas.md')
    const read = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '')
    const link = '([10:32](inbox/2026-09-18.md))'
    const base = { base: vault, inboxRelative: 'murmur/inbox/2026-09-18.md', when: probeMoment }
    const answer = (content: string, sink?: (body: string) => void): typeof fetch =>
      (async (_url: unknown, init?: RequestInit) => {
        sink?.(String(init?.body ?? ''))
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
      }) as typeof fetch
    try {
      mkdirSync(join(vault, 'murmur', 'inbox'), { recursive: true })
      updateSettings({ notes: { folder: vault, sort: true, ...layout } })

      let body = ''
      const idea = await sortNote(
        { ...base, text: 'Oh, and an idea: a rooftop launch party.' },
        { fetchImpl: answer('{"1":"idea","keep":{"1":[5,8]}}', (b) => (body = b)), connection: cfg }
      )
      const sent = JSON.parse(body) as { messages: Array<{ content: string }> }
      const ideaOk =
        idea.outcome === 'filed' &&
        idea.ideas === 1 &&
        sent.messages[0].content.includes('key "keep"') &&
        sent.messages[1].content.includes('Words:\n1: 1 Oh, | 2 and | 3 an | 4 idea: | 5 a | 6 rooftop') &&
        // The filler is never offered as a cut (US-114).
        !sent.messages[1].content.includes('Seams:') &&
        read(ideas) === `## 2026-09-18\n- a rooftop launch party. ${link}\n`

      const run = await sortNote(
        { ...base, text: 'Honestly, tomorrow I need to buy apples, rice, and coffee.' },
        {
          fetchImpl: answer('{"1":"task","seams":{"1":[2,3]},"starts":{"1":7},"keep":{"1":[2,10]}}'),
          connection: cfg
        }
      )
      const runOk =
        run.outcome === 'filed' &&
        run.tasks === 3 &&
        read(todo) ===
          `## 2026-09-18\n- tomorrow I need to buy:\n  - [ ] apples ${link}\n  - [ ] rice ${link}\n  - [ ] coffee ${link}\n`

      const afterRun = read(todo)
      const bad = await sortNote(
        { ...base, text: 'Oh, call the vet.' },
        { fetchImpl: answer('{"1":"task","keep":{"1":[0,9]}}'), connection: cfg }
      )
      const badOk = bad.outcome === 'filed' && bad.tasks === 1 && read(todo) === `${afterRun}- [ ] Oh, call the vet. ${link}\n`

      const afterBad = read(todo)
      const afterIdeas = read(ideas)
      const note = await sortNote(
        { ...base, text: 'Honestly the weather was lovely today.' },
        { fetchImpl: answer('{"1":"note","keep":{"1":[2,4]}}'), connection: cfg }
      )
      const noteOk = note.outcome === 'filed' && note.notes === 1 && read(todo) === afterBad && read(ideas) === afterIdeas

      // A decision that fails falls back to the chat sorter, which trims.
      const fellBack = await sortNote(
        { ...base, text: 'Oh, and an idea: a podcast tour.' },
        {
          fetchImpl: (async (url: unknown) =>
            String(url).endsWith('/systemone')
              ? new Response('{}', { status: 500 })
              : new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"idea","keep":{"1":[5,7]}}' } }] }), {
                  status: 200
                })) as typeof fetch,
          connection: { baseUrl: 'https://mock-decide.local/v1', model: 'jev-latest', apiKey: 'k' },
          protocol: 'decide',
          fallback: cfg
        }
      )
      const fallbackOk = fellBack.outcome === 'filed' && read(ideas) === `${afterIdeas}- a podcast tour. ${link}\n`

      // US-116: the decision model trims too, from two keep Choices.
      // LB's live dump of 2026-10-29, which filed whole on 0.1.16.
      const beforeDecideTodo = read(todo)
      const beforeDecideIdeas = read(ideas)
      let decideBody = ''
      const decided = await sortNote(
        { ...base, text: 'Call the dentist tomorrow. Oh, and an idea: a rooftop launch party.' },
        {
          fetchImpl: (async (_url: unknown, init?: RequestInit) => {
            decideBody = String(init?.body ?? '')
            return new Response(
              JSON.stringify({
                model: 'jev-1.14.0',
                answers: {
                  label_1: { type: 'choice', choice: 'task', confidence: 1 },
                  label_2: { type: 'choice', choice: 'idea', confidence: 1 },
                  keep_first_1: { type: 'choice', choice: '1', confidence: 1 },
                  keep_last_1: { type: 'choice', choice: '4', confidence: 0.99 },
                  keep_first_2: { type: 'choice', choice: '5', confidence: 0.97 },
                  keep_last_2: { type: 'choice', choice: '8', confidence: 0.95 }
                }
              }),
              { status: 200 }
            )
          }) as typeof fetch,
          connection: { baseUrl: 'https://mock-decide.local/v1', model: 'jev-latest', apiKey: 'k' },
          protocol: 'decide'
        }
      )
      const asked = JSON.parse(decideBody || '{}') as { questions?: Record<string, { criteria?: Record<string, string> }> }
      const decideOk =
        decided.outcome === 'filed' &&
        decided.tasks === 1 &&
        decided.ideas === 1 &&
        asked.questions?.keep_first_2?.criteria?.['5'] === 'a' &&
        asked.questions?.keep_last_2?.criteria?.['8'] === 'party.' &&
        read(todo) === `${beforeDecideTodo}- [ ] Call the dentist tomorrow. ${link}\n` &&
        read(ideas) === `${beforeDecideIdeas}- a rooftop launch party. ${link}\n`

      const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
      return (
        ideaOk &&
        runOk &&
        badOk &&
        noteOk &&
        fallbackOk &&
        decideOk &&
        !existsSync(join(vault, 'murmur', 'inbox', '2026-09-18.md')) &&
        log.includes(' trimmed=1') &&
        /protocol=decide model=jev-1\.14\.0 slot=separate.* trimmed=1/.test(log) &&
        log.includes('[sort] keep 1=1.00/0.99 2=0.97/0.95 threshold=')
      )
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

  registerSmokeCheck('noteSortParts', async () => {
    // US-180: a note too large for 1 request goes again in halves, a 429
    // waits what it asked and tries once more, every line files once,
    // and after a second 429 the lines left stay in the inbox and Sort
    // again sends only those. The provider's reason reaches the log
    // without its organization id.
    const before = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-vault-parts')
    const todo = join(vault, 'murmur', 'todo.md')
    const read = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '')
    // Its own connection, so the limit it states is not the other checks'.
    const partsCfg: PolishConfig = { baseUrl: 'https://mock-parts.local/v1', model: 'smoke-parts', apiKey: 'k' }
    const base = { base: vault, inboxRelative: 'murmur/inbox/2026-09-18.md', when: probeMoment }
    const supplier = Array.from({ length: 12 }, (_, i) => `Call the supplier about crate ${i + 1} today.`)
    const printer = supplier.map((line) => line.replace('supplier', 'printer'))
    const sent: string[][] = []
    const model = (refuse: (n: number) => 413 | 429 | null): typeof fetch => {
      let n = 0
      return (async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content: string }> }
        const user = body.messages?.[1]?.content ?? ''
        const numbered = (user.split('\n\n')[0] ?? '').split('\n').filter((line) => /^\d+\. /.test(line))
        sent.push(numbered.map((line) => line.replace(/^\d+\. /, '')))
        const refused = refuse(n++)
        if (refused === 413) {
          const message =
            'Request too large for model `smoke-parts` in organization `org_smoke123` on tokens per minute (TPM): Limit 8000, Requested 9000'
          return new Response(JSON.stringify({ error: { message, type: 'tokens' } }), { status: 413 })
        }
        if (refused === 429) {
          const message = 'Rate limit reached for model `smoke-parts`. Please try again in 2s.'
          return new Response(JSON.stringify({ error: { message } }), { status: 429, headers: { 'retry-after': '2' } })
        }
        const labels = Object.fromEntries(numbered.map((_, i) => [String(i + 1), 'task']))
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(labels) } }] }), { status: 200 })
      }) as typeof fetch
    }
    const waits: number[] = []
    const sleep = async (ms: number): Promise<void> => {
      waits.push(ms)
    }
    const once = (text: string, lines: readonly string[]): boolean => lines.every((line) => text.split(line).length === 2)
    try {
      mkdirSync(join(vault, 'murmur', 'inbox'), { recursive: true })
      updateSettings({ notes: { folder: vault, sort: true, ...layout } })
      const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
      const logBefore = read(logFile).length
      // The estimate says the whole note fits; the provider says not.
      const whole = await sortNote(
        { ...base, text: supplier.join(' ') },
        { fetchImpl: model((n) => (n === 0 ? 413 : n === 2 ? 429 : null)), connection: partsCfg, partTokens: 100_000, sleep }
      )
      const wholeOk =
        whole.outcome === 'filed' &&
        whole.tasks === 12 &&
        whole.unsorted === undefined &&
        (whole.parts ?? 0) >= 3 &&
        sent[0]?.length === 12 &&
        (sent[1]?.length ?? 99) <= 6 &&
        waits.join() === '2500' &&
        once(read(todo), supplier)

      // Each part about 4 lines; the second part is refused twice.
      const later: SortInput = { ...base, text: printer.join(' ') }
      rememberForSort(later)
      sent.length = 0
      const partial = await sortNote(later, {
        fetchImpl: model((n) => (n === 1 || n === 2 ? 429 : null)),
        connection: partsCfg,
        partTokens: 1300,
        sleep
      })
      const firstPart = sent[0] ?? []
      const left = printer.slice(firstPart.length)
      const partialOk =
        firstPart.length > 0 &&
        firstPart.length < 12 &&
        partial.outcome === 'filed' &&
        partial.tasks === firstPart.length &&
        partial.unsorted === left.length &&
        partial.reason === 'http 429' &&
        canSortAgain()
      sent.length = 0
      const again = await sortLastNote({ fetchImpl: model(() => null), connection: partsCfg, partTokens: 1300, sleep })
      const againOk =
        again?.outcome === 'filed' &&
        again.tasks === left.length &&
        again.unsorted === undefined &&
        JSON.stringify(sent.flat()) === JSON.stringify(left) &&
        !canSortAgain() &&
        once(read(todo), printer)
      const log = read(logFile).slice(logBefore)
      const logOk =
        log.includes('[sort] part too large reason=http 413 sentences=12; sending it in halves') &&
        log.includes('said="Request too large for model … in organization … on tokens per minute (TPM): Limit 8000, Requested 9000"') &&
        !log.includes('org_smoke123') &&
        log.includes('[sort] rate limited reason=http 429 for=labels wait=2.0s model=smoke-parts; trying once more') &&
        log.includes('[sort] stopped reason=http 429 left=') &&
        !log.includes('crate')
      const conditions = { wholeOk, partialOk, againOk, logOk }
      const failed = Object.entries(conditions)
        .filter(([, ok]) => !ok)
        .map(([name]) => name)
      if (failed.length > 0) console.error(`smoke noteSortParts: failed=${failed.join(',')}`)
      return failed.length === 0
    } finally {
      updateSettings({ notes: before })
    }
  })
}
