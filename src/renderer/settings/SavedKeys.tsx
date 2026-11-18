// SPDX-License-Identifier: GPL-3.0-only
// Saved keys (US-154): every key in the ring, by provider name, with
// what it does in the setup running now (speech, cleanup, notes sorting,
// Transform, or nothing), and Replace and Remove. 1 key per provider:
// profiles never copy keys, they switch base URLs and the ring answers.
import { useState } from 'react'
import type { RingEntry } from '../../preload/settings'
import type { ProviderCatalog } from '../../shared/catalog'
import { type KeysKnown, keyUseLine, keyUses, providerName } from '../../shared/profiles'
import type { Settings } from '../../shared/settings'
import { Row } from './controls'

const slug = (url: string): string =>
  url
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function SavedKeys(props: {
  list: RingEntry[]
  settings: Settings
  catalog: ProviderCatalog | null
  keys: KeysKnown
  onReplace: (baseUrl: string, key: string) => Promise<void>
  onRemove: (baseUrl: string) => void
}): React.JSX.Element {
  const [replacing, setReplacing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  if (props.list.length === 0) {
    return (
      <Row label="No keys yet" anchor="row-saved-keys" keywords="api keys saved providers" desc="Save a key under Speech and it shows here.">
        <span className="dim">none</span>
      </Row>
    )
  }

  const save = async (baseUrl: string): Promise<void> => {
    if (draft.trim() === '') return
    await props.onReplace(baseUrl, draft.trim())
    setDraft('')
    setReplacing(null)
  }

  return (
    <>
      {props.list.map((entry, index) => {
        const name = providerName(props.catalog, entry.baseUrl)
        const uses = keyUses(props.settings, props.keys, entry.baseUrl)
        const open = replacing === entry.baseUrl
        return (
          <Row
            key={entry.baseUrl}
            label={name}
            anchor={index === 0 ? 'row-saved-keys' : `row-saved-key-${slug(entry.baseUrl)}`}
            keywords="api keys saved providers replace remove"
            block={open}
            desc={
              <>
                {keyUseLine(uses)} <span className="mono-dim">{entry.masked}</span>
              </>
            }
          >
            {open ? (
              <div className="inline">
                <input
                  type="password"
                  className="field mono-field"
                  placeholder={`paste a new ${name} key`}
                  aria-label={`New ${name} key`}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save(entry.baseUrl)
                    if (e.key === 'Escape') setReplacing(null)
                  }}
                />
                <button className="btn btn-primary" disabled={draft.trim() === ''} onClick={() => void save(entry.baseUrl)}>
                  Save
                </button>
                <button className="btn" onClick={() => setReplacing(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="btn-row">
                <button
                  className="btn"
                  aria-label={`Replace saved ${name} key`}
                  onClick={() => {
                    setDraft('')
                    setReplacing(entry.baseUrl)
                  }}
                >
                  Replace
                </button>
                <button
                  className="btn btn-remove"
                  aria-label={`Remove saved ${name} key`}
                  onClick={() => props.onRemove(entry.baseUrl)}
                >
                  Remove
                </button>
              </div>
            )}
          </Row>
        )
      })}
    </>
  )
}
