// SPDX-License-Identifier: GPL-3.0-only
// Report this take (US-130). murmur has no server, so a report is an
// email the person sends from their own mail app, after seeing and
// editing every word of it. This builds the words. It takes only what
// is listed in ReportInput, so audio, keys, base URLs, the dictionary,
// expansions, and other takes have no way in.

export const REPORT_ADDRESS = 'support@murmurapp.app'
/** The 90 day cleanup finds a report by this start of the subject. */
export const REPORT_SUBJECT = 'murmur report: a take came out wrong'
/** Beyond this some mail apps cut a mailto link short, so the person
 *  copies the report and pastes it instead. */
const MAX_MAILTO_CHARS = 1900

export interface ReportInput {
  said: string
  typed: string
  shouldHaveBeen: string
  version: string
  platform: string
  level: string
  smartLists: boolean
  corrections: boolean
  speechModel: string
  cleanupModel: string
}

export function reportBody(input: ReportInput): string {
  const onOff = (value: boolean): string => (value ? 'on' : 'off')
  return [
    'What I said:',
    input.said.trim(),
    '',
    'What murmur typed:',
    input.typed.trim(),
    '',
    'What it should have been:',
    input.shouldHaveBeen.trim() || '(not filled in)',
    '',
    `murmur ${input.version} on ${input.platform}`,
    `Formatting: ${input.level}, Smart lists ${onOff(input.smartLists)}, Apply corrections ${onOff(input.corrections)}`,
    `Models: ${input.speechModel} for speech, ${input.cleanupModel} for cleanup`
  ].join('\n')
}

export function mailtoUrl(body: string): string {
  return `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(REPORT_SUBJECT)}&body=${encodeURIComponent(body)}`
}

/** A blank message to the same address, for a report copied by hand. */
export function blankMailtoUrl(): string {
  return `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(REPORT_SUBJECT)}`
}

export function fitsMailto(body: string): boolean {
  return mailtoUrl(body).length <= MAX_MAILTO_CHARS
}

/** The main process opens only these 2 shapes, so no page can turn the
 *  mail handler into a general way to open links. */
export function isReportMailto(url: string): boolean {
  return url.startsWith(`mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(REPORT_SUBJECT)}`)
}
