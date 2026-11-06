// SPDX-License-Identifier: GPL-3.0-only
// The Microphone row (US-110): follow the system default, or pick a mic
// murmur stays on whenever it is plugged in. The list comes from the
// capture window, the one window allowed the microphone (US-072); this
// window only ever sees names.
import { useEffect, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import type { MicReport } from '../../shared/mic'
import type { Settings } from '../../shared/settings'
import { Row, Segmented } from './controls'

const bridge = (): SettingsApi => window.murmur

// The option standing for a pick that is unplugged right now.
const UNPLUGGED = 'unplugged'

export function MicRow(props: {
  settings: Settings
  onUpdate: (partial: Partial<Settings>) => Promise<void>
}): React.JSX.Element {
  const [report, setReport] = useState<MicReport | null>(null)

  useEffect(() => {
    const load = (): void => {
      void bridge()
        .listMics()
        .then(setReport)
        .catch(() => undefined)
    }
    load()
    const off = bridge().onMicsChanged(load)
    window.addEventListener('focus', load)
    return () => {
      off()
      window.removeEventListener('focus', load)
    }
  }, [])

  const isMac = navigator.platform.toLowerCase().includes('mac')
  const systemDefault = isMac ? "your Mac's default input" : 'the Windows default input'
  const pick = props.settings.microphone
  const picked = pick.id !== '' || pick.label !== ''
  const devices = report?.devices ?? []
  // By id, or by name when the id changed (the same rule capture uses).
  const matched =
    devices.find((d) => pick.id !== '' && d.id === pick.id) ??
    devices.find((d) => pick.label !== '' && d.label === pick.label)
  const value = !picked ? '' : (matched?.id ?? UNPLUGGED)
  const current = report?.current ?? ''
  const inUse = current !== '' ? ` In use now: ${current}.` : ''

  let desc: string
  if (!picked) {
    desc = `Follows ${systemDefault}, also after a mic is unplugged or the computer wakes.${inUse}`
  } else if (!matched) {
    desc = `${pick.label || 'Your pick'} is unplugged, so ${systemDefault} stands in until it is back.${inUse}`
  } else {
    desc = `murmur stays on this mic whenever it is plugged in.${inUse}`
  }

  const press = props.settings.micMode === 'press'
  const lastPress = report?.openMs ?? null
  return (
    <>
    <Row label="Microphone" anchor="row-mic" keywords="microphone mic input device audio headset" desc={desc}>
      <select
        className="field"
        aria-label="Microphone"
        value={value}
        onChange={(e) => {
          if (e.target.value === UNPLUGGED) return
          if (e.target.value === '') {
            void props.onUpdate({ microphone: { id: '', label: '' } })
            return
          }
          const device = devices.find((d) => d.id === e.target.value)
          if (device) void props.onUpdate({ microphone: { id: device.id, label: device.label } })
        }}
      >
        <option value="">{isMac ? 'Mac default' : 'Windows default'}</option>
        {devices.map((d, i) => (
          <option key={d.id} value={d.id}>
            {d.label || `Input ${i + 1}`}
          </option>
        ))}
        {picked && !matched && <option value={UNPLUGGED}>{`${pick.label || 'Your pick'} (unplugged)`}</option>}
      </select>
    </Row>
    <Row
      label="Between takes"
      keywords="microphone always on privacy orange dot closed open warm"
      desc={
        press
          ? `The mic is off until you press, and the listening sound plays once it is live, so wait for it before you speak.${
              lastPress === null ? '' : ` Your last press took ${lastPress} ms.`
            }`
          : 'The mic stays ready so your first word is not cut off. The last 300 ms sit in memory, and nothing is saved or sent until you press.'
      }
    >
      <Segmented
        label="Between takes"
        value={props.settings.micMode}
        options={[
          { value: 'ready', label: 'Keep the mic ready' },
          { value: 'press', label: 'Open the mic only when I press' }
        ]}
        onChange={(micMode) => void props.onUpdate({ micMode })}
      />
    </Row>
    </>
  )
}
