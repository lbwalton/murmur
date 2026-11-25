// SPDX-License-Identifier: GPL-3.0-only
// Keep it current, in Settings, Dictionary (US-184, US-185): where the
// rows sit, what the switch promises before it is turned on, and that a
// suggestion is a question whose words stay off the screen under Hide
// words.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'
import { KeepCurrentRows, LEARN_DESC, LEARN_KEEPS_NOTHING, LEARN_MAC_ONLY, Suggestions, hiddenSuggestions } from './LearnPanel'

const app = readFileSync(join(__dirname, 'App.tsx'), 'utf8')
const source = readFileSync(join(__dirname, 'LearnPanel.tsx'), 'utf8')
const list = [
  { heard: 'shiv on', written: 'Siobhan', count: 2 },
  { heard: 'git hub', written: 'GitHub', count: 5 }
]
const rows = (settings: Settings): string =>
  renderToStaticMarkup(
    <KeepCurrentRows settings={settings} hotkeys={null} onUpdate={async () => undefined} onRefresh={async () => undefined} />
  )

describe('Keep it current, under Custom words', () => {
  it('is its own group between Custom words and Expansions, where settings search finds both rows', () => {
    const custom = app.indexOf('label="Custom words"')
    const group = app.indexOf('<Group id="keep-current" title="Keep it current">')
    const expansions = app.indexOf('label="Expansions"')
    expect(custom).toBeGreaterThan(-1)
    expect(custom).toBeLessThan(group)
    expect(group).toBeLessThan(expansions)
    expect(app.slice(group, expansions)).toContain('<KeepCurrentRows settings={settings} hotkeys={hotkeys} onUpdate={update} onRefresh={refresh} />')
    const html = rows(DEFAULT_SETTINGS)
    expect(html).toContain('id="row-fix-word-chord"')
    expect(html).toContain('id="row-learn-fixes"')
    for (const word of ['correct', 'spelling', 'chord', 'shortcut']) expect(html).toMatch(new RegExp(`id="row-fix-word-chord" data-keywords="[^"]*\\b${word}\\b`))
    for (const word of ['automatic', 'learn', 'suggestions', 'privacy']) expect(html).toMatch(new RegExp(`id="row-learn-fixes" data-keywords="[^"]*\\b${word}\\b`))
  })

  it('starts with both off: no chord set, the switch off, and nothing suggested', () => {
    expect(DEFAULT_SETTINGS.learn).toEqual({ watch: false, fixBinding: '' })
    const html = rows(DEFAULT_SETTINGS)
    expect(html).toContain('aria-label="Fix a word chord. Click to change.">not set<')
    expect(html).toMatch(/role="switch" class="switch" aria-checked="false" aria-label="Learn from my fixes"/)
    expect(html).not.toContain('row-suggested-words')
    expect(html).not.toContain('>Clear<')
    // A set chord shows, with a way to clear it and the way back to Shortcuts.
    const set = rows({ ...DEFAULT_SETTINGS, learn: { watch: false, fixBinding: 'Ctrl+Shift+F9' } })
    expect(set).toContain('>Ctrl+Shift+F9<')
    expect(set).toContain('>Clear<')
    expect(set).toContain('row-also')
  })

  it('says what learning does before it is turned on: every promise, in plain words', () => {
    const html = rows(DEFAULT_SETTINGS)
    expect(html).toContain(LEARN_DESC)
    for (const said of [
      'Off until you turn it on',
      'the active text box in the app in front, normally the box it just typed into',
      'up to 1 minute',
      'on this computer',
      'in 2 takes',
      'only your yes adds it',
      'the Accessibility permission murmur already has',
      'never reads a box your Mac marks as a password',
      'never saved or sent',
      'only the pair of words you fixed is kept',
      'for as long as your history setting keeps words'
    ]) {
      expect(LEARN_DESC).toContain(said)
    }
    for (const copy of [LEARN_DESC, LEARN_MAC_ONLY, LEARN_KEEPS_NOTHING, hiddenSuggestions(2)]) {
      expect(copy).not.toMatch(/Murmur|—|–|--| - /)
      expect(copy).not.toMatch(/\b(one|two|three)\b/i)
    }
  })

  it('holds the switch off, with the reason, where learning cannot run', () => {
    // The reasons come from the main process: no Mac, or a history
    // setting that keeps no words.
    expect(source).toContain('unsupported ? LEARN_MAC_ONLY : !state.keeps ? LEARN_KEEPS_NOTHING : undefined')
    // Held off only where it cannot run. While it waits on the history
    // setting it is still the person's to turn off.
    expect(source).toContain('checked={learn.watch && !unsupported}')
    expect(source).toContain('disabled={unsupported}')
    expect(source).toContain("describedBy={waits !== undefined ? 'row-learn-fixes-waits' : undefined}")
  })
})

describe('Suggested words', () => {
  const draw = (hide: boolean, items = list): string =>
    renderToStaticMarkup(<Suggestions list={items} hide={hide} busy={false} onAnswer={() => undefined} />)

  it('asks about each fix: the pair, how often it was made, and 2 answers', () => {
    const html = draw(false)
    expect(html).toContain('id="row-suggested-words"')
    expect(html).toContain('shiv on → Siobhan')
    expect(html).toContain('You made this fix in 2 takes.')
    expect(html).toContain('You made this fix in 5 takes.')
    expect(html.match(/>Add</g)).toHaveLength(2)
    expect(html.match(/>Not this</g)).toHaveLength(2)
    // Add is a rule for every later take, and the row says so.
    expect(html).toContain('from then on murmur writes that word this way in every take')
    expect(html).toContain('aria-label="Add shiv on → Siobhan to your dictionary"')
    expect(html).toContain('aria-label="Not this: stop suggesting git hub → GitHub"')
    // Not this deletes nothing the person has: it is not a red button.
    expect(html).not.toContain('danger-btn')
  })

  it('draws nothing when there is nothing to suggest', () => {
    expect(draw(false, [])).toBe('')
    expect(draw(true, [])).toBe('')
  })

  it('keeps every word off the screen under Hide words, and says how many wait', () => {
    const html = draw(true)
    expect(html).not.toMatch(/shiv|Siobhan|git hub|GitHub/)
    expect(html).toContain('2 suggestions are hidden while Hide words is on.')
    expect(html).not.toContain('<button')
    expect(hiddenSuggestions(1)).toBe('1 suggestion is hidden while Hide words is on.')
  })

  it('shows only while learning is on, and passes the Hide words setting through', () => {
    expect(source).toContain('{learn.watch && state !== null && (')
    expect(source).toContain('hide={props.settings.history.hideWords}')
  })
})

describe('styles', () => {
  const css = readFileSync(join(__dirname, 'styles.css'), 'utf8')

  it('lets a long pair wrap inside its row, never push the buttons off the card', () => {
    expect(css).toMatch(/\.suggest-item \{[^}]*flex-wrap: wrap;/)
    expect(css).toMatch(/\.suggest-text \.well-pair \{[^}]*overflow-wrap: anywhere;/)
  })
})
