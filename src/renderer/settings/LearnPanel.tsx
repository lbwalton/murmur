// SPDX-License-Identifier: GPL-3.0-only
// Keep it current, in Settings, Dictionary (US-184, US-185): the 2 ways
// a word murmur keeps getting wrong reaches the dictionary. Fix a word
// is a chord: select the word, press it, type the spelling. Learn from
// my fixes is a switch, off until it is turned on: murmur looks at the
// box it just typed into, counts spelling fixes, and suggests the ones
// it sees again. A suggestion is a question, and only a yes adds a word.
import { useEffect, useState } from 'react'
import type { HotkeysStatus, LearnState, SettingsApi } from '../../preload/settings'
import { LEARN_REPEATS, LEARN_WATCH_SECONDS, pairText, seenLine } from '../../shared/learn'
import type { Settings } from '../../shared/settings'
import { captureProblem } from './Shortcuts'
import { AlsoInShortcuts, Row, Switch } from './controls'

const bridge = (): SettingsApi => window.murmur

/** What Learn from my fixes does, said before it is turned on. Every
 *  clause is a promise the watcher keeps (src/main/learn). */
export const LEARN_DESC = `Off until you turn it on. After murmur types a take, it looks at that same text box for up to ${LEARN_WATCH_SECONDS / 60} minute, on this computer, to see whether you fix a word. On a Mac that uses the Accessibility permission murmur already has. A fix you make in ${LEARN_REPEATS} takes shows here as a suggestion, and only your yes adds it. murmur never reads a box your Mac marks as a password. The text it reads is never saved or sent: only the pair of words you fixed is kept, on this computer, for as long as your history setting keeps words.`

export const LEARN_MAC_ONLY = 'On a Mac only, for now. Fix a word works here today.'
export const LEARN_KEEPS_NOTHING = 'Keep history for is set to keep no text, so murmur keeps no fixes to count.'

