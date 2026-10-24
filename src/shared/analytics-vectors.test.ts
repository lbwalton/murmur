// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/analytics-vectors.json through the analytics, time back, and
// recap. MurmurCore runs the same file, so the iPhone's share card, numbers,
// Home's stroke, and recap say what desktop's would (ios/prd.json IOS-021,
// IOS-022).
import { describe, expect, it } from 'vitest'
import catalog from '../../shared/provider-catalog.json'
import vectors from '../../shared/analytics-vectors.json'
import { CARD_DAYS } from '../renderer/settings/cardPaint'
import { aggregate, dailyTotals, heatmap, typicalDayBack, typicalShare } from './analytics'
import { type ProviderCatalog, ratesFromCatalog } from './catalog'
import type { SessionEvent } from './history'
import { recapBody } from './recap'
import { clampTypingWpm, formatMinutesBack, formatMinutesBackWords, minutesBack, shownMinutes, typicalLine } from './timeback'

interface Take {
  day: string
  words: number
  durationMs?: number
}

/** Local noon on a day, as desktop's clock would read it that day. */
const noonOf = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

const event = (t: Take): SessionEvent => ({ at: noonOf(t.day), durationMs: t.durationMs ?? 1000, rawText: '', finalText: '', words: t.words, wpm: 0, day: t.day, hour: 12 })

const rates = (): ReturnType<typeof ratesFromCatalog> => ratesFromCatalog(catalog as unknown as ProviderCatalog)

describe('shared/analytics-vectors.json', () => {
  it("the share card's month is CARD_DAYS long", () => {
    expect((vectors as { cardDays?: number }).cardDays).toBe(CARD_DAYS)
  })

  for (const c of vectors.dailyTotals) {
    it(`daily totals: ${c.name}`, () => {
      expect(dailyTotals(c.takes.map(event), c.count, () => noonOf(c.today))).toEqual(c.expect)
    })
  }

  it('rates, from the bundled catalog', () => {
    expect(rates()).toEqual(vectors.rates)
  })

  it('time back and its words', () => {
    const t = vectors.timeBack
    for (const c of t.minutesBack) expect(minutesBack(c.words, c.durationMs, c.wpm)).toBe(c.minutesBack)
    for (const c of t.clamp) expect(clampTypingWpm(c.value)).toBe(c.clamped)
    for (const c of t.shown) expect(shownMinutes(c.raw)).toBe(c.shown)
    for (const c of t.format) {
      expect(formatMinutesBack(c.minutes)).toBe(c.short)
      expect(formatMinutesBackWords(c.minutes)).toBe(c.words)
    }
    for (const c of t.typicalLine) expect(typicalLine(c.share, c.typical)).toBe(c.line)
  })

  it('the typical day', () => {
    for (const c of vectors.typical.dayBack) expect(typicalDayBack(c.days)).toBe(c.typical)
    for (const c of vectors.typical.share) expect(typicalShare(c.today, c.typical)).toBe(c.share)
  })

  for (const c of vectors.aggregate) {
    it(`aggregate: ${c.name}`, () => {
      const options = { now: () => noonOf(c.today), sttModel: c.sttModel, llmModel: c.llmModel, typingWpm: c.typingWpm }
      expect(aggregate(c.takes.map(event), rates(), options)).toEqual(c.expect)
    })
  }

  for (const c of vectors.heatmap) {
    it(`heat map: ${c.name}`, () => {
      const data = heatmap(c.takes.map(event), { now: () => noonOf(c.today), year: c.year })
      expect({
        first: data.days[0]?.day ?? null,
        last: data.days[data.days.length - 1]?.day ?? null,
        count: data.days.length,
        busy: data.days.filter((d) => d.words > 0),
        totalWords: data.totalWords,
        years: data.years,
        period: data.period
      }).toEqual(c.expect)
    })
  }

  it('the recap', () => {
    for (const c of vectors.recap) expect(recapBody(c)).toBe(c.body)
  })
})
