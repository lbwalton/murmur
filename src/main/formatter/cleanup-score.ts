// SPDX-License-Identifier: GPL-3.0-only
// The grader behind shared/cleanup-cases.json (US-125). Lost content
// is kept apart from a stumble left in: losing what someone meant is
// worse than leaving a slip in the text, so the two are never added
// into 1 number. Used by the probe and its unit test, never by the app.

export const CLEANUP_KINDS = [
  'cue-fix',
  'restatement',
  'abandoned-start',
  'real-cue-word',
  'list',
  'long-structure',
  'plain-prose'
] as const

export type CleanupKind = (typeof CLEANUP_KINDS)[number]

export interface CleanupCase {
  id: string
  kind: CleanupKind
  /** What the recognizer hands over. */
  text: string
  /** Must survive; a | separates accepted spellings. */
  keep: string[]
  /** Must go. */
  drop: string[]
  /** The fewest list lines the result needs. */
  listLines?: number
  /** Every word stays, in order, and the shape stays prose. */
  unchanged?: boolean
  /** Close to an example inside a prompt, so the model has seen the answer. */
  tuned?: boolean
}

export interface CleanupGrade {
  passed: boolean
  /** Keep phrases that vanished. */
  lost: string[]
  /** Drop phrases still in the text. */
  left: string[]
  /** An unchanged case had its words or its shape changed. */
  changed: boolean
  /** A list case came back with too few list lines. */
  shortList: boolean
}

export interface CleanupOutcome {
  model: string
  id: string
  kind: CleanupKind
  tuned: boolean
  run: number
  typed: string
  /** Why the pass fell back, or null when the answer was accepted. */
  fallback: string | null
  /** The request never reached the model (a 429, a 500, a dropped
   *  connection), so the case says nothing about it and stays out of the
   *  score. A timeout or an empty answer counts: the app falls back there too. */
  transport: boolean
  grade: CleanupGrade
}

const UNITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen'
]
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const NUMBER_WORDS = new Map<string, number>([
  ...UNITS.map((word, value): [string, number] => [word, value]),
  ...TENS.map((word, index): [string, number] => [word, (index + 2) * 10])
])

const TENS_AND_UNIT = new RegExp(`\\b(${TENS.join('|')})[ -](${UNITS.slice(1, 10).join('|')})\\b`, 'g')

/**
 * Words only, lowercase, number words as digits, so a model that writes
 * 50,000 or $20 is not graded as having lost fifty thousand or twenty.
 * Tens join a unit only across a space or hyphen: in two thirty, three
 * the comma separates 2 numbers.
 */
export function plainText(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(TENS_AND_UNIT, (_, tens: string, unit: string) =>
      String((NUMBER_WORDS.get(tens) ?? 0) + (NUMBER_WORDS.get(unit) ?? 0))
    )
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => {
      const number = NUMBER_WORDS.get(word)
      return number === undefined ? word : String(number)
    })
  const merged: string[] = []
  for (const word of words) {
    const last = merged[merged.length - 1]
    if (word === 'thousand' && last !== undefined && /^\d+$/.test(last)) {
      merged[merged.length - 1] = String(Number(last) * 1000)
    } else {
      merged.push(word)
    }
  }
  return merged.join(' ')
}

function holds(text: string, phrase: string): boolean {
  return phrase.split('|').some((spelling) => ` ${text} `.includes(` ${plainText(spelling)} `))
}

const LIST_LINE = /^\s*(?:- |\d+\. )/

/** Grade what would land at the cursor against 1 case. */
export function gradeCase(probe: CleanupCase, typed: string): CleanupGrade {
  const lines = typed.split('\n')
  // List markers are shape, not words: 2. eggs must not read as two eggs.
  const text = plainText(lines.map((line) => line.replace(LIST_LINE, '')).join('\n'))
  const lost = probe.keep.filter((phrase) => !holds(text, phrase))
  const left = probe.drop.filter((phrase) => holds(text, phrase))
  const listLines = lines.filter((line) => LIST_LINE.test(line)).length
  // Words alone cannot see a list forced onto prose.
  const reshaped = listLines > 0 || /^\s*[*•] /m.test(typed) || typed.trim().includes('\n')
  const changed = probe.unchanged === true && (text !== plainText(probe.text) || reshaped)
  const shortList = probe.listLines !== undefined && listLines < probe.listLines
  return { passed: lost.length === 0 && left.length === 0 && !changed && !shortList, lost, left, changed, shortList }
}

