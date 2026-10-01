// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import bundled from '../../shared/provider-catalog.json'
import {
  type ProviderCatalog,
  catalogRefusal,
  costPer1kWords,
  providerForBaseUrl,
  providerForKeyMask,
  ratesFromCatalog,
  validateCatalog
} from './catalog'

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

describe('validateCatalog with a decision provider', () => {
  const catalog = validateCatalog(bundled)!

  it('accepts the decide kind and still rejects a kind it does not know', () => {
    const provider = catalog.providers.find((p) => p.id === 'typesafe')
    expect(provider?.kinds).toEqual(['decide'])
    expect(provider?.llmModels[0]).toMatchObject({ id: 'jev-latest', inputPerMTok: 0.042, outputPerMTok: 0 })
    // A refreshed copy (the shape the app fetches) accepts it too.
    expect(validateCatalog(JSON.parse(JSON.stringify(bundled)))?.providers.some((p) => p.id === 'typesafe')).toBe(true)
    const broken = JSON.parse(JSON.stringify(bundled)) as { providers: Array<{ kinds: string[] }> }
    broken.providers[0].kinds = ['decide', 'oracle']
    expect(validateCatalog(broken)).toBeNull()
  })

  it('prices the decision model on input alone through the existing rates', () => {
    const rates = ratesFromCatalog(catalog)
    expect(rates.llm.models['jev-latest']).toEqual({ inputPerMTokUsd: 0.042, outputPerMTokUsd: 0 })
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

describe('providerForKeyMask', () => {
  const catalog = validateCatalog(bundled)!

  it('recognizes a prefix only when it fits entirely inside the visible head', () => {
    expect(providerForKeyMask(catalog, 'gsk_…OC9g')?.id).toBe('groq')
  })

  it('never guesses on truncated, ambiguous, or unknown formats', () => {
    // A legacy OpenAI key can legitimately start sk-o; a prefix longer
    // than the visible head must never count as a hit.
    expect(providerForKeyMask(catalog, 'sk-o…abcd')).toBeNull()
    expect(providerForKeyMask(catalog, 'sk-p…abcd')).toBeNull()
    expect(providerForKeyMask(catalog, '••••')).toBeNull()
    expect(providerForKeyMask(catalog, '')).toBeNull()
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

describe('catalogRefusal', () => {
  const shipped = validateCatalog(bundled) as ProviderCatalog
  const today = '2026-10-01'
  const edited = (edit: (c: ProviderCatalog) => void): ProviderCatalog => {
    const copy = structuredClone(shipped)
    edit(copy)
    return copy
  }

  it('accepts the bundled catalog and a refresh that only moves rates and dates', () => {
    expect(catalogRefusal(shipped, shipped, today)).toBeNull()
    const refreshed = edited((c) => {
      c.verifiedOn = today
      c.providers[0].verifiedOn = today
      c.providers[0].sttModels[0].perHourUsd = 0.05
    })
    expect(catalogRefusal(refreshed, shipped, today)).toBeNull()
  })

  it('refuses a refresh that moves where a shipped preset sends keys', () => {
    const moved = edited((c) => {
      c.providers[0].baseUrl = 'https://api.groq.com.evil.example/openai/v1'
    })
    expect(catalogRefusal(moved, shipped, today)).toBe('groq base URL changed')
  })

  it('refuses a cleartext remote preset but allows a local server', () => {
    const added = (baseUrl: string): ProviderCatalog =>
      edited((c) => {
        c.providers.push({ ...structuredClone(c.providers[0]), id: 'newcomer', name: 'Newcomer', baseUrl })
      })
    expect(catalogRefusal(added('http://api.newcomer.example/v1'), shipped, today)).toBe(
      'newcomer base URL is not https'
    )
    expect(catalogRefusal(added('not a url'), shipped, today)).toBe('newcomer base URL is not https')
    expect(catalogRefusal(added('https://api.newcomer.example/v1'), shipped, today)).toBeNull()
    expect(catalogRefusal(added('http://localhost:1234/v1'), shipped, today)).toBeNull()
    expect(catalogRefusal(added('http://127.0.0.1:1234/v1'), shipped, today)).toBeNull()
    expect(catalogRefusal(added('http://[::1]:1234/v1'), shipped, today)).toBeNull()
  })

  it('refuses a future or malformed verified-on date, which would outrank every later fix', () => {
    expect(catalogRefusal(edited((c) => (c.verifiedOn = '9999-12-31')), shipped, today)).toBe(
      'verifiedOn malformed or in the future'
    )
    expect(catalogRefusal(edited((c) => (c.verifiedOn = '2026-10-01z')), shipped, today)).toBe(
      'verifiedOn malformed or in the future'
    )
    expect(catalogRefusal(edited((c) => (c.providers[1].verifiedOn = '2026-10-05')), shipped, today)).toBe(
      `${shipped.providers[1].id} verifiedOn malformed or in the future`
    )
  })

  it('refuses a refresh that moves or adds a cleanup URL on a shipped preset', () => {
    const local = shipped.providers.find((p) => p.llmBaseUrl !== undefined) as ProviderCatalog['providers'][number]
    const moved = edited((c) => {
      const p = c.providers.find((x) => x.id === local.id)
      if (p) p.llmBaseUrl = 'https://evil.example/v1'
    })
    expect(catalogRefusal(moved, shipped, today)).toBe(`${local.id} cleanup URL changed`)
    const added = edited((c) => {
      c.providers[0].llmBaseUrl = 'https://evil.example/v1'
    })
    expect(catalogRefusal(added, shipped, today)).toBe(`${shipped.providers[0].id} cleanup URL changed`)
    const cleartext = edited((c) => {
      c.providers.push({ ...structuredClone(c.providers[0]), id: 'newcomer', name: 'Newcomer', llmBaseUrl: 'http://evil.example/v1' })
    })
    expect(catalogRefusal(cleartext, shipped, today)).toBe('newcomer cleanup URL is not https')
  })

  it('refuses a refresh that drops a shipped preset or lets another wear its name', () => {
    expect(catalogRefusal(edited((c) => c.providers.shift()), shipped, today)).toBe(`${shipped.providers[0].id} missing`)
    const impostor = edited((c) => {
      c.providers.push({ ...structuredClone(c.providers[0]), id: 'groq2', baseUrl: 'https://evil.example/v1' })
    })
    expect(catalogRefusal(impostor, shipped, today)).toBe('two presets share an id or a name')
  })

  it('allows one day ahead for time zones east of this machine', () => {
    expect(catalogRefusal(edited((c) => (c.verifiedOn = '2026-10-02')), shipped, today)).toBeNull()
    expect(catalogRefusal(edited((c) => (c.verifiedOn = '2026-10-03')), shipped, today)).not.toBeNull()
  })
})
