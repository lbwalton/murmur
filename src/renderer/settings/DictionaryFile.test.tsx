// SPDX-License-Identifier: GPL-3.0-only
// Custom words (US-183): the list keeps its group, Import and Export
// are its last line, settings search finds them, and the line beside
// them counts the words.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AskFirst } from './AskFirst'
import { GroupRow } from './controls'
import { FILE_TIPS } from '../../shared/dictionary-file'
import { fileNote, useDictionaryFile } from './DictionaryFile'

const app = readFileSync(join(__dirname, 'App.tsx'), 'utf8')

/** The group as App.tsx draws it: the list, the buttons, then the rest. */
function CustomWords(props: { count: number }): React.JSX.Element {
  const wordsFile = useDictionaryFile(props.count)
  return (
    <GroupRow label="Custom words" after={wordsFile.after}>
      <div className="well">the list</div>
      {wordsFile.buttons}
    </GroupRow>
  )
}

const render = (count: number): string => renderToStaticMarkup(<CustomWords count={count} />)

describe('Import and Export under Custom words', () => {
  it('sits in the Custom words group in Settings, where settings search finds it', () => {
    const start = app.indexOf('label="Custom words"')
    const group = app.slice(start, app.indexOf('label="Expansions"', start))
    expect(group).toContain('after={wordsFile.after}')
    expect(group.indexOf('<div className="well">')).toBeLessThan(group.indexOf('{wordsFile.buttons}'))
    expect(group.indexOf('{wordsFile.buttons}')).toBeLessThan(group.indexOf('</GroupRow>'))
    const keywords = /keywords="([^"]*)"/.exec(group)?.[1] ?? ''
    for (const word of ['vocabulary', 'names', 'import', 'export', 'csv', 'json', 'backup', 'encoding', 'quotes']) {
      expect(keywords.split(' ')).toContain(word)
    }
  })

  it('has Import and Export after the list, inside the same box', () => {
    const html = render(3)
    const box = html.slice(html.indexOf('group-rows'), html.indexOf('well-file-after'))
    expect(box.indexOf('the list')).toBeLessThan(box.indexOf('Import…'))
    expect(box.indexOf('Import…')).toBeLessThan(box.indexOf('Export…'))
  })

  it('keeps the question and its result on the group card: after the box, before the card ends', () => {
    // On the bare window the question's text falls under 4.5 to 1 over
    // a white page, and an empty block there doubles the gap to the
    // next group (review gate, 2026-11-21).
    const html = render(3)
    expect(html).toMatch(/<\/div><div class="well-file-after">.*<\/div><\/section>$/)
    expect(html.match(/<section/g)).toHaveLength(1)
    expect(app).not.toMatch(/^\s*\{wordsFile\.after\}\s*$/m)
  })

  it('leaves Import pressable while it asks, so cancel can hand focus back to it', () => {
    const source = readFileSync(join(__dirname, 'DictionaryFile.tsx'), 'utf8')
    const importButton = source.slice(source.indexOf('ref={importRef}'), source.indexOf('Import…'))
    expect(importButton).toContain('disabled={busy}')
    expect(importButton).not.toContain('aria-expanded')
    expect(render(3)).not.toContain('aria-expanded')
    // Export waits for the answer: its save window would freeze the question's buttons.
    const exportButton = source.slice(source.indexOf('Import…'), source.indexOf('Export…'))
    expect(exportButton).toContain('disabled={busy || ask !== null || count === 0}')
  })

  it('has the main process send the window the new list, and the window take it', () => {
    // The window keeps its own copy of the list, and Add and Remove write
    // that copy back: without this an import is undone by the next word
    // typed (review gate, 2026-11-21).
    const main = readFileSync(join(__dirname, '..', '..', 'main', 'dictionary-file.ts'), 'utf8')
    const handler = main.slice(main.indexOf("ipc.handle('dictionary:import'"), main.indexOf("ipc.handle('dictionary:drop'"))
    expect(handler).toContain("webContents.send('settings:pushed', settings)")
    expect(main).toMatch(/changed\?\.\(updateSettings\(\{ dictionary: plan\.next \}\)\)/)
    expect(app).toContain('bridge().onSettingsPushed(setSettings)')
  })

  it('has nothing to export from an empty list, and can always import', () => {
    const buttons = (html: string): string[] => html.match(/<button[^>]*>(Import…|Export…)<\/button>/g) ?? []
    const [importEmpty, exportEmpty] = buttons(render(0))
    expect(importEmpty).not.toContain('disabled')
    expect(exportEmpty).toContain('disabled')
    const [, exportFull] = buttons(render(2))
    expect(exportFull).not.toContain('disabled')
  })

  it('asks nothing and says nothing until a file is picked, with the result line always there to be heard', () => {
    const html = render(3)
    expect(html).not.toContain('ask-first')
    expect(html).toMatch(/<p class="visually-hidden"[^>]*role="status"><\/p>/)
  })

  it('says what a file needs and where the reader can go wrong, under the buttons and on the card', () => {
    // The limits are said where the file is picked, never only in the
    // docs (LB, 2026-11-21).
    const html = render(3)
    const tips = html.slice(html.indexOf('<details class="well-file-tips">'), html.indexOf('</details>'))
    expect(tips).toContain('<summary class="well-file-tips-summary">What a file needs, and what can go wrong</summary>')
    for (const tip of FILE_TIPS) expect(tips).toContain(`<li>${tip}</li>`)
    expect(html.indexOf('Export…')).toBeLessThan(html.indexOf('well-file-tips'))
    expect(html.indexOf('well-file-tips')).toBeLessThan(html.indexOf('well-file-after'))
    // Closed until wanted, and there before the list holds a word.
    expect(html).not.toMatch(/<details[^>]* open/)
    expect(render(0)).toContain('<details class="well-file-tips">')
  })

  it('counts the words beside the buttons', () => {
    expect(fileNote(0)).toBe('A CSV or JSON list: heard as, written as.')
    expect(fileNote(1)).toBe('1 word. A CSV or JSON list: heard as, written as.')
    expect(fileNote(1204)).toBe('1,204 words. A CSV or JSON list: heard as, written as.')
  })
})

