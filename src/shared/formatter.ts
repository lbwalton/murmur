// SPDX-License-Identifier: GPL-3.0-only
// The deterministic formatter. Pure function, no IO: rules come from
// shared/format-spec.json, cases from shared/test-vectors.json, and the
// LLM pass (US-014) falls back to this output on any failure.

export interface FormatSpec {
  fillers: { words: string[] }
  scratchThat: { triggers: string[] }
  spokenPunctuation: { map: Record<string, string> }
  listCommands: { map: Record<string, string> }
  numbers: {
    units: Record<string, number>
    tens: Record<string, number>
  }
  terminalPunctuation: { minWords: number; append: string }
}

export interface FormatOptions {
  level: 'off' | 'light' | 'full'
  numbers: 'auto' | 'words' | 'digits'
  /** Smart lists setting: spoken list commands convert only when true. */
  smartLists?: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeFillers(text: string, words: string[]): string {
  if (words.length === 0) return text
  const pattern = new RegExp(`(?:^|\\s)(?:${words.map(escapeRegExp).join('|')})(?=\\s|[.,!?;:]|$)`, 'gi')
  return text.replace(pattern, '')
}

function applyScratchThat(text: string, triggers: string[]): string {
  let out = text
  for (;;) {
    let earliest: { start: number; end: number } | null = null
    for (const trigger of triggers) {
      const match = new RegExp(`\\b${escapeRegExp(trigger)}\\b[.,]?`, 'i').exec(out)
      if (match && (earliest === null || match.index < earliest.start)) {
        earliest = { start: match.index, end: match.index + match[0].length }
      }
    }
    if (!earliest) return out
    // Delete from the start of the current sentence through the trigger.
    const before = out.slice(0, earliest.start)
    const boundary = Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('!'),
      before.lastIndexOf('?'),
      before.lastIndexOf('\n')
    )
    const sentenceStart = boundary + 1
    out = `${out.slice(0, sentenceStart)} ${out.slice(earliest.end)}`.replace(/ {2,}/g, ' ')
  }
}

function applySpokenPunctuation(text: string, map: Record<string, string>): string {
  let out = text
  const phrases = Object.keys(map).sort((a, b) => b.length - a.length)
  for (const phrase of phrases) {
    const symbol = map[phrase]
    const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(phrase)}(?=\\s|[.,]|$)[.,]?`, 'gi')
    out = out.replace(pattern, symbol)
  }
  return out
}

function fixWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?([.,!?;:]) ?/g, '$1 ')
    .replace(/([.,!?;:]) (?=[.,!?;:])/g, '$1')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +$/gm, '')
    .replace(/^ +/gm, '')
    .trim()
}

function wordsToDigits(text: string, units: Record<string, number>, tens: Record<string, number>): string {
  const tensNames = Object.keys(tens).map(escapeRegExp).join('|')
  const unitNames = Object.keys(units)
    .filter((u) => units[u] >= 1 && units[u] <= 9)
    .map(escapeRegExp)
    .join('|')
  let out = text.replace(new RegExp(`\\b(${tensNames})[ -](${unitNames})\\b`, 'gi'), (_m, t: string, u: string) => {
    return String(tens[t.toLowerCase()] + units[u.toLowerCase()])
  })
  const allNames = [...new Set([...Object.keys(units), ...Object.keys(tens)])]
    .map(escapeRegExp)
    .join('|')
  out = out.replace(new RegExp(`\\b(${allNames})\\b`, 'gi'), (m: string) => {
    const key = m.toLowerCase()
    return String(units[key] ?? tens[key])
  })
  return out
}

function digitsToWords(text: string, units: Record<string, number>): string {
  const byValue = new Map<number, string>()
  for (const [word, value] of Object.entries(units)) {
    if (!byValue.has(value)) byValue.set(value, word)
  }
  return text.replace(/\b(\d{1,2})\b/g, (m: string) => {
    const word = byValue.get(Number(m))
    return word ?? m
  })
}

function capitalizeSentences(text: string): string {
  let out = text.replace(/^\s*([a-z])/, (m) => m.toUpperCase())
  out = out.replace(/([.!?]["')\]]?\s+|\n+\s*)([a-z])/g, (_m, sep: string, ch: string) => {
    return sep + ch.toUpperCase()
  })
  return out
}

function ensureTerminal(text: string, minWords: number, append: string, smartLists: boolean): string {
  if (text.length === 0) return text
  // A list never gets a period stapled onto its last item. Gated on the
  // setting: with smart lists off, even a raw transcript that happens to
  // start a line with a dash must format byte-identically to before.
  if (smartLists) {
    const lastLine = text.slice(text.lastIndexOf('\n') + 1)
    if (/^- /.test(lastLine)) return text
  }
  const words = text.split(/\s+/).filter((w) => w.length > 0)
  if (words.length < minWords) return text
  if (/[\w)]$/.test(text)) return text + append
  return text
}

/** Format a raw transcript deterministically according to the spec. */
export function formatTranscript(raw: string, options: FormatOptions, spec: FormatSpec): string {
  const trimmed = raw.trim()
  if (options.level === 'off') return trimmed

  let out = removeFillers(trimmed, spec.fillers.words)

  if (options.level === 'full') {
    // Punctuation first: scratch-that needs real sentence boundaries to
    // know where the current sentence starts.
    out = applySpokenPunctuation(out, spec.spokenPunctuation.map)
    // List commands share spoken punctuation's matching rules and stage.
    if (options.smartLists) out = applySpokenPunctuation(out, spec.listCommands.map)
    out = applyScratchThat(out, spec.scratchThat.triggers)
  }

  out = fixWhitespace(out)

  if (options.level === 'full' && options.numbers === 'digits') {
    out = wordsToDigits(out, spec.numbers.units, spec.numbers.tens)
  }
  if (options.level === 'full' && options.numbers === 'words') {
    out = digitsToWords(out, spec.numbers.units)
  }

  out = capitalizeSentences(out)

  if (options.level === 'full') {
    out = ensureTerminal(
      out,
      spec.terminalPunctuation.minWords,
      spec.terminalPunctuation.append,
      options.smartLists === true
    )
  }
  return out
}
