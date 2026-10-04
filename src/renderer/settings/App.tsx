// SPDX-License-Identifier: GPL-3.0-only
// The settings surface. Quiet night-studio panels; the overlay pill
// stays the only loud element in the product. The settings tab is a
// rail of sections beside one scrolling column (US-069).
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HotkeysStatus,
  KeyStatus,
  RingStatus,
  PermissionsStatus,
  ProviderTestResult,
  SettingsApi
} from '../../preload/settings'
import proConfig from '../../../shared/pro.json'
import { type ProviderCatalog, costPer1kWords, providerForBaseUrl } from '../../shared/catalog'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'
import { type OverlayLook, normalizeOverlayLook } from '../../shared/overlay-state'
import { MAX_TYPING_WPM, MIN_TYPING_WPM } from '../../shared/timeback'
import { AnalyticsView } from './AnalyticsView'
import { ApiKeys } from './ApiKeys'
import { HomeView } from './HomeView'
import { PageTitle } from './PageTitle'
import { JourneyView } from './JourneyView'
import { WizardView } from './WizardView'
import { WrapUpView } from './WrapUpView'
import { ConnectionRows } from './ConnectionRows'
import { NotesPanel } from './NotesPanel'
import { TransformPanel } from './TransformPanel'
import { type RailSection, SettingsRail } from './SettingsRail'
import { FinishSetup, type SetupCheck, setupStatus } from './SetupStatus'
import {
  Advanced,
  ModelPicker,
  NumberSetting,
  Row,
  Section,
  Segmented,
  Switch,
  TextSetting,
  TimeInput,
  jumpToRow
} from './controls'

declare global {
  interface Window {
    murmur: SettingsApi
  }
}

const bridge = (): SettingsApi => window.murmur

const RAIL_GROUPS = [
  { id: 'essentials', label: 'essentials' },
  { id: 'features', label: 'features' },
  { id: 'app', label: 'app' }
] as const

const FORMAT_DESC: Record<Settings['formatting']['level'], string> = {
  off: 'Raw transcript, exactly as heard.',
  light: 'Removes fillers and fixes capitals.',
  full: 'Punctuation commands plus the cleanup model.'
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
      aria-label="Sound volume"
      onChange={(e) => setDraft(Number(e.target.value))}
      onPointerUp={commit}
      onBlur={commit}
    />
  )
}

