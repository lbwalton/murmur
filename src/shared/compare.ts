// SPDX-License-Identifier: GPL-3.0-only
// Comparing a new dump against what is already filed (US-055), pure
// half. The items already in the tasks and ideas files ride the same
// request as the labels, numbered, and for each new sentence the model
// votes one relation against that list: new, the same as item N, or a
// report that item N is finished (a note can only be the last). The model chooses from numbers
// only. A line the vote ties to an item is held in the verbatim inbox
// with the item quoted, and nothing is ever merged or edited without a
// click. A malformed vote means new, so a bad reply can never hide a
// line.
import { parseListItems } from './todo'

/** How many of each file's most recent items are compared against. */
export const COMPARE_CAP = 60

export type ContextFile = 'tasks' | 'ideas'

export interface ContextItem {
  /** The number the model sees, across both files. */
  number: number
  file: ContextFile
  /** For a checkbox line, its position among the file's checkboxes,
   *  counted the way parseTodo and tickLine count them; for a plain
   *  bullet, its position among all of the file's items. */
  nth: number
  text: string
  done: boolean
  checkbox: boolean
}

/** The most recent items of each file, numbered in file order, tasks
 *  first. Empty or missing files yield nothing, so every line votes
 *  new by construction. */
export function buildCompareContext(tasksText: string, ideasText: string, cap = COMPARE_CAP): ContextItem[] {
  const out: ContextItem[] = []
  const take = (text: string, file: ContextFile): void => {
    const items = parseListItems(text)
    // nth for a checkbox counts checkboxes only, matching tickLine.
    let boxes = -1
    items.forEach((item, index) => {
      if (item.checkbox) boxes += 1
      if (index < items.length - cap) return
      out.push({
        number: out.length + 1,
        file,
        nth: item.checkbox ? boxes : index,
        text: item.text,
        done: item.done,
        checkbox: item.checkbox
      })
    })
  }
  take(tasksText, 'tasks')
  take(ideasText, 'ideas')
  return out
}

/** The items as the chat model sees them. */
export function contextPrompt(items: readonly ContextItem[], cap = COMPARE_CAP): string {
  if (items.length === 0) return ''
  const lines = items.map((item) => `${item.number}. [${item.done ? 'x' : ' '}] ${item.text}`)
  return `Items already filed (the most recent ${cap} of each file):\n${lines.join('\n')}`
}

/** Appended to the system prompt only when there are items to compare. */
export const SORT_RELATIONS_PROMPT = [
  'Below the sentences is a numbered list of items already in the user\'s files, each marked [ ] open or [x] done.',
  'Also include the key "relations": an object mapping a sentence number to a pair [code, item], where code 1 means the sentence says the same thing as that item, and code 2 means the sentence reports that item as finished.',
  'Leave out every sentence that is new. Relate a sentence to an item only when it clearly refers to the same thing; a sentence that reports something done is code 2 whatever label it carries. Numbers only, never text.'
].join(' ')

export type Relation = 'same' | 'completes'

export interface RelationVote {
  relation: Relation
  /** The item's number in the context. */
  item: number
}

/** Confirmed relation votes per sentence number. Produced by whichever
 *  connection voted and consumed by the holder, so a second backend
 *  supplies votes without touching it. */
export type RelationVotes = Record<number, RelationVote>

const CODES: Record<number, Relation> = { 1: 'same', 2: 'completes' }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Read the reserved key. Anything that is not a clean pair naming a
 *  real sentence and a real item means new for that sentence only. */
export function readRelationVotes(raw: unknown, sentenceCount: number, itemCount: number): RelationVotes {
  const votes: RelationVotes = {}
  if (!isRecord(raw) || itemCount === 0) return votes
  for (const [key, value] of Object.entries(raw)) {
    const sentence = Number(key)
    if (!Number.isInteger(sentence) || sentence < 1 || sentence > sentenceCount) continue
    if (!Array.isArray(value) || value.length !== 2) continue
    const [code, item] = value
    if (typeof code !== 'number' || typeof item !== 'number') continue
    const relation = CODES[code]
    if (!relation || !Number.isInteger(item) || item < 1 || item > itemCount) continue
    votes[sentence] = { relation, item }
  }
  return votes
}

export type HeldReason = 'unsure' | 'same' | 'completes' | 'done-before'

export interface RelatedLine {
  /** Index among the sentences sent. */
  local: number
  vote: RelationVote
  item: ContextItem
}

/**
 * Split the sure lines into the ones a vote tied to a filed item and
 * the ones that file. A task or an idea is compared both ways. A note
 * is compared for completion only: a report that something is done is
 * naturally a past-tense statement, which the model labels a note, so
 * it can complete an item; but a note files nowhere, so it is never a
 * duplicate of one (live finding 2026-09-22). A vote naming an item
 * outside the context counts for nothing.
 */
export function pickRelated(
  sure: readonly number[],
  labels: readonly string[],
  relations: RelationVotes,
  items: readonly ContextItem[]
): { related: RelatedLine[]; kept: number[] } {
  const related: RelatedLine[] = []
  const kept: number[] = []
  for (const i of sure) {
    const label = labels[i]
    const vote = relations[i + 1]
    const item = vote ? items[vote.item - 1] : undefined
    const compared = label === 'task' || label === 'idea' || vote?.relation === 'completes'
    if (compared && vote && item) related.push({ local: i, vote, item })
    else kept.push(i)
  }
  return { related, kept }
}

/** Why a related line is held, given the item it was tied to: a match
 *  to a finished item reads as "you finished this before" whatever the
 *  vote said. */
export function heldReasonFor(vote: RelationVote, item: ContextItem): HeldReason {
  if (item.done) return 'done-before'
  return vote.relation
}
