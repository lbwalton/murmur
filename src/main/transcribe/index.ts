// SPDX-License-Identifier: GPL-3.0-only
// App-level transcription: reads settings and the key, calls the
// provider, saves recovery audio on failure. Smoke mode short-circuits
// with a canned transcript so no network or key is ever needed.
import { join } from 'node:path'
import { app } from 'electron'
import { getApiKey, getSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { type TranscribeResult, transcribe } from './provider'
import { saveRecovery } from './recovery'

export const SMOKE_TRANSCRIPT = 'smoke transcript from the mock provider'

export function recoveryDir(): string {
  return join(app.getPath('userData'), 'recovery')
}

/**
 * Transcribe a finished recording. On failure the WAV is saved for
 * recovery and the failure is returned, never thrown.
 */
export async function transcribeWav(wav: Uint8Array): Promise<TranscribeResult> {
  if (isSmoke) return { ok: true, text: SMOKE_TRANSCRIPT }

  const key = getApiKey()
  if (!key) {
    saveRecovery(wav, recoveryDir())
    return { ok: false, kind: 'auth', detail: 'no API key configured' }
  }

  const settings = getSettings()
  const result = await transcribe(wav, {
    baseUrl: settings.provider.baseUrl,
    model: settings.provider.sttModel,
    apiKey: key
  })
  if (!result.ok) saveRecovery(wav, recoveryDir())
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
}
