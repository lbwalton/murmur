// SPDX-License-Identifier: GPL-3.0-only
// The settings surface. Quiet night-studio panels; the overlay pill
// stays the only loud element in the product.
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HotkeysStatus,
  KeyStatus,
  PermissionsStatus,
  ProviderTestResult,
  SettingsApi
} from '../../preload/settings'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'

declare global {
  interface Window {
    murmur: SettingsApi
  }
}

const bridge = (): SettingsApi => window.murmur

interface SetupStep {
  id: string
  label: string
  ok: boolean
  /** Row anchor to scroll to and highlight when the step needs fixing. */
  anchor: string
}

/** Text field that commits on blur or Enter, with optional suggestions. */
function TextSetting(props: {
  value: string
  placeholder?: string
  listId?: string
  options?: string[]
  wide?: boolean
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => setDraft(props.value), [props.value])
  const commit = (): void => {
    const next = draft.trim()
    if (next.length > 0 && next !== props.value) props.onCommit(next)
    else setDraft(props.value)
  }
  return (
    <>
      <input
        className={`field mono-field ${props.wide ? 'wide-field' : ''}`}
        value={draft}
        placeholder={props.placeholder}
        list={props.listId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {props.listId && props.options && (
        <datalist id={props.listId}>
          {props.options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </>
  )
}

/**
 * Inline add form for a pair of values. multilineRight turns the second
 * field into a textarea (snippets need line breaks for sign-offs):
 * Enter makes a new line there, Cmd or Ctrl+Enter and the Add button
 * submit.
 */
function PairAdd(props: {
  placeholderLeft: string
  placeholderRight: string
  multilineRight?: boolean
  onAdd: (left: string, right: string) => void
}): React.JSX.Element {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const canSubmit = left.trim().length > 0 && right.trim().length > 0
  const submit = (): void => {
    if (!canSubmit) return
    props.onAdd(left.trim(), right.trim())
    setLeft('')
    setRight('')
  }
  return (
    <div className="dict-row">
      <input
        className="field mono-field dict-field"
        placeholder={props.placeholderLeft}
        value={left}
        onChange={(e) => setLeft(e.target.value)}
      />
      <span className="dim">→</span>
      {props.multilineRight ? (
        <textarea
          className="field mono-field dict-field dict-multiline"
          placeholder={props.placeholderRight}
          rows={2}
          value={right}
          onChange={(e) => setRight(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
        />
      ) : (
        <input
          className="field mono-field dict-field"
          placeholder={props.placeholderRight}
          value={right}
          onChange={(e) => setRight(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      )}
      <button className="btn" onClick={submit} disabled={!canSubmit}>
        Add
      </button>
    </div>
  )
}

function Row(props: {
  label: string
  desc?: string
  anchor?: string
  highlight?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={`row ${props.highlight ? 'row-flash' : ''}`} id={props.anchor}>
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
  const [captureNote, setCaptureNote] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const autoTested = useRef(false)

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
    return k
  }, [])

  useEffect(() => {
    void refresh().then((k) => {
      // Health needs a connection verdict: test once automatically when
      // a key is already saved.
      if (k.present && !autoTested.current) {
        autoTested.current = true
        void bridge().testProvider().then(setTest)
      }
    })
    const timer = setInterval(() => {
      void bridge().getPermissions().then(setPerms)
      void bridge().getHotkeysStatus().then(setHotkeys)
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
    setTesting(true)
    try {
      setTest(await bridge().testProvider())
    } finally {
      setTesting(false)
    }
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    try {
      setTest(await bridge().testProvider())
    } finally {
      setTesting(false)
    }
  }

  const startCapture = async (): Promise<void> => {
    if (capturing) return
    setCapturing(true)
    setCaptureNote(null)
    try {
      const result = await bridge().captureHotkey()
      if (result.ok) {
        await refresh()
      } else if (result.reason === 'needs-modifier') {
        setCaptureNote('single letters would fire while typing; add Ctrl, Alt, Shift, or Cmd (F-keys can stand alone)')
      } else {
        setCaptureNote('not captured; click and try again, Esc cancels')
      }
    } finally {
      setCapturing(false)
    }
  }

  const jumpTo = (anchor: string): void => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlighted(anchor)
    setTimeout(() => setHighlighted((h) => (h === anchor ? null : h)), 2600)
  }

  if (!settings) return <main className="shell" />

  const isMac = navigator.platform.toLowerCase().includes('mac')
  const micOk = perms?.microphone === 'granted'

  const steps: SetupStep[] = [
    { id: 'key', label: 'API key saved', ok: keyStatus.present, anchor: 'row-key' },
    {
      id: 'conn',
      label: 'Provider connected',
      ok: test?.ok === true,
      anchor: 'row-conn'
    },
    ...(isMac
      ? [
          { id: 'mic', label: 'Microphone', ok: micOk, anchor: 'row-mic' },
          {
            id: 'axs',
            label: 'Accessibility',
            ok: perms?.accessibility === true,
            anchor: 'row-axs'
          },
          {
            id: 'input',
            label: 'Input monitoring',
            ok: perms?.inputMonitoring === true,
            anchor: 'row-input'
          }
        ]
      : []),
    { id: 'hotkey', label: 'Hotkey ready', ok: hotkeys?.bindingValid === true, anchor: 'row-hotkey' }
  ]
  const allOk = steps.every((s) => s.ok)

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
        <div className="panel-head">
          <p className="micro-label">setup</p>
          <span className={`health ${allOk ? 'health-ok' : 'health-bad'}`}>
            {allOk ? '✓ all set' : '✗ needs attention'}
          </span>
        </div>

        <div className="checklist">
          {steps.map((step) => (
            <button
              key={step.id}
              className={`check ${step.ok ? 'check-ok' : 'check-bad'}`}
              onClick={() => !step.ok && jumpTo(step.anchor)}
              disabled={step.ok}
            >
              <span className="check-mark">{step.ok ? '✓' : '✗'}</span>
              {step.label}
            </button>
          ))}
        </div>

        <Row
          label="Groq API key"
          anchor="row-key"
          highlight={highlighted === 'row-key'}
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
                onClick={() => {
                  void bridge().clearApiKey().then(setKeyStatus)
                  setTest(null)
                }}
              >
                Remove
              </button>
            )}
          </div>
        </Row>

        <Row
          label="Connection"
          anchor="row-conn"
          highlight={highlighted === 'row-conn'}
          desc="Checks your key against the provider."
        >
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
        <div className="panel-head">
          <p className="micro-label">provider</p>
          {(settings.provider.baseUrl !== DEFAULT_SETTINGS.provider.baseUrl ||
            settings.provider.sttModel !== DEFAULT_SETTINGS.provider.sttModel ||
            settings.provider.llmModel !== DEFAULT_SETTINGS.provider.llmModel) && (
            <button
              className="btn quiet-btn"
              onClick={() => void update({ provider: { ...DEFAULT_SETTINGS.provider } })}
            >
              Reset to Groq defaults
            </button>
          )}
        </div>

        <Row
          label="Base URL"
          desc="Any OpenAI-compatible endpoint. Groq by default; point it at OpenAI, a proxy, or a local server. Run Test connection after changing."
        >
          <TextSetting
            wide
            value={settings.provider.baseUrl}
            placeholder="https://api.groq.com/openai/v1"
            onCommit={(baseUrl) => void update({ provider: { baseUrl } as Settings['provider'] })}
          />
        </Row>

        <Row
          label="Speech model"
          desc="Transcribes your voice. Pick a suggestion or type any model id your provider offers."
        >
          <TextSetting
            value={settings.provider.sttModel}
            listId="stt-models"
            options={['whisper-large-v3-turbo', 'whisper-large-v3']}
            onCommit={(sttModel) => void update({ provider: { sttModel } as Settings['provider'] })}
          />
        </Row>

        <Row
          label="Cleanup model"
          desc="Polishes transcripts at Full formatting. If it misbehaves, murmur falls back to built-in cleanup."
        >
          <TextSetting
            value={settings.provider.llmModel}
            listId="llm-models"
            options={['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']}
            onCommit={(llmModel) => void update({ provider: { llmModel } as Settings['provider'] })}
          />
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
          anchor="row-hotkey"
          highlight={highlighted === 'row-hotkey'}
          desc={
            captureNote ??
            'Click, then press the combo. Modifiers alone work too (press and release Ctrl+Alt). Esc cancels.'
          }
        >
          <div className="inline">
            <button
              className={`field capture ${capturing ? 'capture-live' : ''}`}
              onClick={() => void startCapture()}
            >
              {capturing ? 'press keys…' : settings.hotkey.binding}
            </button>
            {settings.hotkey.binding !== DEFAULT_SETTINGS.hotkey.binding && (
              <button
                className="btn quiet-btn"
                onClick={() => {
                  setCaptureNote(null)
                  void update({
                    hotkey: { binding: DEFAULT_SETTINGS.hotkey.binding } as Settings['hotkey']
                  })
                }}
              >
                Reset
              </button>
            )}
          </div>
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

        <Row label="Waveform" desc="How the pill visualizes your voice.">
          <select
            className="field"
            value={settings.overlay.style}
            onChange={(e) =>
              void update({ overlay: { style: e.target.value } as Settings['overlay'] })
            }
          >
            <option value="bars">Bars (classic)</option>
            <option value="speckle">Speckle (dust that vibrates)</option>
          </select>
        </Row>

        <Row label="Overlay" desc="See the pill without dictating.">
          <button className="btn" onClick={() => void bridge().previewOverlay()}>
            Preview overlay
          </button>
        </Row>
      </section>

      <section className="panel">
        <p className="micro-label">dictionary</p>
        <Row
          label="Custom words"
          desc="Names and terms the speech model misspells. Heard becomes written, whole words only, exactly your casing."
        >
          <div className="dict-editor">
            {settings.dictionary.map((entry, i) => (
              <div className="dict-row" key={i}>
                <span className="dict-pair mono-inline">
                  {entry.from} → {entry.to}
                </span>
                <button
                  className="btn quiet-btn"
                  onClick={() =>
                    void update({ dictionary: settings.dictionary.filter((_, j) => j !== i) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <PairAdd
              placeholderLeft="heard as…"
              placeholderRight="written as…"
              onAdd={(from, to) =>
                void update({ dictionary: [...settings.dictionary, { from, to }] })
              }
            />
          </div>
        </Row>

        <Row
          label="Expansions"
          desc="Say a trigger phrase, get a snippet: an email address, a sign-off, an intro. Inserted exactly as written."
        >
          <div className="dict-editor">
            {settings.expansions.map((entry, i) => (
              <div className="dict-row" key={i}>
                <span className="dict-pair mono-inline">
                  {entry.trigger} → {entry.text.length > 24 ? `${entry.text.slice(0, 24)}…` : entry.text}
                </span>
                <button
                  className="btn quiet-btn"
                  onClick={() =>
                    void update({ expansions: settings.expansions.filter((_, j) => j !== i) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <PairAdd
              placeholderLeft="when I say…"
              placeholderRight="insert… (Enter for a new line)"
              multilineRight
              onAdd={(trigger, text) =>
                void update({ expansions: [...settings.expansions, { trigger, text }] })
              }
            />
          </div>
        </Row>
      </section>

      {isMac && (
        <section className="panel">
          <p className="micro-label">macos permissions</p>

          <Row
            label="Microphone"
            anchor="row-mic"
            highlight={highlighted === 'row-mic'}
            desc="Asked automatically on your first dictation."
          >
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

          <Row
            label="Accessibility"
            anchor="row-axs"
            highlight={highlighted === 'row-axs'}
            desc="Lets murmur press Cmd+V to insert text."
          >
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
            anchor="row-input"
            highlight={highlighted === 'row-input'}
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
