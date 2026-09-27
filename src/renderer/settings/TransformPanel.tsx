// SPDX-License-Identifier: GPL-3.0-only
// The transform section of settings (US-054): the chord that turns a
// selection into the subject of a spoken instruction, whether originals
// stay in history, and the connection the edit runs on.
import { useEffect, useState } from 'react'
import type { HotkeysStatus, KeyStatus, SettingsApi } from '../../preload/settings'
import type { ProviderCatalog } from '../../shared/catalog'
import type { Settings } from '../../shared/settings'
import { ConnectionRows } from './ConnectionRows'
import { Row, Section, Switch } from './controls'

const bridge = (): SettingsApi => window.murmur

export function TransformPanel(props: {
  settings: Settings
  catalog: ProviderCatalog | null
  hotkeys: HotkeysStatus | null
  onUpdate: (partial: Partial<Settings>) => Promise<void>
  onRefresh: () => Promise<unknown>
  /** A key saved or removed here also lists under API keys. */
  onKeysChanged: () => void
}): React.JSX.Element {
  const transform = props.settings.transform
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ present: false, masked: null })
  const [capturing, setCapturing] = useState(false)
  const [captureNote, setCaptureNote] = useState<string | null>(null)

  useEffect(() => {
    void bridge().getKeyStatusFor(transform.connection.baseUrl).then(setKeyStatus)
  }, [transform.connection.baseUrl])

  const update = async (partial: Partial<Settings['transform']>): Promise<void> => {
    // The store deep-merges, so only the changed field travels.
    await props.onUpdate({ transform: partial as Settings['transform'] })
  }

  const startCapture = async (): Promise<void> => {
    if (capturing) return
    setCapturing(true)
    setCaptureNote(null)
    try {
      const result = await bridge().captureHotkey('transform')
      if (result.ok) {
        await props.onRefresh()
      } else if (result.reason === 'needs-key') {
        setCaptureNote('this chord needs a regular key too, like Ctrl+F10; modifiers alone fire by accident')
      } else if (result.reason === 'collides') {
        setCaptureNote('that combo contains your dictation hotkey or is already another chord; pick a different one')
      } else {
        setCaptureNote('not captured; click and try again, Esc cancels')
      }
    } finally {
      setCapturing(false)
    }
  }

  const disarmed =
    transform.binding !== '' && props.hotkeys !== null && !props.hotkeys.transformBindingValid

  return (
    <Section id="transform" title="Transform" sub="Select text, hold the chord, and say how to change it.">

      <Row
        label="Transform chord"
        anchor="row-transform-chord"
        keywords="rewrite edit selection chord hotkey"
        desc={
          captureNote ??
          (disarmed
            ? 'This chord is disarmed: it clashes with your dictation hotkey or another chord, or no longer parses. Capture a new one.'
            : 'Select text in any app, hold it, and say what to do ("turn this into a list with action steps"). The result replaces the selection. Off until you set one; a modifier plus an F-key is safest.')
        }
      >
        <div className="inline">
          <button
            className={`field capture ${capturing ? 'capture-live' : ''}`}
            aria-label="Transform chord. Click to change."
            onClick={() => void startCapture()}
          >
            {capturing ? 'press keys…' : transform.binding === '' ? 'not set' : transform.binding}
          </button>
          {transform.binding !== '' && (
            <button
              className="btn btn-remove"
              onClick={() => {
                setCaptureNote(null)
                void update({ binding: '' })
              }}
            >
              Clear
            </button>
          )}
        </div>
      </Row>

      <Row
        label="Keep originals in history"
        anchor="row-transform-keep"
        keywords="undo history original"
        desc={
          transform.keepOriginals
            ? 'Each original selection is saved to history before the model sees it, so paste-last or the home tab always brings it back.'
            : 'Originals stay in memory only, never on disk. Paste-last still brings back the latest one until your next dictation or transform, or until murmur quits.'
        }
      >
        <Switch
          checked={transform.keepOriginals}
          label="Keep originals in history"
          onChange={(keepOriginals) => void update({ keepOriginals })}
        />
      </Row>

      <ConnectionRows
        value={transform.connection}
        catalog={props.catalog}
        keyStatus={keyStatus}
        onKeyStatus={(status) => {
          setKeyStatus(status)
          props.onKeysChanged()
        }}
        onChange={(connection) => update({ connection: { ...transform.connection, ...connection } })}
        labels={{
          connection: 'Transform runs on',
          connectionDesc:
            'Same uses your cleanup connection. Separate lets transforms run on a stronger model with its own key.',
          sameOption: 'Same as cleanup',
          provider: 'Transform provider',
          baseUrl: 'Transform base URL',
          model: 'Transform model id',
          key: 'Transform key',
          keyDesc:
            'This connection has its own key, stored encrypted like the others. Until one is saved, transforms keep riding your cleanup connection.',
          sharedDesc:
            'Shares a key with your speech or cleanup connection: one provider, one key. It is in the API keys list under Provider and keys.'
        }}
        sharedWith={[
          props.settings.provider.baseUrl,
          props.settings.polish.enabled ? props.settings.polish.baseUrl : ''
        ]}
        anchor="row-transform-connection"
        api={{
          setKey: (key) => bridge().setKeyFor(transform.connection.baseUrl, key),
          clearKey: () => bridge().clearKeyFor(transform.connection.baseUrl),
          status: () => bridge().getKeyStatusFor(transform.connection.baseUrl),
          test: () => bridge().testConnectionFor(transform.connection.baseUrl)
        }}
      />
    </Section>
  )
}
