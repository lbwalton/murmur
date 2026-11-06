// SPDX-License-Identifier: GPL-3.0-only
// What cleanup changed (US-128): the words as heard, with the ones that
// did not reach the final text marked.
import type { SessionEvent } from './history'

export interface HeardWord {
  text: string
  removed: boolean
}

// Past this, the table would slow the window, and a take this long is
// shown unmarked rather than marked wrongly.
const MAX_CELLS = 16_000_000

const plain = (word: string): string =>
  word
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

const wordsOf = (text: string): string[] => text.split(/\s+/).filter((word) => word.length > 0)

/** The raw words in order, each marked when no longest common run with
 *  the final text keeps it. Punctuation and case never count as a change. */
export function heardWords(raw: string, final: string): HeardWord[] {
  const heard = wordsOf(raw)
  const a = heard.map(plain)
  const b = wordsOf(final).map(plain)
  if (a.length * b.length > MAX_CELLS) return heard.map((text) => ({ text, removed: false }))
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  const out: HeardWord[] = []
  let i = 0
  let j = 0
  while (i < a.length) {
    if (j < b.length && a[i] === b[j]) {
      out.push({ text: heard[i], removed: false })
      i += 1
      j += 1
    } else if (j < b.length && table[i * width + j + 1] >= table[(i + 1) * width + j]) {
      j += 1
    } else {
      out.push({ text: heard[i], removed: true })
      i += 1
    }
  }
  return out
}

/** Whether a history row offers What you said: cleanup changed a word,
 *  not just punctuation, on a real dictation. */
export function offersWhatYouSaid(event: SessionEvent): boolean {
  if (event.kind === 'transform' || event.rawText.trim().length === 0) return false
  return wordsOf(event.rawText).map(plain).join(' ') !== wordsOf(event.finalText).map(plain).join(' ')
}
