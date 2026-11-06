// SPDX-License-Identifier: GPL-3.0-only
// Report this take (US-130). Everything that would be sent is on screen
// and editable first, and it goes only through the person's own mail
// app. murmur sends nothing.
import { useEffect, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import type { SessionEvent } from '../../shared/history'
import { REPORT_ADDRESS, fitsMailto, reportBody } from '../../shared/report'
import type { Settings } from '../../shared/settings'

const bridge = (): SettingsApi => window.murmur

function platformName(raw: string): string {
  const mac = /Mac/i.test(raw)
  return mac ? 'macOS' : /Win/i.test(raw) ? 'Windows' : raw
}

export function ReportPanel(props: {
  id: string
  event: SessionEvent
  settings: Settings
  onClose: () => void
}): React.JSX.Element {
  const { event, settings } = props
  const [said, setSaid] = useState(event.rawText)
  const [typed, setTyped] = useState(event.finalText)
  const [shouldHaveBeen, setShouldHaveBeen] = useState('')
  const [version, setVersion] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void bridge().appVersion().then(setVersion)
  }, [])

  const polish = settings.polish
  const body = reportBody({
    said,
    typed,
    shouldHaveBeen,
    version,
    platform: platformName(navigator.userAgent),
    level: settings.formatting.level,
    smartLists: settings.formatting.smartLists,
    corrections: settings.formatting.corrections,
    speechModel: settings.provider.sttModel,
    cleanupModel: polish.enabled && polish.llmModel !== '' ? polish.llmModel : settings.provider.llmModel
  })
  const fits = fitsMailto(body)
  const details = body.split('\n').slice(-3)

  return (
    <div className="log-said" id={props.id}>
      <p className="micro-label log-original">report this take</p>
      <p className="row-note">
        This opens an email to {REPORT_ADDRESS} in your own mail app, and nothing goes until you press send. LaBroi
        reads it to make murmur better, and it is kept 90 days. Take out anything private first.
      </p>
      <label className="report-field">
        <span className="micro-label">what you said</span>
        <textarea className="field entry-field" rows={3} value={said} onChange={(e) => setSaid(e.target.value)} />
      </label>
      <label className="report-field">
        <span className="micro-label">what murmur typed</span>
        <textarea className="field entry-field" rows={3} value={typed} onChange={(e) => setTyped(e.target.value)} />
      </label>
      <label className="report-field">
        <span className="micro-label">what it should have been (optional)</span>
        <textarea
          className="field entry-field"
          rows={2}
          value={shouldHaveBeen}
          onChange={(e) => setShouldHaveBeen(e.target.value)}
        />
      </label>
      <p className="row-note">
        Also included: {details.join('. ')}. Never your audio, keys, base URLs, dictionary, or other takes.
      </p>
      <p className="log-said-foot">
        {fits ? (
          <button className="btn" onClick={() => void bridge().openReportMail(body).then(props.onClose)}>
            Open in my mail app
          </button>
        ) : (
          <>
            <span className="mono-inline dim">too long for a mail link</span>
            <button
              className="btn"
              onClick={() => {
                void bridge()
                  .copyText(body)
                  .then(() => setCopied(true))
                  .then(() => bridge().openReportMail(null))
              }}
            >
              {copied ? 'copied, paste it in' : 'Copy report and open mail'}
            </button>
          </>
        )}
        <button className="btn quiet-btn" onClick={props.onClose}>
          Cancel
        </button>
      </p>
    </div>
  )
}
