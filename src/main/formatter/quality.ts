// SPDX-License-Identifier: GPL-3.0-only
// The quality log (US-129): 1 line per take saying how cleanup went, in
// numbers, so misses can be counted without ever keeping a word of what
// was said. Everything here is a count, an on or off, a model name from
// settings, or a reason from the short list llm.ts falls back with.

export interface TakeQuality {
  level: string
  smartLists: boolean
  corrections: boolean
  model: string
  /** cleaned, skipped, or the fallback reason. */
  outcome: string
  wordsIn: number
  wordsOut: number
  cuesIn: number
  cuesOut: number
}

export interface QualitySummary {
  takes: number
  fallbacks: Record<string, number>
  hints: number
}

const SUMMARY_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// Each field has a closed shape, and anything outside it is logged as
// other, so a stray value can never carry words into the log. Keeping
// the characters and swapping the spaces would still hold the words.
const LEVELS = new Set(['off', 'light', 'full'])
const OUTCOME =
  /^(?:cleaned|skipped|timeout|network|hint echo|response missing text|http \d{3}|validate: (?:empty|meta chatter|refusal|preamble line|missing entries|kept first attempt|cut opening cue|cut parallel fact|length ratio|length delta|appended chatter))$/
// A model id: a word or 2 joined by these marks, with no spaces, and
// short, since an id is typed into settings and never said aloud.
const MODEL = /^[\w.:-]{1,48}(?:\/[\w.:-]{1,48}){0,4}$/

const level = (value: string): string => (LEVELS.has(value) ? value : 'other')
const outcome = (value: string): string => (OUTCOME.test(value) ? value.replace(/ /g, '_') : 'other')
const model = (value: string): string => (MODEL.test(value) ? value : 'other')

export function qualityLine(take: TakeQuality): string {
  // A cue word that survives is a hint, not a verdict: real ones should stay.
  const hint = take.cuesOut > 0 ? 1 : 0
  return (
    `[quality] level=${level(take.level)} lists=${take.smartLists ? 'on' : 'off'} ` +
    `corrections=${take.corrections ? 'on' : 'off'} model=${model(take.model)} outcome=${outcome(take.outcome)} ` +
    `wordsIn=${take.wordsIn} wordsOut=${take.wordsOut} cuesIn=${take.cuesIn} cuesOut=${take.cuesOut} hint=${hint}`
  )
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
}

const LINE = /^(\S+) \[quality\] .*\boutcome=(\S+) .*\bhint=(\d)/

/** Reads the [quality] lines of the last 30 days out of the log text. */
export function summarizeQuality(log: string, now: Date): QualitySummary {
  const summary: QualitySummary = { takes: 0, fallbacks: {}, hints: 0 }
  const cutoff = now.getTime() - SUMMARY_DAYS * DAY_MS
  for (const line of log.split('\n')) {
    const match = LINE.exec(line)
    if (match === null || !(Date.parse(match[1]) >= cutoff)) continue
    summary.takes += 1
    if (match[3] === '1') summary.hints += 1
    const outcome = match[2]
    if (outcome !== 'cleaned' && outcome !== 'skipped') {
      summary.fallbacks[outcome] = (summary.fallbacks[outcome] ?? 0) + 1
    }
  }
  return summary
}

const percent = (part: number, whole: number): string => `${whole === 0 ? 0 : Math.round((part / whole) * 100)}%`

/** The lines for the diagnostics report. */
export function qualityReport(summary: QualitySummary): string[] {
  const fallbacks = Object.entries(summary.fallbacks)
  const total = fallbacks.reduce((sum, [, count]) => sum + count, 0)
  return [
    `quality, last ${SUMMARY_DAYS} days or as far as the log reaches:`,
    `  takes: ${summary.takes}`,
    `  fell back: ${total} (${percent(total, summary.takes)})`,
    ...fallbacks.map(([reason, count]) => `    ${reason}: ${count}`),
    `  cue word hints: ${summary.hints} (${percent(summary.hints, summary.takes)})`
  ]
}
