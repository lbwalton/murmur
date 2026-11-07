// SPDX-License-Identifier: GPL-3.0-only
// Hide words (US-145). Each surface is rendered for real, off and on: off
// proves the word would be there to find, on proves it is not in the
// markup at all, attributes included.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '../../shared/history'
import { WORDS_HIDDEN } from '../../shared/history'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import type { NotesStatus } from '../../preload/settings'
import { HIDE_WORDS_LINE, HideWordsRow, REPORT_HIDDEN, TRY_HIDDEN, TakeWords, TryBox } from './HideWords'
import { LogWords, WhatYouSaid } from './HomeView'
import { heldLabel, heldPhrase } from './NotesPanel'
import { ReportTake } from './ReportPanel'
import { WrapUpTake } from './WrapUpView'

const WORD = 'zebrafinch'

const take: SessionEvent = {
  at: 1,
  durationMs: 4000,
  rawText: `um the ${WORD} sang`,
  finalText: `The ${WORD} sang.`,
  words: 3,
  wpm: 120
}

function both(render: (hide: boolean) => React.JSX.Element): { shown: string; hidden: string } {
  return { shown: renderToStaticMarkup(render(false)), hidden: renderToStaticMarkup(render(true)) }
}

function expectMasked(render: (hide: boolean) => React.JSX.Element): string {
  const { shown, hidden } = both(render)
  expect(shown.toLowerCase()).toContain(WORD)
  expect(hidden.toLowerCase()).not.toContain(WORD)
  return hidden
}

describe('the words of a log row', () => {
  it('leaves a dictation out and says so', () => {
    expect(expectMasked((hide) => <LogWords event={take} hide={hide} />)).toContain(WORDS_HIDDEN)
  })

  it('leaves a note out', () => {
    expectMasked((hide) => <LogWords event={{ ...take, kind: 'note' }} hide={hide} />)
  })

  it('leaves out both halves of a transform, the instruction and the original', () => {
    const event: SessionEvent = { ...take, kind: 'transform', rawText: `make the ${WORD} louder` }
    const hidden = expectMasked((hide) => <LogWords event={event} hide={hide} />)
    expect(hidden).not.toContain('you said')
    expect(hidden).toContain('original')
    expect(renderToStaticMarkup(<LogWords event={{ ...event, finalText: 'Other.' }} hide={false} />)).toContain(WORD)
    expect(renderToStaticMarkup(<LogWords event={{ ...event, finalText: 'Other.' }} hide={true} />)).not.toContain(WORD)
  })

  it('leaves out a transform that was never sent', () => {
    expectMasked((hide) => <LogWords event={{ ...take, kind: 'transform', unsent: true }} hide={hide} />)
  })

  it('leaves a take with no words saying what it said', () => {
    const empty: SessionEvent = { ...take, rawText: '', finalText: '' }
    const { shown, hidden } = both((hide) => <LogWords event={empty} hide={hide} />)
    expect(hidden).toBe(shown)
  })
})

describe('what you said', () => {
  const said = (hide: boolean): React.JSX.Element => <WhatYouSaid id="said-1" event={take} hide={hide} />

  it('leaves the words out', () => {
    expectMasked(said)
  })

  it('keeps the count and the copy', () => {
    const hidden = renderToStaticMarkup(said(true))
    expect(hidden).toContain('Copy what you said')
    expect(hidden).toContain('removed')
  })
})

describe('report this take', () => {
  const report = (hide: boolean): React.JSX.Element => (
    <ReportTake id="report-1" event={take} settings={DEFAULT_SETTINGS} hide={hide} onClose={() => undefined} />
  )

  it('closes with a plain sentence, and no field or button that could send', () => {
    const hidden = expectMasked(report)
    expect(hidden).toContain(REPORT_HIDDEN)
    expect(hidden).not.toContain('<textarea')
    expect(hidden).not.toContain('<button')
  })
})

describe('the wrap-up takes', () => {
  it('keeps the numbers and leaves the words out', () => {
    const hidden = expectMasked((hide) => <WrapUpTake event={take} hide={hide} />)
    expect(hidden).toContain('3w · 120wpm')
    expect(hidden).toContain(WORDS_HIDDEN)
  })
})

