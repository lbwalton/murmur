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

/** What a provider serves: speech, an OpenAI-compatible chat model, or
 *  a decision model (US-057) that answers typed questions and never
 *  writes text, so it fits the sort connection only. */
export type CatalogKind = 'stt' | 'llm' | 'decide'

export interface CatalogProvider {
  id: string
  name: string
  kinds: CatalogKind[]
  baseUrl: string
  /** Cleanup connections use this instead of baseUrl when present
   *  (the local preset: speech and cleanup run on different ports). */
  llmBaseUrl?: string
  keyUrl?: string
  /** The provider's own page of models, ids and prices (US-158). Opened
   *  from the Model list by provider id, so a window never names a URL. */
  modelsUrl?: string
  /** Runs on the user's machine at no cost; the cost preview says so
   *  instead of showing a rate. */
  free?: boolean
  verifiedOn: string
  sources: string[]
  nuances: string[]
  sttModels: CatalogSttModel[]
  llmModels: CatalogLlmModel[]
  /** Key formats unique to this provider (gsk_ is only ever Groq).
   *  Listed ONLY when unambiguous; ambiguous formats like a bare sk-
   *  stay unlisted so inference can never guess wrong. */
  keyPrefixes?: string[]
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
    if (!Array.isArray(p.kinds) || !p.kinds.every((k) => k === 'stt' || k === 'llm' || k === 'decide')) {
      return null
    }
    if (typeof p.verifiedOn !== 'string') return null
    if (!Array.isArray(p.nuances) || !p.nuances.every((n) => typeof n === 'string')) return null
    if (p.modelsUrl !== undefined && typeof p.modelsUrl !== 'string') return null
    if (p.keyPrefixes !== undefined) {
      if (!Array.isArray(p.keyPrefixes) || !p.keyPrefixes.every((k) => typeof k === 'string' && k.length > 0)) {
        return null
      }
    }
    if (!Array.isArray(p.sttModels) || !p.sttModels.every((m) => validModel(m, ['perHourUsd']))) return null
    if (!Array.isArray(p.llmModels) || !p.llmModels.every((m) => validModel(m, ['inputPerMTok', 'outputPerMTok']))) {
      return null
    }
  }
  return data as unknown as ProviderCatalog
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** A preset base URL a refreshed catalog may carry: https, or plain
 *  http only to this machine (local servers). */
function safePresetUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/** A page murmur may open in the browser: https only. */
export function httpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Why a catalog that arrived from outside the build (a refresh, or the
 * cached copy of one) must not replace the bundled one, or null when it
 * may (US-072). A refresh exists to move rates. It never moves where a
 * shipped preset sends keys, audio, or text (its base URL or its
 * cleanup URL), never drops a shipped preset or lets another wear its
 * name, never names a cleartext remote host, and never claims a future
 * or malformed verified-on date, which would outrank every later fix.
 * today is a YYYY-MM-DD date; one day of slack covers time zones ahead
 * of this machine.
 */
