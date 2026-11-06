// SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MIN_UPLOAD_TIMEOUT_MS,
  type TranscribeConfig,
  clearFormatMemo,
  transcribe,
  uploadTimeoutMs
} from './provider'

const cfg: TranscribeConfig = {
  baseUrl: 'https://api.example.com/v1/',
  model: 'whisper-test',
  apiKey: 'test-key'
}

const wav = new Uint8Array([1, 2, 3])

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('transcribe', () => {
  it('posts multipart to the audio endpoint and returns text', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      captured = { url: String(url), init: init! }
      return jsonResponse(200, { text: 'hello world' })
    }) as typeof fetch

    const result = await transcribe(wav, cfg, { fetchImpl })
    expect(result).toEqual({ ok: true, text: 'hello world' })
    expect(captured!.url).toBe('https://api.example.com/v1/audio/transcriptions')
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    const form = captured!.init.body as FormData
    expect(form.get('model')).toBe('whisper-test')
    expect(form.get('file')).toBeInstanceOf(Blob)
  })

  it('classifies auth errors and does not retry them', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return jsonResponse(401, {})
    }) as typeof fetch
    const result = await transcribe(wav, cfg, { fetchImpl })
    expect(result).toMatchObject({ ok: false, kind: 'auth' })
    expect(calls).toBe(1)
  })

  it('classifies bad requests without retry', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return jsonResponse(422, {})
    }) as typeof fetch
    // A plain-json model: a whisper model would get one format fallback.
    const result = await transcribe(wav, { ...cfg, model: 'gpt-transcribe' }, { fetchImpl })
    expect(result).toMatchObject({ ok: false, kind: 'badrequest' })
    expect(calls).toBe(1)
  })

  it('retries a 5xx once and can succeed on the retry', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return calls === 1 ? jsonResponse(500, {}) : jsonResponse(200, { text: 'second try' })
    }) as typeof fetch
    const result = await transcribe(wav, cfg, { fetchImpl })
    expect(result).toEqual({ ok: true, text: 'second try' })
    expect(calls).toBe(2)
  })

  it('retries a network error once then reports it', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      throw new Error('socket hang up')
    }) as typeof fetch
    const result = await transcribe(wav, cfg, { fetchImpl })
    expect(result).toMatchObject({ ok: false, kind: 'network', detail: 'socket hang up' })
    expect(calls).toBe(2)
  })

  it('times out through the abort signal', async () => {
    const fetchImpl = ((_url: unknown, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    }) as typeof fetch
    const result = await transcribe(wav, cfg, { fetchImpl, timeoutMs: 20, retries: 0 })
    expect(result).toMatchObject({ ok: false, kind: 'timeout' })
  })

  it('treats a missing text field as a server error', async () => {
    const fetchImpl = (async () => jsonResponse(200, { nope: true })) as typeof fetch
    const result = await transcribe(wav, cfg, { fetchImpl, retries: 0 })
    expect(result).toMatchObject({ ok: false, kind: 'server', detail: 'response missing text' })
  })
})

describe('uploadTimeoutMs', () => {
  // 16 kHz 16-bit mono is 32,000 bytes a second, behind a 44 byte header.
  const wavOf = (seconds: number): number => 44 + seconds * 32_000

  it('gives a short take the 30 second floor', () => {
    expect(MIN_UPLOAD_TIMEOUT_MS).toBe(30_000)
    expect(uploadTimeoutMs(0)).toBe(30_000)
    expect(uploadTimeoutMs(wavOf(10))).toBe(30_000)
    // The floor holds until 15 seconds plus the upload at 1 Mbps passes it.
    expect(uploadTimeoutMs(1_875_000)).toBe(30_000)
    expect(uploadTimeoutMs(1_875_125)).toBe(30_001)
  })

  it('gives a 12 minute take about 199 seconds', () => {
    // About 23 MB: 15 seconds for the answer plus 184 seconds of upload at 1 Mbps.
    expect(Math.round(uploadTimeoutMs(wavOf(720)))).toBe(199_320)
    expect(uploadTimeoutMs(23_000_000)).toBe(199_000)
  })

  it('grows with the payload', () => {
    expect(uploadTimeoutMs(wavOf(300))).toBeGreaterThan(uploadTimeoutMs(wavOf(120)))
    expect(uploadTimeoutMs(wavOf(720))).toBeGreaterThan(uploadTimeoutMs(wavOf(300)))
  })
})

