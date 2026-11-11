// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'
import { ShortcutsSection, captureProblem, clearedShortcut, shortcutsOf } from './Shortcuts'

const read = (name: string): string => readFileSync(join(__dirname, name), 'utf8')
const base: Settings = {
  ...DEFAULT_SETTINGS,
  hotkey: { ...DEFAULT_SETTINGS.hotkey, mode: 'hold', doubleTap: true, pasteLastBinding: 'Ctrl+F12' },
  notes: { ...DEFAULT_SETTINGS.notes, binding: 'Ctrl+Alt+N' },
  transform: { ...DEFAULT_SETTINGS.transform, binding: '' }
}
const allGood = { hookStarted: true, bindingValid: true, pasteBindingValid: true, noteBindingValid: true, transformBindingValid: true }
const draw = (settings: Settings, hotkeys = allGood): string =>
  renderToStaticMarkup(
    <ShortcutsSection settings={settings} hotkeys={hotkeys} onUpdate={async () => undefined} onRefresh={async () => undefined} />
  )

describe('Shortcuts: every key combo in 1 place (US-164)', () => {
  it('lists the 4 shortcuts with their combos, each pointing at its own section', () => {
    const list = shortcutsOf(base, allGood)
    expect(list.map((s) => [s.kind, s.label, s.binding, s.home.anchor, s.home.name])).toEqual([
      ['dictation', 'Dictation', DEFAULT_SETTINGS.hotkey.binding, 'row-hotkey', 'Dictation'],
      ['pasteLast', 'Paste last dictation', 'Ctrl+F12', 'row-paste-last-dictation', 'Dictation'],
      ['note', 'Note', 'Ctrl+Alt+N', 'row-note-chord', 'Notes'],
      ['transform', 'Transform', '', 'row-transform-chord', 'Transform']
    ])
    expect(list.every((s) => !s.disarmed)).toBe(true)
    // The rows it points at exist where it says.
    const app = read('App.tsx')
    expect(app).toContain('anchor="row-hotkey"')
    expect(app).toContain('label="Paste last dictation"')
    expect(read('NotesPanel.tsx')).toContain('anchor="row-note-chord"')
    expect(read('TransformPanel.tsx')).toContain('anchor="row-transform-chord"')
  })

  it('says when a saved shortcut is not listening, and never for one that is not set', () => {
    const list = shortcutsOf(base, { ...allGood, noteBindingValid: false, transformBindingValid: false })
    expect(list.find((s) => s.kind === 'note')?.disarmed).toBe(true)
    expect(list.find((s) => s.kind === 'transform')?.disarmed).toBe(false)
    const html = draw(base, { ...allGood, noteBindingValid: false })
    expect(html.match(/Not listening: it clashes with another shortcut here/g)).toHaveLength(1)
  })

  it('draws both groups, the combos on capture buttons, and Clear only where there is something to clear', () => {
    const html = draw(base)
    expect(html).toContain('id="sec-shortcuts"')
    expect([...html.matchAll(/class="group-title"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Yours to set', 'Built in'])
    expect([...html.matchAll(/class="row" id="(row-shortcut-[a-zA-Z-]+)"( data-mirror="")?/g)].map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['row-shortcut-dictation', true],
      ['row-shortcut-paste-last', true],
      ['row-shortcut-note', true],
      ['row-shortcut-transform', true],
      ['row-shortcut-hands-free', false],
      ['row-shortcut-cancel', false],
      ['row-shortcut-zoom', false]
    ])
    expect(html).toContain('aria-label="Note shortcut, Ctrl+Alt+N. Click to change."')
    expect(html).toContain('aria-label="Transform shortcut, not set. Click to change."')
    expect(html.match(/>Clear</g)).toHaveLength(2)
    expect(html).not.toContain('>Reset<')
    expect(html.match(/also under/g)).toHaveLength(4)
    expect(html).toContain('aria-label="Paste last dictation, under Dictation"')
    expect(html).toContain('Tap the dictation or note shortcut twice')
    const moved = draw({ ...base, hotkey: { ...base.hotkey, binding: 'Ctrl+Shift+D' } })
    expect(moved).toContain('aria-label="Reset the dictation shortcut"')
  })

  it('shows hands-free as on or off, with where to turn it on', () => {
    expect(draw(base)).toContain('<span class="mono-dim">double-tap</span>')
    const off = draw({ ...base, hotkey: { ...base.hotkey, doubleTap: false } })
    expect(off).toContain('<span class="mono-dim">off</span>')
    expect(off).toContain('Turn on Double-tap for hands-free under Dictation')
    expect(draw({ ...base, hotkey: { ...base.hotkey, mode: 'toggle' } })).toContain('<span class="mono-dim">off</span>')
  })

  it('explains each reason a combo is turned down', () => {
    expect(captureProblem('needs-modifier')).toContain('single letters would fire while typing')
    expect(captureProblem('needs-key')).toContain('needs a regular key too')
    expect(captureProblem('collides')).toContain('already another shortcut here')
    expect(captureProblem(undefined)).toContain('not captured')
  })

  it('clears a shortcut, and resets dictation instead of leaving murmur without one', () => {
    expect(clearedShortcut('dictation')).toEqual({ hotkey: { binding: DEFAULT_SETTINGS.hotkey.binding } })
    expect(clearedShortcut('pasteLast')).toEqual({ hotkey: { pasteLastBinding: '' } })
    expect(clearedShortcut('note')).toEqual({ notes: { binding: '' } })
    expect(clearedShortcut('transform')).toEqual({ transform: { binding: '' } })
  })

  it('sits in the rail after Dictation, inside its own guard, and search lists each shortcut once', () => {
    const app = read('App.tsx')
    expect(app).toMatch(/id: 'dictation'[^\n]+\n\s+\{ id: 'shortcuts', title: 'Shortcuts', group: 'essentials' \},\n\s+\{ id: 'dictionary'/)
    expect(app).toMatch(/<SectionGuard id="shortcuts" title="Shortcuts">\s*<ShortcutsSection[^>]+\/>\s*<\/SectionGuard>\s*<Section id="dictionary"/)
    expect(read('SettingsRail.tsx')).toContain(".row[id]:not([data-mirror])")
  })

  it('names no one and keeps murmur lowercase', () => {
    const html = draw(base)
    expect(html).not.toMatch(/LaBroi|Walton|\bLB\b|Murmur/)
  })
})
