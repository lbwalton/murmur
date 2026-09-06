// SPDX-License-Identifier: GPL-3.0-only
// The belt progression engine. Pure and deterministic: feed it the
// session log and the ladder, get back the current rank, dual-gate
// progress toward the next, and a dated promotion history. Both gates
// (lifetime words AND distinct active days) must hold, so time on the
// mat cannot be faked with one loud weekend. The 10th degree is the
// Founder belt: granted only by the founder flag, never by usage.
import { type SessionEvent, eventDay } from './history'

export interface RankSpec {
  id: string
  belt: string
  stripes: number
  label: string
  title: string
  words: number | null
  activeDays: number | null
  founderOnly?: boolean
}

export interface RanksFile {
  ranks: RankSpec[]
}

export interface GateProgress {
  have: number
  need: number
  /** 0..1, clamped. 1 when the gate is satisfied. */
  pct: number
}

export interface Promotion {
  id: string
  at: number
}

export interface ProgressReport {
  rank: RankSpec
  /** Index into the ladder. */
  index: number
  /** Null at the top of the earnable ladder (or for the founder). */
  next: RankSpec | null
  words: GateProgress | null
  activeDays: GateProgress | null
  totals: { words: number; activeDays: number }
  promotions: Promotion[]
  founder: boolean
}

function earnable(rank: RankSpec): boolean {
  return !rank.founderOnly && rank.words !== null && rank.activeDays !== null
}

/** Highest rank whose BOTH gates are satisfied by the given totals. */
function rankFor(ladder: RankSpec[], words: number, activeDays: number): number {
  let index = 0
  for (let i = 0; i < ladder.length; i++) {
    const rank = ladder[i]
    if (!earnable(rank)) continue
    if (words >= (rank.words as number) && activeDays >= (rank.activeDays as number)) index = i
  }
  return index
}

/**
 * Compute the full progression report from the session log.
 * Promotions are dated by walking events chronologically and recording
 * the moment each rank's second gate closed.
 */
export function computeProgress(
  events: readonly SessionEvent[],
  spec: RanksFile,
  options: { founder?: boolean } = {}
): ProgressReport {
  const ladder = spec.ranks
  const sorted = [...events].sort((a, b) => a.at - b.at)

  let words = 0
  const daysSeen = new Set<string>()
  const promotions: Promotion[] = []
  let reachedIndex = 0

  for (const event of sorted) {
    words += event.words
    daysSeen.add(eventDay(event))
    const nowIndex = rankFor(ladder, words, daysSeen.size)
    while (reachedIndex < nowIndex) {
      reachedIndex += 1
      const rank = ladder[reachedIndex]
      if (earnable(rank)) promotions.push({ id: rank.id, at: event.at })
    }
  }

  const totals = { words, activeDays: daysSeen.size }

  if (options.founder) {
    const founderRank = ladder.find((r) => r.founderOnly) ?? ladder[ladder.length - 1]
    return {
      rank: founderRank,
      index: ladder.indexOf(founderRank),
      next: null,
      words: null,
      activeDays: null,
      totals,
      promotions,
      founder: true
    }
  }

  const index = rankFor(ladder, totals.words, totals.activeDays)
  const rank = ladder[index]
  const next = ladder.slice(index + 1).find(earnable) ?? null

  const gate = (have: number, need: number | null): GateProgress | null => {
    if (need === null) return null
    return { have, need, pct: need === 0 ? 1 : Math.min(1, have / need) }
  }

  return {
    rank,
    index,
    next,
    words: next ? gate(totals.words, next.words) : null,
    activeDays: next ? gate(totals.activeDays, next.activeDays) : null,
    totals,
    promotions,
    founder: false
  }
}
