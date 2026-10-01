// SPDX-License-Identifier: GPL-3.0-only
// The fence around the weekly pricing agent (US-072). The agent reads
// vendor pages, which are untrusted text, so nothing it writes is
// trusted either: its edited catalog is reduced here to a list of
// number and date changes, each addressed by the ids of the catalog it
// started from, and every other byte must be unchanged. The job that
// holds a write token applies only that list and writes the PR body
// itself, so a prompt-injected page can at worst propose a wrong rate
// for a human to reject. Pure: the CLI in scripts/pricing-watch.js does
// the IO.

/** Model fields a refresh may move. Everything else is frozen. */
const RATE_KEYS = new Set(['perHourUsd', 'minimumBillableSeconds', 'inputPerMTok', 'outputPerMTok'])
const ISSUES = new Set(['renamed', 'retired', 'unreachable', 'ambiguous'])
const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_RATE = 10_000

function dayAfter(today) {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Readable name for a path, built from the starting catalog's ids. */
function label(before, path) {
  const parts = []
  let node = before
  for (const key of path) {
    const next = node[key]
    if (Array.isArray(node) && isRecord(next) && typeof next.id === 'string') parts.push(next.id)
    else parts.push(String(key))
    node = next
  }
  if (parts[0] === 'providers' && parts.length > 1) parts.shift()
  return parts.join('.')
}

/** Where a changed leaf may move, or null when it is frozen. */
function allowedChange(path, from, to, today) {
  const key = path[path.length - 1]
  const inModel = path.length === 5 && path[0] === 'providers' && (path[2] === 'sttModels' || path[2] === 'llmModels')
  if (inModel && RATE_KEYS.has(key) && typeof from === 'number') {
    if (typeof to !== 'number' || !Number.isFinite(to) || to < 0 || to > MAX_RATE) return 'rate is not a sane number'
    return null
  }
  const isDate = (path.length === 1 && key === 'verifiedOn') || (path.length === 3 && path[0] === 'providers' && key === 'verifiedOn')
  if (isDate && typeof from === 'string') {
    if (typeof to !== 'string' || !DAY.test(to) || Number.isNaN(Date.parse(`${to}T00:00:00Z`))) return 'date is not YYYY-MM-DD'
    if (to < from) return 'date moved backwards'
    if (to > dayAfter(today)) return 'date is in the future'
    return null
  }
  return 'frozen field changed'
}

/**
 * The changes from before to after, or the reason they are refused.
 * Structure, ids, labels, URLs, and order must match exactly; only rate
 * numbers and verified-on dates may differ.
 */
function rateChanges(before, after, today) {
  const changes = []
  function walk(a, b, path) {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${label(before, path)}: list changed`
      for (let i = 0; i < a.length; i++) {
        const reason = walk(a[i], b[i], [...path, i])
        if (reason) return reason
      }
      return null
    }
    if (isRecord(a) || isRecord(b)) {
      if (!isRecord(a) || !isRecord(b)) return `${label(before, path)}: shape changed`
      const keysA = Object.keys(a)
      const keysB = Object.keys(b)
      if (keysA.length !== keysB.length || keysA.some((k, i) => k !== keysB[i])) return `${label(before, path)}: keys changed`
      for (const key of keysA) {
        const reason = walk(a[key], b[key], [...path, key])
        if (reason) return reason
      }
      return null
    }
    if (Object.is(a, b)) return null
    const reason = allowedChange(path, a, b, today)
    if (reason) return `${label(before, path)}: ${reason}`
    changes.push({ path, from: a, to: b })
    return null
  }
  const reason = walk(before, after, [])
  return reason ? { ok: false, reason } : { ok: true, changes }
}

/** Notes the agent may leave, kept only when they name a provider and
 *  model the catalog already has and an issue from the fixed list. */
function cleanNotes(before, notes) {
  if (!Array.isArray(notes)) return []
  const kept = []
  for (const note of notes) {
    if (!isRecord(note) || !ISSUES.has(note.issue)) continue
    const provider = before.providers.find((p) => p.id === note.provider)
    if (!provider) continue
    if (note.model !== undefined) {
      const models = [...provider.sttModels, ...provider.llmModels]
      if (!models.some((m) => m.id === note.model)) continue
      kept.push({ provider: provider.id, model: note.model, issue: note.issue })
    } else {
      kept.push({ provider: provider.id, issue: note.issue })
    }
  }
  return kept
}

/**
 * Apply a change list to the catalog text. Each change is re-checked
 * against the catalog as it is now (its from must still be there), so a
 * stale or forged list changes nothing. Returns the new text, or throws.
 */
function applyChanges(catalogText, changes, today) {
  const before = JSON.parse(catalogText)
  const after = structuredClone(before)
  for (const change of changes) {
    if (!isRecord(change) || !Array.isArray(change.path) || change.path.length === 0) throw new Error('malformed change')
    let node = after
    for (const key of change.path.slice(0, -1)) {
      if (!(typeof key === 'string' || Number.isInteger(key)) || !Object.hasOwn(node, key)) throw new Error('unknown path')
      node = node[key]
    }
    const leaf = change.path[change.path.length - 1]
    if (!Object.hasOwn(node, leaf) || !Object.is(node[leaf], change.from)) throw new Error(`stale change at ${label(before, change.path)}`)
    node[leaf] = change.to
  }
  const checked = rateChanges(before, after, today)
  if (!checked.ok) throw new Error(checked.reason)
  return `${JSON.stringify(after, null, 2)}\n`
}

/** The PR body, written from the checked changes and the catalog's own
 *  source lists; no agent text reaches it. */
function prBody(before, changes, notes) {
  const lines = ['Rate drift found by pricing-watch. Every number below was checked against its source by the agent and needs a human look before merge.', '']
  for (const change of changes) {
    if (change.path[change.path.length - 1] === 'verifiedOn') continue
    lines.push(`- ${label(before, change.path)}: ${change.from} to ${change.to}`)
  }
  const touched = new Set(changes.filter((c) => c.path[0] === 'providers').map((c) => c.path[1]))
  if (touched.size > 0) {
    lines.push('', 'Sources:')
    for (const index of touched) {
      const provider = before.providers[index]
      for (const url of provider.sources) lines.push(`- ${provider.id}: ${url}`)
    }
  }
  if (notes.length > 0) {
    lines.push('', 'Notes:')
    for (const note of notes) lines.push(`- ${note.provider}${note.model ? `.${note.model}` : ''}: ${note.issue}`)
  }
  return `${lines.join('\n')}\n`
}

/** Vendor HTML to plain text the agent can read with file tools. */
function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/table|\/section)[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#36;|&dollar;/g, '$')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

module.exports = { RATE_KEYS, rateChanges, cleanNotes, applyChanges, prBody, htmlToText }
