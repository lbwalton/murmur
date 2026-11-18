#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// npm run site:downloads: prints the website's download counts (US-169)
// by day, by ref, and in all, each split into Mac and Windows. The
// counts live in the Workers KV namespace murmur-downloads; this reads
// its keys with wrangler under your own Cloudflare login, so it needs
// no key of its own.
//
//   npm run site:downloads                    every day so far
//   npm run site:downloads -- --since 2026-11-01
//   npm run site:downloads -- --json          the same, as JSON
//
// DOWNLOADS_NAMESPACE_ID skips looking the namespace up by its name.
const { execFileSync } = require('node:child_process')
const { TARGETS, summarize } = require('../site/download')

const NAMESPACE = 'murmur-downloads'

/** The JSON wrangler printed; any line before it is chatter. */
function parseWranglerJson(out) {
  const start = out.search(/^[[{]/m)
  if (start < 0) throw new Error(`site:downloads: wrangler printed no JSON:\n${out}`)
  return JSON.parse(out.slice(start))
}

/** --since and --json from the command line, or an error to print. */
function parseArgs(args) {
  const json = args.includes('--json')
  const at = args.indexOf('--since')
  const since = at >= 0 ? args[at + 1] || '' : ''
  if (at >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(since)) return { error: 'site:downloads: --since takes a day, like 2026-11-01' }
  return { json, since }
}

/** The counts as text tables: by day, by ref, and in all. */
function render({ days, refs, total }, since = '') {
  const platforms = [...Object.keys(TARGETS), 'total']
  const table = (title, rows) => {
    const width = Math.max(title.length, ...rows.map((r) => r.key.length))
    const line = (key, cells) => `${key.padEnd(width)}  ${cells.map((c) => String(c).padStart(7)).join('  ')}`
    return [line(title, platforms), ...rows.map((row) => line(row.key, platforms.map((p) => row[p])))].join('\n')
  }
  return [
    `murmurapp.app download clicks${since ? ` since ${since}` : ''} (days in UTC; our own browsers and bots are not counted)`,
    table('day', days),
    table('ref', refs),
    table('all', [{ key: 'all', ...total }])
  ].join('\n\n')
}

function wrangler(...rest) {
  const out = execFileSync('npx', ['--yes', 'wrangler', ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 256 * 1024 * 1024 })
  return parseWranglerJson(out)
}

function namespaceId() {
  if (process.env.DOWNLOADS_NAMESPACE_ID) return process.env.DOWNLOADS_NAMESPACE_ID
  const found = wrangler('kv', 'namespace', 'list').find((ns) => ns.title === NAMESPACE)
  if (!found) throw new Error(`site:downloads: no KV namespace named ${NAMESPACE} on this Cloudflare account (HANDOFF.md, US-169)`)
  return found.id
}

function main() {
  const { json, since, error } = parseArgs(process.argv.slice(2))
  if (error) {
    console.error(error)
    process.exit(1)
  }
  try {
    const keys = wrangler('kv', 'key', 'list', '--namespace-id', namespaceId(), '--remote').map((key) => key.name)
    const counts = summarize(keys, { since })
    console.log(json ? JSON.stringify({ since: since || null, ...counts }, null, 2) : render(counts, since))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}

if (require.main === module) main()

module.exports = { parseArgs, parseWranglerJson, render }
