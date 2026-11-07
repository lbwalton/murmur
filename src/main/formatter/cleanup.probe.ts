// SPDX-License-Identifier: GPL-3.0-only
// Live scoreboard for the cleanup pass (US-125): runs shared/cleanup-cases.json
// through the deterministic formatter, the exact prompt, the exact
// validation, and the exact time limit the app ships. Rerun it after any
// cleanup change. The file name is outside the unit test globs, so npm
// test and CI never call out, and it is skipped without a key.
//
//   MURMUR_PROBE_KEY=... npm run probe:cleanup
//
// Optional: MURMUR_PROBE_BASE_URL (default Groq), MURMUR_PROBE_MODELS
// (comma list, default openai/gpt-oss-120b), MURMUR_PROBE_RUNS (default 16,
// tripled for long-structure),
// MURMUR_PROBE_CONCURRENCY (default 3), MURMUR_PROBE_ROUTE to pin an
// OpenRouter provider, MURMUR_PROBE_KINDS (comma list),
// MURMUR_PROBE_ID_PREFIX (fresh runs the cases written after tuning),
// MURMUR_PROBE_PACE_MS (a wait after each call, for a key on a low rate limit), and
// MURMUR_PROBE_SMART_LISTS=0 or MURMUR_PROBE_CORRECTIONS=0 to turn those off.
// Both default on, unlike the app until US-127, since that is what is
// being measured.
//
// MURMUR_PROBE_OUT=file saves every raw answer as it arrives, with the
// settings it ran under. MURMUR_PROBE_REPLAY=file grades saved answers
// again with no key and no model calls, so a change to validation or to
// the grader can be measured for free. Replay uses the saved settings
// and skips an answer whose case text has changed since.
//
// MURMUR_PROBE_CLAUDE_CLI=1 with MURMUR_PROBE_MODELS=claude-haiku-5-5 runs
// the set through Claude Code on the signed-in plan, with no key. Made-up
// sentences only. It measures quality, not speed: the app's time limit and
// temperature do not apply, and Claude Code adds a little context of its own.
import { execFile } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import cleanupCases from '../../../shared/cleanup-cases.json'
import formatSpec from '../../../shared/format-spec.json'
import { type FormatSpec, formatTranscript } from '../../shared/formatter'
import { type CleanupCase, type CleanupOutcome, cleanupReport, gradeCase } from './cleanup-score'
import { polishTranscript } from './llm'

const KEY = process.env.MURMUR_PROBE_KEY ?? ''
const BASE_URL = process.env.MURMUR_PROBE_BASE_URL ?? 'https://api.groq.com/openai/v1'
const MODELS = (process.env.MURMUR_PROBE_MODELS ?? 'openai/gpt-oss-120b').split(',').map((model) => model.trim())
const RUNS = Number(process.env.MURMUR_PROBE_RUNS ?? 16)
const CONCURRENCY = Number(process.env.MURMUR_PROBE_CONCURRENCY ?? 3)
const ROUTE = process.env.MURMUR_PROBE_ROUTE ?? ''
const KINDS = (process.env.MURMUR_PROBE_KINDS ?? '').split(',').filter((kind) => kind.length > 0)
const ID_PREFIX = process.env.MURMUR_PROBE_ID_PREFIX ?? ''
const OUT = process.env.MURMUR_PROBE_OUT ?? ''
const REPLAY = process.env.MURMUR_PROBE_REPLAY ?? ''
const PACE_MS = Number(process.env.MURMUR_PROBE_PACE_MS ?? 0)
const CLAUDE_CLI = process.env.MURMUR_PROBE_CLAUDE_CLI === '1'

const CLAUDE_CLI_LIMIT_MS = 60_000
const RETRIES = 5
const LONG_RUNS_FACTOR = 3
const CASES = (cleanupCases.cases as CleanupCase[]).filter(
  (probe) => (KINDS.length === 0 || KINDS.includes(probe.kind)) && probe.id.startsWith(ID_PREFIX)
)

interface ProbeSettings {
  smartLists: boolean
  corrections: boolean
}

interface RawAnswer {
  model: string
  id: string
  run: number
  /** The spoken text, so a case edited later is not graded against this. */
  text: string
  /** The model's answer, or null when it never gave one. */
  raw: string | null
  /** Why not, when raw is null. */
  reason: string | null
}

interface ProbeJob {
  model: string
  probe: CleanupCase
  run: number
  /** Present in a replay. */
  saved?: RawAnswer
}

