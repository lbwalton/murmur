// SPDX-License-Identifier: GPL-3.0-only
// How updates arrive (US-136). Automatic is the default, and Off says
// plainly what it costs.
import { useEffect, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import type { Settings, UpdateMode } from '../../shared/settings'
import { Row, Segmented } from './controls'

const bridge = (): SettingsApi => window.murmur

type UpdateOffer = Awaited<ReturnType<SettingsApi['getUpdateOffer']>>

export function UpdatesRow(props: { settings: Settings; onChange: (mode: UpdateMode) => void }): React.JSX.Element {
  const mode = props.settings.updates
  const [offer, setOffer] = useState<UpdateOffer | null>(null)

  useEffect(() => {
    void bridge().getUpdateOffer().then(setOffer)
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
      {mode === 'ask' && offer?.available && (
        <div className="row-note">
          Version {offer.available} is ready to download.{' '}
          <button
            type="button"
            className="btn"
            disabled={offer.downloading}
            onClick={() => void bridge().downloadUpdate().then(setOffer)}
          >
            {offer.downloading ? 'Downloading' : 'Download'}
          </button>
        </div>
      )}
      {offer?.ready && <div className="row-note">Version {offer.ready} installs when you quit.</div>}
    </>
  )
}
