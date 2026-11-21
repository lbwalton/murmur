// SPDX-License-Identifier: GPL-3.0-only
// What murmur says when a sort could not finish (US-180). A sort runs
// after the note is safely in the inbox, so a failure never costs a
// word, but it used to cost the sort silently: the pill had already
// said noted to inbox, and only the Last note line in settings knew.
// The note receipt now says so instead, in plain words, with where Sort
// again lives. Pure, so tests pin the words; the words never include
// any of the note, so Hide words has nothing to take out.

/** The parts of a sort report the notice reads. */
export interface SortTroubleReport {
  outcome: 'filed' | 'rejected' | 'failed' | 'skipped'
  reason?: string
  /** Lines no answer covered, left in the inbox for Sort again. */
  unsorted?: number
}

/** Where Sort again is, as the screen names it. */
export const SORT_AGAIN_WHERE = 'Settings, Notes, Last note'

// The reasons validateSort gives a reply that fails its checks.
const CHECK_REASONS = new Set(['empty', 'not json', 'not an object', 'extra sentences', 'missing sentences', 'bad label'])

/** A sort left lines no answer covered: the receipt says so. */
export function sortTrouble(report: SortTroubleReport): boolean {
  return report.outcome !== 'skipped' && (report.unsorted ?? 0) > 0
}

/** Why, in a sentence, from a sort reason. */
export function sortWhy(reason = ''): string {
  if (reason === 'http 413') return 'The provider said it was too large to send, even 1 line at a time.'
  // Neutral on purpose: the limit may be per minute or per day.
  if (reason === 'http 429' || reason === 'rate limit') return "The provider's rate limit ran out for now."
  if (reason === 'timeout') return 'The model took too long to answer.'
  if (reason === 'network' || reason.startsWith('network ')) return 'murmur could not reach the model.'
  if (reason === 'http 401' || reason === 'http 403' || reason.startsWith('auth ')) return 'The provider turned the key down.'
  if (/^http 5\d\d$/.test(reason) || reason === 'overloaded') return 'The provider had a problem on its side.'
  if (reason === 'no connection') return 'No connection has a key to sort with.'
  if (/^http 4\d\d$/.test(reason)) return 'The provider turned the request down.'
  if (reason.startsWith('write ')) return 'A tasks or ideas file could not be written.'
  if (reason === 'paths') return 'The tasks or ideas file layout in settings could not be used.'
  if (CHECK_REASONS.has(reason) || reason.startsWith('response ') || reason.startsWith('validate')) {
    return "The model's answer did not pass murmur's checks."
  }
  // Plain words only: a code the list above does not know stays in the log.
  return 'The sort stopped.'
}

export function sortTroubleTitle(report: SortTroubleReport): string {
  return report.outcome === 'filed' ? 'Sorted part of your note' : 'Sort did not finish'
}

/** The notice's words. `time` names the note (09:30), never its words,
 *  so a notice about an older note can be told from the newest's. */
export function sortTroubleBody(report: SortTroubleReport, time = ''): string {
  const left = report.unsorted ?? 0
  const which = time ? `your note from ${time}` : 'your note'
  const lines = left === 1 ? `1 line of ${which} is` : `${left} lines of ${which} are`
  const lead =
    report.outcome === 'filed'
      ? `${lines} still only in the inbox.`
      : `${which.charAt(0).toUpperCase()}${which.slice(1)} is safe in the inbox.`
  const how =
    report.outcome === 'filed'
      ? `Sort again under ${SORT_AGAIN_WHERE} sends just those.`
      : `Sort again is under ${SORT_AGAIN_WHERE}.`
  return `${lead} ${sortWhy(report.reason)} ${how}`
}

/** The Last note line's words for lines of older notes still waiting
 *  (US-180), so they are never only in a notice; '' when none. */
export function waitingWords(waiting: { lines: number; notes: number }): string {
  if (waiting.lines === 0) return ''
  const lines = waiting.lines === 1 ? '1 line' : `${waiting.lines} lines`
  const from = waiting.notes === 1 ? 'an earlier note' : `${waiting.notes} earlier notes`
  const verb = waiting.lines === 1 ? 'is' : 'are'
  return `${lines} from ${from} ${verb} still waiting in the inbox, and Sort again sends ${waiting.lines === 1 ? 'it' : 'them'} too`
}
