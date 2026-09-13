// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import bundled from '../../shared/provider-catalog.json'
import { costPer1kWords, providerForBaseUrl, ratesFromCatalog, validateCatalog } from './catalog'

describe('validateCatalog', () => {
  it('accepts the bundled catalog', () => {
    expect(validateCatalog(bundled)).not.toBeNull()
  })

  it('rejects garbage, wrong versions, and broken shapes', () => {
    expect(validateCatalog(null)).toBeNull()
    expect(validateCatalog('catalog')).toBeNull()
    expect(validateCatalog({ ...bundled, catalogVersion: 2 })).toBeNull()
    expect(validateCatalog({ ...bundled, providers: [] })).toBeNull()
    expect(validateCatalog({ ...bundled, estimate: { tokensPerWord: 0 } })).toBeNull()
    const badModel = structuredClone(bundled) as Record<string, unknown>
    ;(badModel.providers as Array<{ sttModels: unknown[] }>)[0].sttModels.push({
      id: 'x',
      perHourUsd: 'free'
    })
    expect(validateCatalog(badModel)).toBeNull()
  })
})

describe('ratesFromCatalog', () => {
  const rates = ratesFromCatalog(validateCatalog(bundled)!)

  it('carries the groq rates the old rates file held', () => {
    expect(rates.stt.models['whisper-large-v3-turbo']).toBe(0.04)
    expect(rates.stt.models['whisper-large-v3']).toBe(0.111)
    expect(rates.stt.minimumBillableSeconds).toBe(10)
    expect(rates.llm.models['openai/gpt-oss-120b']).toEqual({
      inputPerMTokUsd: 0.15,
      outputPerMTokUsd: 0.6
    })
  })

  it('excludes non-USD models so analytics stays a USD figure', () => {
    expect(rates.llm.models['mistral-small-latest']).toBeUndefined()
  })
})

describe('costPer1kWords', () => {
  const catalog = validateCatalog(bundled)!
  const groq = catalog.providers.find((p) => p.id === 'groq')!

  it('prices a groq speech and cleanup pairing at the user pace', () => {
    const parts = costPer1kWords(groq.sttModels[0], groq.llmModels[0], catalog.estimate, 100)!
    expect(parts).toHaveLength(1)
    expect(parts[0].currency).toBe('USD')
    // 10 minutes of audio at $0.04/hour, plus 1350 content tokens out,
    // 1350 + 1800 overhead tokens in, at $0.15/$0.60 per million.
    const stt = (10 / 60) * 0.04
    const llm = (3150 / 1_000_000) * 0.15 + (1350 / 1_000_000) * 0.6
    expect(parts[0].amount).toBeCloseTo(stt + llm, 6)
  })

  it('splits currencies when the cleanup model is priced in euros', () => {
    const mistral = catalog.providers.find((p) => p.id === 'mistral')!
    const parts = costPer1kWords(groq.sttModels[0], mistral.llmModels[0], catalog.estimate, 100)!
    const currencies = parts.map((p) => p.currency).sort()
    expect(currencies).toEqual(['EUR', 'USD'])
  })

  it('falls back to the catalog pace before history exists and nulls without rates', () => {
    const slow = costPer1kWords(groq.sttModels[0], null, catalog.estimate, 0)!
    const fast = costPer1kWords(groq.sttModels[0], null, catalog.estimate, 260)!
    expect(slow[0].amount).toBeGreaterThan(fast[0].amount)
    expect(costPer1kWords(null, null, catalog.estimate, 100)).toBeNull()
    expect(costPer1kWords({ id: 'unpriced' }, null, catalog.estimate, 100)).toBeNull()
  })
})

describe('providerForBaseUrl', () => {
  const catalog = validateCatalog(bundled)!

  it('matches presets with and without trailing slashes, including the local llm port', () => {
    expect(providerForBaseUrl(catalog, 'https://api.groq.com/openai/v1/')?.id).toBe('groq')
    expect(providerForBaseUrl(catalog, 'http://localhost:11434/v1')?.id).toBe('local')
    expect(providerForBaseUrl(catalog, 'https://example.com/v1')).toBeNull()
  })
})
