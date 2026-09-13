// SPDX-License-Identifier: GPL-3.0-only
// The provider catalog at runtime. The bundled copy always works; a
// refreshed copy fetched from the murmur repo can replace it only after
// passing the same structural validation, and never moves backwards in
// verified-on date. Nothing in the dictation path waits on any of this:
// a refresh failure costs a log line and the rates stay as shipped.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import bundledJson from '../../shared/provider-catalog.json'
import { type ProviderCatalog, costPer1kWords, validateCatalog } from '../shared/catalog'
import { getSettings } from './settings'
import { isSmoke, registerSmokeCheck } from './smoke'

// A read-only file fetch against the same GitHub host the updater
// already talks to. No user data rides along: no query, no headers
// beyond fetch defaults.
const CATALOG_URL = 'https://raw.githubusercontent.com/lbwalton/murmur/main/shared/provider-catalog.json'
const MAX_CATALOG_BYTES = 512 * 1024
const FETCH_TIMEOUT_MS = 15_000

let current: ProviderCatalog | null = null

function cachedPath(): string {
  return join(app.getPath('userData'), 'provider-catalog.json')
}

function loadInitial(): ProviderCatalog {
  const bundled = validateCatalog(bundledJson)
  if (!bundled) throw new Error('bundled provider catalog failed validation')
  try {
    const cached = validateCatalog(JSON.parse(readFileSync(cachedPath(), 'utf8')))
    // A cached refresh wins only while it is at least as fresh as what
    // this build shipped with; ISO dates compare correctly as strings.
    if (cached && cached.verifiedOn >= bundled.verifiedOn) return cached
  } catch {
    // No cache yet, or an unreadable one: the bundled copy stands.
  }
  return bundled
}

async function refresh(): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(CATALOG_URL, { signal: controller.signal })
    if (!response.ok) return
    const body = await response.text()
    if (body.length > MAX_CATALOG_BYTES) return
    const fetched = validateCatalog(JSON.parse(body))
    if (!fetched || !current || fetched.verifiedOn < current.verifiedOn) return
    writeFileSync(cachedPath(), body)
    current = fetched
  } catch (error) {
    console.error('[murmur] provider catalog refresh failed:', error)
  } finally {
    clearTimeout(timer)
  }
}

/** The catalog other main-process code reads. */
export function getCatalog(): ProviderCatalog {
  if (!current) current = loadInitial()
  return current
}

export function initCatalog(): void {
  current = loadInitial()
  ipcMain.handle('catalog:get', () => current)

  // One refresh per launch, honoring the setting; smoke never fetches.
  if (!isSmoke && getSettings().catalogRefresh) void refresh()

  registerSmokeCheck('catalog', () => {
    const bundled = validateCatalog(bundledJson)
    if (!bundled) return false
    const groq = bundled.providers.find((p) => p.id === 'groq')
    if (!groq) return false
    const parts = costPer1kWords(groq.sttModels[0], groq.llmModels[0], bundled.estimate, 0)
    return current !== null && parts !== null && parts[0].amount > 0 && parts[0].amount < 1
  })
}
