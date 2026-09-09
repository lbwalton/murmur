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
import { parseRecapTime } from '../../shared/recap'
import proConfig from '../../../shared/pro.json'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'
import { AnalyticsView } from './AnalyticsView'
import { HomeView } from './HomeView'
import { JourneyView } from './JourneyView'
import { WizardView } from './WizardView'
import { WrapUpView } from './WrapUpView'

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
 * Volume slider. Dragging fires change continuously; committing each
 * tick would flood synchronous settings writes, so the value lives
 * locally and commits when the drag settles.
 */
function VolumeSlider(props: {
  value: number
  disabled: boolean
  onCommit: (volume: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(Math.round(props.value * 100))
  useEffect(() => setDraft(Math.round(props.value * 100)), [props.value])
  const commit = (): void => {
    if (draft !== Math.round(props.value * 100)) props.onCommit(draft / 100)
  }
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={draft}
      disabled={props.disabled}
      onChange={(e) => setDraft(Number(e.target.value))}
      onPointerUp={commit}
      onBlur={commit}
    />
  )
}

/**
 * Recap time field. A native time input reports empty string during
 * incomplete edits; persisting that would silently kill the recap
 * schedule forever. Only valid times ever reach the store, and blurring
 * an incomplete edit snaps back to the saved value.
 */
function RecapTimeInput(props: {
  value: string
  disabled: boolean
  onCommit: (time: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => setDraft(props.value), [props.value])
  return (
    <input
      type="time"
      className="field"
      value={draft}
      disabled={props.disabled}
      onChange={(e) => {
        setDraft(e.target.value)
        if (parseRecapTime(e.target.value)) props.onCommit(e.target.value)
      }}
      onBlur={() => {
        if (!parseRecapTime(draft)) setDraft(props.value)
      }}
    />
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
  const [version, setVersion] = useState('')
  const [cosmetics, setCosmetics] = useState<import('../../shared/cosmetics').CosmeticsReport | null>(null)
  const [insignia, setInsignia] = useState<{ color: string; stripes: number; founder: boolean } | null>(null)
  const [page, setPage] = useState<'home' | 'analytics' | 'wrapup' | 'journey' | 'setup'>('home')
  const [wizardOpen, setWizardOpen] = useState(false)
  const offeredWizard = useRef(false)
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
    // The recap notification lands on the wrap-up page.
    const unNav = bridge().onNavigate((target) => {
      if (target === 'wrapup') setPage('wrapup')
    })
    void bridge().appVersion().then(setVersion)
    const loadCosmetics = (): void => {
      void Promise.all([bridge().getCosmetics(), bridge().getRankProgress()]).then(([c, p]) => {
        setCosmetics(c)
        setInsignia({
          color: c.beltColor,
          stripes: p.rank.belt === 'red' ? 0 : p.rank.stripes,
          founder: p.founder
        })
      })
    }
    loadCosmetics()
    const unCosmetics = bridge().onHistoryAppended(() => loadCosmetics())
    void refresh().then((k) => {
      // Health needs a connection verdict: test once automatically when
      // a key is already saved.
      if (k.present && !autoTested.current) {
        autoTested.current = true
        void bridge().testProvider().then(setTest)
      }
      // Fresh profiles get the guided path once, automatically.
      if (!offeredWizard.current) {
        offeredWizard.current = true
        void bridge()
          .getSettings()
          .then((s) => {
            if (!s.onboarding.completed && !k.present) setWizardOpen(true)
          })
      }
    })
    const timer = setInterval(() => {
      void bridge().getPermissions().then(setPerms)
      void bridge().getHotkeysStatus().then(setHotkeys)
    }, 3000)
    return () => {
      clearInterval(timer)
      unNav()
      unCosmetics()
    }
  }, [refresh])

  const update = async (partial: Partial<Settings>): Promise<void> => {
    setSettings(await bridge().updateSettings(partial))
    setHotkeys(await bridge().getHotkeysStatus())
  }

  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.cosmetics.uiTheme
  }, [settings])

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

  if (wizardOpen) {
    return (
      <main className="shell">
        <header className="masthead">
          <p className="micro-label">murmur</p>
        </header>
        <WizardView
          settings={settings}
          onSettings={setSettings}
          onFinish={() => {
            setWizardOpen(false)
            void update({ onboarding: { completed: true } })
            void refresh()
          }}
        />
      </main>
    )
  }

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

  // The chosen accent recolors data emphasis across the GUI (chart
  // bars, gate fills) via one CSS variable. Amber stays reserved for
  // live states, so the default accent keeps the quiet cream look.
  const guiAccent = ((): string | null => {
    if (!settings || !cosmetics) return null
    const id = settings.cosmetics.accent
    if (id === 'amber') return null
    const item = cosmetics.accents.find((a) => a.id === id)
    if (!item?.unlocked) return null
    if (item.id === 'belt' || !item.color) return cosmetics.beltColor
    return item.color
  })()

  return (
    <main
      className="shell"
      style={guiAccent ? ({ '--gui-accent': guiAccent } as React.CSSProperties) : undefined}
    >
      <header className="masthead">
        <div className="mast-top">
          <p className="micro-label">
            murmur
            {insignia && (
              <span className="insignia" style={{ background: insignia.color }} title="your belt">
                {Array.from({ length: Math.min(insignia.stripes, 4) }, (_, i) => (
                  <span className="insignia-stripe" key={i} />
                ))}
                {insignia.founder && <span className="insignia-crown">♛</span>}
              </span>
            )}
          </p>
          <nav className="nav">
            <button
              className={`nav-btn ${page === 'home' ? 'nav-active' : ''}`}
              onClick={() => setPage('home')}
            >
              home
            </button>
            <button
              className={`nav-btn ${page === 'analytics' ? 'nav-active' : ''}`}
              onClick={() => setPage('analytics')}
            >
              analytics
            </button>
            <button
              className={`nav-btn ${page === 'wrapup' ? 'nav-active' : ''}`}
              onClick={() => setPage('wrapup')}
            >
              wrap-up
            </button>
            <button
              className={`nav-btn ${page === 'journey' ? 'nav-active' : ''}`}
              onClick={() => setPage('journey')}
            >
              journey
            </button>
            <button
              className={`nav-btn ${page === 'setup' ? 'nav-active' : ''}`}
              onClick={() => setPage('setup')}
            >
              settings
            </button>
            {!allOk && page !== 'setup' && <span className="nav-alert">✗</span>}
          </nav>
        </div>
        <h1>Push-to-talk dictation.</h1>
        <p className="dim">
          Hold <span className="kbd">{settings.hotkey.binding}</span>, speak, release. Text lands at
          your cursor.
        </p>
      </header>

      {page === 'home' && <HomeView settings={settings} onUpdateSettings={update} />}
      {page === 'analytics' && <AnalyticsView />}
      {page === 'wrapup' && <WrapUpView />}
      {page === 'journey' && <JourneyView />}

      <div style={{ display: page === 'setup' ? 'contents' : 'none' }}>
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
            options={['openai/gpt-oss-120b', 'openai/gpt-oss-20b']}
            onCommit={(llmModel) => void update({ provider: { llmModel } as Settings['provider'] })}
          />
        </Row>

        <ProfilesRow settings={settings} onSettings={setSettings} />
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

        <Row label="Waveform" desc="How the pill visualizes your voice. Locked styles show how to earn them.">
          <select
            className="field"
            value={settings.overlay.style}
            onChange={(e) =>
              void update({ overlay: { style: e.target.value } as Settings['overlay'] })
            }
          >
            {(cosmetics?.overlayStyles ?? []).map((item) => (
              <option key={item.id} value={item.id} disabled={!item.unlocked}>
                {item.unlocked ? `${item.name} (${item.hint})` : `${item.name} (locked: ${item.hint})`}
              </option>
            ))}
          </select>
        </Row>

        <Row
          label="Accent"
          desc="Your default accent everywhere it earns attention: the waveform, chart bars, and progress fills. The activity wall in analytics keeps its own picker. Earned, never bought."
        >
          <div className="inline">
            <select
              className="field"
              value={settings.cosmetics.accent}
              onChange={(e) =>
                void update({
                  cosmetics: { ...settings.cosmetics, accent: e.target.value }
                })
              }
            >
              {(cosmetics?.accents ?? []).map((item) => (
                <option key={item.id} value={item.id} disabled={!item.unlocked}>
                  {item.unlocked ? item.name : `${item.name} (locked: ${item.hint})`}
                </option>
              ))}
            </select>
            {(() => {
              const chosen = cosmetics?.accents.find((a) => a.id === settings.cosmetics.accent)
              const color = chosen ? (chosen.color ?? cosmetics?.beltColor) : null
              return color ? <span className="swatch" style={{ background: color }} title={chosen?.name} /> : null
            })()}
          </div>
        </Row>

        <Row label="Theme" desc="The window itself. More arrive with rank.">
          <div className="inline">
            <select
              className="field"
              value={settings.cosmetics.uiTheme}
              onChange={(e) =>
                void update({
                  cosmetics: { ...settings.cosmetics, uiTheme: e.target.value }
                })
              }
            >
              {(cosmetics?.uiThemes ?? []).map((item) => (
                <option key={item.id} value={item.id} disabled={!item.unlocked}>
                  {item.unlocked ? item.name : `${item.name} (locked: ${item.hint})`}
                </option>
              ))}
            </select>
            {(() => {
              const chosen = cosmetics?.uiThemes.find((t) => t.id === settings.cosmetics.uiTheme)
              const p = chosen?.preview
              return p && p.length >= 2 ? (
                <span
                  className="swatch"
                  style={{ background: `linear-gradient(135deg, ${p[0]} 50%, ${p[1]} 50%)` }}
                  title={chosen?.name}
                />
              ) : null
            })()}
          </div>
        </Row>

        <Row label="Overlay" desc="See the pill without dictating.">
          <button className="btn" onClick={() => void bridge().previewOverlay()}>
            Preview overlay
          </button>
        </Row>

        <Row label="Setup wizard" desc="Walk the guided setup again anytime.">
          <button className="btn" onClick={() => setWizardOpen(true)}>
            Run wizard
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
                  {String(entry.from ?? '')} → {String(entry.to ?? '')}
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
                  {String(entry.trigger ?? '')} →{' '}
                  {String(entry.text ?? '').length > 24
                    ? `${String(entry.text ?? '').slice(0, 24)}…`
                    : String(entry.text ?? '')}
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

      <section className="panel">
        <p className="micro-label">system</p>

        <Row label="Sounds" desc="Quiet cues for start, stop, insert, and errors.">
          <div className="inline">
            <select
              className="field"
              value={settings.sounds.enabled ? 'on' : 'off'}
              onChange={(e) =>
                void update({ sounds: { ...settings.sounds, enabled: e.target.value === 'on' } })
              }
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
            <VolumeSlider
              value={settings.sounds.volume}
              disabled={!settings.sounds.enabled}
              onCommit={(volume) => void update({ sounds: { ...settings.sounds, volume } })}
            />
          </div>
        </Row>

        <Row
          label="Start at login"
          desc="Opens murmur in the tray when you log in. Applies to installed builds."
        >
          <select
            className="field"
            value={settings.autostart ? 'on' : 'off'}
            onChange={(e) => void update({ autostart: e.target.value === 'on' })}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </Row>
      </section>

      <section className="panel">
        <p className="micro-label">recap</p>
        <Row label="Daily recap" desc="A notification with your day's numbers; click it to open the wrap-up.">
          <div className="inline">
            <select
              className="field"
              value={settings.recap.enabled ? 'on' : 'off'}
              onChange={(e) =>
                void update({
                  recap: { ...settings.recap, enabled: e.target.value === 'on' }
                })
              }
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
            <RecapTimeInput
              value={settings.recap.time}
              disabled={!settings.recap.enabled}
              onCommit={(time) => void update({ recap: { ...settings.recap, time } })}
            />
            <button className="btn" onClick={() => void bridge().testRecap()}>
              Test
            </button>
          </div>
        </Row>
        <p className="row-desc rates-note">
          Test fires a real notification through the same pipe as belt promotions and
          achievements. Nothing appearing on a Mac? System Settings, Notifications: allow
          Electron while running from source (the installed app shows as murmur) and pick
          the Banners style.
        </p>
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
        <p className="micro-label">murmur pro</p>
        <ProSection />
      </section>

      <section className="panel">
        <p className="micro-label">try it</p>
        <Row
          label="Test dictation"
          desc={`Click into the box, hold ${settings.hotkey.binding}, say something, release.`}
        >
          <textarea className="field trybox" placeholder="dictate here…" rows={3} />
        </Row>
      </section>

      </div>

      <footer className="foot dim">
        murmur {version} · free software under{' '}
        <button className="link-btn" onClick={() => void bridge().openLicense()}>
          GPL-3.0-only
        </button>{' '}
        · copyright LaBroi Walton
      </footer>
    </main>
  )
}

