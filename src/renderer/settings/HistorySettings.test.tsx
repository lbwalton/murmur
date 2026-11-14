// SPDX-License-Identifier: GPL-3.0-only
// History in Settings (US-148): the rows that left the bottom of Home are
// all here under their anchors, Clear all says what it will do before it
// asks, and Home's 1-line rule matches the setting.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KEEP_24_HOURS, KEEP_FOREVER, KEEP_NO_TEXT } from '../../shared/history'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import { HistorySettings, clearAllLine } from './HistorySettings'
import { keptLine } from './HomeView'

describe('HistorySettings', () => {
  const html = renderToStaticMarkup(<HistorySettings settings={DEFAULT_SETTINGS} onUpdateSettings={async () => undefined} />)

  it('holds Keep history for, Encrypt saved words, Hide words, and Clear all under their anchors', () => {
    for (const anchor of ['row-keep-history', 'row-encrypt-words', 'row-hide-words', 'row-clear-history']) {
      expect(html).toContain(`id="${anchor}"`)
    }
  })

  it('keeps every Keep history choice', () => {
    for (const value of [KEEP_NO_TEXT, KEEP_24_HOURS, 30, 90, 365, KEEP_FOREVER]) {
      expect(html).toContain(`value="${value}"`)
    }
  })

  it('lets settings search find the rows by the words people type', () => {
    expect(html).toMatch(/data-keywords="[^"]*retention/)
    expect(html).toMatch(/data-keywords="[^"]*encrypt/)
    expect(html).toMatch(/data-keywords="[^"]*delete/)
  })
})

describe('clearAllLine', () => {
  it('says nothing until it knows the count, then what Clear all removes', () => {
    expect(clearAllLine(null)).toBe('')
    expect(clearAllLine(0)).toBe('Your history is empty.')
    expect(clearAllLine(1)).toContain('the 1 entry')
    expect(clearAllLine(1204)).toContain('all 1,204 entries')
    expect(clearAllLine(1204)).toContain('asks first')
  })
})

describe('keptLine', () => {
  it('says the Keep history rule in 1 line for Home', () => {
    expect(keptLine(30)).toBe('Kept 30 days on this computer.')
    expect(keptLine(90)).toBe('Kept 90 days on this computer.')
    expect(keptLine(365)).toBe('Kept a year on this computer.')
    expect(keptLine(KEEP_FOREVER)).toBe('Kept on this computer until you clear it.')
    expect(keptLine(KEEP_24_HOURS)).toBe('Words are kept 24 hours on this computer.')
    expect(keptLine(KEEP_NO_TEXT)).toBe('Words are not kept on this computer.')
  })
})