function percent(part: number, whole: number): string {
  return whole === 0 ? 'n/a' : `${Math.round((part / whole) * 100)}%`
}

function tallyReasons(outcomes: CleanupOutcome[]): string {
  const reasons = new Map<string, number>()
  for (const outcome of outcomes) {
    if (outcome.fallback !== null) reasons.set(outcome.fallback, (reasons.get(outcome.fallback) ?? 0) + 1)
  }
  return [...reasons].map(([reason, count]) => `${reason} ${count}`).join(', ')
}

/** The printed scoreboard: 1 row per kind, per model, then what went wrong by name. */
export function cleanupReport(outcomes: CleanupOutcome[]): string {
  const lines: string[] = []
  for (const model of [...new Set(outcomes.map((outcome) => outcome.model))]) {
    const all = outcomes.filter((outcome) => outcome.model === model)
    const graded = all.filter((outcome) => !outcome.transport)
    lines.push(`model ${model}: ${graded.length} graded, ${all.length - graded.length} could not be graded`)
    for (const kind of CLEANUP_KINDS) {
      const rows = graded.filter((outcome) => outcome.kind === kind)
      const failed = all.filter((outcome) => outcome.kind === kind && outcome.transport)
      if (rows.length === 0 && failed.length === 0) continue
      const passed = rows.filter((outcome) => outcome.grade.passed).length
      const lost = rows.filter((outcome) => outcome.grade.lost.length > 0).length
      // A case the model never touched still passes when nothing needed
      // cutting, so a run that did nothing cannot pass for a good one.
      const unearned = rows.filter((outcome) => outcome.grade.passed && outcome.fallback !== null).length
      const heldOut = rows.filter((outcome) => !outcome.tuned)
      const heldOutPassed = heldOut.filter((outcome) => outcome.grade.passed).length
      const reasons = tallyReasons(rows)
      const failedReasons = tallyReasons(failed)
      lines.push(
        `  ${kind.padEnd(16)} ${percent(passed, rows.length).padStart(4)}  ${passed}/${rows.length}  lost ${lost}` +
          (heldOut.length < rows.length ? `  held out ${percent(heldOutPassed, heldOut.length)}` : '') +
          (unearned > 0 ? `  passed by falling back ${unearned}` : '') +
          (reasons ? `  fallbacks: ${reasons}` : '') +
          (failedReasons ? `  not graded: ${failedReasons}` : '')
      )
    }
    const passed = graded.filter((outcome) => outcome.grade.passed).length
    const fellBack = graded.filter((outcome) => outcome.fallback !== null).length
    lines.push(`  ${'all'.padEnd(16)} ${percent(passed, graded.length).padStart(4)}  ${passed}/${graded.length}`)
    lines.push(`  fell back ${fellBack}/${graded.length} (${percent(fellBack, graded.length)})`)

    const failing = graded.filter((outcome) => !outcome.grade.passed)
    const lostRows = failing.filter((outcome) => outcome.grade.lost.length > 0)
    if (lostRows.length > 0) lines.push('  LOST CONTENT:')
    for (const id of [...new Set(lostRows.map((outcome) => outcome.id))]) {
      const rows = lostRows.filter((outcome) => outcome.id === id)
      lines.push(`    ${id} ${rows.length}x, lost: ${rows[0].grade.lost.join('; ')}`)
      lines.push(`      typed: ${rows[0].typed.replace(/\n/g, ' / ')}`)
    }
    const missRows = failing.filter((outcome) => outcome.grade.lost.length === 0)
    if (missRows.length > 0) lines.push('  misses:')
    for (const id of [...new Set(missRows.map((outcome) => outcome.id))]) {
      const rows = missRows.filter((outcome) => outcome.id === id)
      const { left, changed, shortList } = rows[0].grade
      const why = [
        left.length > 0 ? `left: ${left.join('; ')}` : '',
        changed ? 'words changed' : '',
        shortList ? 'too few list lines' : '',
        rows[0].fallback ? `fell back: ${rows[0].fallback}` : ''
      ]
        .filter((part) => part.length > 0)
        .join(', ')
      lines.push(`    ${id} ${rows.length}x, ${why}`)
      lines.push(`      typed: ${rows[0].typed.replace(/\n/g, ' / ')}`)
    }
  }
  return lines.join('\n')
}
