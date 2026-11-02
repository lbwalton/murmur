// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/achievement-vectors.json through the achievements. MurmurCore
// runs the same file, so a change to either side breaks both platforms or
// neither (ios/prd.json IOS-018).
import { describe, expect, it } from 'vitest'
import achievements from '../../shared/achievements.json'
import vectors from '../../shared/achievement-vectors.json'
import { type AchievementsFile, evaluateAchievements } from './achievements'
import type { SessionEvent } from './history'

interface Case {
  name: string
  events: { at: number; words: number; durationMs: number; day: string; hour: number }[]
  expect: { id: string; at: number }[]
}

describe('shared/achievement-vectors.json', () => {
  for (const c of vectors.cases as Case[]) {
    it(c.name, () => {
      const events: SessionEvent[] = c.events.map((e) => ({ at: e.at, durationMs: e.durationMs, rawText: '', finalText: '', words: e.words, wpm: 0, day: e.day, hour: e.hour }))
      expect(evaluateAchievements(events, achievements as unknown as AchievementsFile)).toEqual(c.expect)
    })
  }
})
