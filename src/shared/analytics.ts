// SPDX-License-Identifier: GPL-3.0-only
// Aggregations over the session log: totals, the monthly usage card,
// the daily series, and the live cost estimate. Pure functions; rates
// come from shared/rates.json and costs are estimates at today's rates.
import { type SessionEvent, dayKey, eventDay } from './history'

export interface RatesSpec {
  stt: {
    minimumBillableSeconds: number
    models: Record<string, number>
    fallbackPerHourUsd: number
  }
  llm: {
    promptOverheadTokens: number
    tokensPerWord: number
    models: Record<string, { inputPerMTokUsd: number; outputPerMTokUsd: number }>
    fallback: { inputPerMTokUsd: number; outputPerMTokUsd: number }
  }
}

export interface UsageTotals {
  sessions: number
  words: number
  minutes: number
  estCostUsd: number
  /** Words per spoken minute across the whole span. */
  avgWpm: number
}

export interface DayUsage {
  day: string
  sessions: number
  words: number
  minutes: number
}

export interface AnalyticsSummary {
  lifetime: UsageTotals
  month: UsageTotals
  today: UsageTotals
  /** Most recent days first is NOT used: chronological, oldest first. */
  days: DayUsage[]
}

/** Estimated cost of one session in USD at current rates. */
export function sessionCostUsd(
  event: Pick<SessionEvent, 'durationMs' | 'words'>,
  rates: RatesSpec,
  sttModel: string,
  llmModel: string
): number {
  const billableSeconds = Math.max(event.durationMs / 1000, rates.stt.minimumBillableSeconds)
  const sttPerHour = rates.stt.models[sttModel] ?? rates.stt.fallbackPerHourUsd
  const sttCost = (billableSeconds / 3600) * sttPerHour

  const llmRates = rates.llm.models[llmModel] ?? rates.llm.fallback
  const contentTokens = event.words * rates.llm.tokensPerWord
  const inputTokens = contentTokens + rates.llm.promptOverheadTokens
  const outputTokens = contentTokens
  const llmCost =
    (inputTokens / 1_000_000) * llmRates.inputPerMTokUsd +
    (outputTokens / 1_000_000) * llmRates.outputPerMTokUsd

  return sttCost + llmCost
}

function emptyTotals(): UsageTotals {
  return { sessions: 0, words: 0, minutes: 0, estCostUsd: 0, avgWpm: 0 }
}

function add(totals: UsageTotals, event: SessionEvent, cost: number): void {
  totals.sessions += 1
  totals.words += event.words
  totals.minutes += event.durationMs / 60_000
  totals.estCostUsd += cost
}

function round(totals: UsageTotals): UsageTotals {
  return {
    sessions: totals.sessions,
    words: totals.words,
    minutes: Math.round(totals.minutes * 10) / 10,
    estCostUsd: Math.round(totals.estCostUsd * 10_000) / 10_000,
    avgWpm: totals.minutes > 0 ? Math.round(totals.words / totals.minutes) : 0
  }
}

/** Aggregate the log. dayCount controls the chart series length. */
export function aggregate(
  events: readonly SessionEvent[],
  rates: RatesSpec,
  options: {
    now?: () => number
    sttModel?: string
    llmModel?: string
    dayCount?: number
  } = {}
): AnalyticsSummary {
  const { now = () => Date.now(), sttModel = '', llmModel = '', dayCount = 14 } = options
  const nowDate = new Date(now())
  const todayKey = dayKey(now())
  const monthPrefix = todayKey.slice(0, 7)

  const lifetime = emptyTotals()
  const month = emptyTotals()
  const today = emptyTotals()

  // Chronological day buckets ending today, zero-filled.
  const days: DayUsage[] = []
  const dayIndex = new Map<string, DayUsage>()
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - i)
    const key = dayKey(d.getTime())
    const usage: DayUsage = { day: key, sessions: 0, words: 0, minutes: 0 }
    days.push(usage)
    dayIndex.set(key, usage)
  }

  for (const event of events) {
    const cost = sessionCostUsd(event, rates, sttModel, llmModel)
    add(lifetime, event, cost)
    const key = eventDay(event)
    if (key.startsWith(monthPrefix)) add(month, event, cost)
    if (key === todayKey) add(today, event, cost)
    const bucket = dayIndex.get(key)
    if (bucket) {
      bucket.sessions += 1
      bucket.words += event.words
      // Raw accumulation; rounding happens once after the loop so
      // per-event rounding error can never compound.
      bucket.minutes += event.durationMs / 60_000
    }
  }
  for (const bucket of days) bucket.minutes = Math.round(bucket.minutes * 10) / 10

  return { lifetime: round(lifetime), month: round(month), today: round(today), days }
}

export interface HeatDay {
  day: string
  words: number
}

export interface HeatmapData {
  /** Chronological, zero-filled days covering the whole period. */
  days: HeatDay[]
  /** Words dictated inside the period. */
  totalWords: number
  /** Calendar years holding at least one session, oldest first. */
  years: number[]
  /** What was rendered: the rolling last year, or one calendar year. */
  period: 'last-year' | number
}

/**
 * The activity-wall series. With no year, the rolling last 365 days
 * ending today; with a year, that calendar year (clipped at today for
 * the current one). Day attribution uses the stored local day on each
 * event, so past sessions never re-bucket when the timezone changes.
 */
export function heatmap(
  events: readonly SessionEvent[],
  options: { now?: () => number; year?: number | null } = {}
): HeatmapData {
  const { now = () => Date.now(), year = null } = options
  const nowDate = new Date(now())
  const todayKey = dayKey(now())

  const wordsByDay = new Map<string, number>()
  const yearSet = new Set<number>()
  for (const event of events) {
    const key = eventDay(event)
    wordsByDay.set(key, (wordsByDay.get(key) ?? 0) + event.words)
    yearSet.add(Number(key.slice(0, 4)))
  }

  let start: Date
  let end: Date
  if (year !== null) {
    start = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31)
    const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate())
    end = yearEnd.getTime() < today.getTime() ? yearEnd : today
  } else {
    end = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate())
    start = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 364)
  }

  const days: HeatDay[] = []
  let totalWords = 0
  for (let d = start; d.getTime() <= end.getTime(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const key = dayKey(d.getTime())
    const words = wordsByDay.get(key) ?? 0
    days.push({ day: key, words })
    totalWords += words
  }
  // A brand-new profile still gets the current year as a destination.
  if (yearSet.size === 0) yearSet.add(Number(todayKey.slice(0, 4)))

  return {
    days,
    totalWords,
    years: [...yearSet].sort((a, b) => a - b),
    period: year ?? 'last-year'
  }
}
