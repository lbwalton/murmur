// SPDX-License-Identifier: GPL-3.0-only
// The rules half of the weekly model watch (US-158): murmur reads each
// provider's model list live, so the only thing we keep current is the
// catalog's suggested models. This says which of them a provider's list
// no longer carries, or marks to retire.

/** The entries of a /models body: data, models, or a bare array. */
function entriesOf(body) {
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.data)) return parsed.data
  if (parsed && Array.isArray(parsed.models)) return parsed.models
  return null
}

/** Problems with a provider's suggested models, given its list body:
 *  one line each, empty when all is well. */
function suggestionProblems(provider, body) {
  const entries = entriesOf(body)
  if (!entries) return [`${provider.name}: the model list could not be read`]
  const byId = new Map()
  for (const entry of entries) {
    const id = typeof entry === 'string' ? entry : (entry?.id ?? entry?.name)
    if (typeof id === 'string') byId.set(id, typeof entry === 'object' ? entry : {})
  }
  const problems = []
  for (const { id } of provider.llmModels ?? []) {
    const entry = byId.get(id)
    if (!entry) problems.push(`${provider.name}: \`${id}\` is no longer in its model list`)
    else if (typeof entry.expiration_date === 'string' && entry.expiration_date !== '') {
      problems.push(`${provider.name}: \`${id}\` retires on ${entry.expiration_date}`)
    }
  }
  return problems
}

/** The issue body: what to fix, and which lists were not readable. */
function report(problems, skipped, today) {
  const lines = [`# Suggested models to update (${today})`, '']
  if (problems.length > 0) {
    lines.push(
      'The catalog suggests these in the Model list, and their provider says otherwise. Pick a replacement in shared/provider-catalog.json (llmModels), check it with a live Test, and ship it with the next release.',
      ''
    )
    for (const p of problems) lines.push(`- ${p}`)
  } else {
    lines.push('Every suggested model is still listed, with no retirement date.')
  }
  if (skipped.length > 0) {
    lines.push('', 'Not checked here (their lists need a key, so the in-app list covers them):', '')
    for (const s of skipped) lines.push(`- ${s}`)
  }
  return `${lines.join('\n')}\n`
}

module.exports = { report, suggestionProblems }
