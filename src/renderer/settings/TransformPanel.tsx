// SPDX-License-Identifier: GPL-3.0-only
// The transform section of settings (US-054): the chord that turns a
// selection into the subject of a spoken instruction, whether originals
// stay in history, and the connection the edit runs on.
import { useEffect, useState } from 'react'
import type { HotkeysStatus, KeyStatus, SettingsApi } from '../../preload/settings'
import type { ProviderCatalog } from '../../shared/catalog'
import type { Settings } from '../../shared/settings'
import { ConnectionRows } from './ConnectionRows'
import { Row } from './controls'

const bridge = (): SettingsApi => window.murmur

export function TransformPanel(props: {
  settings: Settings
  catalog: ProviderCatalog | null
  hotkeys: HotkeysStatus | null
  onUpdate: (partial: Partial<Settings>) => Promise<void>
  onRefresh: () => Promise<unknown>
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
    <section className="panel">
      <p className="micro-label">transform</p>

      <Row
        label="Transform chord"
        anchor="row-transform-chord"
        desc={
          captureNote ??
          (disarmed
            ? 'This chord is currently disarmed: it clashes with your dictation hotkey or another chord, or no longer parses. Capture a new one.'
            : 'Select text in any app, hold it, and say what to do ("turn this into a list with action steps"). The result replaces the selection. Off until you set one. A modifier plus an F-key is safest.')
        }
      >
        <div className="inline">
          <button
            className={`field capture ${capturing ? 'capture-live' : ''}`}
            onClick={() => void startCapture()}
          >
            {capturing ? 'press keys…' : transform.binding === '' ? 'not set' : transform.binding}
          </button>
          {transform.binding !== '' && (
            <button
              className="btn quiet-btn"
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
        desc={
          transform.keepOriginals
            ? 'Each original selection is saved to history before the model sees it, so paste-last or the home tab always brings it back.'
            : 'Originals are held in memory only: paste-last still brings back the latest one until the next transform or until murmur quits, and nothing is written to disk.'
        }
      >
        <select
          className="field"
          value={transform.keepOriginals ? 'on' : 'off'}
          onChange={(e) => void update({ keepOriginals: e.target.value === 'on' })}
        >
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
      </Row>

      <ConnectionRows
        value={transform.connection}
        catalog={props.catalog}
        keyStatus={keyStatus}
        onKeyStatus={setKeyStatus}
        onChange={(connection) => update({ connection: { ...transform.connection, ...connection } })}
        labels={{
          connection: 'Transform connection',
          connectionDesc:
            'Same runs transforms on your cleanup connection, which is your speech provider unless you set cleanup apart. Separate lets them run on a stronger model with its own key.',
          sameOption: 'Same as cleanup',
          provider: 'Transform provider',
          baseUrl: 'Transform base URL',
          model: 'Transform model id',
          key: 'Transform key',
          keyDesc:
            'This connection has its own key, stored encrypted like the others. Until one is saved, transforms keep riding your cleanup connection.',
          sharedDesc:
            'Shares a key with your speech or cleanup connection: one provider, one key. Manage it in the setup panel.'
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
    </section>
  )
}
