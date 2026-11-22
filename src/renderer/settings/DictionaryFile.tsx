// SPDX-License-Identifier: GPL-3.0-only
// Import and Export for Settings, Dictionary, Custom words (US-183).
// The buttons are the last line of the list's box; the question and
// its result sit under the box, on the same card. Import asks first, in
// place, with what the file would add and change, and only a yes
// touches the list. The main process reads the file and writes the
// list; this only asks and says what happened.
import { useEffect, useRef, useState } from 'react'
import {
  type DictionaryPick,
  exportedMessage,
  importQuestion,
  importedMessage,
  pickMessage
} from '../../shared/dictionary-file'
import type { SettingsApi } from '../../preload/settings'
import { AskFirst } from './AskFirst'

const bridge = (): SettingsApi => window.murmur

type Ready = Extract<DictionaryPick, { status: 'ready' }>

/** The line beside the buttons: how many words, and what a file holds. */
export function fileNote(count: number): string {
  const kind = 'A CSV or JSON list: heard as, written as.'
  if (count === 0) return kind
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'word' : 'words'}. ${kind}`
}

/**
 * The 2 halves of the row, sharing 1 state: `buttons` goes inside the
 * Custom words box after the list, `after` goes under the box, on the
 * group's card. `count` is how many words the list holds: Export has
 * nothing to do at 0.
 */
export function useDictionaryFile(count: number): { buttons: React.JSX.Element; after: React.JSX.Element } {
  const [ask, setAsk] = useState<Ready | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const importRef = useRef<HTMLButtonElement>(null)
  const messageRef = useRef<HTMLParagraphElement>(null)

  // A question left open when the row goes away takes its words with it.
  useEffect(() => () => void bridge().dropDictionaryImport(), [])

  const say = (text: string): void => {
    setMessage(text)
    if (text !== '') messageRef.current?.focus()
  }
  const failed = (what: string) => (error: unknown) => {
    console.error(`[murmur] dictionary ${what} failed:`, error)
    say(what === 'export' ? 'Could not save the file. Try again in a moment.' : 'Could not import that file. Try again in a moment.')
  }

  const pick = (): void => {
    setBusy(true)
    setAsk(null)
    setMessage('')
    void bridge()
      .pickDictionaryFile()
      .then((picked) => {
        if (picked.status === 'ready' && importQuestion(picked) !== null) setAsk(picked)
        else say(pickMessage(picked))
      })
      .catch(failed('import'))
      .finally(() => setBusy(false))
  }
  const cancel = (): void => {
    setAsk(null)
    void bridge().dropDictionaryImport()
    importRef.current?.focus()
  }
  const confirm = (token: string): void => {
    setBusy(true)
    void bridge()
      .importDictionary(token)
      .then((result) => say(importedMessage(result)))
      .catch(failed('import'))
      .finally(() => {
        setBusy(false)
        setAsk(null)
      })
  }
  const save = (): void => {
    setBusy(true)
    setMessage('')
    void bridge()
      .exportDictionary()
      .then((result) => say(exportedMessage(result)))
      .catch(failed('export'))
      .finally(() => setBusy(false))
  }

  // Import stays pressable while its question is open, as Clear all
  // does: cancel hands focus back to it, and a disabled button cannot
  // take focus. Pressed again, it asks about another file.
  const buttons = (
    <div className="well-file">
      <button
        ref={importRef}
        type="button"
        className="btn quiet-btn"
        disabled={busy}
        aria-controls={ask !== null ? 'dictionary-import-confirm' : undefined}
        onClick={pick}
      >
        Import…
      </button>
      <button type="button" className="btn quiet-btn" disabled={busy || ask !== null || count === 0} onClick={save}>
        Export…
      </button>
      <span className="well-file-note">{fileNote(count)}</span>
    </div>
  )
  const after = (
    <div className="well-file-after">
      {ask !== null && (
        <AskFirst
          id="dictionary-import-confirm"
          question={importQuestion(ask) ?? ''}
          confirm={busy ? 'importing' : `import ${(ask.added + ask.changed).toLocaleString('en-US')}`}
          keep="cancel"
          plain
          busy={busy}
          onConfirm={() => confirm(ask.token)}
          onKeep={cancel}
        />
      )}
      {/* Always mounted, so screen readers hear the result. */}
      <p className={message ? 'waiting-message' : 'visually-hidden'} ref={messageRef} tabIndex={-1} role="status">
        {message}
      </p>
    </div>
  )
  return { buttons, after }
}
