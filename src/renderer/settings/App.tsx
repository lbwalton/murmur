// SPDX-License-Identifier: GPL-3.0-only
// The settings surface. Quiet night-studio panels; the overlay pill
// stays the only loud element in the product.
import { useCallback, useEffect, useState } from 'react'
import type {
  HotkeysStatus,
  KeyStatus,
  PermissionsStatus,
  ProviderTestResult,
  SettingsApi
} from '../../preload/settings'
import type { Settings } from '../../shared/settings'

declare global {
  interface Window {
    murmur: SettingsApi
  }
}

const bridge = (): SettingsApi => window.murmur

/** Map a keyboard event to a binding string the main process can parse. */
function captureBinding(e: React.KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Cmd')

  const code = e.code
  let key: string | null = null
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5)
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code
  else if (code === 'Space') key = 'Space'
  if (!key) return null
  return [...mods, key].join('+')
}

function Row(props: { label: string; desc?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="row">
      <div className="row-text">
        <div className="row-label">{props.label}</div>
        {props.desc && <div className="row-desc">{props.desc}</div>}
      </div>
      <div className="row-control">{props.children}</div>
    </div>
  )
}

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ present: false, masked: null })
  const [keyDraft, setKeyDraft] = useState('')
  const [test, setTest] = useState<ProviderTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [perms, setPerms] = useState<PermissionsStatus | null>(null)
  const [hotkeys, setHotkeys] = useState<HotkeysStatus | null>(null)
  const [capturing, setCapturing] = useState(false)

  const refresh = useCallback(async () => {
    const b = bridge()
    const [s, k, p, h] = await Promise.all([
      b.getSettings(),
      b.getApiKeyStatus(),
      b.getPermissions(),
      b.getHotkeysStatus()
    ])
    setSettings(s)
    setKeyStatus(k)
    setPerms(p)
    setHotkeys(h)
  }, [])

  useEffect(() => {
    void refresh()
    // Permission grants happen in System Settings; poll while open.
    const timer = setInterval(() => {
      void bridge().getPermissions().then(setPerms)
    }, 3000)
    return () => clearInterval(timer)
  }, [refresh])

  const update = async (partial: Partial<Settings>): Promise<void> => {
    setSettings(await bridge().updateSettings(partial))
    setHotkeys(await bridge().getHotkeysStatus())
  }

  const saveKey = async (): Promise<void> => {
    if (keyDraft.trim().length === 0) return
    setKeyStatus(await bridge().setApiKey(keyDraft.trim()))
    setKeyDraft('')
    setTest(null)
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    try {
      setTest(await bridge().testProvider())
    } finally {
      setTesting(false)
    }
  }

  const onCaptureKey = async (e: React.KeyboardEvent): Promise<void> => {
    e.preventDefault()
    const binding = captureBinding(e)
    if (!binding) return
    setCapturing(false)
    await update({ hotkey: { binding } as Settings['hotkey'] })
  }

  if (!settings) return <main className="shell" />

  const isMac = navigator.platform.toLowerCase().includes('mac')
  const micOk = perms?.microphone === 'granted'

  return (
    <main className="shell">
      <header className="masthead">
        <p className="micro-label">murmur</p>
        <h1>Push-to-talk dictation.</h1>
        <p className="dim">
          Hold <span className="kbd">{settings.hotkey.binding}</span>, speak, release. Text lands at
          your cursor.
        </p>
      </header>

      <section className="panel">
        <p className="micro-label">setup</p>

        <Row
          label="Groq API key"
          desc={
            keyStatus.present
              ? `Saved and encrypted (${keyStatus.masked ?? ''})`
              : 'Paste a key from console.groq.com/keys. Stored encrypted, never leaves this machine except to your provider.'
          }
        >
          <div className="inline">
            <input
              type="password"
              className="field"
              placeholder={keyStatus.present ? 'replace key' : 'gsk_…'}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveKey()
              }}
            />
            <button className="btn" onClick={() => void saveKey()} disabled={keyDraft.trim() === ''}>
              Save
            </button>
            {keyStatus.present && (
              <button
                className="btn quiet-btn"
                onClick={() => void bridge().clearApiKey().then(setKeyStatus)}
              >
                Remove
              </button>
            )}
          </div>
        </Row>

        <Row label="Connection" desc="Checks your key against the provider.">
          <div className="inline">
            <button
              className="btn"
              onClick={() => void runTest()}
              disabled={!keyStatus.present || testing}
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {test && (
              <span className={test.ok ? 'status-ok' : 'status-bad'}>
                {test.ok ? 'connected' : test.detail}
              </span>
            )}
          </div>
        </Row>
      </section>

      <section className="panel">
        <p className="micro-label">dictation</p>

        <Row label="Trigger" desc="Hold to talk, or tap to start and stop.">
          <select
            className="field"
            value={settings.hotkey.mode}
            onChange={(e) => void update({ hotkey: { mode: e.target.value } as Settings['hotkey'] })}
          >
            <option value="hold">Hold to talk</option>
            <option value="toggle">Toggle</option>
          </select>
        </Row>

        <Row
          label="Hotkey"
          desc={
            hotkeys && !hotkeys.bindingValid
              ? 'This binding could not be parsed; pick another.'
              : 'Click, then press the combo you want.'
          }
        >
          <input
            className={`field capture ${capturing ? 'capture-live' : ''}`}
            readOnly
            value={capturing ? 'press keys…' : settings.hotkey.binding}
            onFocus={() => setCapturing(true)}
            onBlur={() => setCapturing(false)}
            onKeyDown={(e) => void onCaptureKey(e)}
          />
        </Row>

        <Row label="Insert by" desc="Paste puts text at your cursor. Copy only fills the clipboard.">
          <select
            className="field"
            value={settings.insertion.mode}
            onChange={(e) =>
              void update({ insertion: { mode: e.target.value } as Settings['insertion'] })
            }
          >
            <option value="paste">Paste at cursor</option>
            <option value="copy">Copy only</option>
          </select>
        </Row>

        <Row label="Formatting" desc="Cleanup applied to what you say.">
          <select
            className="field"
            value={settings.formatting.level}
            onChange={(e) =>
              void update({
                formatting: { ...settings.formatting, level: e.target.value } as Settings['formatting']
              })
            }
          >
            <option value="off">Off (raw transcript)</option>
            <option value="light">Light (fillers, capitals)</option>
            <option value="full">Full (punctuation commands, cleanup)</option>
          </select>
        </Row>

        <Row label="Overlay" desc="See the pill without dictating.">
          <button className="btn" onClick={() => void bridge().previewOverlay()}>
            Preview overlay
          </button>
        </Row>
      </section>

      {isMac && (
        <section className="panel">
          <p className="micro-label">macos permissions</p>

          <Row label="Microphone" desc="Asked automatically on your first dictation.">
            <div className="inline">
              <span className={micOk ? 'status-ok' : 'status-bad'}>
                {perms?.microphone ?? '…'}
              </span>
              {!micOk && (
                <button className="btn" onClick={() => void bridge().openPermissionPane('microphone')}>
                  Open settings
                </button>
              )}
            </div>
          </Row>

          <Row label="Accessibility" desc="Lets murmur press Cmd+V to insert text.">
            <div className="inline">
              <span className={perms?.accessibility ? 'status-ok' : 'status-bad'}>
                {perms?.accessibility ? 'granted' : 'not granted'}
              </span>
              {!perms?.accessibility && (
                <button
                  className="btn"
                  onClick={() => void bridge().openPermissionPane('accessibility')}
                >
                  Open settings
                </button>
              )}
            </div>
          </Row>

          <Row
            label="Input monitoring"
            desc="Lets the hotkey work everywhere. After granting, quit and reopen murmur."
          >
            <div className="inline">
              <span className={perms?.inputMonitoring ? 'status-ok' : 'status-bad'}>
                {perms?.inputMonitoring ? 'active' : 'not active'}
              </span>
              {!perms?.inputMonitoring && (
                <button className="btn" onClick={() => void bridge().openPermissionPane('input')}>
                  Open settings
                </button>
              )}
            </div>
          </Row>
        </section>
      )}

      <section className="panel">
        <p className="micro-label">try it</p>
        <Row
          label="Test dictation"
          desc={`Click into the box, hold ${settings.hotkey.binding}, say something, release.`}
        >
          <textarea className="field trybox" placeholder="dictate here…" rows={3} />
        </Row>
      </section>

      <footer className="foot dim">murmur {bridge().appVersion()} · GPL-3.0-only</footer>
    </main>
  )
}
