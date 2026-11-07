// SPDX-License-Identifier: GPL-3.0-only
// Hide words (US-145): people share their screen or film while using
// murmur, and encrypted history does not hide words on screen. While the
// setting is on, the words are never put in the page at all, so a title,
// a selection, or a hover has nothing to show. The switch, the masked
// words, and the words that say why live here, so Home and Settings can
// never disagree.
import { WORDS_HIDDEN } from '../../shared/history'
import type { Settings } from '../../shared/settings'
import { Row, Switch } from './controls'

export const HIDE_WORDS_LINE =
  "Hides your words in murmur's windows while you share your screen or film. It does not hide what lands in other apps."

/** Why Report is closed: a report's promise is that every word it would
 *  send is on screen first, and that cannot be true while they are hidden. */
export const REPORT_HIDDEN =
  'Report shows your words so you can check them before anything goes, so it is off while Hide words is on. Turn off Hide words to report this take.'

/** Why the practice box is gone: what you dictate into it is on screen. */
export const TRY_HIDDEN = 'This box is off while Hide words is on, because your words would show in it.'

/** The Hide words switch, on Home and in Settings. Both read and write
 *  the one stored setting. */
export function HideWordsRow(props: {
  settings: Settings
  /** Unique per place: Settings stays mounted behind Home. */
  anchor: string
  onUpdate: (partial: Partial<Settings>) => Promise<void>
}): React.JSX.Element {
  return (
    <Row
      label="Hide words"
      anchor={props.anchor}
      keywords="privacy private screen share sharing record recording film filming video demo stream blur mask"
      desc={HIDE_WORDS_LINE}
    >
      <Switch
        checked={props.settings.history.hideWords}
        label="Hide words"
        onChange={(hideWords) => void props.onUpdate({ history: { hideWords } } as Partial<Settings>)}
      />
    </Row>
  )
}

/** One take's words in a log, or the line that stands in for them. */
export function TakeWords(props: { text: string; hide: boolean }): React.JSX.Element {
  return props.hide ? <p className="log-text dim">{WORDS_HIDDEN}</p> : <p className="log-text">{props.text}</p>
}

/** The box to practice in. Hidden, it is not disabled but gone: a
 *  disabled box still shows what is in it. It reads the setting itself,
 *  so no caller can leave it showing. */
export function TryBox(props: { settings: Settings; className: string; rows: number; label?: string }): React.JSX.Element {
  if (props.settings.history.hideWords) return <p className="row-note">{TRY_HIDDEN}</p>
  return <textarea className={props.className} placeholder="dictate here…" rows={props.rows} aria-label={props.label} />
}
