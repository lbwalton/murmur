// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { type ReportInput, REPORT_ADDRESS, blankMailtoUrl, fitsMailto, isReportMailto, mailtoUrl, reportBody } from './report'

const input: ReportInput = {
  said: 'send it tuesday sorry wednesday',
  typed: 'Send it Tuesday, sorry, Wednesday.',
  shouldHaveBeen: 'Send it Wednesday.',
  version: '0.1.17',
  platform: 'macOS arm64',
  level: 'full',
  smartLists: true,
  corrections: false,
  speechModel: 'whisper-large-v3-turbo',
  cleanupModel: 'openai/gpt-oss-120b'
}

describe('reportBody', () => {
  it('holds what the person sees and nothing else', () => {
    expect(reportBody(input)).toBe(
      [
        'What I said:',
        'send it tuesday sorry wednesday',
        '',
        'What murmur typed:',
        'Send it Tuesday, sorry, Wednesday.',
        '',
        'What it should have been:',
        'Send it Wednesday.',
        '',
        'murmur 0.1.17 on macOS arm64',
        'Formatting: full, Smart lists on, Apply corrections off',
        'Models: whisper-large-v3-turbo for speech, openai/gpt-oss-120b for cleanup'
      ].join('\n')
    )
  })

  it('says so when the last field is empty', () => {
    expect(reportBody({ ...input, shouldHaveBeen: '  ' })).toContain('(not filled in)')
  })

  it('cannot carry a key, a base URL, the dictionary, or expansions, even when they sit beside it', () => {
    const marked = {
      ...input,
      apiKey: 'sk-MARKEDKEY',
      baseUrl: 'https://MARKED.example/v1',
      dictionary: [{ from: 'MARKEDWORD', to: 'x' }],
      expansions: [{ trigger: 'MARKEDTRIGGER', text: 'x' }],
      audio: 'MARKEDAUDIO',
      settings: DEFAULT_SETTINGS
    }
    expect(reportBody(marked as ReportInput)).not.toMatch(/MARKED|sk-|https:/)
  })
})

describe('mailto links', () => {
  it('goes to support with the subject the 90 day cleanup looks for', () => {
    const url = mailtoUrl('hello there')
    expect(url.startsWith(`mailto:${REPORT_ADDRESS}?subject=murmur%20report`)).toBe(true)
    expect(decodeURIComponent(url)).toContain('body=hello there')
  })

  it('survives what people dictate', () => {
    const url = new URL(mailtoUrl('50% & more? a=b\nnext line #1'))
    expect(url.searchParams.get('body')).toBe('50% & more? a=b\nnext line #1')
  })

  it('knows when a report is too long for a link', () => {
    expect(fitsMailto('short')).toBe(true)
    expect(fitsMailto('word '.repeat(1000))).toBe(false)
  })

  it('only ever lets its own 2 shapes through', () => {
    expect(isReportMailto(mailtoUrl('x'))).toBe(true)
    expect(isReportMailto(blankMailtoUrl())).toBe(true)
    for (const url of ['https://example.com', 'mailto:someone@else.com?subject=x', `mailto:${REPORT_ADDRESS}`, 'file:///etc/passwd']) {
      expect(isReportMailto(url), url).toBe(false)
    }
  })
})
