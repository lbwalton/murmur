// SPDX-License-Identifier: GPL-3.0-only
// Settings, History (US-148): how long murmur keeps your dictations,
// whether their words are encrypted on disk, Hide words, and Clear all.
// These lived at the bottom of Home, under every dictation, where almost
// nobody found them (LaBroi, 2026-11-08). The asks and their wording are
// unchanged: a shorter keep and Clear all still ask first.
import { useEffect, useRef, useState } from 'react'
import { KEEP_24_HOURS, KEEP_NO_TEXT, type SealStatus } from '../../shared/history'
import type { SettingsApi } from '../../preload/settings'
import type { Settings } from '../../shared/settings'
import { AskFirst } from './AskFirst'
import { Row, Switch } from './controls'
import { HideWordsRow } from './HideWords'
import {
  DOUBLE_CLICK_MS,
  HISTORY_CLEARED,
  clearAllQuestion,
  keepLine,
  sealLine,
  shorterKeepQuestion
} from './HomeView'

const bridge = (): SettingsApi => window.murmur

/** What the Clear all row says before anything is asked. */
export function clearAllLine(count: number | null): string {
  if (count === null) return ''
  if (count === 0) return 'Your history is empty.'
  const what = count === 1 ? 'the 1 entry' : `all ${count.toLocaleString()} entries`
  return `Removes ${what} from this computer. It asks first, and it cannot be undone.`
}

export function HistorySettings(props: {
  settings: Settings
  onUpdateSettings: (partial: Partial<Settings>) => Promise<void>
}): React.JSX.Element {
  const [count, setCount] = useState<number | null>(null)
  const [keepAsk, setKeepAsk] = useState<{ value: number; question: string } | null>(null)
  // Clear all asks first (US-099): the whole log's count while the
  // question is open, null while it is closed.
  const [clearAsk, setClearAsk] = useState<number | null>(null)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState<string | null>(null)
  const [sealStatus, setSealStatus] = useState<SealStatus | null>(null)
  const clearRef = useRef<HTMLButtonElement>(null)
  const clearedRef = useRef<HTMLParagraphElement>(null)
  // While the count is on its way, and when the question opened: a
  // second click of a double click never closes it again.
  const counting = useRef(false)
  const askedAt = useRef(0)
  const { retentionDays, encrypt } = props.settings.history

  const refreshCount = (): void => {
    void bridge()
      .countHistory()
      .then(setCount)
      .catch((error: unknown) => console.error('[murmur] could not count history:', error))
  }

  useEffect(() => {
    refreshCount()
    const offAppended = bridge().onHistoryAppended(() => {
      refreshCount()
      // Clear all clears what lands while it asks too, so it counts it.
      setClearAsk((asked) => (asked === null ? asked : asked + 1))
      setCleared(null)
    })
    const offChanged = bridge().onHistoryChanged(refreshCount)
    return () => {
      offAppended()
      offChanged()
    }
  }, [])

  useEffect(() => {
    void bridge().getHistorySealStatus().then(setSealStatus)
  }, [encrypt, cleared, retentionDays])

  useEffect(() => {
    if (cleared) clearedRef.current?.focus()
  }, [cleared])

  const applyKeep = (value: number): void => {
    setKeepAsk(null)
    void props.onUpdateSettings({ history: { retentionDays: value } } as Partial<Settings>).then(refreshCount)
  }
  const chooseKeep = async (value: number): Promise<void> => {
    setKeepAsk(null)
    // Asked on every change: going from Don't keep to 30 days is longer
    // for words, and still removes old entries with their numbers.
    const { takes, recordings } = await bridge().getKeepImpact(value)
    const question = shorterKeepQuestion(value, takes, recordings)
    if (question === '') applyKeep(value)
    else setKeepAsk({ value, question })
  }
  const askClear = (): void => {
    if (counting.current) return
    if (clearAsk !== null) {
      if (performance.now() - askedAt.current >= DOUBLE_CLICK_MS) setClearAsk(null)
      return
    }
    setCleared(null)
    counting.current = true
    void bridge()
      .countHistory()
      .then((total) => {
        setCount(total)
        if (total > 0) {
          askedAt.current = performance.now()
          setClearAsk(total)
        }
      })
      .catch((error: unknown) => console.error('[murmur] could not count history:', error))
      .finally(() => {
        counting.current = false
      })
  }
  const keepHistory = (): void => {
    setClearAsk(null)
    clearRef.current?.focus()
  }
  const clearAll = async (): Promise<void> => {
    setClearing(true)
    try {
      const removed = await bridge().clearHistory()
      window.dispatchEvent(new Event(HISTORY_CLEARED))
      setCleared(removed === 1 ? 'Cleared 1 entry.' : `Cleared ${removed.toLocaleString()} entries.`)
    } catch (error) {
      console.error('[murmur] clear all failed:', error)
      setCleared('Could not clear your history. Try again in a moment.')
    } finally {
      setClearing(false)
      setClearAsk(null)
      refreshCount()
    }
  }

  return (
    <>
      <Row
        label="Keep history for"
        anchor="row-keep-history"
        keywords="retention history keep days delete old entries"
        desc={keepLine(retentionDays)}
      >
        <select
          className="field"
          aria-label="Keep history for"
          value={retentionDays}
          onChange={(e) => void chooseKeep(Number(e.target.value))}
        >
          <option value={KEEP_NO_TEXT}>don't keep</option>
          <option value={KEEP_24_HOURS}>24 hours</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={365}>a year</option>
          <option value={0}>forever</option>
        </select>
      </Row>
      {keepAsk !== null && (
        <AskFirst
          id="keep-shorter-confirm"
          question={keepAsk.question}
          confirm="remove them"
          keep="keep them"
          busy={false}
          onConfirm={() => applyKeep(keepAsk.value)}
          onKeep={() => setKeepAsk(null)}
        />
      )}
      <Row
        label="Encrypt saved words"
        anchor="row-encrypt-words"
        keywords="encrypt encryption seal keychain secure history"
        desc={sealStatus ? sealLine(sealStatus) : ''}
      >
        <Switch
          checked={encrypt}
          label="Encrypt saved words"
          onChange={(next) => void props.onUpdateSettings({ history: { encrypt: next } } as Partial<Settings>)}
        />
      </Row>
      <HideWordsRow settings={props.settings} anchor="row-hide-words" onUpdate={props.onUpdateSettings} />
      <Row label="Clear all" anchor="row-clear-history" keywords="clear delete erase wipe history" desc={clearAllLine(count)}>
        <button
          ref={clearRef}
          className="btn quiet-btn"
          disabled={clearing || !count}
          aria-expanded={clearAsk !== null}
          aria-controls={clearAsk !== null ? 'clear-all-confirm' : undefined}
          onClick={askClear}
        >
          Clear all
        </button>
      </Row>
      {clearAsk !== null && (
        <AskFirst
          id="clear-all-confirm"
          question={clearAllQuestion(clearAsk)}
          confirm={clearing ? 'clearing' : `clear ${clearAsk.toLocaleString()}`}
          keep={clearAsk === 1 ? 'keep it' : undefined}
          busy={clearing}
          onConfirm={() => void clearAll()}
          onKeep={keepHistory}
        />
      )}
      {/* Always mounted, so screen readers hear the result. */}
      <p className={cleared ? 'waiting-message' : 'visually-hidden'} ref={clearedRef} tabIndex={-1} role="status">
        {cleared}
      </p>
    </>
  )
}
