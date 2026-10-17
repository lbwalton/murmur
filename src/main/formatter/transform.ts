// SPDX-License-Identifier: GPL-3.0-only
// The transform call (US-054): a spoken instruction applied to selected
// text. The roles invert from dictation and never mix: the SPOKEN words
// are the instruction, the SELECTED text is data that is never obeyed.
// The two travel in separate messages, the selection fenced so nothing
// inside it can close the fence, and a reply that is empty, chatty, or
// refused is rejected so the caller leaves the selection untouched.
// The prompt, the phrases, and the numbers live in shared/transform.json,
// which the iPhone reads too (ios/prd.json IOS-024);
// shared/transform-vectors.json keeps both platforms answering alike.
import rules from '../../../shared/transform.json'
import type { PolishConfig } from './llm'

/** Longest selection a transform will send (characters). Longer ones
 *  are refused before anything leaves the machine. */
export const TRANSFORM_MAX_CHARS = rules.maxChars

export const TRANSFORM_SYSTEM_PROMPT = rules.systemPrompt.join(' ')

export type TransformVerdict = { ok: true; text: string } | { ok: false; reason: string }

export type TransformResult = TransformVerdict

export interface TransformOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const FENCE_OPEN = `<${rules.tag}>`
const FENCE_CLOSE = `</${rules.tag}>`

/** A phrase from shared/transform.json as a pattern that matches only it. */
function literal(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function anyOf(phrases: string[]): string {
  return `(?:${phrases.map(literal).join('|')})`
}

const FENCE_TAG = new RegExp(`<\\s*(\\/?)\\s*${literal(rules.tag)}\\b`, 'gi')

/** The selection as it travels: fenced, with any fence-like tag inside
 *  it defanged so the data can never end its own fence early. */
export function fenceSelection(selection: string): string {
  const defanged = selection.replace(FENCE_TAG, (_m, slash: string) => `‹${slash}${rules.tag}`)
  return `${rules.selectionHead}\n${FENCE_OPEN}\n${defanged}\n${FENCE_CLOSE}`
}

/** The chat messages for one transform. Pure, so tests can prove the
 *  selection never reaches the system or instruction slots. */
export function buildTransformMessages(
  instruction: string,
  selection: string
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: TRANSFORM_SYSTEM_PROMPT },
    { role: 'user', content: fenceSelection(selection) },
    { role: 'user', content: `${rules.instructionHead}\n${instruction.trim()}` }
  ]
}

// A preamble line that announces the payload ("Here is the list:").
const PREAMBLE = new RegExp(`^${anyOf(rules.preambleOpeners)}\\b[^\\n]*:\\s*$`, 'i')
// Assistant refusals. Kept to phrasings about helping, so a transform
// that legitimately writes "I'm sorry, I can't make Thursday" survives.
const REFUSAL = new RegExp(
  `^${anyOf(rules.refusalApologies)}?${anyOf(rules.refusalCannots)} ${anyOf(rules.refusalActions)}\\b|\\b${anyOf(rules.refusalAnywhere)}\\b`,
  'i'
)

/**
 * Decide whether a model reply can replace the selection. A transform
 * rewrites on purpose, so there is no word-keeping rule here; the
 * guarantee is recoverability, and this only filters replies that are
 * plainly not the result (empty, chatter, refusal).
 */
export function validateTransform(candidate: string): TransformVerdict {
  let text = candidate.trim()
  // One code fence around the whole reply is wrapping, not content.
  const fenced = text.match(/^```[\w-]*\n([\s\S]*?)\n```$/)
  if (fenced) text = fenced[1].trim()
  if (text.length === 0) return { ok: false, reason: 'empty' }
  if (text.includes(FENCE_OPEN) || text.includes(FENCE_CLOSE)) {
    return { ok: false, reason: 'echoed fence' }
  }
  const lines = text.split('\n')
  if (PREAMBLE.test(lines[0].trim())) {
    // A lone "Here you go:" with nothing after is still nothing.
    const rest = lines.slice(1).join('\n').trim()
    if (rest.length === 0) return { ok: false, reason: 'empty' }
    return { ok: false, reason: 'preamble line' }
  }
  if (REFUSAL.test(text.slice(0, rules.refusalWindow))) return { ok: false, reason: 'refusal' }
  return { ok: true, text }
}

/**
 * Run one transform. Resolves the result, or a reason it was rejected.
 * Never throws, never retries.
 */
export async function transformText(
  instruction: string,
  selection: string,
  cfg: PolishConfig,
  options: TransformOptions = {}
): Promise<TransformResult> {
  const { fetchImpl = fetch, timeoutMs = rules.timeoutMs } = options
  if (instruction.trim().length === 0) return { ok: false, reason: 'no instruction' }
  if (selection.length > TRANSFORM_MAX_CHARS) return { ok: false, reason: 'selection too long' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: rules.temperature,
        messages: buildTransformMessages(instruction, selection)
      }),
      signal: controller.signal
    })
    if (!response.ok) return { ok: false, reason: `http ${response.status}` }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return { ok: false, reason: 'response missing text' }
    return validateTransform(content)
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, reason: aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}
