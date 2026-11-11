// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Group, GroupRow, Row, Switch } from './controls'
import { NotesPanel } from './NotesPanel'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'

const read = (name: string): string => readFileSync(join(__dirname, name), 'utf8')
const app = read('App.tsx')
const notes = read('NotesPanel.tsx')
const transform = read('TransformPanel.tsx')
const css = read('styles.css')

/** The Group ids inside 1 Section of App.tsx, in page order. */
function groupsOf(section: string): string[] {
  const start = app.indexOf(`<Section id="${section}"`) === -1 ? app.indexOf(`id="${section}"\n`) : app.indexOf(`<Section id="${section}"`)
  const body = app.slice(start, app.indexOf('</Section>', start))
  return [...body.matchAll(/<Group(?:Row)?\s+(?:id|label)="([^"]+)"/g)].map((m) => m[1])
}

describe('every Settings section is grouped, with rows in a well (US-155)', () => {
  it('draws a group as a titled panel with its rows in a well, or a bare well when it has no title', () => {
    const titled = renderToStaticMarkup(
      <Group id="hotkey" title="Hotkey">
        <p>row</p>
      </Group>
    )
    expect(titled).toContain('<section class="group" id="group-hotkey" aria-labelledby="group-hotkey-title">')
    expect(titled).toContain('<h3 class="group-title" id="group-hotkey-title">Hotkey</h3>')
    expect(titled).toContain('<div class="group-rows"><p>row</p></div>')
    expect(titled).not.toContain('group-sub')
    const bare = renderToStaticMarkup(
      <Group id="look">
        <p>row</p>
      </Group>
    )
    expect(bare).toBe('<section class="group" id="group-look"><div class="group-rows"><p>row</p></div></section>')
  })

  it('folds a group from its heading, and says what is inside while closed', () => {
    const fold = renderToStaticMarkup(
      <Group id="file-layout" title="File layout" sub="Inbox files." fold={{ tag: '6 settings' }}>
        <p>row</p>
      </Group>
    )
    expect(fold).toMatch(/^<details class="group group-fold" id="group-file-layout">/)
    expect(fold).toContain('<summary class="group-summary"><h3 class="group-title"')
    expect(fold).toContain('<span class="group-tag">6 settings</span>')
    expect(fold).not.toContain(' open')
  })

  it('makes a list its own group that search still reads as a row', () => {
    const list = renderToStaticMarkup(
      <GroupRow label="Custom words" desc="Names." keywords="vocabulary">
        <i>list</i>
      </GroupRow>
    )
    expect(list).toContain('class="group group-row row" id="row-custom-words" data-keywords="vocabulary"')
    expect(list).toContain('<h3 class="group-title row-label" id="row-custom-words-title">Custom words</h3>')
    expect(list).toContain('<p class="group-sub row-desc">Names.</p>')
    expect(list).toContain('<div class="group-rows row-control"><i>list</i></div>')
    // Search names it once: the label, not the label again as its group.
    expect(read('SettingsRail.tsx')).toContain("row.matches('.group') ? ''")
  })

  it('dims a row that waits on another setting and says what it needs', () => {
    const waiting = renderToStaticMarkup(
      <Row label="Smart lists" waits="needs Full formatting">
        <i />
      </Row>
    )
    expect(waiting).toContain('class="row row-waits" id="row-smart-lists"')
    expect(waiting).toContain('<div class="row-waits-note" id="row-smart-lists-waits">needs Full formatting</div>')
    // The switch names that line, so a screen reader says why it is off limits.
    expect(renderToStaticMarkup(<Switch checked label="Smart lists" disabled describedBy="row-smart-lists-waits" onChange={() => undefined} />)).toContain(
      'aria-describedby="row-smart-lists-waits" disabled=""'
    )
    expect(app).toContain("describedBy={needsFull ? 'row-smart-lists-waits' : undefined}")
    expect(app).toContain("describedBy={needsFull ? 'row-apply-corrections-waits' : undefined}")
    expect(renderToStaticMarkup(<Row label="Smart lists"><i /></Row>)).toContain('class="row" id="row-smart-lists"')
    expect(app).toContain("settings.formatting.level === 'full' ? undefined : 'needs Full formatting'")
    expect(app.match(/waits=\{needsFull\}/g)).toHaveLength(2)
    expect(app.match(/disabled=\{needsFull !== undefined\}/g)).toHaveLength(2)
  })

  it('groups each section the way LaBroi approved on 2026-11-11', () => {
    expect(groupsOf('provider')).toEqual(['speech', 'cleanup', 'keys', 'cost'])
    expect(groupsOf('dictation')).toEqual(['hotkey', 'microphone', 'formatting', 'landing', 'Try it'])
    expect(groupsOf('dictionary')).toEqual(['Custom words', 'Expansions'])
    expect(groupsOf('timeback')).toEqual(['timeback'])
    expect(groupsOf('history')).toEqual(['history'])
    expect(groupsOf('look')).toEqual(['look'])
    expect(groupsOf('system')).toEqual(['general', 'perms', 'help'])
    const groupIds = (source: string): string[] => [...source.matchAll(/<Group\s+id="([^"]+)"/g)].map((m) => m[1])
    expect(groupIds(notes)).toEqual(['held', 'capture', 'sorting', 'note-alerts', 'file-layout'])
    expect(groupIds(transform)).toEqual(['transform'])
    // Only groups that sort a long list carry a heading.
    for (const id of ['timeback', 'history', 'look', 'transform', 'pro']) {
      expect(`${app}${notes}${transform}`).not.toMatch(new RegExp(`<Group\\s+id="${id}"\\s+title=`))
    }
  })

  it('keeps the rows in their approved order, each inside its approved group', () => {
    // The body of 1 Group, so a row that drifts to another group fails.
    const inGroup = (source: string, id: string): string => {
      const start = source.search(new RegExp(`<Group\\s+id="${id}"`))
      expect(start, id).toBeGreaterThan(-1)
      return source.slice(start, source.indexOf('</Group>', start))
    }
    const holds = (body: string, marks: string[]): void => {
      let at = -1
      for (const mark of marks) {
        const next = body.indexOf(mark, at + 1)
        expect(next, mark).toBeGreaterThan(at)
        at = next
      }
    }
    holds(inGroup(app, 'speech'), ['row-speech-provider', 'row-speech-model', 'row-base-url', '<PlainHttpNote', 'anchor="row-key"'])
    holds(inGroup(app, 'cost'), ['label="Estimated cost"', 'label="Price refresh"', 'label="Groq defaults"'])
    holds(inGroup(app, 'hotkey'), ['anchor="row-hotkey"', 'label="Trigger"', 'label="Double-tap for hands-free"', 'label="Loop once it settles"'])
    holds(inGroup(app, 'microphone'), ['<MicRow'])
    holds(inGroup(app, 'formatting'), ['anchor="row-formatting"', 'label="Smart lists"', 'label="Apply corrections"'])
    holds(inGroup(app, 'landing'), ['label="Insert by"', 'label="Paste last dictation"'])
    holds(inGroup(app, 'timeback'), ['label="Typing speed"', 'label="Daily recap"', 'label="Milestone alerts"'])
    holds(inGroup(app, 'look'), ['label="Waveform"', 'label="Overlay look"', 'label="Accent"', 'label="Theme"'])
    holds(inGroup(app, 'general'), ['label="Sounds"', 'label="Start at login"', '<UpdatesRow'])
    holds(inGroup(app, 'perms'), ['anchor="row-perm-mic"', 'anchor="row-axs"', 'anchor="row-input"'])
    holds(inGroup(app, 'help'), ['label="Diagnostics"', 'label="Setup wizard"'])
    holds(inGroup(app, 'history'), ['<HistorySettings'])
    holds(read('HistorySettings.tsx'), ['row-keep-history', 'row-encrypt-words', 'row-hide-words', 'row-clear-history'])
    holds(inGroup(notes, 'capture'), ['anchor="row-note-chord"', 'anchor="row-notes-folder"', 'label="Last note"'])
    holds(inGroup(notes, 'sorting'), ['anchor="row-notes-sort"', 'anchor="row-sort-connection"', 'anchor="row-sort-threshold"'])
    holds(inGroup(notes, 'note-alerts'), ['anchor="row-note-receipts"', 'anchor="row-notes-reminders"'])
    holds(inGroup(notes, 'file-layout'), ['anchor="row-inbox-file"', 'label="Tasks file"', 'label="Ideas file"', 'label="Group under"', 'label="Name each note"', 'label="Entry"', 'label="Defaults"'])
    holds(inGroup(transform, 'transform'), ['anchor="row-transform-chord"', 'anchor="row-transform-keep"', 'anchor="row-transform-connection"'])
    // Try it and the 2 lists come after the groups of their sections.
    holds(app, ['<Group id="landing"', 'anchor="row-try-it"', '<Section id="dictionary"', 'label="Custom words"', 'label="Expansions"'])
  })

  it('renames Formatting to Level without moving its link name, and gives each permission its own', () => {
    expect(app).toMatch(/label="Level"\s+anchor="row-formatting"\s+keywords="formatting /)
    expect(app).not.toContain('anchor="row-mic"')
    expect(read('MicRow.tsx')).toContain('anchor="row-mic"')
  })

  it('shows only the chord and the folder until a notes folder is set', () => {
    const draw = (folder: string): string => {
      const settings: Settings = { ...DEFAULT_SETTINGS, notes: { ...DEFAULT_SETTINGS.notes, folder } }
      return renderToStaticMarkup(
        <NotesPanel
          settings={settings}
          catalog={null}
          hotkeys={null}
          onUpdate={async () => undefined}
          onRefresh={async () => undefined}
          onKeysChanged={() => undefined}
        />
      )
    }
    const rowIds = (html: string): string[] => [...html.matchAll(/class="row[^"]*" id="([^"]+)"/g)].map((m) => m[1])
    const off = draw('')
    expect(rowIds(off)).toEqual(['row-note-chord', 'row-notes-folder'])
    expect(off).toContain('Sorting, alerts and file layout show here once you pick a notes folder.')
    expect(off).not.toContain('group-title')
    const on = draw('/notes')
    expect(rowIds(on).slice(0, 5)).toEqual(['row-note-chord', 'row-notes-folder', 'row-last-note', 'row-notes-sort', 'row-note-receipts'])
    expect(rowIds(on)).toContain('row-inbox-file')
    expect([...on.matchAll(/class="group-title"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Capture', 'Sorting', 'Alerts', 'File layout'])
    expect(on).not.toContain('show here once you pick')
    // 1 tree for both states: the 2 rows keep their place, so picking a
    // folder with the keyboard keeps focus on the button pressed.
    expect(notes.match(/anchor="row-note-chord"/g)).toHaveLength(1)
    expect(notes.match(/anchor="row-notes-folder"/g)).toHaveLength(1)
  })

  it('asks Runs on the same way for cleanup, sorting and transforms', () => {
    for (const source of [notes, transform]) {
      expect(source).toContain("connection: 'Runs on'")
      expect(source).toContain("separateOption: 'Its own provider'")
      expect(source).toMatch(/provider: 'Provider',\s+baseUrl: 'Base URL',\s+model: 'Model',\s+key: 'Key'/)
      expect(source).not.toContain('API keys list')
    }
    expect(notes).toContain("ariaName: 'Sort'")
    expect(transform).toContain("ariaName: 'Transform'")
  })

  it('shows the Mac notifications line on Macs only, and has no Advanced fold', () => {
    expect(app).toMatch(/note=\{\s+isMac\s+\? 'Nothing appearing\?/)
    expect(`${app}${notes}`).not.toContain('<Advanced')
    expect(app).not.toContain('under Advanced')
  })

  it('finds all 4 shortcuts when you search shortcut, hotkey or chord (LaBroi, 2026-11-11)', () => {
    const keywords = (source: string, anchorOrLabel: string): string => {
      const at = source.indexOf(anchorOrLabel)
      return /keywords="([^"]+)"/.exec(source.slice(at))?.[1] ?? ''
    }
    const rows = [
      keywords(app, 'anchor="row-hotkey"'),
      keywords(app, 'label="Paste last dictation"'),
      keywords(notes, 'anchor="row-note-chord"'),
      keywords(transform, 'anchor="row-transform-chord"')
    ]
    for (const words of rows) {
      // Hotkey's own label carries the word hotkey.
      for (const word of ['shortcut', 'chord']) expect(words.split(' '), words).toContain(word)
    }
    for (const words of rows.slice(1)) expect(words.split(' ')).toContain('hotkey')
  })

  it('steps the type 28, 20, 15, 14 and keeps row labels a dimmer cream from the tokens', () => {
    expect(css).toMatch(/\.settings-content \.page-title h1 \{\s+font-size: 28px;\s+font-weight: 700;/)
    expect(css).toMatch(/\.sec-title \{\s+font-size: 20px;\s+font-weight: 700;/)
    expect(css).toMatch(/\.group-title \{\s+margin: 0;\s+font-size: 15px;\s+font-weight: 600;/)
    expect(css).toMatch(/\.group-rows \.row-label \{\s+font-size: 14px;\s+font-weight: 400;\s+color: color-mix\(in srgb, var\(--text\) 90%, var\(--ink\)\);/)
    expect(css).toMatch(/\.row-desc \{\s+color: var\(--text-dim\);\s+font-size: 12\.5px;/)
    expect(css).not.toContain('sec-grouped')
  })
})
