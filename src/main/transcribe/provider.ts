// SPDX-License-Identifier: GPL-3.0-only
// The transcription client: any OpenAI-compatible audio transcriptions
// endpoint, Groq by default. Injectable fetch for tests and smoke. One
// retry on transient failures, never on 4xx. Callers own the audio; this
// module never discards it.
//
// Whisper models are asked for verbose_json so each segment's own
// no-speech scores can drop invented words on a silent take (US-119).
// Other models get plain json. A 400, 415 or 422 on verbose_json (the
// server refusing the format) is retried once as json without using up a retry, and a json success
// is remembered for that base URL and model for the rest of the run.
import { type SilenceStats, type SpeechSegment, dropSilentSegments } from '../../shared/speech-gate'
import { appFetch } from '../net'

export interface TranscribeConfig {
  baseUrl: string
  model: string
  apiKey: string
}

export type TranscribeErrorKind = 'auth' | 'badrequest' | 'plainhttp' | 'server' | 'network' | 'timeout'

export type TranscribeResult =
  | { ok: true; text: string; silence?: SilenceStats }
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

type ResponseFormat = 'json' | 'verbose_json'

/** The statuses that mean a server refused the format itself. Rate
 *  limits and size limits (429, 413, 498) are not format answers. */
const FORMAT_REFUSED: readonly number[] = [400, 415, 422]

/** Base URL + model pairs whose server refused verbose_json (4xx) but
 *  took json. Lives for the run. */
const plainJsonOnly = new Set<string>()

function formatKey(cfg: TranscribeConfig): string {
  return `${cfg.baseUrl.replace(/\/$/, '')}|${cfg.model}`
}

/** Test hook: forget which servers refused verbose_json. */
export function clearFormatMemo(): void {
  plainJsonOnly.clear()
}

function wantedFormat(cfg: TranscribeConfig): ResponseFormat {
  if (!/whisper/i.test(cfg.model)) return 'json'
  return plainJsonOnly.has(formatKey(cfg)) ? 'json' : 'verbose_json'
}

async function attempt(
  wav: Uint8Array,
  cfg: TranscribeConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  format: ResponseFormat
): Promise<TranscribeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const form = new FormData()
    form.append('file', new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }), 'audio.wav')
    form.append('model', cfg.model)
    form.append('response_format', format)

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

    let body: { text?: unknown; segments?: unknown }
    try {
      body = (await response.json()) as { text?: unknown; segments?: unknown }
    } catch {
      // The parser's message quotes the start of the body, which could be
      // the transcript itself: never let it reach the log.
      return { ok: false, kind: 'server', detail: 'response not json' }
    }
    if (typeof body.text !== 'string') {
      return { ok: false, kind: 'server', detail: 'response missing text' }
    }
    if (format === 'verbose_json' && Array.isArray(body.segments)) {
      const segments = body.segments.filter(
        (entry): entry is SpeechSegment => typeof entry === 'object' && entry !== null
      )
      if (segments.length > 0) {
        const { text, stats } = dropSilentSegments(segments, body.text)
        return stats ? { ok: true, text, silence: stats } : { ok: true, text }
      }
    }
    return { ok: true, text: body.text }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, kind: 'timeout', detail: `no response in ${timeoutMs}ms` }
    }
    const detail = error instanceof Error ? error.message : 'fetch failed'
    // Not an outage, so trying again cannot help (US-140).
    if (/not confirmed|ERR_BLOCKED/.test(detail)) return { ok: false, kind: 'plainhttp', detail }
    return { ok: false, kind: 'network', detail }
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
  let format = wantedFormat(cfg)
  const once = async (): Promise<TranscribeResult> => {
    const first = await attempt(wav, cfg, fetchImpl, timeoutMs, format)
    if (first.ok || format !== 'verbose_json' || first.kind !== 'badrequest') return first
    if (!FORMAT_REFUSED.some((status) => first.detail === `http ${status}`)) return first
    // A server that refuses verbose_json: ask again for plain json, and
    // stay on json for the rest of this call, retries included.
    format = 'json'
    const plain = await attempt(wav, cfg, fetchImpl, timeoutMs, 'json')
    if (plain.ok) plainJsonOnly.add(formatKey(cfg))
    return plain
  }
  let result = await once()
  let remaining = retries
  while (!result.ok && RETRYABLE.includes(result.kind) && remaining > 0) {
    remaining -= 1
    result = await once()
  }
  return result
}
