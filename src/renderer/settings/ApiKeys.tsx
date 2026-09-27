// SPDX-License-Identifier: GPL-3.0-only
// The API keys list (US-069): the active provider's key and every
// other key in the ring, one line each, one Remove size in one column.
// The active key is the only line that can be replaced or pasted; the
// others belong to providers you are not using right now.
import { useState } from 'react'

export interface OtherKey {
  baseUrl: string
  name: string
  masked: string
}

export function ApiKeys(props: {
  /** The active provider's name, or a stand-in for a custom endpoint. */
  providerName: string
  /** Where to get a key, shown while none is saved. */
  keyUrl: string | null
  placeholder: string
  active: { present: boolean; masked: string | null }
  others: OtherKey[]
  legacy: { present: boolean; masked: string | null }
  onSave: (key: string) => Promise<void>
  onRemoveActive: () => void
  onRemoveOther: (baseUrl: string) => void
  onAssignLegacy: () => void
  onRemoveLegacy: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [saving, setSaving] = useState(false)
  const editing = !props.active.present || replacing

  const save = async (): Promise<void> => {
    if (draft.trim() === '' || saving) return
    setSaving(true)
    try {
      await props.onSave(draft.trim())
      setDraft('')
      setReplacing(false)
    } catch {
      // Nothing was stored; the draft stays for another try.
    } finally {
      setSaving(false)
    }
  }
  const cancel = (): void => {
    setDraft('')
    setReplacing(false)
  }

  return (
    <div className="well">
      <div className="well-item">
        <span className="well-name">{props.providerName}</span>
        {editing ? (
          <>
            <input
              type="password"
              className="field mono-field well-field"
              placeholder={props.placeholder}
              aria-label={`${props.providerName} API key`}
              value={draft}
              autoFocus={replacing}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
                if (e.key === 'Escape' && replacing) cancel()
              }}
            />
            <div className="well-actions">
              <button
                className="btn btn-primary"
                onClick={() => void save()}
                disabled={draft.trim() === '' || saving}
              >
                Save
              </button>
              {replacing && (
                <button className="btn" onClick={cancel}>
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="well-meta">{props.active.masked ?? ''}</span>
            <span className="badge-ok">in use</span>
            <div className="well-actions">
              <button className="btn" onClick={() => setReplacing(true)}>
                Replace
              </button>
              <button
                className="btn btn-remove"
                aria-label={`Remove ${props.providerName} key`}
                onClick={props.onRemoveActive}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </div>
      {!props.active.present && (
        <p className="well-hint">
          {props.keyUrl ? `Get one at ${props.keyUrl}. ` : ''}It stays encrypted here and is sent only to
          this provider.
        </p>
      )}
      {props.others.map((entry) => (
        <div className="well-item" key={entry.baseUrl}>
          <span className="well-name" title={entry.name}>
            {entry.name}
          </span>
          <span className="well-meta">{entry.masked}</span>
          <div className="well-actions">
            <button
              className="btn btn-remove"
              aria-label={`Remove ${entry.name} key`}
              onClick={() => props.onRemoveOther(entry.baseUrl)}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      {props.legacy.present && (
        <div className="well-item">
          <span className="well-name">Unassigned</span>
          <span className="well-meta" title="saved before keys tracked providers">
            {props.legacy.masked ?? ''}, saved before keys tracked providers
          </span>
          <div className="well-actions">
            {!props.active.present && (
              <button className="btn" onClick={props.onAssignLegacy}>
                Assign to {props.providerName}
              </button>
            )}
            <button className="btn btn-remove" aria-label="Remove unassigned key" onClick={props.onRemoveLegacy}>
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