export function catalogRefusal(candidate: ProviderCatalog, bundled: ProviderCatalog, today: string): string | null {
  const latest = new Date(`${today}T00:00:00Z`)
  latest.setUTCDate(latest.getUTCDate() + 1)
  const latestDay = latest.toISOString().slice(0, 10)
  const badDay = (day: string): boolean => !DAY.test(day) || day > latestDay
  if (badDay(candidate.verifiedOn)) return 'verifiedOn malformed or in the future'
  const ids = new Set(candidate.providers.map((p) => p.id))
  const names = new Set(candidate.providers.map((p) => p.name.trim().toLowerCase()))
  if (ids.size !== candidate.providers.length || names.size !== candidate.providers.length) {
    return 'two presets share an id or a name'
  }
  for (const shipped of bundled.providers) {
    if (!ids.has(shipped.id)) return `${shipped.id} missing`
  }
  for (const provider of candidate.providers) {
    if (badDay(provider.verifiedOn)) return `${provider.id} verifiedOn malformed or in the future`
    if (!safePresetUrl(provider.baseUrl)) return `${provider.id} base URL is not https`
    const llm = provider.llmBaseUrl
    if (llm !== undefined && (typeof llm !== 'string' || !safePresetUrl(llm))) {
      return `${provider.id} cleanup URL is not https`
    }
    if (provider.modelsUrl !== undefined && !httpsUrl(provider.modelsUrl)) return `${provider.id} models page is not https`
    const shipped = bundled.providers.find((p) => p.id === provider.id)
    if (shipped && shipped.baseUrl !== provider.baseUrl) return `${provider.id} base URL changed`
    if (shipped && shipped.modelsUrl !== provider.modelsUrl) return `${provider.id} models page changed`
    if (shipped && shipped.llmBaseUrl !== llm) return `${provider.id} cleanup URL changed`
  }
  return null
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

/**
 * The provider a key's masked display betrays, when exactly one
 * provider's registered prefix fits the visible start of the mask.
 * Ambiguity returns null: this exists to catch a gsk_ key sitting
 * under an OpenAI label, never to guess.
 */
export function providerForKeyMask(catalog: ProviderCatalog, masked: string): CatalogProvider | null {
  // Only the head before the ellipsis is real key material, and a
  // prefix must fit ENTIRELY inside it to count: matching a truncated
  // prefix misattributed ~1.5 percent of legacy OpenAI keys to a
  // provider whose prefix merely began the same way (review gate
  // proof, 2026-09-16). Better no inference than a wrong one.
  const head = masked.split('…')[0]
  if (head.length === 0) return null
  const matches = catalog.providers.filter((p) =>
    (p.keyPrefixes ?? []).some((prefix) => prefix.length <= head.length && head.startsWith(prefix))
  )
  return matches.length === 1 ? matches[0] : null
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

/**
 * Whether a provider's model list (the body of GET /models) names a
 * model (US-154). OpenAI-compatible lists put { id } entries under
 * data; a few use models or a bare array. null when the body is not a
 * list this can read, so Test never claims a model is missing on a
 * guess.
 */
export function modelListed(body: string, model: string): boolean | null {
  const read = readModelList(body)
  if (!read) return null
  const { parsed, list } = read
  const ids = list
    .map((entry) => (typeof entry === 'string' ? entry : isRecord(entry) ? (entry.id ?? entry.name) : null))
    .filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return null
  const wanted = model.trim()
  // Ollama lists llama3.2:latest and takes llama3.2 for it.
  const names = wanted.includes(':') ? [wanted] : [wanted, `${wanted}:latest`]
  const aliases = list.flatMap((entry) =>
    isRecord(entry) && Array.isArray(entry.aliases) ? entry.aliases.filter((a): a is string => typeof a === 'string') : []
  )
  if ([...ids, ...aliases].some((id) => names.includes(id))) return true
  // The same id in another case may or may not work, depending on the
  // host, and a list with more pages may hold it on a later one: in
  // both cases this cannot say.
  const lower = wanted.toLowerCase()
  if (ids.some((id) => id.toLowerCase() === lower)) return null
  if (isRecord(parsed) && parsed.has_more === true) return null
  return false
}

/** A /models body as JSON and its list of entries, or null when it is
 *  not a list this can read: most providers use data, a few use models
 *  or a bare array. */
function readModelList(body: string): { parsed: unknown; list: unknown[] } | null {
  if (body.length > 16_000_000) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (Array.isArray(parsed)) return { parsed, list: parsed }
  if (isRecord(parsed) && Array.isArray(parsed.data)) return { parsed, list: parsed.data }
  if (isRecord(parsed) && Array.isArray(parsed.models)) return { parsed, list: parsed.models }
  return null
}

/** What a model list request answers (US-158): the ids, or why not. */
export type ModelListResult = { ok: true; ids: string[] } | { ok: false; detail: string }

// Models that turn speech into text, text into speech or pictures, text
// into numbers, or that only grade safety: none can tidy a dictation.
const NOT_FOR_CLEANUP = /whisper|transcri|tts|text-to-speech|embed|moderation|dall-e|gpt-image|imagen|audio|realtime|llama-guard|prompt-guard/i

const modalities = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((m): m is string => typeof m === 'string') : null

/**
 * The ids in a /models body that can write text for cleanup, A to Z
 * (US-158), or null when the body is not a list. A list that says what
 * a model takes and gives (OpenRouter's architecture) is believed; a
 * model the provider marks inactive (Groq) is left out; and ids that
 * name speech, image, embedding or moderation models are left out on
 * every list.
 */
export function chatModelIds(body: string): string[] | null {
  const read = readModelList(body)
  if (!read) return null
  const ids = new Set<string>()
  for (const entry of read.list) {
    const id = typeof entry === 'string' ? entry : isRecord(entry) ? (entry.id ?? entry.name) : null
    if (typeof id !== 'string' || id.trim() === '' || id.length > 200 || NOT_FOR_CLEANUP.test(id)) continue
    if (isRecord(entry)) {
      if (entry.active === false) continue
      const arch = isRecord(entry.architecture) ? entry.architecture : null
      const output = modalities(arch?.output_modalities)
      const input = modalities(arch?.input_modalities)
      if (output && !output.includes('text')) continue
      if (input && !input.includes('text')) continue
    }
    ids.add(id.trim())
  }
  // A to Z by name: OpenRouter's ~latest aliases sort beside their model.
  const key = (id: string): string => id.replace(/^[^a-z0-9]+/i, '')
  return [...ids].sort((a, b) => key(a).localeCompare(key(b), 'en', { sensitivity: 'base' }) || a.localeCompare(b))
}
