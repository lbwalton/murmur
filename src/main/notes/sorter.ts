// SPDX-License-Identifier: GPL-3.0-only
// The sorter's main-process half (US-051): resolve a connection, ask
// the model to label the note's numbered sentences, validate the reply
// strictly, and copy tasks and ideas into their files with links back.
// It runs after the note is already on disk and touches no file unless
// the whole labeling is valid, so a rejected sort costs nothing: the
// note is in the inbox, where it already was. Nothing here logs the
// note's text.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
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
  SORT_SEAMS_PROMPT,
  SORT_SYSTEM_PROMPT,
  SORT_TOPIC_PROMPT,
  applySplits,
  findSeams,
  headingPrefix,
  holdBelow,
  numberedList,
  planFiling,
  rekeyVotes,
  remainingSentences,
  renderFiledHeading,
  seamPrompt,
  settle,
  splitSentences,
  validateSort
} from '../../shared/sorter'
import { buildDecisionRequest, readDecisionAnswers } from '../../shared/decide'
import type { SortVerdict } from '../../shared/sorter'
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
  const all = splitSentences(input.text)
  // Sort again sends only the positions still unsettled; a fresh note
  // sends everything. The model sees whatever it gets numbered from 1.
  const positions = only ?? all.map((_, i) => i)
  const sentences = positions.map((i) => all[i])
  if (sentences.length === 0) return record('skipped', NONE, 'nothing to sort')

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

  let verdict: SortVerdict | null = null
  let answeredBy = config.model
  if (protocol === 'decide') {
    // One request: a Choice per sentence, a Noul per seam. Anything
    // short of a complete set of answers falls back to the chat sorter,
    // so choosing the decision model can never be why a sort fails.
    const reply = await askDecision(
      buildDecisionRequest(config.model, sentences, seamsBySentence),
      config,
      fetchImpl,
      timeoutMs
    )
    const read = reply.ok ? readDecisionAnswers(reply.answers, sentences.length, seamCounts) : null
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
      ...(offerSeams ? [SORT_SEAMS_PROMPT] : [])
    ].join(' ')
    const userPrompt = offerSeams
      ? `${numberedList(sentences)}\n\nSeams:\n${seamPrompt(sentences, seamsBySentence)}`
      : numberedList(sentences)
    const reply = await askModel(systemPrompt, userPrompt, config, fetchImpl, timeoutMs)
    if (!reply.ok) {
      writeAppLog(`[sort] failed reason=${reply.reason} model=${config.model} slot=${slot}`)
      return record('failed', NONE, reply.reason)
    }
    const chat = validateSort(sentences.length, reply.content, { topic: wantsTopic, seamCounts })
    if (!chat.ok) {
      writeAppLog(`[sort] rejected reason=${chat.reason} model=${config.model} slot=${slot} sentences=${sentences.length}`)
      return record('rejected', NONE, chat.reason)
    }
    verdict = chat
  }

  let tasksPath: ReturnType<typeof resolveTemplateOrDefault>
  let ideasPath: ReturnType<typeof resolveTemplateOrDefault>
  try {
    tasksPath = resolveTemplateOrDefault(settings.notes.tasksTemplate, DEFAULT_TASKS_TEMPLATE, input.when, 'tasks')
    ideasPath = resolveTemplateOrDefault(settings.notes.ideasTemplate, DEFAULT_IDEAS_TEMPLATE, input.when, 'ideas')
  } catch (error) {
    writeAppLog(`[sort] failed reason=${errorCode(error)}`)
    return record('failed', NONE, 'paths')
  }
  // Held lines (US-058): on a decision connection, a line the model is
  // not sure of stays in the inbox, which is already verbatim, so
  // holding writes nothing. The chat path reports no confidence and
  // holds nothing. A note with nothing kept is a rejected sort.
  const threshold = settings.notes.connection.threshold
  const { kept, held } = holdBelow(sentences.length, protocol === 'decide' ? verdict.confidence : undefined, threshold)
  if (kept.length === 0) {
    writeAppLog(`[sort] held every line reason=low confidence held=${held.length} threshold=${threshold} model=${answeredBy}`)
    return record('rejected', { ...NONE, held: held.length }, 'low confidence')
  }
  const keptSentences = kept.map((i) => sentences[i])
  const keptLabels = kept.map((i) => verdict.labels[i])
  const keptSeams = kept.map((i) => seamsBySentence[i])
  const keptVotes = rekeyVotes(verdict.seams, kept)

  // Cut at the confirmed seams before filing; only task and idea lines
  // split, and a sentence with no vote stays whole.
  const expanded = applySplits(keptSentences, keptLabels, keptSeams, keptVotes)
  const splitCount = Object.keys(keptVotes).filter((k) => {
    const label = keptLabels[Number(k) - 1]
    return label === 'task' || label === 'idea'
  }).length
  const plan = planFiling(expanded.sentences, expanded.labels, {
    time: noteMoment(input.when).time,
    inboxFile: input.inboxRelative,
    tasksFile: tasksPath.relative,
    ideasFile: ideasPath.relative
  })
  const counts = { tasks: plan.tasks.length, ideas: plan.ideas.length, notes: plan.notes.length, held: held.length }
  const writes: Array<{ file: string; lines: string[]; kind: 'tasks' | 'ideas' }> = []
  if (plan.tasks.length > 0) writes.push({ file: join(input.base, ...tasksPath.segments), lines: plan.tasks, kind: 'tasks' })
  if (plan.ideas.length > 0) writes.push({ file: join(input.base, ...ideasPath.segments), lines: plan.ideas, kind: 'ideas' })
  let targets: ReturnType<typeof openTargets>
  try {
    targets = openTargets(writes.map((w) => w.file))
  } catch (error) {
    writeAppLog(`[sort] write failed reason=${errorCode(error)} before any line landed`)
    return record('failed', NONE, `write ${errorCode(error)}`)
  }
  const landed = { tasks: 0, ideas: 0, notes: counts.notes, held: held.length }
  const heading = renderFiledHeading(settings.notes.filedHeadingTemplate, input.when, verdict.topic)
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
    // Whatever landed is settled so Sort again cannot land it twice;
    // lines whose file failed stay pending in the verbatim inbox
    // (review gate 2026-09-22).
    settleFor(
      input,
      positions,
      kept.filter((_, k) => {
        const label = keptLabels[k]
        return label === 'note' || (label === 'task' && landed.tasks > 0) || (label === 'idea' && landed.ideas > 0)
      })
    )
    return record('failed', landed, `write ${errorCode(error)}`)
  } finally {
    for (const fd of targets.fds) closeSync(fd)
  }
  // Everything kept is settled for this note; held lines stay pending
  // so Sort again can send them alone.
  settleFor(input, positions, kept)
  const topicNote = wantsTopic && protocol === 'decide' ? ' topic=unavailable' : ''
  const heldNote = held.length > 0 ? ` held=${held.length} threshold=${threshold}` : ''
  writeAppLog(
    `[sort] filed tasks=${counts.tasks} ideas=${counts.ideas} notes=${counts.notes} split=${splitCount} protocol=${protocol} model=${answeredBy} slot=${slot}${heldNote}${topicNote}`
  )
  return record('filed', counts)
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
          `${todoBeforeSplit}- [ ] Tomorrow we are getting groceries ([10:32](inbox/2026-09-18.md))\n- [ ] getting tacos ([10:32](inbox/2026-09-18.md))\n- [ ] going to the playground. ([10:32](inbox/2026-09-18.md))\n`
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
          `${afterSplit}- [ ] Buy eggs ([10:32](inbox/2026-09-18.md))\n- [ ] buy milk. ([10:32](inbox/2026-09-18.md))\n- [ ] Call Bob, then call Ann. ([10:32](inbox/2026-09-18.md))\n`

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
          '- [ ] Renew the domain ([10:32](inbox/2026-09-18.md))\n- [ ] pay the invoice. ([10:32](inbox/2026-09-18.md))\n'
        ) &&
        Array.isArray(decisionBody.state) &&
        decisionBody.questions?.label_1?.type === 'choice' &&
        decisionBody.questions?.label_2?.type === 'choice' &&
        decisionBody.questions?.seam_1_1?.type === 'noul'
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
          '- [ ] Buy eggs ([10:32](inbox/2026-09-18.md))\n- [ ] buy milk. ([10:32](inbox/2026-09-18.md))\n- [ ] Call Bob, then call Ann. ([10:32](inbox/2026-09-18.md))\n'
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
        getLastSort() === allHeld &&
        log.includes('held=1 threshold=0.5') &&
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
