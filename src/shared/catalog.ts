// SPDX-License-Identifier: GPL-3.0-only
// The provider catalog: presets, rates, and billing nuances, loaded
// from shared/provider-catalog.json (bundled) or a refreshed copy the
// app fetched from the repo. Pure module, no IO: validation lives here
// because the refreshed copy crosses the network and must never be
// trusted structurally.
import type { RatesSpec } from './analytics'

export interface CatalogSttModel {
  id: string
  label?: string
  /** USD per hour of audio unless currency says otherwise. */
  perHourUsd?: number
  currency?: string
  minimumBillableSeconds?: number
}

export interface CatalogLlmModel {
  id: string
  label?: string
  inputPerMTok?: number
  outputPerMTok?: number
  /** ISO 4217; USD when absent. */
  currency?: string
}

export interface CatalogProvider {
  id: string
  name: string
  kinds: Array<'stt' | 'llm'>
  baseUrl: string
  /** Cleanup connections use this instead of baseUrl when present
   *  (the local preset: speech and cleanup run on different ports). */
  llmBaseUrl?: string
  keyUrl?: string
  /** Runs on the user's machine at no cost; the cost preview says so
   *  instead of showing a rate. */
  free?: boolean
  verifiedOn: string
  sources: string[]
  nuances: string[]
  sttModels: CatalogSttModel[]
  llmModels: CatalogLlmModel[]
}

export interface CatalogEstimate {
  tokensPerWord: number
  promptOverheadTokens: number
  sessionsPer1kWords: number
  fallbackWpm: number
}

export interface ProviderCatalog {
  catalogVersion: number
  verifiedOn: string
  estimate: CatalogEstimate
  providers: CatalogProvider[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isOptionalNumber(v: unknown): boolean {
  return v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
}

function validModel(v: unknown, rateKeys: string[]): boolean {
  if (!isRecord(v) || typeof v.id !== 'string' || v.id.length === 0) return false
  return rateKeys.every((k) => isOptionalNumber(v[k]))
}

/**
 * Structural gate for catalog data. The bundled file must pass it too
 * (smoke-checked), so bundled and fetched copies live under one rule:
 * anything that fails validates to null and the caller keeps what it
 * already had.
 */
export function validateCatalog(data: unknown): ProviderCatalog | null {
  if (!isRecord(data)) return null
  if (data.catalogVersion !== 1) return null
  if (typeof data.verifiedOn !== 'string') return null
  const est = data.estimate
  if (
    !isRecord(est) ||
    typeof est.tokensPerWord !== 'number' ||
    typeof est.promptOverheadTokens !== 'number' ||
    typeof est.sessionsPer1kWords !== 'number' ||
    typeof est.fallbackWpm !== 'number' ||
    est.tokensPerWord <= 0 ||
    est.fallbackWpm <= 0
  ) {
    return null
  }
  if (!Array.isArray(data.providers) || data.providers.length === 0) return null
  for (const p of data.providers) {
    if (!isRecord(p)) return null
    if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.baseUrl !== 'string') return null
    if (!Array.isArray(p.kinds) || !p.kinds.every((k) => k === 'stt' || k === 'llm')) return null
    if (typeof p.verifiedOn !== 'string') return null
    if (!Array.isArray(p.nuances) || !p.nuances.every((n) => typeof n === 'string')) return null
    if (!Array.isArray(p.sttModels) || !p.sttModels.every((m) => validModel(m, ['perHourUsd']))) return null
    if (!Array.isArray(p.llmModels) || !p.llmModels.every((m) => validModel(m, ['inputPerMTok', 'outputPerMTok']))) {
      return null
    }
  }
  return data as unknown as ProviderCatalog
}

/**
 * The analytics RatesSpec, derived from the catalog so pricing has one
 * source. USD models only: analytics totals are a USD figure, and a
 * model priced in another currency falls back like an unknown one.
 */
export function ratesFromCatalog(catalog: ProviderCatalog): RatesSpec {
  const stt: Record<string, number> = {}
  const llm: Record<string, { inputPerMTokUsd: number; outputPerMTokUsd: number }> = {}
  let minimumBillableSeconds = 0
  for (const provider of catalog.providers) {
    for (const m of provider.sttModels) {
      if (m.perHourUsd !== undefined && (m.currency ?? 'USD') === 'USD' && stt[m.id] === undefined) {
        stt[m.id] = m.perHourUsd
        minimumBillableSeconds = Math.max(minimumBillableSeconds, m.minimumBillableSeconds ?? 0)
      }
    }
    for (const m of provider.llmModels) {
      if (
        m.inputPerMTok !== undefined &&
        m.outputPerMTok !== undefined &&
        (m.currency ?? 'USD') === 'USD' &&
        llm[m.id] === undefined
      ) {
        llm[m.id] = { inputPerMTokUsd: m.inputPerMTok, outputPerMTokUsd: m.outputPerMTok }
      }
    }
  }
  return {
    stt: {
      minimumBillableSeconds,
      models: stt,
      fallbackPerHourUsd: stt['whisper-large-v3-turbo'] ?? 0.04
    },
    llm: {
      promptOverheadTokens: catalog.estimate.promptOverheadTokens,
      tokensPerWord: catalog.estimate.tokensPerWord,
      models: llm,
      fallback: llm['openai/gpt-oss-120b'] ?? { inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6 }
    }
  }
}

export interface CostPart {
  amount: number
  currency: string
}

/**
 * Estimated cost of dictating 1,000 words: audio time at the speech
 * model's hourly rate plus the cleanup pass token math, at the user's
 * own pace. Parts are grouped by currency (a Groq speech model next to
 * a euro-priced cleanup model yields two parts). Models without rates
 * contribute nothing; null means no priced model was given at all.
 */
export function costPer1kWords(
  stt: CatalogSttModel | null,
  llm: CatalogLlmModel | null,
  estimate: CatalogEstimate,
  avgWpm: number
): CostPart[] | null {
  const wpm = avgWpm > 0 ? avgWpm : estimate.fallbackWpm
  const byCurrency = new Map<string, number>()
  const add = (currency: string, amount: number): void => {
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount)
  }

  if (stt?.perHourUsd !== undefined) {
    const hours = 1000 / wpm / 60
    add(stt.currency ?? 'USD', hours * stt.perHourUsd)
  }
  if (llm && llm.inputPerMTok !== undefined && llm.outputPerMTok !== undefined) {
    const contentTokens = 1000 * estimate.tokensPerWord
    const inputTokens = contentTokens + estimate.promptOverheadTokens * estimate.sessionsPer1kWords
    const cost = (inputTokens / 1_000_000) * llm.inputPerMTok + (contentTokens / 1_000_000) * llm.outputPerMTok
    add(llm.currency ?? 'USD', cost)
  }

  if (byCurrency.size === 0) return null
  return [...byCurrency.entries()].map(([currency, amount]) => ({ amount, currency }))
}

/** The provider whose preset matches a base URL, if any. */
export function providerForBaseUrl(catalog: ProviderCatalog, baseUrl: string): CatalogProvider | null {
  const normalized = baseUrl.replace(/\/$/, '')
  return (
    catalog.providers.find(
      (p) => p.baseUrl.replace(/\/$/, '') === normalized || p.llmBaseUrl?.replace(/\/$/, '') === normalized
    ) ?? null
  )
}
