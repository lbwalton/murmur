// SPDX-License-Identifier: GPL-3.0-only
// The transcription client: any OpenAI-compatible audio transcriptions
// endpoint, Groq by default. Injectable fetch for tests and smoke. One
// retry on transient failures, never on 4xx. Callers own the audio; this
// module never discards it.
import { appFetch } from '../net'

export interface TranscribeConfig {
  baseUrl: string
  model: string
  apiKey: string
}

export type TranscribeErrorKind = 'auth' | 'badrequest' | 'server' | 'network' | 'timeout'

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; kind: TranscribeErrorKind; detail: string }

/** The shortest wait for an upload's answer, whatever its size. */
export const MIN_UPLOAD_TIMEOUT_MS = 30_000

/**
 * How long one attempt may take to upload a WAV of this many bytes and
 * hear back: 15 seconds for the answer plus the upload at 1 Mbps (125
 * bytes a millisecond), never under 30 seconds. A 12 minute hands-free
 * take is about 23 MB, which a fixed 30 seconds cut off on an ordinary
 * home connection (US-117).
 */
export function uploadTimeoutMs(bytes: number): number {
  return Math.max(MIN_UPLOAD_TIMEOUT_MS, 15_000 + bytes / 125)
}

export interface TranscribeOptions {
  fetchImpl?: typeof fetch
  /** Per attempt. Defaults to MIN_UPLOAD_TIMEOUT_MS. */
  timeoutMs?: number
  /** Retries after the first attempt, for transient failures only. */
  retries?: number
}

async function attempt(
  wav: Uint8Array,
  cfg: TranscribeConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<TranscribeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const form = new FormData()
    form.append('file', new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }), 'audio.wav')
    form.append('model', cfg.model)
    form.append('response_format', 'json')

    const url = `${cfg.baseUrl.replace(/\/$/, '')}/audio/transcriptions`
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: controller.signal
    })

    if (response.status === 401 || response.status === 403) {
      return { ok: false, kind: 'auth', detail: `http ${response.status}` }
    }
    if (response.status >= 400 && response.status < 500) {
      return { ok: false, kind: 'badrequest', detail: `http ${response.status}` }
    }
    if (!response.ok) {
      return { ok: false, kind: 'server', detail: `http ${response.status}` }
    }

    const body = (await response.json()) as { text?: unknown }
    if (typeof body.text !== 'string') {
      return { ok: false, kind: 'server', detail: 'response missing text' }
    }
    return { ok: true, text: body.text }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout', detail: `no response in ${timeoutMs}ms` }
    }
    return { ok: false, kind: 'network', detail: error instanceof Error ? error.message : 'fetch failed' }
  } finally {
    clearTimeout(timer)
  }
}

const RETRYABLE: readonly TranscribeErrorKind[] = ['server', 'network', 'timeout']

export async function transcribe(
  wav: Uint8Array,
  cfg: TranscribeConfig,
  options: TranscribeOptions = {}
): Promise<TranscribeResult> {
  const { fetchImpl = appFetch, timeoutMs = MIN_UPLOAD_TIMEOUT_MS, retries = 1 } = options
  let result = await attempt(wav, cfg, fetchImpl, timeoutMs)
  let remaining = retries
  while (!result.ok && RETRYABLE.includes(result.kind) && remaining > 0) {
    remaining -= 1
    result = await attempt(wav, cfg, fetchImpl, timeoutMs)
  }
  return result
}