// A request that never reached the model says nothing about it. A
// timeout or an empty answer does: the app falls back on those, so they
// are graded as what the person would get.
function isTransport(reason: string | null): boolean {
  return reason !== null && /^(?:http \d|network)/.test(reason)
}

// A 429 used to fall back and read as a model miss (2026-10-19). A bad
// key or a wrong model name will not fix itself, so those fail at once.
function isWorthRetrying(reason: string | null): boolean {
  return reason !== null && /^(?:http (?:429|5\d\d)|network)/.test(reason)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function answering(raw: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: raw } }] }), { status: 200 })) as typeof fetch
}

// An empty folder, so no project instructions reach the model.
const cliFolder = CLAUDE_CLI ? mkdtempSync(join(tmpdir(), 'murmur-probe-')) : ''

// Answers a chat request through Claude Code. The API key is dropped so a
// stray one cannot bill instead of the plan.
function askClaudeCode(init: RequestInit | undefined): Promise<Response> {
  const { model, messages } = JSON.parse(String(init?.body)) as {
    model: string
    messages: Array<{ role: string; content: string }>
  }
  const text = (role: string): string =>
    messages
      .filter((message) => message.role === role)
      .map((message) => message.content)
      .join('\n')
  const args = ['-p', '--model', model, '--effort', 'low', '--setting-sources', '', '--strict-mcp-config', '--tools', '']
  args.push('--disable-slash-commands', '--no-session-persistence', '--output-format', 'json')
  args.push('--system-prompt', text('system'))
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  return new Promise((resolve, reject) => {
    const child = execFile('claude', args, { cwd: cliFolder, env, timeout: CLAUDE_CLI_LIMIT_MS }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      const answer = JSON.parse(stdout) as { result?: string; is_error?: boolean }
      if (answer.is_error === true || typeof answer.result !== 'string') {
        reject(new Error('no answer'))
        return
      }
      resolve(new Response(JSON.stringify({ choices: [{ message: { content: answer.result } }] }), { status: 200 }))
    })
    child.stdin?.end(text('user'))
  })
}

// Keeps the raw answer for MURMUR_PROBE_OUT and pins the OpenRouter
// provider, so a probe through OpenRouter matches the app's default host.
function liveFetch(onAnswer: (raw: string) => void): typeof fetch {
  return async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (ROUTE !== '') body.provider = { order: [ROUTE], allow_fallbacks: false }
    const response = CLAUDE_CLI ? await askClaudeCode(init) : await fetch(url, { ...init, body: JSON.stringify(body) })
    if (response.ok) {
      const parsed = (await response.clone().json()) as { choices?: Array<{ message?: { content?: unknown } }> }
      const content = parsed.choices?.[0]?.message?.content
      if (typeof content === 'string') onAnswer(content)
    }
    return response
  }
}

async function runJob(job: ProbeJob, settings: ProbeSettings): Promise<{ outcome: CleanupOutcome; answer: RawAnswer }> {
  const { model, probe, run, saved } = job
  const formatted = formatTranscript(
    probe.text,
    { level: 'full', numbers: 'auto', smartLists: settings.smartLists },
    formatSpec as unknown as FormatSpec
  )
  const cfg = { baseUrl: BASE_URL, model, apiKey: KEY }
  let raw: string | null = null
  let reason: string | null = saved?.reason ?? null
  let polished: string | null = null
  // A saved request that got no answer stays what it was.
  if (saved === undefined || saved.raw !== null) {
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      reason = null
      if (attempt > 0) await sleep(2_000 * 2 ** (attempt - 1))
      polished = await polishTranscript(formatted, cfg, {
        fetchImpl:
          saved?.raw != null
            ? answering(saved.raw)
            : liveFetch((answer) => {
                raw = answer
              }),
        smartLists: settings.smartLists,
        corrections: settings.corrections,
        ...(CLAUDE_CLI ? { timeoutMs: CLAUDE_CLI_LIMIT_MS } : {}),
        onFallback: (why) => {
          reason = why
        }
      })
      if (saved !== undefined || !isWorthRetrying(reason)) break
    }
  }
  // A fallback types the formatted text unchanged, so that is what gets graded.
  const typed = polished ?? formatted
  return {
    outcome: {
      model,
      id: probe.id,
      kind: probe.kind,
      tuned: probe.tuned === true,
      run,
      typed,
      fallback: reason,
      transport: isTransport(reason),
      grade: gradeCase(probe, typed)
    },
    answer: { model, id: probe.id, run, text: probe.text, raw: raw ?? saved?.raw ?? null, reason: raw === null ? reason : null }
  }
}

