// SPDX-License-Identifier: GPL-3.0-only
// How updates arrive (US-136). Automatic is the default, and Off says
// plainly what it costs. Below it, check now and restart now (US-178).
import { useEffect, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import type { Settings, UpdateMode } from '../../shared/settings'
import { Row, Segmented } from './controls'

const bridge = (): SettingsApi => window.murmur

type UpdateOffer = Awaited<ReturnType<SettingsApi['getUpdateOffer']>>

const OFFER_POLL_MS = 3_000

export function UpdatesRow(props: { settings: Settings; onChange: (mode: UpdateMode) => void }): React.JSX.Element {
  const mode = props.settings.updates
  const [offer, setOffer] = useState<UpdateOffer | null>(null)

  // A download ends, or a new version turns up, with this row on screen.
  useEffect(() => {
    const load = (): void => {
      void bridge().getUpdateOffer().then(setOffer)
    }
    load()
    const timer = setInterval(load, OFFER_POLL_MS)
    return () => clearInterval(timer)
  }, [mode])

  return (
    <>
      <Row
        label="Updates"
        keywords="update automatic off ask release version"
        desc="Automatic downloads quietly and installs when you quit. Ask first tells you and waits for a click. Off asks GitHub for nothing."
      >
        <Segmented
          label="Updates"
          value={mode}
          options={[
            { value: 'auto', label: 'Automatic' },
            { value: 'ask', label: 'Ask first' },
            { value: 'off', label: 'Off' }
          ]}
          onChange={props.onChange}
        />
      </Row>
      {mode === 'off' && (
        <div className="row-note" role="status">
          Security fixes will not reach you, so check for new versions yourself.{' '}
          <button type="button" className="btn" onClick={() => void bridge().openReleases()}>
            Open releases
          </button>
        </div>
      )}
      {mode !== 'off' && offer?.live && <UpdateNote offer={offer} onOffer={setOffer} />}
    </>
  )
}

/** 1 line under the choice: what the updater is doing, and the 1 button
 *  that moves it along (US-178). */
function UpdateNote(props: { offer: UpdateOffer; onOffer: (offer: UpdateOffer) => void }): React.JSX.Element {
  const { offer, onOffer } = props
  if (offer.ready) {
    return (
      <div className="row-note" role="status">
        {offer.restartPending ? (
          <>Version {offer.ready} installs as soon as this take is done.</>
        ) : offer.restarting ? (
          <>murmur is restarting to install version {offer.ready}.</>
        ) : (
          <>
            Version {offer.ready} installs when you quit.{' '}
            <button type="button" className="btn" onClick={() => void bridge().restartToUpdate().then(onOffer)}>
              Restart now
            </button>
          </>
        )}
      </div>
    )
  }
  if (offer.available && offer.downloading) {
    // No status role: the percent moves every few seconds, and a screen
    // reader would read each one out.
    return (
      <div className="row-note">
        Version {offer.available} is downloading{offer.percent === null ? '' : ` (${offer.percent}%)`}.
      </div>
    )
  }
  if (offer.available) {
    return (
      <div className="row-note">
        Version {offer.available} is ready to download.{' '}
        <button type="button" className="btn" onClick={() => void bridge().downloadUpdate().then(onOffer)}>
          Download
        </button>
      </div>
    )
  }
  const said =
    offer.checked === 'newest'
      ? 'You have the newest version.'
      : offer.checked === 'failed'
        ? "murmur couldn't check. Check your internet connection and try again."
        : 'murmur checks every few hours.'
  return (
    <div className="row-note" role="status">
      {said}{' '}
      <button
        type="button"
        className="btn"
        disabled={offer.checking}
        onClick={() => void bridge().checkForUpdates().then(onOffer)}
      >
        {offer.checking ? 'Checking' : 'Check for updates'}
      </button>
    </div>
  )
}
