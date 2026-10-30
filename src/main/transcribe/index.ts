// SPDX-License-Identifier: GPL-3.0-only
// App-level transcription: reads settings and the key, calls the
// provider, saves recovery audio on failure. Smoke mode short-circuits
// with a canned transcript so no network or key is ever needed.
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { app } from 'electron'
import { getApiKey, getSettings } from '../settings'
import { appFetch } from '../net'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { type TranscribeResult, transcribe, uploadTimeoutMs } from './provider'
import { type TakeKind, type TakeRecord, saveRecovery } from './recovery'

export const SMOKE_TRANSCRIPT = 'smoke transcript from the mock provider'

export function recoveryDir(): string {
  return join(app.getPath('userData'), 'recovery')
}

/** Called after a failed take is saved, so the home tab's waiting list
 *  can refresh (set by the retry subsystem; a hook, not an import, to
 *  keep this module free of cycles). */
let onRecoverySaved: () => void = () => undefined
export function setRecoveryListener(listener: () => void): void {
  onRecoverySaved = listener
}

/** Keep a take's audio on the home tab's waiting list, with what it
 *  was and why it waits, and tell the list. Returns the WAV's path.
 *  Throws when the folder cannot be written; callers decide. */
export function saveTakeForRetry(wav: Uint8Array, take: TakeRecord): string {
  const file = saveRecovery(wav, recoveryDir(), { take })
  onRecoverySaved()
  return file
}

/**
 * Transcribe a finished recording. On failure a live take's WAV is
 * saved for recovery with what it was and why it failed (US-068), and
 * the failure is returned, never thrown, with saved saying whether the
 * audio made it onto the waiting list. A retry passes recover: false:
 * its audio is already saved.
 */
export async function transcribeWav(
  wav: Uint8Array,
  recover: { kind: TakeKind; startedAt: number } | false
): Promise<TranscribeResult & { saved?: boolean }> {
  if (isSmoke) return { ok: true, text: SMOKE_TRANSCRIPT }

  const save = (failure: { kind: string; detail: string }): boolean => {
    if (recover === false) return false
    try {
      saveTakeForRetry(wav, { ...recover, failure })
      return true
    } catch (error) {
      console.error('[murmur] recovery save failed:', error)
      return false
    }
  }

  const key = getApiKey()
  if (!key) {
    const failure = { kind: 'auth' as const, detail: 'no API key configured' }
    return { ok: false, ...failure, saved: save(failure) }
  }

  const settings = getSettings()
  // A long take needs longer to upload: live takes and retries alike.
  const result = await transcribe(
    wav,
    { baseUrl: settings.provider.baseUrl, model: settings.provider.sttModel, apiKey: key },
    { timeoutMs: uploadTimeoutMs(wav.byteLength) }
  )
  if (!result.ok) return { ...result, saved: save({ kind: result.kind, detail: result.detail }) }
  return result
}

