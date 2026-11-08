// SPDX-License-Identifier: GPL-3.0-only
// The top of Provider and keys (US-154, LaBroi's pick B, 2026-11-08):
// what runs right now, then each saved profile as a card naming what it
// runs. A click on a card switches everything it holds at once. When the
// setup moves away from the active profile, a bar offers Save, Save as
// new, and Undo, and the card says it changed. Profiles are murmur Pro;
// without Pro the area offers them and the setup below is 1 unnamed one.
import { useEffect, useRef, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import type { ProfileResult } from '../../main/profiles'
import type { ProviderCatalog } from '../../shared/catalog'
import { type KeysKnown, describeProfile, profileMatches, runningNow } from '../../shared/profiles'
import type { Settings } from '../../shared/settings'
import proConfig from '../../../shared/pro.json'
import { AskFirst } from './AskFirst'
import { Row } from './controls'

const bridge = (): SettingsApi => window.murmur

/** What runs speech and cleanup right now, whatever any profile says
 *  (US-152): unsaved changes and fallbacks included. */
export function RunningStrip(props: {
  settings: Settings
  catalog: ProviderCatalog | null
  keys: KeysKnown
}): React.JSX.Element {
  const now = runningNow(props.settings, props.catalog, props.keys)
  return (
    <div className="running-strip" id="running-now">
      <p className="micro-label running-kicker">running now</p>
      <p className="running-lines">
        <span>
          Speech: <b>{now.speech}</b>
        </span>
        <span>
          Cleanup: <b>{now.cleanup}</b>
        </span>
      </p>
      {now.note && <p className="running-note">{now.note}</p>}
    </div>
  )
}

const REFUSED: Record<'pro' | 'not-found' | 'bad-name', string> = {
  pro: 'Profiles need murmur Pro.',
  'not-found': 'That profile is gone. It may have been deleted in another window.',
  'bad-name': 'Give the profile a name first.'
}

export function ProfileCards(props: {
  settings: Settings
  catalog: ProviderCatalog | null
  /** Shared app-level license truth; null while it loads. */
  pro: boolean | null
  /** The Pro mark beside the label: filled for Pro, outlined as an offer. */
  mark?: React.ReactNode
  onSettings: (s: Settings) => void
  /** Re-read the key ring after a profile action. */
  onKeysChanged: () => void
}): React.JSX.Element | null {
  const { settings, catalog } = props
  // Naming a new profile: 'new' from the last card, 'copy' from the bar.
  const [naming, setNaming] = useState<'new' | 'copy' | null>(null)
  const [name, setName] = useState('')
  // The profile a Delete is asking about, and a switch waiting on an
  // answer because the active profile has unsaved changes.
  const [deleting, setDeleting] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (naming) nameRef.current?.focus()
  }, [naming])

  if (props.pro === null) return null
  if (!props.pro) {
    return (
      <div className="panel profiles-offer">
        <Row
          label="Profiles"
          anchor="row-profiles"
          mark={props.mark}
          keywords="profiles setups switch save provider pro"
          desc="murmur Pro: save this whole setup, speech and cleanup, under a name, and switch between setups in 1 click. Keys stay saved by provider, so switching never asks for one."
        >
          {proConfig.buyUrl ? (
            <button className="btn" onClick={() => void bridge().openBuyPage()}>
              Get Pro
            </button>
          ) : (
            <span className="dim">Pro feature</span>
          )}
        </Row>
      </div>
    )
  }

  const profiles = settings.provider.profiles
  const active = profiles.find((p) => p.id === settings.provider.activeProfile) ?? null
  const changed = active !== null && !profileMatches(active, settings)

  const handle = (result: ProfileResult): void => {
    if (!result.ok) {
      setProblem(REFUSED[result.reason])
      return
    }
    setProblem(null)
    props.onSettings(result.settings)
    // Applying can fold a profile's old key file into the ring without
    // the base URL changing (live-found 2026-09-26), so the key status
    // is read again after every profile action.
    props.onKeysChanged()
  }
  const focusLater = (id: string): void => {
    window.setTimeout(() => document.getElementById(id)?.focus(), 0)
  }
  const pick = (id: string): void => {
    // Switching away from unsaved changes would lose them, so it asks.
    if (changed) setSwitching(id)
    else void bridge().applyProviderProfile(id).then(handle)
  }
  const saveNamed = (): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    void bridge().saveProviderProfile(trimmed).then(handle)
    setName('')
    setNaming(null)
  }

  return (
    <div
      className="row row-block profiles-row"
      id="row-profiles"
      data-keywords="profiles setups switch save apply provider"
    >
      <div className="row-text">
        <div className="row-label micro-label profiles-label">
          Profiles
          {props.mark}
        </div>
      </div>
      <div className="row-control">
        <div className="profile-cards">
          {profiles.map((p) => {
            const on = p.id === active?.id
            const lines = describeProfile(p, catalog)
            return (
              <div className="profile-slot" key={p.id}>
                <button
                  id={`profile-card-${p.id}`}
                  className={on ? 'profile-card profile-card-on' : 'profile-card'}
                  aria-current={on ? 'true' : undefined}
                  onClick={() => {
                    if (!on) pick(p.id)
                  }}
                >
                  <span className="profile-name">
                    {on && (
                      <svg className="profile-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path
                          d="M2.5 6.2 5 8.6l4.5-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    <span className="profile-name-text">{p.name}</span>
                    {on && changed && <span className="profile-changed">changed</span>}
                  </span>
                  <span className="profile-line">
                    Speech: <b>{lines.speech}</b>
                  </span>
                  <span className="profile-line">
                    Cleanup: <b>{lines.cleanup ?? 'not saved yet'}</b>
                  </span>
                  {lines.cleanup === null && (
                    <span className="profile-line profile-old">
                      Saved before profiles held cleanup. Save it again to keep it.
                    </span>
                  )}
                </button>
                <button
                  id={`profile-delete-${p.id}`}
                  className="link-btn profile-delete"
                  aria-label={`Delete profile ${p.name}`}
                  aria-expanded={deleting === p.id}
                  aria-controls={deleting === p.id ? 'profile-delete-confirm' : undefined}
                  onClick={() => setDeleting(deleting === p.id ? null : p.id)}
                >
                  Delete
                </button>
              </div>
            )
          })}
          <button
            className="profile-card profile-new"
            aria-expanded={naming === 'new'}
            onClick={() => setNaming(naming === 'new' ? null : 'new')}
          >
            + Save this setup as a profile
          </button>
        </div>

        {naming && (
          <div className="inline profile-naming">
            <input
              ref={nameRef}
              className="field"
              placeholder="name this setup…"
              aria-label="Profile name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNamed()
                if (e.key === 'Escape') setNaming(null)
              }}
            />
            <button className="btn btn-primary" disabled={name.trim() === ''} onClick={saveNamed}>
              Save
            </button>
            <button className="btn" onClick={() => setNaming(null)}>
              Cancel
            </button>
          </div>
        )}

        {active && changed && (
          <div className="profile-bar" role="status">
            <span className="profile-bar-text">
              You changed <b>{active.name}</b>. The change is working now. Keep it in the profile?
            </span>
            <div className="btn-row">
              <button
                className="btn btn-primary"
                onClick={() => void bridge().resaveProviderProfile(active.id).then(handle)}
              >
                Save
              </button>
              <button className="btn" onClick={() => setNaming('copy')}>
                Save as new
              </button>
              <button className="btn" onClick={() => void bridge().applyProviderProfile(active.id).then(handle)}>
                Undo
              </button>
            </div>
          </div>
        )}

        {problem && (
          <p className="row-desc profile-problem" role="alert">
            {problem}
          </p>
        )}

        {switching !== null && active && (
          <AskFirst
            id="profile-switch-confirm"
            question={`Switch to ${profiles.find((p) => p.id === switching)?.name ?? 'that profile'}? Your unsaved change to ${active.name} is lost. Save it first to keep it.`}
            confirm="switch"
            keep="stay"
            busy={false}
            onConfirm={() => {
              const id = switching
              setSwitching(null)
              void bridge().applyProviderProfile(id).then(handle)
            }}
            onKeep={() => {
              const id = switching
              setSwitching(null)
              focusLater(`profile-card-${id}`)
            }}
          />
        )}
        {deleting !== null && (
          <AskFirst
            id="profile-delete-confirm"
            question={`Delete the profile ${profiles.find((p) => p.id === deleting)?.name ?? ''}? ${
              deleting === active?.id ? 'The setup keeps running, and your' : 'Your'
            } keys stay saved.`}
            confirm="delete it"
            keep="keep it"
            busy={false}
            onConfirm={() => {
              const id = deleting
              setDeleting(null)
              void bridge().deleteProviderProfile(id).then(handle)
            }}
            onKeep={() => {
              const id = deleting
              setDeleting(null)
              focusLater(`profile-delete-${id}`)
            }}
          />
        )}
      </div>
    </div>
  )
}
