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
  SORT_SYSTEM_PROMPT,
  SORT_TOPIC_PROMPT,
  headingPrefix,
  numberedList,
  planFiling,
  renderFiledHeading,
  splitSentences,
  validateSort
} from '../../shared/sorter'
import { resolvePolishConnection } from '../formatter'
import type { PolishConfig } from '../formatter/llm'
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
  reason?: string
}

export interface SortOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Smoke only: a connection that bypasses the ring and settings. */
  connection?: PolishConfig
}

let lastSort: SortReport | null = null
let lastInput: SortInput | null = null
// The input whose lines already landed: Sort again must never file it
// twice (review gate 2026-09-20).
let lastFiledInput: SortInput | null = null
// One sort at a time: a Sort again click during the model round trip
// joins the running sort instead of starting a second one that would
// append every line twice.
let inFlight: Promise<SortReport> | null = null

export function getLastSort(): SortReport | null {
  return lastSort
}

/** Sort again is offered only for a note that has not been filed. */
export function canSortAgain(): boolean {
  return lastInput !== null && lastInput !== lastFiledInput
}

/** Keep the newest note so Sort again can re-run it after a reject. */
export function rememberForSort(input: SortInput): void {
  lastInput = input
}

/** The connection the sort runs on: the separate slot when complete
 *  (its key served by the ring under its base URL), else whatever the
 *  cleanup pass would use (the cleanup slot, or the speech provider). */
export function resolveSortConnection(
  settings: Settings
): { config: PolishConfig; slot: 'separate' | 'cleanup' } | null {
  const slot = settings.notes.connection
  if (slot.enabled && slot.baseUrl !== '' && slot.llmModel !== '') {
    const key = getApiKeyFor(slot.baseUrl)
    if (key) return { config: { baseUrl: slot.baseUrl, model: slot.llmModel, apiKey: key }, slot: 'separate' }
    writeAppLog('[sort] separate connection has no key; using the cleanup connection')
  }
  const cleanup = resolvePolishConnection(settings)
  return cleanup ? { config: cleanup, slot: 'cleanup' } : null
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
  prompt: string,
  cfg: PolishConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  wantsTopic: boolean
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
          {
            role: 'system',
            content: wantsTopic ? `${SORT_SYSTEM_PROMPT} ${SORT_TOPIC_PROMPT}` : SORT_SYSTEM_PROMPT
          },
          { role: 'user', content: prompt }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return { ok: false, reason: `http ${response.status}` }
    let body: { choices?: Array<{ message?: { content?: unknown } }> }
    try {
      body = (await response.json()) as typeof body
    } catch {
      return { ok: false, reason: 'response not json' }
    }
    const content = body.choices?.[0]?.message?.content
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
  counts: { tasks: number; ideas: number; notes: number },
  reason?: string
): SortReport {
  lastSort = { at: Date.now(), outcome, ...counts, ...(reason ? { reason } : {}) }
  return lastSort
}

const NONE = { tasks: 0, ideas: 0, notes: 0 }

/**
 * Sort one note. Never throws; every outcome is a report and a log
 * line with a reason. Files are written only after the whole labeling
 * validated, tasks first, then ideas.
 */
export async function sortNote(input: SortInput, options: SortOptions = {}): Promise<SortReport> {
  if (inFlight) return inFlight
  inFlight = runSort(input, options).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runSort(input: SortInput, options: SortOptions): Promise<SortReport> {
  const settings = getSettings()
  if (!settings.notes.sort) return record('skipped', NONE, 'sorting off')
  if (isSmoke && !options.fetchImpl) return record('skipped', NONE, 'smoke')
  const sentences = splitSentences(input.text)
  if (sentences.length === 0) return record('skipped', NONE, 'nothing to sort')

  const resolved = options.connection
    ? { config: options.connection, slot: 'separate' as const }
    : resolveSortConnection(settings)
  if (!resolved) {
    writeAppLog('[sort] failed reason=no connection; save a key for the speech, cleanup, or sort connection')
    return record('failed', NONE, 'no connection')
  }
  const { config, slot } = resolved
  // Topics only mean something when a heading can carry them.
  const wantsTopic =
    settings.notes.topicHeadings && settings.notes.filedHeadingTemplate.includes('{topic}')
  const reply = await askModel(
    numberedList(sentences),
    config,
    options.fetchImpl ?? fetch,
    options.timeoutMs ?? 12_000,
    wantsTopic
  )
  if (!reply.ok) {
    writeAppLog(`[sort] failed reason=${reply.reason} model=${config.model} slot=${slot}`)
    return record('failed', NONE, reply.reason)
  }
  const verdict = validateSort(sentences.length, reply.content, { topic: wantsTopic })
  if (!verdict.ok) {
    writeAppLog(`[sort] rejected reason=${verdict.reason} model=${config.model} slot=${slot} sentences=${sentences.length}`)
    return record('rejected', NONE, verdict.reason)
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
  const plan = planFiling(sentences, verdict.labels, {
    time: noteMoment(input.when).time,
    inboxFile: input.inboxRelative,
    tasksFile: tasksPath.relative,
    ideasFile: ideasPath.relative
  })
  const counts = { tasks: plan.tasks.length, ideas: plan.ideas.length, notes: plan.notes.length }
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
  const landed = { tasks: 0, ideas: 0, notes: counts.notes }
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
    return record('failed', landed, `write ${errorCode(error)}`)
  } finally {
    for (const fd of targets.fds) closeSync(fd)
  }
  lastFiledInput = input
  writeAppLog(
    `[sort] filed tasks=${counts.tasks} ideas=${counts.ideas} notes=${counts.notes} model=${config.model} slot=${slot}`
  )
  return record('filed', counts)
}

/** Re-run the sort on the newest note (Sort again in settings): never
 *  a note whose lines already landed, and never beside a running sort. */
export async function sortLastNote(): Promise<SortReport | null> {
  if (inFlight) return inFlight
  if (!lastInput || lastInput === lastFiledInput) return lastSort
  return sortNote(lastInput)
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
        getLastSort() === badTopic &&
        log.includes('[sort] filed tasks=2 ideas=1 notes=1 model=smoke-sorter') &&
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
      updateSettings({ notes: { connection: { enabled: true, baseUrl: sortUrl, llmModel: 'sort-m' } } })
      ringSetKey(sortUrl, 'smoke-sort-key-1234567890')
      const separate = resolveSortConnection(getSettings())
      const separateOk = separate?.slot === 'separate' && separate.config.baseUrl === sortUrl && separate.config.model === 'sort-m'
      ringClearKey(sortUrl)
      // No sort key, and the primary provider holds one: cleanup path.
      ringSetKey(before.provider.baseUrl, 'smoke-primary-key-1234567890')
      const cleanup = resolveSortConnection(getSettings())
      const cleanupOk = cleanup?.slot === 'cleanup' && cleanup.config.baseUrl === before.provider.baseUrl
      updateSettings({ notes: { connection: { enabled: false } } })
      const same = resolveSortConnection(getSettings())
      const sameOk = same?.slot === 'cleanup' && same.config.baseUrl === before.provider.baseUrl
      ringClearKey(before.provider.baseUrl)
      const none = resolveSortConnection(getSettings())
      return separateOk && cleanupOk && sameOk && none === null
    } finally {
      ringClearKey(sortUrl)
      updateSettings({ notes: { connection: before.notes.connection } })
    }
  })
}
