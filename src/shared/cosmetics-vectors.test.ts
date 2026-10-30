// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/cosmetics-vectors.json through the cosmetics: what fixed
// takes unlock and the color each accent resolves to. MurmurCore runs the
// same file, so the iPhone's Look unlocks what desktop's does (ios/prd.json
// IOS-020).
import { describe, expect, it } from 'vitest'
import achievements from '../../shared/achievements.json'
import cosmetics from '../../shared/cosmetics.json'
import ranks from '../../shared/ranks.json'
import vectors from '../../shared/cosmetics-vectors.json'
import { type AchievementsFile, evaluateAchievements } from './achievements'
import { type CosmeticsFile, computeCosmetics, resolveAccentColor } from './cosmetics'
import type { SessionEvent } from './history'
import { type RanksFile, computeProgress } from './ranks'

interface Take {
  at: number
  words: number
  durationMs: number
  day: string
  hour: number
}

const event = (t: Take): SessionEvent => ({ at: t.at, durationMs: t.durationMs, rawText: '', finalText: '', words: t.words, wpm: 0, day: t.day, hour: t.hour })

describe('shared/cosmetics-vectors.json', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const spec = cosmetics as unknown as CosmeticsFile
      const events = (c.takes as Take[]).map(event)
      const progress = computeProgress(events, ranks as unknown as RanksFile)
      const earned = evaluateAchievements(events, achievements as unknown as AchievementsFile)
      const report = computeCosmetics(spec, progress, earned)
      expect({
        rank: progress.rank.id,
        earned: earned.map((e) => e.id),
        styles: report.overlayStyles.filter((s) => s.unlocked).map((s) => s.id),
        accents: report.accents.filter((a) => a.unlocked).map((a) => a.id),
        beltColor: report.beltColor,
        colors: Object.fromEntries(Object.keys(c.expect.colors).map((id) => [id, resolveAccentColor(id, spec, progress, earned)]))
      }).toEqual(c.expect)
    })
  }
})