export function initTranscribe(): void {
  registerSmokeCheck('provider', async () => {
    // Exercise the real HTTP client against an in-process mock fetch:
    // success, retry-once-on-5xx, and no-retry-on-auth all hold.
    const wav = new Uint8Array([1])
    const cfg = { baseUrl: 'https://mock.local/v1', model: 'm', apiKey: 'k' }

    const okResult = await transcribe(wav, cfg, {
      fetchImpl: (async () => new Response(JSON.stringify({ text: 'ok' }), { status: 200 })) as typeof fetch
    })

    let flakyCalls = 0
    const flakyResult = await transcribe(wav, cfg, {
      fetchImpl: (async () => {
        flakyCalls += 1
        return flakyCalls === 1
          ? new Response('{}', { status: 500 })
          : new Response(JSON.stringify({ text: 'recovered' }), { status: 200 })
      }) as typeof fetch
    })

    let authCalls = 0
    const authResult = await transcribe(wav, cfg, {
      fetchImpl: (async () => {
        authCalls += 1
        return new Response('{}', { status: 401 })
      }) as typeof fetch
    })

    return (
      okResult.ok &&
      okResult.text === 'ok' &&
      flakyResult.ok &&
      flakyCalls === 2 &&
      !authResult.ok &&
      authResult.kind === 'auth' &&
      authCalls === 1
    )
  })

  registerSmokeCheck('chromiumNet', async () => {
    // The real request path (US-109): transcribe with its default fetch
    // against a server on 127.0.0.1, so the request rides Chromium's
    // network stack exactly as a live dictation does. Loopback only.
    const seen: { agent: string; auth: string; multipart: boolean; cookie: string | undefined }[] = []
    let modelLists = 0
    const handle = (req: IncomingMessage, res: ServerResponse): void => {
      if (req.url?.startsWith('/stall')) return
      if (req.url?.endsWith('/models')) {
        // Cacheable on purpose: a second ask must still reach the server.
        modelLists += 1
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=600' })
        res.end('{"data":[]}')
        return
      }
      let body = ''
      req.setEncoding('latin1')
      req.on('data', (chunk: string) => (body += chunk))
      req.on('end', () => {
        seen.push({
          agent: req.headers['user-agent'] ?? '',
          auth: req.headers.authorization ?? '',
          multipart: /name="file"; filename="audio\.wav"/.test(body) && /name="model"\r\n\r\nm\r\n/.test(body),
          cookie: req.headers.cookie
        })
        res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'smoke=1; Path=/' })
        res.end(JSON.stringify({ text: 'via chromium' }))
      })
    }
    const listen = async (): Promise<ReturnType<typeof createServer>> => {
      const server = createServer(handle)
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      return server
    }
    const portOf = (server: ReturnType<typeof createServer>): number => (server.address() as AddressInfo).port

    // The live server first, so the closed port can never be handed to it.
    const server = await listen()
    const closed = await listen()
    const closedPort = portOf(closed)
    await new Promise<void>((resolve) => closed.close(() => resolve()))
    try {
      const cfg = { baseUrl: `http://127.0.0.1:${portOf(server)}/v1`, model: 'm', apiKey: 'k' }
      const wav = new Uint8Array([1, 2, 3])
      const first = await transcribe(wav, cfg)
      const second = await transcribe(wav, cfg)
      const stalled = await transcribe(
        wav,
        { ...cfg, baseUrl: `http://127.0.0.1:${portOf(server)}/stall` },
        { timeoutMs: 300, retries: 0 }
      )
      const refused = await transcribe(wav, { ...cfg, baseUrl: `http://127.0.0.1:${closedPort}/v1` }, { retries: 0 })
      for (let i = 0; i < 2; i++) await (await appFetch(`${cfg.baseUrl}/models`)).text()
      const conditions = {
        transcribed: first.ok && first.text === 'via chromium' && second.ok,
        chromiumAgent: seen.length === 2 && seen.every((s) => / Chrome\/\d/.test(s.agent)),
        keySent: seen.every((s) => s.auth === 'Bearer k'),
        multipartAudio: seen.every((s) => s.multipart),
        noCookies: seen.every((s) => s.cookie === undefined),
        noCache: modelLists === 2,
        stallTimedOut: !stalled.ok && stalled.kind === 'timeout',
        refusedNamed: !refused.ok && refused.kind === 'network' && refused.detail.includes('ERR_CONNECTION_REFUSED')
      }
      const failed = Object.entries(conditions)
        .filter(([, ok]) => !ok)
        .map(([name]) => name)
      if (failed.length > 0) {
        const detail = (r: TranscribeResult): string => (r.ok ? 'ok' : `${r.kind}:${r.detail}`)
        console.error(
          `smoke chromiumNet: failed=${failed.join(',')} agent=${seen[0]?.agent ?? 'none'} stalled=${detail(stalled)} refused=${detail(refused)}`
        )
      }
      return failed.length === 0
    } finally {
      server.closeAllConnections()
      server.close()
    }
  })
}