describe('AskFirst, for a question that deletes nothing', () => {
  const ask = (plain: boolean): string =>
    renderToStaticMarkup(
      <AskFirst id="q" question="Import names.csv?" confirm="import 9" keep="cancel" plain={plain} busy={false} onConfirm={() => undefined} onKeep={() => undefined} />
    )

  it('keeps red for deleting: an import button is plain', () => {
    expect(ask(true)).not.toContain('danger-btn')
    expect(ask(false)).toContain('danger-btn')
  })
})

describe('styles', () => {
  const css = readFileSync(join(__dirname, 'styles.css'), 'utf8')

  it('keeps the file note grey on the card, with a marker that turns when it opens', () => {
    expect(css).toMatch(/\.well-file-tips \{[^}]*color: var\(--text-dim\);/)
    expect(css).toMatch(/\.well-file-tips-summary::after \{[^}]*content: '▸';/)
    expect(css).toMatch(/details\[open\] > \.well-file-tips-summary::after \{[^}]*content: '▾';/)
    // No hairline between the buttons and the note under them.
    expect(css).toMatch(/\.group-rows > \.well-file-tips \{\s*border-top: 0;/)
  })

  it('scrolls a long list in its box, so hundreds of words never run down the page', () => {
    expect(css).toMatch(/\.well-list \{[^}]*max-height: 416px;[^}]*overflow-y: auto;/)
  })

  it('never traps the wheel over the list: at its end the page scrolls on', () => {
    expect(css.slice(css.indexOf('.well-list {'), css.indexOf('}', css.indexOf('.well-list {')))).not.toContain('overscroll-behavior')
  })

  it('gives the question and its result no room when there is nothing to say', () => {
    expect(css).not.toMatch(/\.well-file-after \{/)
  })
})
