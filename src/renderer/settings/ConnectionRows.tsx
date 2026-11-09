// SPDX-License-Identifier: GPL-3.0-only
// Rows for a secondary LLM connection slot: ride another connection,
// or a separate provider with its own base URL, model, and ring key.
// The cleanup connection and the sort connection (US-051) both render
// through here, so a fix lands in both and their rules cannot drift.
import { PlainHttpNote } from './PlainHttpNote'
import { useEffect, useRef, useState } from 'react'
import type { KeyStatus, ProviderTestResult } from '../../preload/settings'
import { type CatalogKind, type CatalogProvider, type ProviderCatalog, providerForBaseUrl } from '../../shared/catalog'
import { providerName } from '../../shared/profiles'
import { ModelPicker, Row, Segmented, TextSetting } from './controls'

export interface ConnectionValue {
  enabled: boolean
  baseUrl: string
  llmModel: string
}

export interface ConnectionLabels {
  connection: string
  connectionDesc: string
  sameOption: string
  /** The other choice's words; Separate when not given. */
  separateOption?: string
  /** Prefixed to the controls' accessible names when the visible labels
   *  are short (Model under Cleanup reads Cleanup model to a screen
   *  reader, US-154). */
  ariaName?: string
  provider: string
  baseUrl: string
  model: string
  key: string
  /** Shown while a base URL is set and no key is saved yet. */
  keyDesc: string
  /** Shown when the base URL matches a connection that owns the key. */
  sharedDesc: string
}

export type ConnectionProtocol = 'chat' | 'decide'

/** For a slot that can speak more than one protocol (the sort slot,
 *  US-057): which one, and the words for the row that picks it. */
export interface ConnectionProtocolControl {
  value: ConnectionProtocol
  onChange: (next: ConnectionProtocol) => Promise<void>
  label: string
  desc: string
}

export interface ConnectionKeyApi {
  setKey: (key: string) => Promise<KeyStatus>
  clearKey: () => Promise<KeyStatus>
  status: () => Promise<KeyStatus>
  test: () => Promise<ProviderTestResult>
}

const strip = (u: string): string => u.replace(/\/$/, '')

/** A connection after picking a preset: its address and its suggested
 *  model, or no model at all. A model id left over from another
 *  provider would fail every call (LaBroi, 2026-11-08, US-152). */
export function presetConnection<T extends ConnectionValue>(preset: CatalogProvider, value: T): T {
  return { ...value, baseUrl: preset.llmBaseUrl ?? preset.baseUrl, llmModel: preset.llmModels[0]?.id ?? '' }
}

/** How a test result reads: green when it worked, red when it failed,
 *  and a plain note when the provider answered but does not list a model.
 *  That last one is a soft warning, not an error (LaBroi, 2026-11-08): it
 *  is not critical, least of all for a model the setup is not using. */
export type VerdictTone = 'ok' | 'warn' | 'bad'
export const VERDICT_CLASS: Record<VerdictTone, string> = {
  ok: 'status-ok',
  warn: 'status-warn',
  bad: 'status-bad'
}

/** What a connection test says (US-154): who answered, and whether it
 *  offers each model being used. */
export function testVerdict(result: ProviderTestResult, provider: string): { message: string; tone: VerdictTone } {
  if (!result.ok) return { message: result.detail, tone: 'bad' }
  const asked = result.models ?? (result.model ? [{ id: result.model, listed: result.listed ?? null }] : [])
  const both = (ids: string[]): string => ids.join(' and ')
  const missing = asked.filter((m) => m.listed === false).map((m) => m.id)
  if (missing.length > 0) {
    return {
      message: `${provider} answered, but does not list ${both(missing)}. Check the model id${missing.length > 1 ? 's' : ''}.`,
      tone: 'warn'
    }
  }
  const offered = asked.filter((m) => m.listed === true).map((m) => m.id)
  if (offered.length > 0) return { message: `${provider} answered and offers ${both(offered)}`, tone: 'ok' }
  return { message: `${provider} answered`, tone: 'ok' }
}

/** A connection test's answer, under the Key row's buttons (US-157):
 *  testing while it runs, then the verdict, fading in. Always mounted,
 *  so a screen reader hears each answer. */