function ProSection(): React.JSX.Element {
  const [status, setStatus] = useState<import('../../main/license').LicenseStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [rejected, setRejected] = useState(false)

  useEffect(() => {
    void bridge().getLicenseStatus().then(setStatus)
  }, [])

  if (!status) return <div />
  if (status.pro) {
    return (
      <p className="row-desc">
        {status.founder
          ? 'Founding member. A permanent ten percent discount on every future paid product is yours, cloud included. '
          : 'Pro is active. '}
        Thank you for supporting free software; your belts stay earned, never bought, and every
        Pro convenience lands here first. Supporter since{' '}
        {new Date(status.since).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}.
      </p>
    )
  }

  const activate = async (): Promise<void> => {
    const next = await bridge().setLicenseKey(draft)
    setStatus(next)
    setRejected(!next.pro)
  }

  return (
    <Row
      label="License key"
      desc={
        rejected
          ? 'That key did not verify. Check for missing characters and try again.'
          : 'One-time purchase, verified offline, yours forever. Cosmetics stay earned, never bought.'
      }
    >
      <div className="inline">
        <input
          className="field"
          placeholder="MURMUR-…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setRejected(false)
          }}
        />
        <button className="btn" onClick={() => void activate()} disabled={draft.trim().length === 0}>
          Activate
        </button>
        {proConfig.buyUrl && (
          <button className="btn quiet-btn" onClick={() => void bridge().openBuyPage()}>
            Get Pro
          </button>
        )}
      </div>
    </Row>
  )
}