/** The line that stands in for the suggestions while Hide words is on. */
export function hiddenSuggestions(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'suggestion is' : 'suggestions are'} hidden while Hide words is on.`
}

/** The list of fixes murmur is ready to add, each a question. */
export function Suggestions(props: {
  list: LearnState['suggestions']
  hide: boolean
  busy: boolean
  onAnswer: (heard: string, written: string, how: 'add' | 'dismiss') => void
}): React.JSX.Element | null {
  if (props.list.length === 0) return null
  return (
    <Row
      label="Suggested words"
      anchor="row-suggested-words"
      block
      keywords="suggestions learned fixes corrections approve"
      desc="Fixes murmur saw you make more than once. Add puts the pair in Custom words, and from then on murmur writes that word this way in every take. Not this means murmur stops asking about it."
    >
      {props.hide ? (
        <p className="suggest-hidden dim">{hiddenSuggestions(props.list.length)}</p>
      ) : (
        <ul className="suggest-list">
          {props.list.map((fix) => (
            <li className="suggest-item" key={`${fix.heard}\n${fix.written}`}>
              <span className="suggest-text">
                <span className="well-pair">{pairText(fix)}</span>
                <span className="suggest-seen dim">{seenLine(fix.count)}</span>
              </span>
              <span className="inline">
                <button
                  type="button"
                  className="btn"
                  disabled={props.busy}
                  aria-label={`Add ${pairText(fix)} to your dictionary`}
                  onClick={() => props.onAnswer(fix.heard, fix.written, 'add')}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="btn quiet-btn"
                  disabled={props.busy}
                  aria-label={`Not this: stop suggesting ${pairText(fix)}`}
                  onClick={() => props.onAnswer(fix.heard, fix.written, 'dismiss')}
                >
                  Not this
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Row>
  )
}

/** The rows of the Keep it current group. */
export function KeepCurrentRows(props: {
  settings: Settings
  hotkeys: HotkeysStatus | null
  onUpdate: (partial: Partial<Settings>) => Promise<void>
  onRefresh: () => Promise<unknown>
}): React.JSX.Element {
  const learn = props.settings.learn
  const [capturing, setCapturing] = useState(false)
  const [captureNote, setCaptureNote] = useState<string | null>(null)
  const [state, setState] = useState<LearnState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void bridge().getLearnState().then(setState)
    return bridge().onLearnChanged(setState)
  }, [])
  // A switch flipped, a word added by hand, or history's settings
  // changed: ask again what there is to suggest.
  useEffect(() => {
    void bridge().getLearnState().then(setState)
  }, [learn.watch, props.settings.dictionary, props.settings.history.retentionDays])

  const update = async (partial: Partial<Settings['learn']>): Promise<void> => {
    // The store deep-merges, so only the changed field travels.
    await props.onUpdate({ learn: partial as Settings['learn'] })
  }

  const startCapture = async (): Promise<void> => {
    if (capturing) return
    setCapturing(true)
    setCaptureNote(null)
    try {
      const result = await bridge().captureHotkey('fix')
      if (result.ok) await props.onRefresh()
      else setCaptureNote(captureProblem(result.reason))
    } finally {
      setCapturing(false)
    }
  }

  const answer = (heard: string, written: string, how: 'add' | 'dismiss'): void => {
    setBusy(true)
    void bridge()
      .answerSuggestion(heard, written, how)
      .then(setState)
      .catch((error: unknown) => console.error('[murmur] suggestion answer failed:', (error as Error | null)?.name ?? 'error'))
      .finally(() => setBusy(false))
  }

  const disarmed = learn.fixBinding !== '' && props.hotkeys !== null && !props.hotkeys.fixBindingValid
  // Where learning cannot run at all (no Mac yet) the switch is held
  // off. Where it is only waiting on the history setting, the switch
  // stays the person's to turn off, and shows what they chose.
  const unsupported = state !== null && !state.supported
  const waits = state === null ? undefined : unsupported ? LEARN_MAC_ONLY : !state.keeps ? LEARN_KEEPS_NOTHING : undefined

  return (
    <>
      <Row
        label="Fix a word"
        anchor="row-fix-word-chord"
        also={<AlsoInShortcuts slug="fix-word" label="Fix a word" />}
        keywords="correct correction spelling misheard wrong word teach chord hotkey shortcut keyboard"
        desc={
          captureNote ??
          (disarmed
            ? 'This chord is disarmed: it clashes with your dictation hotkey or another chord, or no longer parses. Capture a new one.'
            : 'Select a word murmur got wrong, in any app, press this, and type how it should be written. murmur fixes it there and saves the pair here, so it comes out right from then on. Off until you set one; a modifier plus an F-key is safest.')
        }
      >
        <div className="inline">
          <button
            className={`field capture ${capturing ? 'capture-live' : ''}`}
            aria-label="Fix a word chord. Click to change."
            onClick={() => void startCapture()}
          >
            {capturing ? 'press keys…' : learn.fixBinding === '' ? 'not set' : learn.fixBinding}
          </button>
          {learn.fixBinding !== '' && (
            <button
              className="btn btn-remove"
              onClick={() => {
                setCaptureNote(null)
                void update({ fixBinding: '' })
              }}
            >
              Clear
            </button>
          )}
        </div>
      </Row>

      <Row
        label="Learn from my fixes"
        anchor="row-learn-fixes"
        keywords="auto automatic learn corrections watch suggest suggestions accessibility privacy"
        desc={LEARN_DESC}
        waits={waits}
      >
        <Switch
          checked={learn.watch && !unsupported}
          label="Learn from my fixes"
          disabled={unsupported}
          describedBy={waits !== undefined ? 'row-learn-fixes-waits' : undefined}
          onChange={(next) => void update({ watch: next })}
        />
      </Row>

      {learn.watch && state !== null && (
        <Suggestions list={state.suggestions} hide={props.settings.history.hideWords} busy={busy} onAnswer={answer} />
      )}
    </>
  )
}
