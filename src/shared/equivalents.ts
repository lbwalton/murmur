// SPDX-License-Identifier: GPL-3.0-only
// The rotating you-have-dictated line. Pure: the caller supplies a
// 0..1 pick value (random per app open, per LaBroi's spec) and gets a
// human sentence comparing lifetime words to a famous work.

export interface WorkRef {
  words: number
  name: string
}

export interface EquivalentsFile {
  works: WorkRef[]
}

function ratioText(ratio: number): string {
  if (ratio >= 10) return `${Math.round(ratio)}x`
  if (ratio >= 1.05) return `${(Math.round(ratio * 10) / 10).toString()}x`
  return 'about the length of'
}

/**
 * Pick a comparison. Eligible works are those the user has reached at
 * least a quarter of; with none, the line becomes progress toward the
 * smallest work. pick (0..1) selects among eligible, so the line
 * rotates between app opens while staying truthful.
 */
export function equivalentLine(words: number, spec: EquivalentsFile, pick: number): string {
  const sorted = [...spec.works].sort((a, b) => a.words - b.words)
  if (sorted.length === 0 || words <= 0) return ''
  const eligible = sorted.filter((w) => words >= w.words * 0.25)
  if (eligible.length === 0) {
    const target = sorted[0]
    const pct = Math.max(1, Math.round((words / target.words) * 100))
    return `${words.toLocaleString()} words dictated: ${pct}% of the way to ${target.name}.`
  }
  const clamped = Math.min(0.999, Math.max(0, pick))
  const chosen = eligible[Math.floor(clamped * eligible.length)]
  const ratio = words / chosen.words
  const prefix = `${words.toLocaleString()} words dictated:`
  if (ratio < 0.95) {
    return `${prefix} ${Math.round(ratio * 100)}% of ${chosen.name}.`
  }
  if (ratio < 1.05) {
    return `${prefix} about the length of ${chosen.name}.`
  }
  return `${prefix} that is ${ratioText(ratio)} ${chosen.name}.`
}
