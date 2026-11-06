// SPDX-License-Identifier: GPL-3.0-only
// Under a base URL field: plain http to anything but this machine stops
// everything from being sent until the person confirms it (US-140).
import { useEffect, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import { isPrivateHost, plainHttpHost } from '../../shared/plain-http'

const bridge = (): SettingsApi => window.murmur

export function PlainHttpNote(props: { url: string }): React.JSX.Element | null {
  const host = plainHttpHost(props.url)
  const [trusted, setTrusted] = useState<string[] | null>(null)

  useEffect(() => {
    if (host === null) return
    void bridge()
      .getSettings()
      .then((settings) => setTrusted(settings.trustedHttpHosts))
  }, [host])

  if (host === null || trusted === null) return null
  const save = (hosts: string[]): void => {
    void bridge()
      .updateSettings({ trustedHttpHosts: hosts })
      .then((settings) => setTrusted(settings.trustedHttpHosts))
  }
  if (trusted.includes(host)) {
    return (
      <div className="row-note">
        Sending to {host} without encryption, as you confirmed.{' '}
        <button type="button" className="btn" onClick={() => save(trusted.filter((item) => item !== host))}>
          Stop
        </button>
      </div>
    )
  }
  return (
    <div className="row-note" role="alert">
      <span className="status-bad">This address is not encrypted.</span> Your API key and what you say would travel in
      the open{isPrivateHost(host) ? ' across your network' : ' across the internet'}. murmur sends nothing to {host}{' '}
      until you confirm.{' '}
      <button type="button" className="btn" onClick={() => save([...trusted, host])}>
        Send to {host} anyway
      </button>
    </div>
  )
}
