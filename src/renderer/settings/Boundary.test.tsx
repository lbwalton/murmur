// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Boundary, CRASH_TEXT, CrashNote, ROOT_OPTIONS, crashLine } from './Boundary'
import { Section } from './controls'

describe('a part that hit a problem (US-163)', () => {
  it('logs where, the name and a capped message, nothing else', () => {
    expect(crashLine('section provider', new TypeError('x is not a function'))).toBe(
      '[settings] problem in section provider: TypeError: x is not a function'
    )
    const long = crashLine('page home', new Error('a'.repeat(500) + '\n  at Secret (file.ts:1)'))
    expect(long).toBe(`[settings] problem in page home: Error: ${'a'.repeat(80)}`)
    // A thrown string is all input, so only its kind is logged.
    expect(crashLine('the window', 'thrown text')).toBe('[settings] problem in the window: string')
    expect(crashLine('the window', new Error(''))).toBe('[settings] problem in the window: Error')
  })

  it('takes out whatever a message quoted, so no words ride along', () => {
    let parsed: unknown
    try {
      parsed = JSON.parse('my private words')
    } catch (error) {
      parsed = error
    }
    const json = crashLine('section history', parsed)
    expect(json).toContain('SyntaxError')
    expect(json).not.toMatch(/private|words/)
    let pattern: unknown
    try {
      pattern = new RegExp('secret(')
    } catch (error) {
      pattern = error
    }
    expect(crashLine('section notes', pattern)).not.toContain('secret')
    let inner: unknown
    try {
      inner = JSON.parse('x"secret one"y')
    } catch (error) {
      inner = error
    }
    expect(crashLine('section notes', inner)).not.toContain('secret')
    expect(crashLine('page home', new TypeError("Cannot read properties of undefined (reading 'text')"))).toBe(
      '[settings] problem in page home: TypeError: Cannot read properties of undefined (reading'
    )
  })

  it('shows Try again and Reload window for a section or a page, Reload window alone for the window', () => {
    const section = renderToStaticMarkup(<CrashNote kind="section" onRetry={() => undefined} />)
    expect(section).toContain('data-crashed="section"')
    expect(section).toContain('role="alert"')
    expect(section).toContain(CRASH_TEXT.section.title)
    expect(section).toContain('Dictation still works')
    expect(section.indexOf('Try again')).toBeLessThan(section.indexOf('Reload window'))

    const page = renderToStaticMarkup(<CrashNote kind="page" onRetry={() => undefined} />)
    expect(page).toContain('This page hit a problem')

    const window = renderToStaticMarkup(<CrashNote kind="window" />)
    expect(window).toContain('class="crash-window"')
    expect(window).toContain('data-crashed="window"')
    expect(window).not.toContain('Try again')
    expect(window).toContain('Reload window')
    // The whole-window note is not the app's shell, so settingsRenderer
    // fails along with settingsUnbroken.
    expect(window).not.toContain('shell')
  })

  it('passes a working part through untouched, and every section sits inside one', () => {
    expect(renderToStaticMarkup(<Boundary kind="page" where="page home"><p>fine</p></Boundary>)).toBe('<p>fine</p>')
    const html = renderToStaticMarkup(
      <Section id="dictation" title="Dictation">
        <p>row</p>
      </Section>
    )
    expect(html).toContain('<div class="sec-groups"><p>row</p></div>')
    const controls = readFileSync(join(__dirname, 'controls.tsx'), 'utf8')
    expect(controls).toMatch(/<Boundary kind="section" where=\{`section \$\{props\.id\}`\}>/)
  })

  it('turns off React\'s own log of a caught problem, wraps the window, and keys each page', () => {
    expect(ROOT_OPTIONS.onCaughtError()).toBeUndefined()
    const main = readFileSync(join(__dirname, 'main.tsx'), 'utf8')
    expect(main).toContain('createRoot(container, ROOT_OPTIONS)')
    expect(main).toMatch(/<Boundary kind="window"[^>]*>\s*<App \/>/)
    const app = readFileSync(join(__dirname, 'App.tsx'), 'utf8')
    expect(app).toContain('<Boundary key={page} kind="page"')
    // A page's cleanup that throws as it closes is logged by a boundary
    // that stays mounted, never shown over the next page.
    expect(app).toMatch(/<Boundary kind="page" where="a page as it closed" logOnly>\s*\{page !== 'setup' && \(/)
    expect(app).toMatch(/<SectionGuard id="notes" title="Notes">\s*<NotesPanel/)
    expect(app).toMatch(/<SectionGuard id="transform" title="Transform">\s*<TransformPanel/)
  })

  it('logs a log-only frame\'s problem and keeps drawing its children', () => {
    expect(
      renderToStaticMarkup(
        <Boundary kind="page" where="a page as it closed" logOnly>
          <p>next page</p>
        </Boundary>
      )
    ).toBe('<p>next page</p>')
    const guarded = renderToStaticMarkup(
      <Section id="notes" title="Notes" note={<CrashNote kind="section" onRetry={() => undefined} />}>
        {null}
      </Section>
    )
    expect(guarded).toContain('id="sec-notes"')
    expect(guarded).toContain('Notes</h2>')
    expect(guarded).toContain('data-crashed="section"')
    expect(guarded).not.toContain('class="sec-groups"')
  })

  it('names no one and keeps murmur lowercase', () => {
    const text = Object.values(CRASH_TEXT).map((t) => t.title + ' ' + t.detail).join(' ')
    expect(text).not.toMatch(/LaBroi|Walton|\bLB\b|Murmur/)
  })
})
