// SPDX-License-Identifier: GPL-3.0-only
// Rows for a secondary LLM connection slot: ride another connection,
// or a separate provider with its own base URL, model, and ring key.
// The cleanup connection and the sort connection (US-051) both render
// through here, so a fix lands in both and their rules cannot drift.
import { useEffect, useRef, useState } from 'react'
import type { KeyStatus, ProviderTestResult } from '../../preload/settings'
import { type CatalogKind, type ProviderCatalog, providerForBaseUrl } from '../../shared/catalog'
import { ModelPicker, Row, TextSetting } from './controls'

export interface ConnectionValue {
  enabled: boolean
  baseUrl: string
  llmModel: string
}

export interface ConnectionLabels {
  connection: string
  connectionDesc: string
  sameOption: string
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

  const shared =
    value.baseUrl !== '' && props.sharedWith.some((u) => u !== '' && strip(u) === strip(value.baseUrl))

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
        <select
          className="field"
          value={value.enabled ? 'separate' : 'same'}
          onChange={(e) => void props.onChange({ ...value, enabled: e.target.value === 'separate' })}
        >
          <option value="same">{labels.sameOption}</option>
          <option value="separate">Separate provider</option>
        </select>
      </Row>
      {value.enabled && props.protocol && (
        <Row label={props.protocol.label} desc={props.protocol.desc}>
          <select
            className="field"
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
            desc={
              mismatch
                ? `${matched?.name ?? 'This provider'} is a ${kind === 'decide' ? 'chat' : 'decision'} model. Switch the sort protocol to use it, or pick a preset that speaks this one.`
                : 'A preset fills the base URL and a recommended model.'
            }
          >
            <select
              className="field"
              value={matchedKind ? (matched?.id ?? 'custom') : 'custom'}
              onChange={(e) => {
                const preset = llmProviders.find((p) => p.id === e.target.value)
                if (!preset) return
                void props.onChange({
                  ...value,
                  baseUrl: preset.llmBaseUrl ?? preset.baseUrl,
                  llmModel: preset.llmModels[0]?.id ?? value.llmModel
                })
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
            desc={kind === 'decide' ? "The decision endpoint's base URL, ending in /v1." : 'Any OpenAI-compatible chat endpoint.'}
          >
            <TextSetting
              wide
              value={value.baseUrl}
              placeholder={placeholders.baseUrl}
              onCommit={(baseUrl) => void props.onChange({ ...value, baseUrl })}
            />
          </Row>
          <Row label={labels.model} desc="Pick a suggestion or type any model id this provider offers.">
            {matched && matched.llmModels.length > 0 ? (
              <ModelPicker
                value={value.llmModel}
                options={matched.llmModels.map((m) => m.id)}
                placeholder={placeholders.model}
                onCommit={(llmModel) => void props.onChange({ ...value, llmModel })}
              />
            ) : (
              <TextSetting
                value={value.llmModel}
                placeholder={placeholders.model}
                onCommit={(llmModel) => void props.onChange({ ...value, llmModel })}
              />
            )}
          </Row>
          {shared ? (
            <Row label={labels.key} desc={labels.sharedDesc}>
              <span className="dim">shared</span>
            </Row>
          ) : (
            <Row
              label={labels.key}
              desc={
                props.keyStatus.present
                  ? `Saved and encrypted (${props.keyStatus.masked ?? ''})`
                  : value.baseUrl === ''
                    ? 'Pick a preset or base URL first; the key files under it.'
                    : labels.keyDesc
              }
            >
              <div className="inline">
                <input
                  type="password"
                  className="field"
                  placeholder={props.keyStatus.present ? 'replace key' : 'key…'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save()
                  }}
                />
                <button className="btn" onClick={() => void save()} disabled={draft.trim() === ''}>
                  Save
                </button>
                {props.keyStatus.present && (
                  <button
                    className="btn quiet-btn"
                    onClick={() => {
                      void props.api.clearKey().then(props.onKeyStatus)
                      setTest(null)
                    }}
                  >
                    Remove
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() => void run()}
                  disabled={!props.keyStatus.present || testing}
                >
                  {testing ? 'Testing…' : 'Test'}
                </button>
                {test && (
                  <span className={test.ok ? 'status-ok' : 'status-bad'}>
                    {test.ok ? 'connected' : test.detail}
                  </span>
                )}
              </div>
            </Row>
          )}
        </>
      )}
    </>
  )
}
