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
  if (reason === 'http 429' || reason === 'rate limit') return "The provider's rate limit ran out; give it a minute."
  if (reason === 'timeout') return 'The model took too long to answer.'
  if (reason === 'network' || reason.startsWith('network ')) return 'murmur could not reach the model.'
  if (reason === 'http 401' || reason === 'http 403' || reason.startsWith('auth ')) return 'The provider turned the key down.'
  if (/^http 5\d\d$/.test(reason) || reason === 'overloaded') return 'The provider had a problem on its side.'
  if (reason === 'no connection') return 'No connection has a key to sort with.'
  if (reason.startsWith('write ')) return 'A tasks or ideas file could not be written.'
  if (CHECK_REASONS.has(reason) || reason.startsWith('response ')) return "The model's answer did not pass murmur's checks."
  return reason === '' ? 'The sort stopped.' : `The sort stopped (${reason}).`
}

export function sortTroubleTitle(report: SortTroubleReport): string {
  return report.outcome === 'filed' ? 'Sorted part of your note' : 'Sort did not finish'
}

export function sortTroubleBody(report: SortTroubleReport): string {
  const left = report.unsorted ?? 0
  const lines = left === 1 ? '1 line is' : `${left} lines are`
  const lead =
    report.outcome === 'filed' ? `${lines} still only in the inbox.` : 'Your note is safe in the inbox.'
  const how =
    report.outcome === 'filed'
      ? `Sort again under ${SORT_AGAIN_WHERE} sends just those.`
      : `Sort again is under ${SORT_AGAIN_WHERE}.`
  return `${lead} ${sortWhy(report.reason)} ${how}`
}
