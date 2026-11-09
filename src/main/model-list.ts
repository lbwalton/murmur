// SPDX-License-Identifier: GPL-3.0-only
// Every model a provider offers, for the Model list (US-158). The list
// comes from the provider itself (its /models), so it is never ours to
// keep current: only the catalog's few suggestions are. The window names
// a connection slot, never a URL, and the key stays here: main reads the
// slot's base URL from settings, sends the saved key if there is one
// (OpenRouter answers without one), and keeps the answer for a day.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'
import { type ModelListResult, chatModelIds, httpsUrl } from '../shared/catalog'
import { getCatalog } from './catalog'
import { ipc } from './ipc'
import { appFetch } from './net'
import { readCapped } from './read-capped'
import { getApiKey, getApiKeyFor, getPolishApiKey, getSettings } from './settings'
import { registerSmokeCheck } from './smoke'

export const MODEL_LIST_TTL_MS = 24 * 60 * 60 * 1000
const MAX_LIST_BYTES = 16_000_000
const TIMEOUT_MS = 10_000

/** The connections whose Model field lists models. */
export type ModelSlot = 'cleanup' | 'sort' | 'transform'

const strip = (u: string): string => u.replace(/\/$/, '')

const cache = new Map<string, { ids: string[]; at: number }>()

/** The base URL a slot calls, from settings, or '' when it has none. */
function slotUrl(slot: unknown): string {
  const s = getSettings()
  if (slot === 'cleanup') return s.polish.enabled ? s.polish.baseUrl : ''
  if (slot === 'sort') return s.notes.connection.enabled ? s.notes.connection.baseUrl : ''
  if (slot === 'transform') return s.transform.connection.enabled ? s.transform.connection.baseUrl : ''
  return ''
}

/** The key saved for a base URL, the way the call itself would find it. */
function keyFor(baseUrl: string): string | null {
  const s = getSettings()
  if (strip(baseUrl) === strip(s.polish.baseUrl)) return getPolishApiKey()
  if (strip(baseUrl) === strip(s.provider.baseUrl)) return getApiKey()
  return getApiKeyFor(baseUrl)
}

/**
 * The text models at a base URL, from the cache when it is less than a
 * day old. A failure is never cached, so saving a key and opening the
 * list again tries afresh.
 */
export async function listModels(baseUrl: string, key: string | null, now = Date.now()): Promise<ModelListResult> {
  const id = strip(baseUrl)
  if (id === '') return { ok: false, detail: 'no base URL set' }
  const hit = cache.get(id)
  if (hit && now - hit.at < MODEL_LIST_TTL_MS) return { ok: true, ids: hit.ids }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await appFetch(`${id}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: controller.signal
    })
    if (response.status === 401 || response.status === 403) {
      return { ok: false, detail: key ? `key rejected (http ${response.status})` : 'it needs a saved key first' }
    }
    if (!response.ok) return { ok: false, detail: `http ${response.status}` }
    if (Number(response.headers.get('content-length') ?? 0) > MAX_LIST_BYTES) return { ok: false, detail: 'the list is too big' }
    const body = await readCapped(response, MAX_LIST_BYTES)
    if (body === null) return { ok: false, detail: 'the list is too big' }
    const ids = chatModelIds(body)
    if (!ids) return { ok: false, detail: 'its answer is not a model list' }
    cache.set(id, { ids, at: now })
    return { ok: true, ids }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { ok: false, detail: 'timed out' }
    return { ok: false, detail: error instanceof Error ? `network error (${error.message})` : 'network error' }
  } finally {
    clearTimeout(timer)
  }
}

export function initModelList(): void {
  ipc.handle('provider:models', async (_event, slot: unknown) => {
    const baseUrl = slotUrl(slot)
    return listModels(baseUrl, baseUrl === '' ? null : keyFor(baseUrl))
  })
  // By provider id, so a window can only ever open a page the catalog
  // names, and only over https.
  ipc.handle('provider:openModelsPage', async (_event, providerId: unknown) => {
    const url = getCatalog().providers.find((p) => p.id === providerId)?.modelsUrl
    if (!url || !httpsUrl(url)) return false
    await shell.openExternal(url)
    return true
  })

  // A local list in OpenRouter's shape: text models only, A to Z, and
  // the second read inside a day never reaches the server.
  registerSmokeCheck('modelList', async () => {
    const auths: string[] = []
    const server = createServer((req, res) => {
      auths.push(String(req.headers.authorization ?? ''))
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          data: [
            { id: 'zeta/chat', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
            { id: 'alpha/chat', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
            { id: 'pics/painter', architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
            { id: 'whisper-large-v3' },
            { id: 'gone/model', active: false }
          ]
        })
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
      const first = await listModels(base, 'smoke-list-key')
      const second = await listModels(`${base}/`, 'smoke-list-key')
      const later = await listModels(base, null, Date.now() + MODEL_LIST_TTL_MS + 1)
      const expected = JSON.stringify(['alpha/chat', 'zeta/chat'])
      return (
        first.ok &&
        JSON.stringify(first.ids) === expected &&
        second.ok &&
        JSON.stringify(second.ids) === expected &&
        later.ok &&
        JSON.stringify(auths) === JSON.stringify(['Bearer smoke-list-key', ''])
      )
    } finally {
      cache.clear()
      server.close()
    }
  })
}
