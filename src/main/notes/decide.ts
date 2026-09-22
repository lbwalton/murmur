// SPDX-License-Identifier: GPL-3.0-only
// The decision-model sort path (US-057), main-process half: one POST to
// TypeSafe's System One endpoint carrying the note as state and typed
// questions, and a connection probe shaped the same way so a good key
// never reports as bad. Verified against docs.typesafe.ai 2026-09-21:
// POST {baseUrl}/systemone with a Bearer key; the documented errors are
// 401 (auth), 422 (malformed request), 429 (rate limit), and 529
// (overloaded). 403 is read as auth and 400 as malformed the way the
// chat probe reads them, on the same reasoning. Nothing here logs the
// note's text.
import type { DecisionRequest } from '../../shared/decide'

export interface DecisionConfig {
  baseUrl: string
  apiKey: string
}

export type DecisionReply =
  | { ok: true; answers: unknown; model: string }
  | { ok: false; reason: string }

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/systemone`
}

function reasonFor(status: number): string {
  if (status === 401 || status === 403) return `auth ${status}`
  if (status === 429) return 'rate limit'
  if (status === 529) return 'overloaded'
  return `http ${status}`
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Ask the decision model. Never throws; every failure is a reason the
 *  caller can log and fall back on. */
export async function askDecision(
  request: DecisionRequest,
  cfg: DecisionConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 12_000
): Promise<DecisionReply> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(endpoint(cfg.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal
    })
    if (!response.ok) return { ok: false, reason: reasonFor(response.status) }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { ok: false, reason: 'response not json' }
    }
    // A body that parses but is not an object (null, a list) is a
    // missing-answers reply, not a network fault.
    if (!isRecord(body) || !isRecord(body.answers)) return { ok: false, reason: 'response missing answers' }
    return { ok: true, answers: body.answers, model: typeof body.model === 'string' ? body.model : request.model }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, reason: aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** The connection test for a decision connection: the smallest real
 *  request the endpoint accepts. A chat-shaped probe would report a
 *  good TypeSafe key as bad, because there is no chat endpoint. */
export async function probeDecision(
  baseUrl: string,
  key: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; detail: string }> {
  if (!key) return { ok: false, detail: 'no key saved yet' }
  const reply = await askDecision(
    {
      model: 'jev-latest',
      state: ['murmur connection test'],
      questions: { ok: { type: 'noul', instructions: 'Is this text written in English?' } }
    },
    { baseUrl, apiKey: key },
    fetchImpl,
    10_000
  )
  if (reply.ok) return { ok: true, detail: 'connected' }
  // The real status matters: 403 can mean a blocked network or an
  // account state, not a wrong key (same rule as the chat probe).
  if (reply.reason.startsWith('auth ')) return { ok: false, detail: `key rejected (http ${reply.reason.slice(5)})` }
  // A rate limit only comes back to a key the endpoint accepted.
  if (reply.reason === 'rate limit') return { ok: true, detail: 'connected, rate limited right now' }
  if (reply.reason === 'overloaded') return { ok: false, detail: 'the service is overloaded; try again shortly' }
  if (reply.reason === 'timeout') return { ok: false, detail: 'timed out' }
  if (reply.reason === 'network') return { ok: false, detail: 'network error' }
  return { ok: false, detail: reply.reason }
}