function ProfilesRow(props: {
  settings: Settings
  onSettings: (s: Settings) => void
}): React.JSX.Element {
  const [pro, setPro] = useState<boolean | null>(null)
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState('')
  const profiles = props.settings.provider.profiles

  useEffect(() => {
    void bridge().getLicenseStatus().then((s) => setPro(s.pro))
  }, [])

  if (pro === null) return <div />
  if (!pro) {
    return (
      <Row
        label="Profiles"
        desc="murmur Pro: save this whole setup (endpoint, models, and key) under a name and switch providers in one click."
      >
        {proConfig.buyUrl ? (
          <button className="btn quiet-btn" onClick={() => void bridge().openBuyPage()}>
            Get Pro
          </button>
        ) : (
          <span className="dim">Pro feature</span>
        )}
      </Row>
    )
  }

  const handle = (result: import('../../main/profiles').ProfileResult): void => {
    if (result.ok) props.onSettings(result.settings)
  }

  return (
    <Row
      label="Profiles"
      desc="Each profile carries its endpoint, models, and key. Applying one swaps the whole setup."
    >
      <div className="inline profiles-stack">
        {profiles.length > 0 && (
          <div className="inline">
            <select className="field" value={chosen} onChange={(e) => setChosen(e.target.value)}>
              <option value="">choose a profile…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={!chosen}
              onClick={() => void bridge().applyProviderProfile(chosen).then(handle)}
            >
              Apply
            </button>
            <button
              className="btn quiet-btn"
              disabled={!chosen}
              onClick={() => {
                void bridge().deleteProviderProfile(chosen).then(handle)
                setChosen('')
              }}
            >
              Delete
            </button>
          </div>
        )}
        <div className="inline">
          <input
            className="field"
            placeholder="name this setup…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn"
            disabled={name.trim().length === 0}
            onClick={() => {
              void bridge().saveProviderProfile(name.trim()).then(handle)
              setName('')
            }}
          >
            Save current
          </button>
        </div>
      </div>
    </Row>
  )
}
