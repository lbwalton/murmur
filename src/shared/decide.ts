// SPDX-License-Identifier: GPL-3.0-only
// The decision-model sort path (US-057), pure half. A decision model
// takes the note as state and one typed question per judgment, and
// returns typed answers with probabilities: a label outside the answer
// space is not something it declines to emit, it is something it
// cannot emit. This module builds that request and reads its answers
// into the same SortVerdict the chat path produces, so everything
// downstream of the verdict never knows which model answered.
import { type ContextItem, type RelationVotes } from './compare'
import {
  type LeadStarts,
  SORT_LABELS,
  type Seam,
  type SeamVotes,
  type SortLabel,
  type SortVerdict,
  leadWords,
  seamSides
} from './sorter'

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
  /** The numbered sentences alone, or, when there are filed items to
   *  compare against, an object holding both lists. */
  state: string[] | { sentences: string[]; items: string[] }
  questions: Record<string, DecisionQuestion>
}

/** One Choice per sentence over the three labels, one Noul per seam
 *  with both sides as structured fields, and, when there are filed
 *  items, a relation Choice and an item Choice per sentence. No
 *  question here can return text. */
export function buildDecisionRequest(
  model: string,
  sentences: readonly string[],
  seamsBySentence: readonly Seam[][],
  items: readonly ContextItem[] = []
): DecisionRequest {
  const questions: Record<string, DecisionQuestion> = {}
  // The items are listed once, in the state; each option here is just
  // its number, so a note with many sentences does not carry the whole
  // list once per sentence (review gate 2026-09-22).
  const itemOptions: Record<string, null> = {}
  for (const item of items) itemOptions[String(item.number)] = null
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
    if (items.length > 0) {
      questions[`relation_${n}`] = {
        type: 'choice',
        instructions: {
          question:
            'Against the items already filed (the items list in the state, the most recent of each file), is this sentence new, the same thing as one of them, or a report that one of them is finished? Relate it only when it clearly refers to the same thing.',
          sentence: n,
          text: sentence
        },
        criteria: {
          new: 'Not about any filed item',
          same: 'Says the same thing as a filed item',
          completes: 'Reports a filed item as finished'
        }
      }
      questions[`match_${n}`] = {
        type: 'choice',
        instructions: {
          question: 'Which item in the items list does this sentence refer to, if any? Answer with its number; pick the closest.',
          sentence: n,
          text: sentence
        },
        criteria: itemOptions
      }
    }
    // US-062: where the first item of a run begins, as a word number.
    // Each option is a number whose description is that word, so the
    // answer can only ever point; it cannot supply text.
    const words = leadWords(sentence, seamsBySentence[i] ?? [])
    if (words.length > 0) {
      const options: Record<string, string> = {}
      words.forEach((word, j) => {
        options[String(j + 1)] = word
      })
      questions[`lead_${n}`] = {
        type: 'choice',
        instructions: {
          question:
            'If this sentence runs through several items, at which word does the FIRST item begin? The words before it only introduce the run (for example I need to buy). Pick 1 when it is not a run of items or nothing introduces it.',
          sentence: n,
          text: sentence
        },
        criteria: options
      }
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
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`)
  const state =
    items.length > 0
      ? { sentences: numbered, items: items.map((item) => `${item.number}. [${item.done ? 'x' : ' '}] ${item.text}`) }
      : numbered
  return { model, state, questions }
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
  seamCounts: readonly number[],
  itemCount = 0,
  leadCounts: readonly number[] = []
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
  // Relations: a relation Choice other than new, with a match naming a
  // real item, holds the line; anything else is new for that line.
  const relations: RelationVotes = {}
  if (itemCount > 0) {
    for (let n = 1; n <= count; n++) {
      const relation = answers[`relation_${n}`]
      const match = answers[`match_${n}`]
      if (!isRecord(relation) || !isRecord(match)) continue
      const kind = relation.choice
      if (kind !== 'same' && kind !== 'completes') continue
      const item = Number(match.choice)
      if (!Number.isInteger(item) || item < 1 || item > itemCount) continue
      relations[n] = { relation: kind, item }
    }
  }
  // Lead-ins (US-062): a word number from 2 to the count offered; any
  // other answer, or none, means no lead-in for that sentence.
  const starts: LeadStarts = {}
  leadCounts.forEach((offered, i) => {
    if (offered < 2) return
    const answer = answers[`lead_${i + 1}`]
    if (!isRecord(answer)) return
    const word = Number(answer.choice)
    if (Number.isInteger(word) && word >= 2 && word <= offered) starts[i + 1] = word
  })
  const offeredLeads = leadCounts.some((n) => n >= 2)
  return { ok: true, labels, topic: '', seams, confidence, relations, ...(offeredLeads ? { starts } : {}) }
}
