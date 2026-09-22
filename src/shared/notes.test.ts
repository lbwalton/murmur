// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTE_ENTRY_TEMPLATE,
  DEFAULT_NOTE_PATH_TEMPLATE,
  appendSeparator,
  noteMoment,
  renderNoteEntry,
  renderTemplate,
  resolveNotePath
} from './notes'

// 2026-09-18 at 10:32 local time, with single-digit fields elsewhere
// to prove the zero padding.
const when = new Date(2026, 8, 18, 10, 32, 5)
const early = new Date(2026, 0, 3, 7, 4, 0)

describe('noteMoment', () => {
  it('renders local, zero-padded tokens', () => {
    expect(noteMoment(when)).toEqual({
      date: '2026-09-18',
      time: '10:32',
      datetime: '2026-09-18 10:32',
      year: '2026',
      month: '09',
      day: '18'
    })
    expect(noteMoment(early)).toEqual({
      date: '2026-01-03',
      time: '07:04',
      datetime: '2026-01-03 07:04',
      year: '2026',
      month: '01',
      day: '03'
    })
  })
})

describe('renderTemplate', () => {
  it('replaces known tokens and leaves unknown ones literal', () => {
    expect(renderTemplate('{date} at {time} {nope}', { date: 'D', time: 'T' })).toBe('D at T {nope}')
  })

  it('replaces every occurrence', () => {
    expect(renderTemplate('{day}-{day}', { day: '18' })).toBe('18-18')
  })
})

describe('resolveNotePath', () => {
  it('resolves the default template to the day file under the murmur inbox', () => {
    const r = resolveNotePath(DEFAULT_NOTE_PATH_TEMPLATE, when)
    expect(r).toEqual({ ok: true, relative: 'murmur/inbox/2026-09-18.md', segments: ['murmur', 'inbox', '2026-09-18.md'] })
  })

  it('renders time tokens filename-safe inside a path', () => {
    const r = resolveNotePath('log/{datetime}.md', when)
    expect(r.ok && r.relative).toBe('log/2026-09-18 10-32.md')
    const t = resolveNotePath('{time}.txt', when)
    expect(t.ok && t.relative).toBe('10-32.txt')
  })

  it('accepts backslashes and collapses repeated separators', () => {
    const r = resolveNotePath('Daily\\{year}\\\\{month}/{date}.md', when)
    expect(r.ok && r.segments).toEqual(['Daily', '2026', '09', '2026-09-18.md'])
  })

  it('accepts .txt and upper-case extensions', () => {
    expect(resolveNotePath('inbox/{date}.TXT', when).ok).toBe(true)
    expect(resolveNotePath('inbox/{date}.Md', when).ok).toBe(true)
  })

  it('rejects an empty or whitespace template', () => {
    expect(resolveNotePath('', when)).toEqual({ ok: false, reason: 'empty' })
    expect(resolveNotePath('   ', when)).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects absolute paths on every platform', () => {
    expect(resolveNotePath('/etc/{date}.md', when)).toEqual({ ok: false, reason: 'absolute' })
    expect(resolveNotePath('C:\\notes\\{date}.md', when)).toEqual({ ok: false, reason: 'absolute' })
    expect(resolveNotePath('\\\\server\\share\\{date}.md', when)).toEqual({ ok: false, reason: 'absolute' })
    expect(resolveNotePath('~/{date}.md', when)).toEqual({ ok: false, reason: 'absolute' })
  })

  it('rejects escapes out of the notes folder', () => {
    expect(resolveNotePath('../{date}.md', when)).toEqual({ ok: false, reason: 'escapes' })
    expect(resolveNotePath('inbox/../../{date}.md', when)).toEqual({ ok: false, reason: 'escapes' })
    expect(resolveNotePath('./{date}.md', when)).toEqual({ ok: false, reason: 'escapes' })
  })

  it('rejects a missing or wrong extension', () => {
    expect(resolveNotePath('inbox/{date}', when)).toEqual({ ok: false, reason: 'extension' })
    expect(resolveNotePath('inbox/{date}.html', when)).toEqual({ ok: false, reason: 'extension' })
    expect(resolveNotePath('inbox/.md', when)).toEqual({ ok: false, reason: 'extension' })
    expect(resolveNotePath('inbox/', when)).toEqual({ ok: false, reason: 'extension' })
  })

  it('rejects characters Windows cannot store and trailing dots or spaces', () => {
    expect(resolveNotePath('in<box>/{date}.md', when)).toEqual({ ok: false, reason: 'characters' })
    expect(resolveNotePath('inbox/{date}?.md', when)).toEqual({ ok: false, reason: 'characters' })
    expect(resolveNotePath('inbox /{date}.md', when)).toEqual({ ok: false, reason: 'characters' })
    expect(resolveNotePath('inbox./{date}.md', when)).toEqual({ ok: false, reason: 'characters' })
    expect(resolveNotePath('in\u0007box/{date}.md', when)).toEqual({ ok: false, reason: 'characters' })
  })

  it('rejects Windows device names as a folder or file name', () => {
    expect(resolveNotePath('CON.md', when)).toEqual({ ok: false, reason: 'reserved' })
    expect(resolveNotePath('nul/{date}.md', when)).toEqual({ ok: false, reason: 'reserved' })
    expect(resolveNotePath('inbox/com1.txt', when)).toEqual({ ok: false, reason: 'reserved' })
    expect(resolveNotePath('console/{date}.md', when).ok).toBe(true)
    expect(resolveNotePath('inbox/lpt10.md', when).ok).toBe(true)
  })

  it('never renders the text token into a path', () => {
    const r = resolveNotePath('{text}.md', when)
    expect(r.ok && r.relative).toBe('{text}.md')
  })
})

describe('renderNoteEntry', () => {
  it('renders the default entry as a time heading over the text with a blank line after', () => {
    expect(renderNoteEntry(DEFAULT_NOTE_ENTRY_TEMPLATE, 'Buy milk.', when)).toBe('## 10:32\n\nBuy milk.\n\n')
  })

  it('ends in one newline, or two when the template asks for a blank line', () => {
    expect(renderNoteEntry('- {time} {text}', 'a', when)).toBe('- 10:32 a\n')
    expect(renderNoteEntry('- {time} {text}\n', 'a', when)).toBe('- 10:32 a\n')
    expect(renderNoteEntry('{text}\n\n', 'a', when)).toBe('a\n\n')
    expect(renderNoteEntry('{text}\n\n\n\n', 'a', when)).toBe('a\n\n')
  })

  it('keeps every word even when the template forgot the text token', () => {
    expect(renderNoteEntry('## {time}', 'never lost', when)).toBe('## 10:32\n\nnever lost\n\n')
    expect(renderNoteEntry('', 'never lost', when)).toBe('## 10:32\n\nnever lost\n\n')
  })

  it('does not expand tokens that appear inside the dictated text', () => {
    expect(renderNoteEntry('{text}', 'say {date} out loud', when)).toBe('say {date} out loud\n')
  })

  it('renders time with a colon in entries', () => {
    expect(renderNoteEntry('{datetime}: {text}', 'x', when)).toBe('2026-09-18 10:32: x\n')
  })
})

describe('appendSeparator', () => {
  it('adds a newline only when the file has content that does not end in one', () => {
    expect(appendSeparator(null)).toBe('')
    expect(appendSeparator('')).toBe('')
    expect(appendSeparator('\n')).toBe('')
    expect(appendSeparator('x')).toBe('\n')
  })
})