/**
 * Inline add line for a pair of values, the last line of a list well.
 * multilineRight turns the second field into a textarea (snippets need
 * line breaks for sign-offs): Enter makes a new line there, Cmd or
 * Ctrl+Enter and the Add button submit.
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
    <div className="well-add">
      <input
        className="field mono-field"
        placeholder={props.placeholderLeft}
        aria-label={props.placeholderLeft}
        value={left}
        onChange={(e) => setLeft(e.target.value)}
      />
      <span className="well-arrow">→</span>
      {props.multilineRight ? (
        <textarea
          className="field mono-field well-multiline"
          placeholder={props.placeholderRight}
          aria-label={props.placeholderRight}
          rows={1}
          value={right}
          onChange={(e) => setRight(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
        />
      ) : (
        <input
          className="field mono-field"
          placeholder={props.placeholderRight}
          aria-label={props.placeholderRight}
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

/** One macOS permission on its own line of the permissions list. */
function PermissionLine(props: {
  anchor: string
  name: string
  ok: boolean | null
  okText: string
  badText: string
  onOpen: () => void
}): React.JSX.Element {
  return (
    <div className="well-item" id={props.anchor}>
      <span className="well-name">{props.name}</span>
      {props.ok === null ? (
        <span className="well-meta">…</span>
      ) : props.ok ? (
        <span className="badge-ok">{props.okText}</span>
      ) : (
        <span className="well-meta well-meta-bad">{props.badText}</span>
      )}
      <div className="well-actions">
        {props.ok === false && (
          <button className="btn" aria-label={`Open ${props.name} settings`} onClick={props.onOpen}>
            Open settings
          </button>
        )}
      </div>
    </div>
  )
}

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [keyStatus, setKeyStatus] = useState<RingStatus>({
    active: { present: false, masked: null },
    list: [],
    legacy: { present: false, masked: null }
  })
  const [test, setTest] = useState<ProviderTestResult | null>(null)
  // Starts true: until the first verdict is in (or there is no key to
  // test), the connection reads as checking, never as failing, so the
  // Finish setup card does not flash open on every launch.
  const [testing, setTesting] = useState(true)
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null)
  const [avgWpm, setAvgWpm] = useState(0)
  const [polishKeyStatus, setPolishKeyStatus] = useState<KeyStatus>({ present: false, masked: null })
  // License status lives at the app level so every surface that gates
  // on Pro (the pro panel, the profiles row) reads ONE truth and an
  // activation or deactivation updates them all at once (live-found
  // 2026-09-14: the profiles row cached its own copy from mount and
  // kept selling Get Pro to a fresh founding member).
  const [license, setLicense] = useState<import('../../main/license').LicenseStatus | null>(null)
  const [customPreset, setCustomPreset] = useState(false)
  const [perms, setPerms] = useState<PermissionsStatus | null>(null)
  const [hotkeys, setHotkeys] = useState<HotkeysStatus | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureNote, setCaptureNote] = useState<string | null>(null)
  const [pasteCapturing, setPasteCapturing] = useState(false)
  const [pasteCaptureNote, setPasteCaptureNote] = useState<string | null>(null)
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

  // Each test carries a number, and a base URL change bumps it too, so
  // a verdict that lands late (an overlapping test, or one earned
  // against the provider just switched away from) is dropped instead of
  // vouching for the wrong key.
  const testSeq = useRef(0)
  const runTest = useCallback(async (): Promise<void> => {
    const seq = ++testSeq.current
    setTesting(true)
    try {
      const result = await bridge().testProvider()
      if (seq === testSeq.current) setTest(result)
    } finally {
      if (seq === testSeq.current) setTesting(false)
    }
  }, [])

  /** Re-read the key ring, then give setup a verdict for the active key
   *  (or stop waiting on one when there is none). */
  const recheckKey = useCallback(async (): Promise<void> => {
    const seq = ++testSeq.current
    setTest(null)
    setTesting(true)
    const k = await bridge().getApiKeyStatus()
    // A save or another recheck that started meanwhile owns the verdict.
    if (seq !== testSeq.current) return
    setKeyStatus(k)
    if (k.active.present) await runTest()
    else setTesting(false)
  }, [runTest])

  useEffect(() => {
    // The recap notification lands on the wrap-up page.
    const unNav = bridge().onNavigate((target) => {
      if (target === 'wrapup') setPage('wrapup')
    })
    void bridge().appVersion().then(setVersion)
    void bridge().getCatalog().then(setCatalog)
    void bridge()
      .getAnalytics()
      .then((a) => setAvgWpm(a.lifetime.avgWpm))
    void bridge().getPolishKeyStatus().then(setPolishKeyStatus)
    void bridge().getLicenseStatus().then(setLicense)
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
      // a key is already saved. With no key there is nothing to wait on.
      // (A second mount in development leaves the first test running.)
      if (!k.active.present) {
        setTesting(false)
      } else if (!autoTested.current) {
        autoTested.current = true
        void runTest()
      }
      // Fresh profiles get the guided path once, automatically.
      if (!offeredWizard.current) {
        offeredWizard.current = true
        void bridge()
          .getSettings()
          .then((s) => {
            if (!s.onboarding.completed && !k.active.present) setWizardOpen(true)
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
  }, [refresh, runTest])

  const update = async (partial: Partial<Settings>): Promise<void> => {
    setSettings(await bridge().updateSettings(partial))
    setHotkeys(await bridge().getHotkeysStatus())
  }

  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.cosmetics.uiTheme
  }, [settings])

  // A base URL change resets what no longer holds: the sticky Custom
  // pick (whole-config actions land on real presets and the select
  // must tell the truth) and the connection verdict (a green
  // "connected" earned against the OLD provider would otherwise keep
  // vouching for the new one; live-found 2026-09-14 with a Groq key
  // shown connected under an OpenAI base URL).
  const prevBaseUrl = useRef<string | null>(null)
  useEffect(() => {
    const current = settings?.provider.baseUrl ?? null
    if (prevBaseUrl.current !== null && current !== null && current !== prevBaseUrl.current) {
      setCustomPreset(false)
      // The ring speaks per provider: a switch changes whose key the
      // active slot describes, so stale status must never linger
      // (live-found 2026-09-17: a Groq mask under a Mistral label with
      // a green Mistral key saved chip). The new provider's own saved
      // key is then tested, so a healthy switch folds setup away again.
      void recheckKey()
    }
    prevBaseUrl.current = current
  }, [settings?.provider.baseUrl, recheckKey])

  // A new tab starts at its top, where the Finish setup card lives.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  // Resolves once the key is stored, so the field clears at once; the
  // connection test runs on behind it.
  const saveKey = async (key: string): Promise<void> => {
    if (key.trim().length === 0) return
    testSeq.current++
    setTest(null)
    setTesting(true)
    try {
      setKeyStatus(await bridge().setApiKey(key.trim()))
    } catch (error) {
      // The store refused (encryption unavailable): nothing was saved,
      // so setup must say so rather than read checking forever.
      void recheckKey()
      throw error
    }
    void runTest()
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

  const startPasteCapture = async (): Promise<void> => {
    if (pasteCapturing) return
    setPasteCapturing(true)
    setPasteCaptureNote(null)
    try {
      const result = await bridge().captureHotkey('pasteLast')
      if (result.ok) {
        await refresh()
      } else if (result.reason === 'needs-key') {
        setPasteCaptureNote('this chord needs a regular key too, like Ctrl+F12; modifiers alone fire by accident')
      } else if (result.reason === 'collides') {
        setPasteCaptureNote('that combo contains your dictation hotkey, so holding it would start a recording; pick another')
      } else {
        setPasteCaptureNote('not captured; click and try again, Esc cancels')
      }
    } finally {
      setPasteCapturing(false)
    }
  }

  if (!settings) return <main className="shell" />

  // Catalog-derived view of the active connections: which preset the
  // base URLs match, the model rate entries, and the pace-aware cost
  // preview. All local math; nothing here leaves the machine.
  const sttProvider = catalog ? providerForBaseUrl(catalog, settings.provider.baseUrl) : null
  // The ring is structural provenance: the active provider either has
  // its own key or it does not, and every other saved key lists under
  // its own provider. No inference, no guessing.
  const normalizeUrl = (u: string): string => u.replace(/\/$/, '')
  const polishActive = settings.polish.enabled && settings.polish.baseUrl !== '' && settings.polish.llmModel !== ''
  const llmProvider =
    catalog && polishActive ? providerForBaseUrl(catalog, settings.polish.baseUrl) : sttProvider
  const activeLlmModel = polishActive ? settings.polish.llmModel : settings.provider.llmModel
  const costParts = catalog
    ? costPer1kWords(
        sttProvider?.sttModels.find((m) => m.id === settings.provider.sttModel) ?? null,
        llmProvider?.llmModels.find((m) => m.id === activeLlmModel) ?? null,
        catalog.estimate,
        avgWpm
      )
    : null

  if (wizardOpen) {
    return (
      <main className="shell">
        <header className="masthead">
          <p className="micro-label wordmark">murmur</p>
        </header>
        <div className="page">
          <WizardView
            settings={settings}
            onSettings={setSettings}
            onFinish={() => {
              // The wizard tested its own connection; the settings badge
              // needs a verdict of its own. The window leaves the wizard
              // only once the key status is fresh, so setup never reads
              // the stale no-key state for a frame.
              setTesting(true)
              void update({ onboarding: { completed: true } })
                .then(() => refresh())
                .then(
                  (k) => {
                    if (k.active.present) void runTest()
                    else setTesting(false)
                  },
                  () => void recheckKey()
                )
                .finally(() => setWizardOpen(false))
            }}
          />
        </div>
      </main>
    )
  }

  const isMac = navigator.platform.toLowerCase().includes('mac')
  const micOk = perms?.microphone === 'granted'
  const keyOk = keyStatus.active.present
  const providerName = sttProvider?.name ?? 'your provider'
  const keyName = sttProvider?.name ?? 'API'
  const openPane = (pane: 'microphone' | 'accessibility' | 'input') => (): void =>
    void bridge().openPermissionPane(pane)

  const checks: SetupCheck[] = [
    {
      id: 'key',
      readyLabel: `${keyName} key saved`,
      state: keyOk ? 'ok' : 'bad',
      title: `Add your ${keyName} key`,
      desc: 'murmur needs it to turn speech into text.',
      action: { label: 'Add key', primary: true, onClick: () => jumpToRow('row-key', { focus: true }) }
    },
    {
      id: 'conn',
      readyLabel: 'Provider connected',
      state: !keyOk ? 'waiting' : testing ? 'pending' : test?.ok ? 'ok' : 'bad',
      title: !keyOk
        ? 'Check the connection'
        : testing
          ? 'Checking the connection'
          : test
            ? 'The connection failed'
            : 'Test the connection',
      desc: !keyOk
        ? 'Runs by itself once the key is saved.'
        : testing
          ? `Asking ${providerName} whether the key works.`
          : test
            ? test.detail
            : `Checks the key in use against ${providerName}.`,
      action: keyOk && !testing ? { label: 'Test', onClick: () => void runTest() } : undefined
    },
    ...(isMac
      ? [
          {
            id: 'mic',
            readyLabel: 'Microphone',
            state: perms === null ? 'pending' : micOk ? 'ok' : 'bad',
            title: 'Allow the microphone',
            desc:
              perms?.microphone === 'not-determined'
                ? 'murmur asks the first time you dictate. Try it once to answer.'
                : 'Allow murmur under Microphone in System Settings.',
            action:
              perms?.microphone === 'not-determined'
                ? { label: 'Try it', onClick: () => jumpToRow('row-try-it', { focus: true }) }
                : { label: 'Open settings', ariaLabel: 'Open Microphone settings', onClick: openPane('microphone') }
          } satisfies SetupCheck,
          {
            id: 'axs',
            readyLabel: 'Accessibility',
            state: perms === null ? 'pending' : perms.accessibility ? 'ok' : 'bad',
            title: 'Allow Accessibility',
            desc: 'Lets murmur press Cmd+V to put text at your cursor.',
            action: { label: 'Open settings', ariaLabel: 'Open Accessibility settings', onClick: openPane('accessibility') }
          } satisfies SetupCheck,
          {
            id: 'input',
            readyLabel: 'Input monitoring',
            state: perms === null ? 'pending' : perms.inputMonitoring ? 'ok' : 'bad',
            title: 'Allow Input monitoring',
            desc: 'Lets your hotkey work in every app. Quit and reopen murmur after allowing it.',
            action: { label: 'Open settings', ariaLabel: 'Open Input monitoring settings', onClick: openPane('input') }
          } satisfies SetupCheck
        ]
      : []),
    {
      id: 'hotkey',
      readyLabel: 'Hotkey ready',
      state: hotkeys === null ? 'pending' : hotkeys.bindingValid ? 'ok' : 'bad',
      title: 'Set a working hotkey',
      desc: 'The current combo cannot be armed. Capture a new one.',
      action: { label: 'Set hotkey', onClick: () => jumpToRow('row-hotkey') }
    }
  ]
  const status = setupStatus(checks)
  const failing = (...ids: string[]): boolean =>
    checks.some((c) => ids.includes(c.id) && c.state === 'bad')

  const railSections: RailSection[] = [
    { id: 'provider', title: 'Provider and keys', group: 'essentials', alert: failing('key', 'conn') },
    { id: 'dictation', title: 'Dictation', group: 'essentials', alert: failing('hotkey') },
    { id: 'dictionary', title: 'Dictionary', group: 'essentials' },
    { id: 'notes', title: 'Notes', group: 'features' },
    { id: 'transform', title: 'Transform', group: 'features' },
    { id: 'timeback', title: 'Time back and recap', group: 'features' },
    { id: 'look', title: 'Look', group: 'app' },
    { id: 'system', title: 'System', group: 'app', alert: failing('mic', 'axs', 'input') },
    { id: 'pro', title: 'murmur Pro', group: 'app' }
  ]

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

  const otherKeys = keyStatus.list
    .filter((entry) => normalizeUrl(entry.baseUrl) !== normalizeUrl(settings.provider.baseUrl))
    .map((entry) => {
      const owner = catalog ? providerForBaseUrl(catalog, entry.baseUrl) : null
      return { baseUrl: entry.baseUrl, name: owner?.name ?? entry.baseUrl, masked: entry.masked }
    })
  const providerDiffers =
    settings.provider.baseUrl !== DEFAULT_SETTINGS.provider.baseUrl ||
    settings.provider.sttModel !== DEFAULT_SETTINGS.provider.sttModel ||
    settings.provider.llmModel !== DEFAULT_SETTINGS.provider.llmModel

  const navButton = (id: typeof page, label: string): React.JSX.Element => (
    <button className={`nav-btn ${page === id ? 'nav-active' : ''}`} onClick={() => setPage(id)}>
      {label}
    </button>
  )

  return (
    <main
      className="shell"
      style={guiAccent ? ({ '--gui-accent': guiAccent } as React.CSSProperties) : undefined}
    >
      <header className="masthead">
        <p className="micro-label wordmark">
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
        <nav className="nav" aria-label="Pages">
          {navButton('home', 'home')}
          {navButton('analytics', 'analytics')}
          {navButton('wrapup', 'wrap-up')}
          {navButton('journey', 'journey')}
          {navButton('setup', 'settings')}
          {status === 'bad' && page !== 'setup' && <span className="nav-alert">✗</span>}
        </nav>
      </header>

      {page !== 'setup' && (
        <div className="page">
          {page === 'home' && <HomeView settings={settings} onUpdateSettings={update} />}
          {page === 'analytics' && <AnalyticsView hotkey={settings.hotkey.binding} />}
          {page === 'wrapup' && <WrapUpView typingWpm={settings.timeBack.typingWpm} hotkey={settings.hotkey.binding} />}
          {page === 'journey' && <JourneyView hotkey={settings.hotkey.binding} />}
        </div>
      )}

      {/* Settings stay mounted while hidden, so half-typed drafts and
          capture notes survive a trip to another tab. */}
      <div className="settings-layout" style={{ display: page === 'setup' ? undefined : 'none' }}>
        <SettingsRail
          sections={railSections}
          groups={RAIL_GROUPS}
          checks={checks}
          status={status}
          visible={page === 'setup'}
        />

        <div className="settings-content">
          <PageTitle title="Settings" sub="How murmur listens, where your words go, and how it looks." />
          {status === 'bad' && <FinishSetup checks={checks} />}

          <Section
            id="provider"
            title="Provider and keys"
            sub="Where your voice is transcribed, and the keys murmur uses to get there."
          >
            <Row
              label="Provider"
              keywords="groq openai mistral deepseek endpoint service preset custom"
              desc={
                customPreset || !sttProvider
                  ? 'Custom: set the address and models yourself. The base URL is under Advanced below.'
                  : 'A preset fills in the address and models.'
              }
            >
              <select
                className="field"
                aria-label="Provider"
                value={customPreset ? 'custom' : (sttProvider?.id ?? 'custom')}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setCustomPreset(true)
                    // Custom means the fields are yours: say so by
                    // walking the eye to the first one to edit.
                    jumpToRow('row-base-url', { tone: 'glow' })
                    return
                  }
                  const preset = catalog?.providers.find(
                    (p) => p.id === e.target.value && p.kinds.includes('stt')
                  )
                  if (!preset) return
                  setCustomPreset(false)
                  void update({
                    provider: {
                      baseUrl: preset.baseUrl,
                      sttModel: preset.sttModels[0]?.id ?? settings.provider.sttModel,
                      llmModel: preset.llmModels[0]?.id ?? settings.provider.llmModel
                    } as Settings['provider']
                  })
                  // Walk the user straight to the key field when the ring
                  // holds no key for the provider they just chose.
                  const hasKeyFor = keyStatus.list.some(
                    (entry) => normalizeUrl(entry.baseUrl) === normalizeUrl(preset.baseUrl)
                  )
                  if (!hasKeyFor) jumpToRow('row-key', { tone: 'glow' })
                }}
              >
                <option value="custom">Custom</option>
                {(catalog?.providers.filter((p) => p.kinds.includes('stt')) ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Row>

            <Row
              label="API keys"
              anchor="row-key"
              block
              keywords="api key token secret password"
              desc="Encrypted on this computer. Each provider keeps its own key; murmur uses the one marked in use."
            >
              <ApiKeys
                providerName={sttProvider?.name ?? 'Custom'}
                keyUrl={sttProvider?.keyUrl?.replace('https://', '') ?? null}
                placeholder={sttProvider?.id === 'groq' ? 'gsk_…' : `paste a ${sttProvider?.name ?? ''} key`}
                active={keyStatus.active}
                others={otherKeys}
                legacy={keyStatus.legacy}
                onSave={saveKey}
                onRemoveActive={() => void bridge().clearApiKey().then(() => recheckKey())}
                onRemoveOther={(baseUrl) => void bridge().removeKeyFor(baseUrl).then(setKeyStatus)}
                onAssignLegacy={() => void bridge().assignLegacyKey().then(() => recheckKey())}
                onRemoveLegacy={() => void bridge().removeLegacyKey().then(setKeyStatus)}
              />
            </Row>

            <Row
              label="Connection"
              anchor="row-conn"
              keywords="test verify check"
              desc={
                test && !test.ok && !testing ? test.detail : `Checks the key in use against ${providerName}.`
              }
            >
              <div className="inline">
                {testing && keyOk ? (
                  <span className="status-dim">testing…</span>
                ) : (
                  test && (
                    <span className={test.ok ? 'status-ok' : 'status-bad'}>
                      {test.ok ? 'connected' : 'failed'}
                    </span>
                  )
                )}
                <button className="btn" onClick={() => void runTest()} disabled={!keyOk || testing}>
                  Test
                </button>
              </div>
            </Row>

            <Row label="Speech model" desc="Turns your voice into text. Pick one or type any model id your provider offers.">
              {sttProvider && sttProvider.sttModels.length > 0 ? (
                <ModelPicker
                  label="Speech model"
                  value={settings.provider.sttModel}
                  options={sttProvider.sttModels.map((m) => m.id)}
                  onCommit={(sttModel) => void update({ provider: { sttModel } as Settings['provider'] })}
                />
              ) : (
                <TextSetting
                  value={settings.provider.sttModel}
                  listId="stt-models"
                  options={['whisper-large-v3-turbo', 'whisper-large-v3']}
                  onCommit={(sttModel) => void update({ provider: { sttModel } as Settings['provider'] })}
                />
              )}
            </Row>

            <Row
              label="Cleanup model"
              keywords="llm polish formatting"
              desc="Polishes text at Full formatting. If it misbehaves, murmur falls back to built-in cleanup."
            >
              {sttProvider && sttProvider.llmModels.length > 0 ? (
                <ModelPicker
                  label="Cleanup model"
                  value={settings.provider.llmModel}
                  options={sttProvider.llmModels.map((m) => m.id)}
                  onCommit={(llmModel) => void update({ provider: { llmModel } as Settings['provider'] })}
                />
              ) : (
                <TextSetting
                  value={settings.provider.llmModel}
                  listId="llm-models"
                  options={['openai/gpt-oss-120b', 'openai/gpt-oss-20b']}
                  onCommit={(llmModel) => void update({ provider: { llmModel } as Settings['provider'] })}
                />
              )}
            </Row>

            <ConnectionRows
              value={settings.polish}
              catalog={catalog}
              keyStatus={polishKeyStatus}
              onKeyStatus={(status) => {
                setPolishKeyStatus(status)
                void bridge().getApiKeyStatus().then(setKeyStatus)
              }}
              onChange={(polish) => update({ polish })}
              labels={{
                connection: 'Cleanup runs on',
                connectionDesc:
                  'Separate lets cleanup run elsewhere with its own key: Groq speech with a DeepSeek cleanup, for example.',
                sameOption: 'Same as speech',
                provider: 'Cleanup provider',
                baseUrl: 'Cleanup base URL',
                model: 'Cleanup model id',
                key: 'Cleanup key',
                keyDesc:
                  'This connection has its own key, stored encrypted like the primary one. Until one is saved, cleanup keeps riding your speech provider.',
                sharedDesc: "Shares the speech connection's key: one provider, one key. It is in the API keys list above."
              }}
              sharedWith={[settings.provider.baseUrl]}
              anchor="row-cleanup-connection"
              api={{
                setKey: (key) => bridge().setPolishKey(key),
                clearKey: () => bridge().clearPolishKey(),
                status: () => bridge().getPolishKeyStatus(),
                test: () => bridge().testPolishProvider()
              }}
            />

            {catalog && (
              <p className="row-note">
                {sttProvider?.free
                  ? 'Free: this preset runs on your machine, nothing is billed.'
                  : costParts
                    ? `Estimated ${formatCostParts(costParts)} per 1,000 words at ${
                        avgWpm > 0 ? `your pace (${avgWpm} wpm)` : `a typical pace (${catalog.estimate.fallbackWpm} wpm)`
                      }. `
                    : 'No published rates for this setup; check your provider. '}
                {(sttProvider ? [sttProvider, ...(llmProvider && llmProvider !== sttProvider ? [llmProvider] : [])] : [])
                  .flatMap((p) => p.nuances)
                  .join(' ')}
                {sttProvider ? ` Rates verified ${sttProvider.verifiedOn}; estimates only, your provider bills you directly.` : ''}
              </p>
            )}

            <Advanced hint="base URL, profiles, price refresh, defaults">
              <Row
                label="Base URL"
                anchor="row-base-url"
                keywords="endpoint address proxy local server"
                desc="Any OpenAI-compatible endpoint: OpenAI, a proxy, or a local server. Test the connection after changing it."
              >
                <TextSetting
                  wide
                  value={settings.provider.baseUrl}
                  placeholder="https://api.groq.com/openai/v1"
                  onCommit={(baseUrl) => void update({ provider: { baseUrl } as Settings['provider'] })}
                />
              </Row>

              <ProfilesRow
                settings={settings}
                onSettings={setSettings}
                onKeysChanged={() =>
                  // Only a profile that brings back a missing key needs a
                  // verdict; a base URL change rechecks on its own.
                  void bridge()
                    .getApiKeyStatus()
                    .then((k) => {
                      setKeyStatus(k)
                      if (k.active.present && !keyOk) void runTest()
                    })
                }
                pro={license === null ? null : license.pro}
              />

              <Row
                label="Price refresh"
                keywords="rates cost catalog"
                desc="At launch, fetch the newest provider rate sheet from the murmur repo, with nothing about you attached. Off uses the rates this version shipped with."
              >
                <Switch
                  checked={settings.catalogRefresh}
                  label="Price refresh"
                  onChange={(catalogRefresh) => void update({ catalogRefresh })}
                />
              </Row>

              {providerDiffers && (
                <Row label="Groq defaults" desc="Put the provider, base URL, and models back to the Groq preset.">
                  <button
                    className="btn"
                    onClick={() => void update({ provider: { ...DEFAULT_SETTINGS.provider } })}
                  >
                    Reset
                  </button>
                </Row>
              )}
            </Advanced>
          </Section>

          <Section id="dictation" title="Dictation" sub="How you start talking and where the words land.">
            <Row
              label="Hotkey"
              anchor="row-hotkey"
              keywords="shortcut keyboard combo push to talk"
              desc={captureNote ?? 'Click, then press the combo. Modifiers alone work too (press and release Ctrl+Alt). Esc cancels.'}
            >
              <div className="inline">
                <button
                  className={`field capture ${capturing ? 'capture-live' : ''}`}
                  aria-label={`Dictation hotkey, ${settings.hotkey.binding}. Click to change.`}
                  onClick={() => void startCapture()}
                >
                  {capturing ? 'press keys…' : settings.hotkey.binding}
                </button>
                {settings.hotkey.binding !== DEFAULT_SETTINGS.hotkey.binding && (
                  <button
                    className="btn"
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

            <Row label="Trigger" keywords="hold toggle mode" desc="Hold while you speak, or tap to start and tap again to stop.">
              <Segmented
                label="Trigger"
                value={settings.hotkey.mode}
                options={[
                  { value: 'hold', label: 'Hold to talk' },
                  { value: 'toggle', label: 'Toggle' }
                ]}
                onChange={(mode) => void update({ hotkey: { mode } as Settings['hotkey'] })}
              />
            </Row>

            <Row label="Insert by" keywords="paste clipboard copy" desc="Paste puts text at your cursor. Copy only fills the clipboard.">
              <Segmented
                label="Insert by"
                value={settings.insertion.mode}
                options={[
                  { value: 'paste', label: 'Paste at cursor' },
                  { value: 'copy', label: 'Copy only' }
                ]}
                onChange={(mode) => void update({ insertion: { mode } as Settings['insertion'] })}
              />
            </Row>

            <Row label="Formatting" keywords="punctuation cleanup polish fillers" desc={FORMAT_DESC[settings.formatting.level]}>
              <Segmented
                label="Formatting"
                value={settings.formatting.level}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'light', label: 'Light' },
                  { value: 'full', label: 'Full' }
                ]}
                onChange={(level) => void update({ formatting: { ...settings.formatting, level } })}
              />
            </Row>

            <Row
              label="Smart lists"
              keywords="bullets numbered"
              desc="At Full formatting, spoken sequences (first, then, then) become numbered lists, and saying bullet point or next item starts a dash line."
            >
              <Switch
                checked={settings.formatting.smartLists}
                label="Smart lists"
                onChange={(smartLists) => void update({ formatting: { ...settings.formatting, smartLists } })}
              />
            </Row>

            <Row
              label="Paste last dictation"
              keywords="repeat again chord"
              desc={
                pasteCaptureNote ??
                (settings.hotkey.pasteLastBinding !== '' && hotkeys && !hotkeys.pasteBindingValid
                  ? 'This chord is disarmed: it clashes with your dictation hotkey or the note chord, or no longer parses. Capture a new one.'
                  : 'A chord that pastes your newest dictation again, wherever your cursor is. Off until you set one; a modifier plus an F-key is safest.')
              }
            >
              <div className="inline">
                <button
                  className={`field capture ${pasteCapturing ? 'capture-live' : ''}`}
                  aria-label="Paste last dictation chord. Click to change."
                  onClick={() => void startPasteCapture()}
                >
                  {pasteCapturing
                    ? 'press keys…'
                    : settings.hotkey.pasteLastBinding === ''
                      ? 'not set'
                      : settings.hotkey.pasteLastBinding}
                </button>
                {settings.hotkey.pasteLastBinding !== '' && (
                  <button
                    className="btn btn-remove"
                    onClick={() => {
                      setPasteCaptureNote(null)
                      void update({ hotkey: { pasteLastBinding: '' } as Settings['hotkey'] })
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </Row>

            <Row
              label="Try it"
              anchor="row-try-it"
              block
              keywords="test dictation practice"
              desc={`Click into the box, hold ${settings.hotkey.binding}, say something, release.`}
            >
              <textarea className="field trybox" placeholder="dictate here…" rows={2} aria-label="Test dictation" />
            </Row>
          </Section>

          <Section id="dictionary" title="Dictionary" sub="Words murmur should spell your way, and phrases that expand.">
            <Row
              label="Custom words"
              block
              keywords="vocabulary spelling names replacements"
              desc="Names and terms the speech model misspells. Heard becomes written, whole words only, exactly your casing."
            >
              <div className="well">
                {settings.dictionary.map((entry, i) => (
                  <div className="well-item" key={i}>
                    <span className="well-pair">
                      {String(entry.from ?? '')}
                      <span className="well-arrow">→</span>
                      {String(entry.to ?? '')}
                    </span>
                    <div className="well-actions">
                      <button
                        className="btn btn-remove"
                        aria-label={`Remove ${String(entry.from ?? '')}`}
                        onClick={() =>
                          void update({ dictionary: settings.dictionary.filter((_, j) => j !== i) })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <PairAdd
                  placeholderLeft="heard as…"
                  placeholderRight="written as…"
                  onAdd={(from, to) => void update({ dictionary: [...settings.dictionary, { from, to }] })}
                />
              </div>
            </Row>

            <Row
              label="Expansions"
              block
              keywords="snippets shortcuts text replacement"
              desc="Say a trigger phrase, get a snippet: an email address, a sign-off, an intro. Inserted exactly as written; Enter starts a new line in the snippet box."
            >
              <div className="well">
                {settings.expansions.map((entry, i) => {
                  const text = String(entry.text ?? '')
                  const firstLine = text.split('\n')[0]
                  return (
                    <div className="well-item" key={i}>
                      <span className="well-pair" title={text}>
                        {String(entry.trigger ?? '')}
                        <span className="well-arrow">→</span>
                        {firstLine}
                        {firstLine !== text ? ' …' : ''}
                      </span>
                      <div className="well-actions">
                        <button
                          className="btn btn-remove"
                          aria-label={`Remove ${String(entry.trigger ?? '')}`}
                          onClick={() =>
                            void update({ expansions: settings.expansions.filter((_, j) => j !== i) })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                })}
                <PairAdd
                  placeholderLeft="when I say…"
                  placeholderRight="insert…"
                  multilineRight
                  onAdd={(trigger, text) => void update({ expansions: [...settings.expansions, { trigger, text }] })}
                />
              </div>
            </Row>
          </Section>

          <NotesPanel
            settings={settings}
            catalog={catalog}
            hotkeys={hotkeys}
            onUpdate={update}
            onRefresh={refresh}
            onKeysChanged={() => void bridge().getApiKeyStatus().then(setKeyStatus)}
          />

          <TransformPanel
            settings={settings}
            catalog={catalog}
            hotkeys={hotkeys}
            onUpdate={update}
            onRefresh={refresh}
            onKeysChanged={() => void bridge().getApiKeyStatus().then(setKeyStatus)}
          />

          <Section id="timeback" title="Time back and recap" sub="Your daily numbers and how time saved is counted.">
            <Row
              label="Daily recap"
              keywords="notification summary evening"
              desc="A notification with your day's numbers; click it to open the wrap-up. Test sends a real one now."
            >
              <div className="inline">
                <Switch
                  checked={settings.recap.enabled}
                  label="Daily recap"
                  onChange={(enabled) => void update({ recap: { ...settings.recap, enabled } })}
                />
                <TimeInput
                  label="Recap time"
                  value={settings.recap.time}
                  disabled={!settings.recap.enabled}
                  onCommit={(time) => void update({ recap: { ...settings.recap, time } })}
                />
                <button className="btn" onClick={() => void bridge().testRecap()}>
                  Test
                </button>
              </div>
            </Row>
            <Row
              label="Typing speed"
              keywords="wpm words per minute"
              desc="Time back is typing at this speed minus the time you spent speaking. 40 wpm is a fair working average."
            >
              <NumberSetting
                value={settings.timeBack.typingWpm}
                min={MIN_TYPING_WPM}
                max={MAX_TYPING_WPM}
                suffix="wpm"
                onCommit={(typingWpm) => void update({ timeBack: { ...settings.timeBack, typingWpm } })}
              />
            </Row>
            <Row
              label="Milestone alerts"
              keywords="notification"
              desc="A notification each time today's time back crosses a 30-minute mark. Once per mark per day."
            >
              <Switch
                checked={settings.timeBack.milestones}
                label="Milestone alerts"
                onChange={(milestones) => void update({ timeBack: { ...settings.timeBack, milestones } })}
              />
            </Row>
            <p className="row-note">
              Nothing appearing on a Mac? In System Settings, Notifications, allow murmur and pick the Banners style.
            </p>
          </Section>

          <Section id="look" title="Look" sub="The waveform pill and the window around it.">
            <Row
              label="Waveform"
              keywords="overlay style visualizer"
              desc="How the pill draws your voice. Locked styles show how to earn them."
            >
              <select
                className="field"
                aria-label="Waveform"
                value={settings.overlay.style}
                onChange={(e) => void update({ overlay: { ...settings.overlay, style: e.target.value } })}
              >
                {(cosmetics?.overlayStyles ?? []).map((item) => (
                  <option key={item.id} value={item.id} disabled={!item.unlocked}>
                    {item.unlocked ? `${item.name} (${item.hint})` : `${item.name} (locked: ${item.hint})`}
                  </option>
                ))}
              </select>
            </Row>

            <Row
              label="Overlay look"
              keywords="pill compact bare size preview"
              desc="Pill is the classic; compact is the same pill at two thirds; bare drops the box and keeps the waveform. Hints and errors always use the pill."
            >
              <div className="inline">
                <Segmented<OverlayLook>
                  label="Overlay look"
                  value={settings.overlay.look}
                  options={[
                    { value: 'pill', label: 'Pill' },
                    { value: 'compact', label: 'Compact' },
                    { value: 'bare', label: 'Bare' }
                  ]}
                  onChange={(look) =>
                    void update({ overlay: { ...settings.overlay, look: normalizeOverlayLook(look) } })
                  }
                />
                <button className="btn" onClick={() => void bridge().previewOverlay()}>
                  Preview
                </button>
              </div>
            </Row>

            <Row
              label="Accent"
              keywords="color colour"
              desc="Colors the waveform, chart bars, and progress fills. The activity wall keeps its own picker. Earned, never bought."
            >
              <div className="inline">
                {(() => {
                  const chosen = cosmetics?.accents.find((a) => a.id === settings.cosmetics.accent)
                  const color = chosen ? (chosen.color ?? cosmetics?.beltColor) : null
                  return color ? <span className="swatch" style={{ background: color }} title={chosen?.name} /> : null
                })()}
                <select
                  className="field"
                  aria-label="Accent"
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
              </div>
            </Row>

            <Row label="Theme" keywords="dark colors window" desc="The window itself. More arrive with rank.">
              <div className="inline">
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
                <select
                  className="field"
                  aria-label="Theme"
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
              </div>
            </Row>
          </Section>

          <Section id="system" title="System" sub="Sounds, startup, permissions, and diagnostics.">
            <Row label="Sounds" keywords="audio volume chime cues" desc="Quiet cues for start, stop, insert, and errors.">
              <div className="inline">
                <VolumeSlider
                  value={settings.sounds.volume}
                  disabled={!settings.sounds.enabled}
                  onCommit={(volume) => void update({ sounds: { ...settings.sounds, volume } })}
                />
                <Switch
                  checked={settings.sounds.enabled}
                  label="Sounds"
                  onChange={(enabled) => void update({ sounds: { ...settings.sounds, enabled } })}
                />
              </div>
            </Row>

            <Row
              label="Start at login"
              keywords="autostart startup launch boot"
              desc="Opens murmur in the tray when you log in. Applies to installed builds."
            >
              <Switch
                checked={settings.autostart}
                label="Start at login"
                onChange={(autostart) => void update({ autostart })}
              />
            </Row>

            {isMac && (
              <Row
                label="macOS permissions"
                anchor="row-perms"
                block
                keywords="microphone accessibility input monitoring privacy security"
                desc="The microphone is asked for on your first dictation. After allowing Input monitoring, quit and reopen murmur."
              >
                <div className="well">
                  <PermissionLine
                    anchor="row-mic"
                    name="Microphone"
                    ok={perms === null ? null : micOk}
                    okText="granted"
                    badText={perms?.microphone ?? '…'}
                    onOpen={openPane('microphone')}
                  />
                  <PermissionLine
                    anchor="row-axs"
                    name="Accessibility"
                    ok={perms === null ? null : perms.accessibility}
                    okText="granted"
                    badText="not granted"
                    onOpen={openPane('accessibility')}
                  />
                  <PermissionLine
                    anchor="row-input"
                    name="Input monitoring"
                    ok={perms === null ? null : perms.inputMonitoring}
                    okText="active"
                    badText="not active"
                    onOpen={openPane('input')}
                  />
                </div>
              </Row>
            )}

            <Row
              label="Diagnostics"
              keywords="log logs bug report support troubleshoot"
              desc="A local log of each dictation with no transcript text or keys, ever. Save report writes one file you can read before sharing; nothing sends on its own."
            >
              <div className="inline">
                <button className="btn" onClick={() => void bridge().saveDiagnostics()}>
                  Save report…
                </button>
                <button className="btn" onClick={() => void bridge().openLogFolder()}>
                  Open log folder
                </button>
              </div>
            </Row>

            <Row label="Setup wizard" keywords="onboarding guide" desc="Walk the guided setup again anytime.">
              <button className="btn" onClick={() => setWizardOpen(true)}>
                Run wizard
              </button>
            </Row>
          </Section>

          <Section id="pro" title="murmur Pro" sub="Your license, verified offline.">
            <ProSection status={license} onStatus={setLicense} />
          </Section>
        </div>
      </div>

      <footer className="foot dim">
        murmur {version} · free software under{' '}
        <button className="link-btn" onClick={() => void bridge().openLicense()}>
          GPL-3.0-only
        </button>{' '}
        · copyright Eze Media LLC
      </footer>
    </main>
  )
}

function ProSection(props: {
  status: import('../../main/license').LicenseStatus | null
  onStatus: (s: import('../../main/license').LicenseStatus) => void
}): React.JSX.Element {
  const { status, onStatus: setStatus } = props
  const [draft, setDraft] = useState('')
  const [rejected, setRejected] = useState(false)

  if (!status) return <div />
  if (status.pro) {
    return (
      <Row
        label={status.founder ? 'Founding member' : 'Pro is active'}
        keywords="license key deactivate"
        desc={`${
          status.founder
            ? 'A permanent ten percent discount on every future paid product is yours, cloud included. '
            : ''
        }Thank you for supporting free software; belts stay earned, never bought. Supporter since ${new Date(
          status.since
        ).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}. Deactivate previews the free experience; your key stays saved here.`}
      >
        <button className="btn" onClick={() => void bridge().deactivateLicense().then(setStatus)}>
          Deactivate
        </button>
      </Row>
    )
  }

  if (status.retained) {
    return (
      <Row
        label="License key"
        keywords="pro reactivate"
        desc="Pro is deactivated, but your key is still saved on this machine. Forget key deletes it; you would need the original key to activate again."
      >
        <div className="inline">
          <button className="btn btn-primary" onClick={() => void bridge().reactivateLicense().then(setStatus)}>
            Reactivate
          </button>
          <button className="btn btn-remove" onClick={() => void bridge().removeLicense().then(setStatus)}>
            Forget key
          </button>
        </div>
      </Row>
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
      keywords="pro buy activate purchase"
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
          aria-label="License key"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setRejected(false)
          }}
        />
        <button className="btn btn-primary" onClick={() => void activate()} disabled={draft.trim().length === 0}>
          Activate
        </button>
        {proConfig.buyUrl && (
          <button className="btn" onClick={() => void bridge().openBuyPage()}>
            Get Pro
          </button>
        )}
      </div>
    </Row>
  )
}

function currencySymbol(code: string): string {
  if (code === 'USD') return '$'
  if (code === 'EUR') return '€'
  return `${code} `
}

function formatCostParts(parts: Array<{ amount: number; currency: string }>): string {
  return parts
    .map((p) => `${currencySymbol(p.currency)}${p.amount < 0.01 ? p.amount.toFixed(4) : p.amount.toFixed(2)}`)
    .join(' + ')
}

function ProfilesRow(props: {
  settings: Settings
  onSettings: (s: Settings) => void
  /** Re-read the key ring's status after a profile action. */
  onKeysChanged: () => void
  /** Shared app-level license truth; null while it loads. */
  pro: boolean | null
}): React.JSX.Element {
  const pro = props.pro
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState('')
  const profiles = props.settings.provider.profiles

  if (pro === null) return <div />
  if (!pro) {
    return (
      <Row
        label="Profiles"
        desc="murmur Pro: save this setup (endpoint and models) under a name and switch providers in one click; each provider's saved key comes along from the key ring."
      >
        {proConfig.buyUrl ? (
          <button className="btn" onClick={() => void bridge().openBuyPage()}>
            Get Pro
          </button>
        ) : (
          <span className="dim">Pro feature</span>
        )}
      </Row>
    )
  }

  const handle = (result: import('../../main/profiles').ProfileResult): void => {
    if (!result.ok) return
    props.onSettings(result.settings)
    // Applying can fold a profile's saved key into the ring without the
    // base URL changing (live-found 2026-09-26: Groq to Groq restored the
    // key, but the key list still said no key and Test stayed disabled),
    // so the key status is re-read after every successful profile action.
    props.onKeysChanged()
  }

  return (
    <Row
      label="Profiles"
      desc="Each profile carries its endpoint and models; applying one swaps the setup and the key ring supplies that provider's key."
    >
      <div className="inline profiles-stack">
        {profiles.length > 0 && (
          <div className="inline">
            <select className="field" aria-label="Profile" value={chosen} onChange={(e) => setChosen(e.target.value)}>
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
              className="btn btn-remove"
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
            aria-label="Profile name"
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