describe('silence scores (US-119)', () => {
  beforeEach(() => clearFormatMemo())

  const formatOf = (init?: RequestInit): string => String((init?.body as FormData).get('response_format'))
  const segment = (text: string, no_speech_prob?: number, avg_logprob?: number) => ({
    text,
    no_speech_prob,
    avg_logprob
  })

  it.each([
    ['whisper-large-v3-turbo', 'verbose_json'],
    ['WHISPER-1', 'verbose_json'],
    ['gpt-transcribe', 'json'],
    ['voxtral-mini-latest', 'json']
  ])('asks %s for %s', async (model, expected) => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      seen.push(formatOf(init))
      return jsonResponse(200, { text: 'x' })
    }) as typeof fetch
    await transcribe(wav, { ...cfg, model }, { fetchImpl })
    expect(seen).toEqual([expected])
  })

  it('drops the silent segment and reports stats', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, {
        text: ' real invented',
        segments: [segment(' real', 0.1, -0.3), segment(' invented', 0.9, -1.4)]
      })) as typeof fetch
    const result = await transcribe(wav, cfg, { fetchImpl })
    expect(result).toEqual({
      ok: true,
      text: 'real',
      silence: { segments: 2, dropped: 1, noSpeech: 0.9, logprob: -1.4 }
    })
  })

  it('leaves the text untouched when nothing drops, leading space included', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, { text: ' hello world', segments: [segment(' hello', 0.1, -0.3), segment(' world', 0.1, -0.2)] })) as typeof fetch
    const result = await transcribe(wav, cfg, { fetchImpl })
    expect(result).toMatchObject({ ok: true, text: ' hello world' })
  })

  it('returns an empty text when every segment is silent', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, { text: 'x', segments: [segment('x', 0.99, -2)] })) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl })).toMatchObject({ ok: true, text: '' })
  })

  it('falls back to the response text without usable segments', async () => {
    for (const body of [{ text: 'plain' }, { text: 'plain', segments: [] }, { text: 'plain', segments: [1, null, 'x'] }]) {
      const fetchImpl = (async () => jsonResponse(200, body)) as typeof fetch
      expect(await transcribe(wav, cfg, { fetchImpl })).toEqual({ ok: true, text: 'plain' })
    }
  })

  it('still needs a string text in a verbose response', async () => {
    const fetchImpl = (async () => jsonResponse(200, { segments: [segment('x', 0.1, -0.1)] })) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl, retries: 0 })).toMatchObject({ ok: false, kind: 'server' })
  })

  it('asks again for json after a 4xx on verbose_json, and remembers it', async () => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      const format = formatOf(init)
      seen.push(format)
      return format === 'verbose_json' ? jsonResponse(400, {}) : jsonResponse(200, { text: 'plain' })
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl })).toEqual({ ok: true, text: 'plain' })
    expect(await transcribe(wav, cfg, { fetchImpl })).toEqual({ ok: true, text: 'plain' })
    expect(seen).toEqual(['verbose_json', 'json', 'json'])
  })

  it('does not remember when json fails too', async () => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      seen.push(formatOf(init))
      return jsonResponse(400, {})
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl })).toMatchObject({ ok: false, kind: 'badrequest' })
    await transcribe(wav, cfg, { fetchImpl })
    expect(seen).toEqual(['verbose_json', 'json', 'verbose_json', 'json'])
  })

  it('has no format fallback for a 401', async () => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      seen.push(formatOf(init))
      return jsonResponse(401, {})
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl })).toMatchObject({ ok: false, kind: 'auth' })
    expect(seen).toEqual(['verbose_json'])
  })

  it('retries a 5xx as verbose_json', async () => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      seen.push(formatOf(init))
      return seen.length === 1 ? jsonResponse(500, {}) : jsonResponse(200, { text: 'ok' })
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl })).toMatchObject({ ok: true })
    expect(seen).toEqual(['verbose_json', 'verbose_json'])
  })

  it('falls back without using up a retry', async () => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      const format = formatOf(init)
      seen.push(format)
      return format === 'verbose_json' ? jsonResponse(400, {}) : jsonResponse(200, { text: 'plain' })
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl, retries: 0 })).toEqual({ ok: true, text: 'plain' })
  })

  it.each([415, 422])('treats a %i as a refused format', async (status) => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      const format = formatOf(init)
      seen.push(format)
      return format === 'verbose_json' ? jsonResponse(status, {}) : jsonResponse(200, { text: 'plain' })
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl })).toMatchObject({ ok: true })
    expect(seen).toEqual(['verbose_json', 'json'])
  })

  it.each([429, 413, 408, 498])('a %i on verbose_json is one call and no memo', async (status) => {
    const seen: string[] = []
    const failing = (async (_u: unknown, init?: RequestInit) => {
      seen.push(formatOf(init))
      return jsonResponse(status, {})
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl: failing })).toMatchObject({ ok: false, kind: 'badrequest' })
    expect(seen).toEqual(['verbose_json'])
    const next: string[] = []
    const ok = (async (_u: unknown, init?: RequestInit) => {
      next.push(formatOf(init))
      return jsonResponse(200, { text: 'x' })
    }) as typeof fetch
    await transcribe(wav, cfg, { fetchImpl: ok })
    expect(next).toEqual(['verbose_json'])
  })

  it('has no format fallback for a 403', async () => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      seen.push(formatOf(init))
      return jsonResponse(403, {})
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl })).toMatchObject({ ok: false, kind: 'auth' })
    expect(seen).toEqual(['verbose_json'])
  })

  it('stays on json for the rest of the call after the fallback fires', async () => {
    const seen: string[] = []
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      const format = formatOf(init)
      seen.push(format)
      if (format === 'verbose_json') return jsonResponse(400, {})
      return seen.length === 2 ? jsonResponse(500, {}) : jsonResponse(200, { text: 'ok' })
    }) as typeof fetch
    expect(await transcribe(wav, cfg, { fetchImpl })).toMatchObject({ ok: true })
    expect(seen).toEqual(['verbose_json', 'json', 'json'])
  })

  it('keys the memo by normalized base URL and model', async () => {
    const fallback = (async (_u: unknown, init?: RequestInit) =>
      formatOf(init) === 'verbose_json' ? jsonResponse(400, {}) : jsonResponse(200, { text: 'p' })) as typeof fetch
    await transcribe(wav, cfg, { fetchImpl: fallback })
    const seen: string[] = []
    const watch = (async (_u: unknown, init?: RequestInit) => {
      seen.push(formatOf(init))
      return jsonResponse(200, { text: 'x' })
    }) as typeof fetch
    await transcribe(wav, { ...cfg, baseUrl: 'https://api.example.com/v1' }, { fetchImpl: watch })
    await transcribe(wav, { ...cfg, model: 'whisper-other' }, { fetchImpl: watch })
    expect(seen).toEqual(['json', 'verbose_json'])
  })

  it('reports a non-JSON answer without quoting its body', async () => {
    const fetchImpl = (async () => new Response('send the invoice tomorrow', { status: 200 })) as typeof fetch
    const result = await transcribe(wav, cfg, { fetchImpl, retries: 0 })
    expect(result).toEqual({ ok: false, kind: 'server', detail: 'response not json' })
    expect(JSON.stringify(result)).not.toContain('invoice')
  })
})
