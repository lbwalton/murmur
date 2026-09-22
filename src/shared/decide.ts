// SPDX-License-Identifier: GPL-3.0-only
// The decision-model sort path (US-057), pure half. A decision model
// takes the note as state and one typed question per judgment, and
// returns typed answers with probabilities: a label outside the answer
// space is not something it declines to emit, it is something it
// cannot emit. This module builds that request and reads its answers
// into the same SortVerdict the chat path produces, so everything
// downstream of the verdict never knows which model answered.
import { SORT_LABELS, type Seam, type SeamVotes, type SortLabel, type SortVerdict, seamSides } from './sorter'

export const DECISION_LABEL_CRITERIA: Record<SortLabel, string> = {
  task: 'Something the speaker intends to do, must do, or wants done: an action with an implied owner.',
  idea: 'A possibility, suggestion, or concept the speaker wants to remember, not an action they committed to.',
  note: 'Anything else: an observation, a feeling, context, a fact.'
}

/** A Noul at or above this probability confirms a seam. */
export const SEAM_YES = 0.5

export interface DecisionQuestion {
  type: 'choice' | 'noul'
  instructions: unknown
  criteria?: unknown
}

export interface DecisionRequest {
  model: string
  state: string[]
  questions: Record<string, DecisionQuestion>
}

/** One Choice per sentence over the three labels, and one Noul per
 *  seam with both sides as structured fields. No question here can
 *  return text. */
export function buildDecisionRequest(
  model: string,
  sentences: readonly string[],
  seamsBySentence: readonly Seam[][]
): DecisionRequest {
  const questions: Record<string, DecisionQuestion> = {}
  sentences.forEach((sentence, i) => {
    const n = i + 1
    questions[`label_${n}`] = {
      type: 'choice',
      instructions: {
        question: 'Which kind of thing is this sentence of the note?',
        sentence: n,
        text: sentence
      },
      criteria: DECISION_LABEL_CRITERIA
    }
    seamsBySentence[i]?.forEach((seam, j) => {
      const { left, right } = seamSides(sentence, seam)
      questions[`seam_${n}_${j + 1}`] = {
        type: 'noul',
        instructions: {
          question:
            'Does this cut separate two distinct items the speaker would act on separately, rather than falling inside one thought, one item, or a figure of speech?',
          sentence: n,
          left,
          right
        },
        criteria: { true: 'Two separate items', false: 'One item or one thought' }
      }
    })
  })
  return { model, state: sentences.map((s, i) => `${i + 1}. ${s}`), questions }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The probability behind a Choice, for the threshold US-058 spends:
 *  the reported confidence, else the winning option's probability,
 *  else one, so a bare answer never reads as doubt. */
function confidenceOf(answer: Record<string, unknown>, choice: string): number {
  if (typeof answer.confidence === 'number') return answer.confidence
  const probabilities = answer.probabilities
  if (isRecord(probabilities) && typeof probabilities[choice] === 'number') return probabilities[choice] as number
  return 1
}

/**
 * Read a decision reply's answers into a verdict. All or nothing, like
 * US-051: every sentence must carry a label from the answer space. A
 * seam confirms at SEAM_YES; a missing or low seam answer means no cut.
 */
export function readDecisionAnswers(
  answers: unknown,
  count: number,
  seamCounts: readonly number[]
): SortVerdict {
  if (!isRecord(answers)) return { ok: false, reason: 'missing sentences' }
  const labels: SortLabel[] = []
  const confidence: number[] = []
  for (let n = 1; n <= count; n++) {
    const answer = answers[`label_${n}`]
    if (!isRecord(answer)) return { ok: false, reason: 'missing sentences' }
    const choice = answer.choice
    if (answer.type !== 'choice' || typeof choice !== 'string' || !SORT_LABELS.includes(choice as SortLabel)) {
      return { ok: false, reason: 'bad label' }
    }
    labels.push(choice as SortLabel)
    confidence.push(confidenceOf(answer, choice))
  }
  const seams: SeamVotes = {}
  seamCounts.forEach((seamCount, i) => {
    const confirmed: number[] = []
    for (let j = 1; j <= seamCount; j++) {
      const answer = answers[`seam_${i + 1}_${j}`]
      if (isRecord(answer) && typeof answer.noul === 'number' && answer.noul >= SEAM_YES) confirmed.push(j)
    }
    if (confirmed.length > 0) seams[i + 1] = confirmed
  })
  return { ok: true, labels, topic: '', seams, confidence }
}
