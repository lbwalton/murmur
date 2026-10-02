#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// The IO half of the pricing-watch workflow (US-072); the rules live in
// scripts/lib/pricing-watch.js.
//
//   node scripts/pricing-watch.js fetch <dir>
//       download every source page in the catalog into <dir> (as text
//       and as raw HTML), with <dir>/index.json listing what arrived. Runs before the
//       agent, so the agent itself needs no network.
//   node scripts/pricing-watch.js check <before.json> <after.json> <dir> <proposal.json>
//       reduce the agent's edited catalog to checked number and date
//       changes (plus any notes it left in <dir>/notes.json); fails on
//       any other edit.
//   node scripts/pricing-watch.js apply <proposal.json> <catalog.json> <body.md>
//       apply a proposal to the catalog and write the PR body; prints
//       changed=true or changed=false.
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { applyChanges, cleanNotes, htmlToText, prBody, rateChanges } = require('./lib/pricing-watch')

const MAX_PAGE_BYTES = 4 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000

const today = () => new Date().toISOString().slice(0, 10)
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

async function fetchSources(dir) {
  const catalog = readJson(join(__dirname, '..', 'shared', 'provider-catalog.json'))
  mkdirSync(dir, { recursive: true })
  const index = []
  for (const provider of catalog.providers) {
    for (const [n, url] of provider.sources.entries()) {
      const file = `${provider.id}-${n + 1}`
      let status = 'ok'
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' })
        const body = await response.text()
        if (!response.ok) status = `http ${response.status}`
        else if (body.length > MAX_PAGE_BYTES) status = 'too large'
        else {
          // Both forms: the text reads easily, and the raw page keeps
          // prices that only appear inside script data.
          writeFileSync(join(dir, `${file}.txt`), htmlToText(body))
          writeFileSync(join(dir, `${file}.html`), body)
        }
      } catch (error) {
        status = `failed ${error instanceof Error ? error.name : 'error'}`
      }
      index.push({ provider: provider.id, url, files: status === 'ok' ? [`${file}.txt`, `${file}.html`] : [], status })
      console.log(`${provider.id} ${url} ${status}`)
    }
  }
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
}

function check(beforeFile, afterFile, dir, out) {
  const before = readJson(beforeFile)
  let after
  try {
    after = readJson(afterFile)
  } catch {
    console.error('refused: the edited catalog is not valid JSON')
    process.exit(1)
  }
  const result = rateChanges(before, after, today())
  if (!result.ok) {
    console.error(`refused: ${result.reason}`)
    process.exit(1)
  }
  let notes = []
  const notesFile = join(dir, 'notes.json')
  if (existsSync(notesFile)) {
    try {
      notes = cleanNotes(before, readJson(notesFile))
    } catch {
      notes = []
    }
  }
  writeFileSync(out, `${JSON.stringify({ changes: result.changes, notes }, null, 2)}\n`)
  console.log(`${result.changes.length} change(s), ${notes.length} note(s)`)
}

function apply(proposalFile, catalogFile, bodyFile) {
  const proposal = readJson(proposalFile)
  const text = readFileSync(catalogFile, 'utf8')
  const before = JSON.parse(text)
  const changes = Array.isArray(proposal.changes) ? proposal.changes : []
  const notes = cleanNotes(before, proposal.notes)
  const rates = changes.filter((c) => Array.isArray(c?.path) && c.path[c.path.length - 1] !== 'verifiedOn')
  if (rates.length === 0) {
    console.log('changed=false')
    return
  }
  writeFileSync(catalogFile, applyChanges(text, changes, today()))
  writeFileSync(bodyFile, prBody(before, changes, notes))
  console.log('changed=true')
}

const [command, ...args] = process.argv.slice(2)
if (command === 'fetch' && args.length === 1) {
  fetchSources(args[0]).catch((error) => {
    console.error(error)
    process.exit(1)
  })
} else if (command === 'check' && args.length === 4) {
  check(...args)
} else if (command === 'apply' && args.length === 3) {
  apply(...args)
} else {
  console.error('usage: pricing-watch.js fetch <dir> | check <before> <after> <dir> <out> | apply <proposal> <catalog> <body>')
  process.exit(2)
}
