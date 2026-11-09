#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// The IO half of the weekly model watch (US-158); the rules live in
// scripts/lib/model-watch.js.
//
//   node scripts/model-watch.js <report.md>
//
// Reads every chat provider's model list that needs no key, writes the
// report, and exits 1 when a suggested model is missing or retiring, 2
// when the script itself broke, 3 when no list could be read at all (an
// outage says nothing either way, so the open issue stays as it is), and
// 0 otherwise.
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { report, suggestionProblems } = require('./lib/model-watch')

const MAX_LIST_BYTES = 16_000_000
const TIMEOUT_MS = 20_000

async function main(out) {
  const catalog = JSON.parse(readFileSync(join(__dirname, '..', 'shared', 'provider-catalog.json'), 'utf8'))
  const problems = []
  const skipped = []
  let read = 0
  for (const provider of catalog.providers) {
    if (!provider.kinds.includes('llm') || (provider.llmModels ?? []).length === 0) continue
    const base = (provider.llmBaseUrl ?? provider.baseUrl).replace(/\/$/, '')
    if (!base.startsWith('https://')) continue
    try {
      const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (response.status === 401 || response.status === 403) {
        skipped.push(provider.name)
        continue
      }
      const body = await response.text()
      if (!response.ok || body.length > MAX_LIST_BYTES) {
        skipped.push(`${provider.name} (http ${response.status})`)
        continue
      }
      read++
      problems.push(...suggestionProblems(provider, body))
    } catch (error) {
      skipped.push(`${provider.name} (${error instanceof Error ? error.message : 'network error'})`)
    }
  }
  writeFileSync(out, report(problems, skipped, new Date().toISOString().slice(0, 10)))
  console.log(problems.length > 0 ? `${problems.length} suggested model(s) to update` : 'suggested models all listed')
  if (problems.length > 0) return 1
  return read === 0 ? 3 : 0
}

const out = process.argv[2]
if (!out) {
  console.error('usage: node scripts/model-watch.js <report.md>')
  process.exit(2)
}
main(out).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error)
    process.exit(2)
  }
)