function readSaved(path: string): { settings: ProbeSettings; answers: RawAnswer[] } {
  const [head, ...rows] = readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Partial<ProbeSettings & RawAnswer>)
  // A replay must never reach the network, so a file that is not what
  // MURMUR_PROBE_OUT wrote stops here.
  const shaped =
    typeof head?.smartLists === 'boolean' &&
    typeof head.corrections === 'boolean' &&
    rows.every((row) => typeof row.text === 'string' && (typeof row.raw === 'string' || row.raw === null))
  if (!shaped) throw new Error(`${path} is not a file MURMUR_PROBE_OUT wrote`)
  return { settings: head as ProbeSettings, answers: rows as RawAnswer[] }
}

function replayJobs(answers: RawAnswer[]): { jobs: ProbeJob[]; stale: number } {
  const jobs: ProbeJob[] = []
  let stale = 0
  for (const saved of answers) {
    const probe = CASES.find((item) => item.id === saved.id)
    if (probe === undefined) {
      // Outside MURMUR_PROBE_KINDS is a filter, not staleness.
      if (!(cleanupCases.cases as CleanupCase[]).some((item) => item.id === saved.id)) stale += 1
    } else if (probe.text !== saved.text) {
      stale += 1
    } else {
      jobs.push({ model: saved.model, probe, run: saved.run, saved })
    }
  }
  return { jobs, stale }
}

// 8 cases is a small sample: at 16 runs the long-structure score still
// moved 7 points between reruns, at 48 it moved 1.3 (2026-11-06).
function runsFor(probe: CleanupCase): number {
  return probe.kind === 'long-structure' ? RUNS * LONG_RUNS_FACTOR : RUNS
}

// Whole passes over the set, not 1 case at a time: a case's runs landing
// seconds apart came back alike, and 1 case swung the long-structure
// score 13 points between reruns (2026-11-06).
function liveJobs(): ProbeJob[] {
  return MODELS.flatMap((model) =>
    Array.from({ length: RUNS * LONG_RUNS_FACTOR }, (_, run) =>
      CASES.filter((probe) => run < runsFor(probe)).map((probe) => ({ model, probe, run }))
    ).flat()
  )
}

async function measure(): Promise<{ outcomes: CleanupOutcome[]; settings: ProbeSettings; stale: number }> {
  const saved = REPLAY === '' ? null : readSaved(REPLAY)
  const settings = saved?.settings ?? {
    smartLists: process.env.MURMUR_PROBE_SMART_LISTS !== '0',
    corrections: process.env.MURMUR_PROBE_CORRECTIONS !== '0'
  }
  const { jobs, stale } = saved === null ? { jobs: liveJobs(), stale: 0 } : replayJobs(saved.answers)
  const recording = OUT !== '' && saved === null
  if (recording) writeFileSync(OUT, `${JSON.stringify(settings)}\n`)
  const outcomes: CleanupOutcome[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next]
      next += 1
      const { outcome, answer } = await runJob(job, settings)
      outcomes.push(outcome)
      if (recording) appendFileSync(OUT, `${JSON.stringify(answer)}\n`)
      if (saved === null && PACE_MS > 0) await sleep(PACE_MS)
    }
  }
  await Promise.all(Array.from({ length: saved === null ? CONCURRENCY : 1 }, worker))
  return { outcomes, settings, stale }
}

describe.skipIf(KEY === '' && REPLAY === '' && !CLAUDE_CLI)('cleanup scoreboard', () => {
  const limitMs = Math.max(600_000, CASES.length * RUNS * LONG_RUNS_FACTOR * MODELS.length * (10_000 + PACE_MS))
  it('measures every kind of case', { timeout: limitMs }, async () => {
    const { outcomes, settings, stale } = await measure()
    const mode = REPLAY === '' ? `${CLAUDE_CLI ? 'Claude Code' : BASE_URL}${ROUTE ? ` via ${ROUTE}` : ''}, ${RUNS} runs, ${RUNS * LONG_RUNS_FACTOR} for long-structure` : `replay of ${REPLAY}`
    console.log(
      [
        `${CASES.length} cases, ${mode}, smart lists ${settings.smartLists ? 'on' : 'off'}, corrections ${settings.corrections ? 'on' : 'off'}`,
        ...(stale > 0 ? [`${stale} saved answers skipped: their case changed or is gone`] : []),
        cleanupReport(outcomes)
      ].join('\n')
    )
    // A measuring tool: the numbers go in a story's notes, they do not fail a run.
    expect(outcomes.length).toBeGreaterThan(0)
  })
})