describe('held lines in the notes panel', () => {
  const line: NotesStatus['heldLines'][number] = {
    id: 1,
    position: 0,
    text: `Feed the ${WORD}.`,
    label: 'task',
    reason: 'same',
    lead: { text: `${WORD} chores:`, position: 0 },
    match: { file: 'tasks', text: `Water the ${WORD}.`, checkbox: true, done: false }
  } as never

  it('takes the line and its lead out of the label the rail search reads', () => {
    expect(heldLabel(line, false)).toContain(WORD)
    expect(heldLabel(line, true)).not.toContain(WORD)
  })

  it.each(['same', 'completes', 'done-before'] as const)('takes the matched item out of a %s line', (reason) => {
    expect(heldPhrase({ ...line, reason }, false)).toContain(WORD)
    expect(heldPhrase({ ...line, reason }, true)).not.toContain(WORD)
  })
})

describe('the Hide words switch', () => {
  const row = (anchor: string, hideWords: boolean): string =>
    renderToStaticMarkup(
      <HideWordsRow
        settings={{ ...DEFAULT_SETTINGS, history: { ...DEFAULT_SETTINGS.history, hideWords } }}
        anchor={anchor}
        onUpdate={async () => undefined}
      />
    )

  it('reads the stored setting, so Home and Settings show the same value', () => {
    expect(row('home-hide-words', true)).toContain('aria-checked="true"')
    expect(row('row-hide-words', true)).toContain('aria-checked="true"')
    expect(row('home-hide-words', false)).toContain('aria-checked="false"')
    expect(row('row-hide-words', false)).toContain('aria-checked="false"')
  })

  it('says what it hides and what it does not', () => {
    expect(row('row-hide-words', false)).toContain('Hide words')
    expect(HIDE_WORDS_LINE).toContain('while you share your screen or film')
    expect(HIDE_WORDS_LINE).toContain('It does not hide what lands in other apps.')
  })
})

describe('the practice box', () => {
  it('is gone, because a disabled box still shows what is in it', () => {
    const hidden = renderToStaticMarkup(<TryBox hide className="field trybox" rows={2} />)
    expect(hidden).not.toContain('<textarea')
    expect(hidden).toContain(TRY_HIDDEN)
    expect(renderToStaticMarkup(<TryBox hide={false} className="field trybox" rows={2} />)).toContain('<textarea')
  })
})

describe('TakeWords', () => {
  it('never renders the words behind a style', () => {
    expect(renderToStaticMarkup(<TakeWords text={WORD} hide />)).toBe(`<p class="log-text dim">${WORDS_HIDDEN}</p>`)
  })
})

/** Every place the renderer reads dictated words. A new line here is a
 *  new way for words to reach the screen: mask it under Hide words, then
 *  add it to this list. */
const WORD_READS: Record<string, string[]> = {
  'HomeView.tsx': [
    'const words = heardWords(props.event.rawText, props.event.finalText)', // shown only when not hidden
    '.copyText(props.event.rawText)', // a click, never the page
    '<p className="log-instruction dim">you said: {event.rawText}</p>', // behind !hide
    '<TakeWords text={event.finalText} hide={hide} />',
    'await bridge().copyText(event.finalText)' // a click, never the page
  ],
  'NotesPanel.tsx': [
    "const item = line.match?.text ?? ''", // heldPhrase, behind hide
    "return `Held: ${line.lead ? `${line.lead.text.replace(/:$/, '')}: ` : ''}${line.text}`", // heldLabel, behind hide
    '? result.body' // the reminder test, masked in main
  ],
  'ReportPanel.tsx': [
    'const [said, setSaid] = useState(event.rawText)', // the panel never mounts while hidden
    'const [typed, setTyped] = useState(event.finalText)'
  ],
  'WrapUpView.tsx': ['{event.finalText.length > 0 ? (', '<TakeWords text={event.finalText} hide={hide} />']
}

const READS_WORDS = /\b(?:finalText|rawText)\b|\bnote\.line\b|\bline\.(?:text|lead)\b|\.match\?\.text\b|\bresult\.body\b/

describe('where the renderer reads dictated words', () => {
  const root = join(__dirname, '..')
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(
    (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)
  )

  it('finds the renderer', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('is exactly the masked list above', () => {
    const found: Record<string, string[]> = {}
    for (const file of files) {
      const lines = readFileSync(join(root, file), 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => READS_WORDS.test(line) && !line.startsWith('//') && !line.startsWith('*'))
      if (lines.length > 0) found[file.split(/[\\/]/).pop() as string] = lines
    }
    expect(found).toEqual(WORD_READS)
  })
})
