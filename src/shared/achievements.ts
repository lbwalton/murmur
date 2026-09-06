// SPDX-License-Identifier: GPL-3.0-only
// The achievements engine. Pure and deterministic: earned badges and
// their timestamps derive entirely from the session log, so they can
// never drift, double-fire, or be lost. Notification dedupe is the
// caller's job; truth lives here.
import { type SessionEvent, eventDay } from './history'

export type AchievementCondition =
  | { type: 'firstSession' }
  | { type: 'streak'; days: number }
  | { type: 'dayWords'; words: number }
  | { type: 'lifetimeSessions'; count: number }
  | { type: 'marathon'; durationMs: number }
  | { type: 'timeOfDay'; fromHour: number; toHour: number }
  | { type: 'comeback'; quietDays: number }

export interface AchievementSpec {
  id: string
  name: string
  hint: string
  condition: AchievementCondition
}

export interface AchievementsFile {
  achievements: AchievementSpec[]
}

export interface EarnedAchievement {
  id: string
  at: number
}

function hourOf(event: SessionEvent): number {
  return typeof event.hour === 'number' ? event.hour : new Date(event.at).getHours()
}

function dayDistance(a: string, b: string): number {
  // Day keys are YYYY-MM-DD; UTC parse keeps the math timezone-free.
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

/** Evaluate every definition, returning first-earn timestamps. */
export function evaluateAchievements(
  events: readonly SessionEvent[],
  spec: AchievementsFile
): EarnedAchievement[] {
  const sorted = [...events].sort((a, b) => a.at - b.at)
  const earned = new Map<string, number>()
  const award = (id: string, at: number): void => {
    if (!earned.has(id)) earned.set(id, at)
  }

  let sessions = 0
  let streak = 0
  let prevDay: string | null = null
  const wordsByDay = new Map<string, number>()

  for (const event of sorted) {
    sessions += 1
    const day = eventDay(event)

    if (prevDay === null || dayDistance(prevDay, day) > 1) streak = 1
    else if (dayDistance(prevDay, day) === 1) streak += 1
    const gap = prevDay === null ? 0 : dayDistance(prevDay, day)

    wordsByDay.set(day, (wordsByDay.get(day) ?? 0) + event.words)
    const dayTotal = wordsByDay.get(day) ?? 0

    for (const def of spec.achievements) {
      const c = def.condition
      switch (c.type) {
        case 'firstSession':
          award(def.id, event.at)
          break
        case 'streak':
          if (streak >= c.days) award(def.id, event.at)
          break
        case 'dayWords':
          if (dayTotal >= c.words) award(def.id, event.at)
          break
        case 'lifetimeSessions':
          if (sessions >= c.count) award(def.id, event.at)
          break
        case 'marathon':
          if (event.durationMs >= c.durationMs) award(def.id, event.at)
          break
        case 'timeOfDay': {
          const hour = hourOf(event)
          if (hour >= c.fromHour && hour < c.toHour) award(def.id, event.at)
          break
        }
        case 'comeback':
          if (gap >= c.quietDays) award(def.id, event.at)
          break
      }
    }
    prevDay = day
  }

  return [...earned.entries()]
    .map(([id, at]) => ({ id, at }))
    .sort((a, b) => a.at - b.at)
}