export function TestVerdict(props: {
  testing: boolean
  verdict: { message: string; tone: VerdictTone } | null
}): React.JSX.Element {
  const shown = props.testing || props.verdict !== null
  return (
    <div className={shown ? 'test-verdict' : 'test-verdict visually-hidden'} role="status">
      {props.testing ? (
        <span className="status-dim">testing…</span>
      ) : (
        props.verdict && <span className={VERDICT_CLASS[props.verdict.tone]}>{props.verdict.message}</span>
      )}
    </div>
  )
}

export function ConnectionRows(props: {
  value: ConnectionValue
  catalog: ProviderCatalog | null
  keyStatus: KeyStatus
  onKeyStatus: (status: KeyStatus) => void
  onChange: (next: ConnectionValue) => Promise<void>
  labels: ConnectionLabels
  /** Base URLs whose key this slot would share; the key row says so
   *  and hides Remove, because that key belongs to the other slot. */
  sharedWith: string[]
  api: ConnectionKeyApi
  placeholders?: { baseUrl?: string; model?: string }
  /** Row anchor for the first row (design QA captures, jump targets). */
  anchor?: string
  protocol?: ConnectionProtocolControl
  /** Rows shown while the slot rides the other connection (the cleanup
   *  group's same-as-speech Model row, US-154). */
  whenSame?: React.ReactNode
}): React.JSX.Element {
  const { value, catalog, labels } = props
  const [draft, setDraft] = useState('')
  const [test, setTest] = useState<ProviderTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  // The presets a slot may pick from follow what it speaks: chat models
  // for a chat protocol, decision models for a decision protocol.
  const kind: CatalogKind = props.protocol?.value === 'decide' ? 'decide' : 'llm'
  const llmProviders = catalog?.providers.filter((p) => p.kinds.includes(kind)) ?? []
  const matched = catalog ? providerForBaseUrl(catalog, value.baseUrl) : null
  // A base URL that belongs to a provider of the other kind (a decision
  // model left on the chat protocol, or the reverse) would pass a test
  // and then fail every call; the row says so instead.
  const matchedKind = matched !== null && matched.kinds.includes(kind)
  const mismatch = matched !== null && !matchedKind && props.protocol !== undefined
  const placeholders = {
    baseUrl: props.placeholders?.baseUrl ?? (kind === 'decide' ? 'https://api.typesafe.ai/v1' : 'https://api.deepseek.com'),
    model: props.placeholders?.model ?? (kind === 'decide' ? 'jev-latest' : 'deepseek-flash')
  }

  // Same rule as the primary connection: a verdict earned against one
  // base URL never vouches for another.
  const prevUrl = useRef<string | null>(null)
  useEffect(() => {
    const current = value.baseUrl
    if (prevUrl.current !== null && current !== prevUrl.current) {
      setTest(null)
      void props.api.status().then(props.onKeyStatus)
    }
    prevUrl.current = current
  }, [value.baseUrl])
  // A verdict about one model never vouches for another.
  useEffect(() => setTest(null), [value.llmModel])

  const shared =
    value.baseUrl !== '' && props.sharedWith.some((u) => u !== '' && strip(u) === strip(value.baseUrl))
  const verdict = test ? testVerdict(test, providerName(catalog, value.baseUrl)) : null
  // Each row's id hangs off the slot's anchor, so 2 slots with the same
  // short labels never share an id (Key under Speech and under Cleanup).
  const sub = (part: string): string | undefined => (props.anchor ? `${props.anchor}-${part}` : undefined)
  const aria = (label: string): string => (labels.ariaName ? `${labels.ariaName} ${label.toLowerCase()}` : label)

  const save = async (): Promise<void> => {
    if (draft.trim().length === 0) return
    const status = await props.api.setKey(draft.trim())
    props.onKeyStatus(status)
    // Keep the typed key when the save could not land (no base URL
    // yet): wiping it would silently discard what the user pasted.
    // The base URL is the landing condition; a stale legacy key can
    // make present read true without this save having gone anywhere
    // (re-gate finding).
    if (value.baseUrl !== '' && status.present) {
      setDraft('')
      setTest(null)
    }
  }
  const run = async (): Promise<void> => {
    if (testing) return
    setTesting(true)
    try {
      setTest(await props.api.test())
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <Row label={labels.connection} desc={labels.connectionDesc} anchor={props.anchor}>
        <Segmented
          label={aria(labels.connection)}
          value={value.enabled ? 'separate' : 'same'}
          options={[
            { value: 'same', label: labels.sameOption },
            { value: 'separate', label: labels.separateOption ?? 'Separate' }
          ]}
          onChange={(next) => void props.onChange({ ...value, enabled: next === 'separate' })}
        />
      </Row>
      {!value.enabled && props.whenSame}
      {value.enabled && props.protocol && (
        <Row label={props.protocol.label} desc={props.protocol.desc} anchor={sub('protocol')}>
          <select
            className="field"
            aria-label={props.protocol.label}
            value={props.protocol.value}
            onChange={(e) => void props.protocol?.onChange(e.target.value === 'decide' ? 'decide' : 'chat')}
          >
            <option value="chat">OpenAI-compatible chat model</option>
            <option value="decide">Decision model (TypeSafe)</option>
          </select>
        </Row>
      )}
      {value.enabled && (
        <>
          <Row
            label={labels.provider}
            anchor={sub('provider')}
            desc={
              mismatch
                ? `${matched?.name ?? 'This provider'} is a ${kind === 'decide' ? 'chat' : 'decision'} model. Switch the sort protocol to use it, or pick a preset that speaks this one.`
                : 'A preset fills the base URL and a recommended model.'
            }
          >
            <select
              className="field"
              aria-label={aria(labels.provider)}
              value={matchedKind ? (matched?.id ?? 'custom') : 'custom'}
              onChange={(e) => {
                const preset = llmProviders.find((p) => p.id === e.target.value)
                if (!preset) return
                void props.onChange(presetConnection(preset, value))
              }}
            >
              <option value="custom">Custom</option>
              {llmProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
          <Row
            label={labels.baseUrl}
            anchor={sub('base-url')}
            desc={kind === 'decide' ? "The decision endpoint's base URL, ending in /v1." : 'Any OpenAI-compatible chat endpoint.'}
          >
            <TextSetting
              wide
              label={aria(labels.baseUrl)}
              value={value.baseUrl}
              placeholder={placeholders.baseUrl}
              onCommit={(baseUrl) => void props.onChange({ ...value, baseUrl })}
            />
          </Row>
          <PlainHttpNote url={value.baseUrl} />
          <Row label={labels.model} anchor={sub('model')} desc="Pick a suggestion or type any model id this provider offers.">
            {matched && matched.llmModels.length > 0 ? (
              <ModelPicker
                label={aria(labels.model)}
                value={value.llmModel}
                options={matched.llmModels.map((m) => m.id)}
                placeholder={placeholders.model}
                onCommit={(llmModel) => void props.onChange({ ...value, llmModel })}
              />
            ) : (
              <TextSetting
                label={aria(labels.model)}
                value={value.llmModel}
                placeholder={placeholders.model}
                onCommit={(llmModel) => void props.onChange({ ...value, llmModel })}
              />
            )}
          </Row>
          {shared ? (
            <Row label={labels.key} anchor={sub('key')} desc={labels.sharedDesc}>
              <span className="dim">shared</span>
            </Row>
          ) : (
            <Row
              label={labels.key}
              anchor={sub('key')}
              block
              indent
              desc={
                props.keyStatus.present
                  ? `Saved and encrypted (${props.keyStatus.masked ?? ''})`
                  : value.baseUrl === ''
                    ? 'Pick a preset or base URL first; the key files under it.'
                    : labels.keyDesc
              }
            >
              <div className="key-line">
                <input
                  type="password"
                  className="field key-field"
                  placeholder={props.keyStatus.present ? 'replace key' : 'key…'}
                  aria-label={aria(labels.key)}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save()
                  }}
                />
                <span className="key-btns">
                  <button className="btn btn-primary" onClick={() => void save()} disabled={draft.trim() === ''}>
                    Save
                  </button>
                  {props.keyStatus.present && (
                    <button
                      className="btn btn-remove"
                      aria-label={`Remove ${aria(labels.key)}`}
                      onClick={() => {
                        void props.api.clearKey().then(props.onKeyStatus)
                        setTest(null)
                      }}
                    >
                      Remove
                    </button>
                  )}
                  <button
                    className="btn btn-test"
                    aria-label={labels.ariaName ? `Test ${labels.ariaName.toLowerCase()} connection` : undefined}
                    aria-busy={testing}
                    onClick={() => void run()}
                    disabled={!props.keyStatus.present}
                  >
                    Test
                  </button>
                </span>
              </div>
              <TestVerdict testing={testing} verdict={test ? verdict : null} />
            </Row>
          )}
        </>
      )}
    </>
  )
}
