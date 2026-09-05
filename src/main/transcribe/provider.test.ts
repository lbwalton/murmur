// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { type TranscribeConfig, transcribe } from './provider'

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
    const result = await transcribe(wav, cfg, { fetchImpl })
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
