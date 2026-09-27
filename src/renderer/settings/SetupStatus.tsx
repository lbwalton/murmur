// SPDX-License-Identifier: GPL-3.0-only
// Setup that folds away (US-069). Every check is ok, bad, waiting on
// another check, or still being determined. All ok folds setup into
// one badge in the rail; any bad opens the Finish setup card at the top
// of the column with only what is missing, each fix beside its line.
// Still being determined never counts as bad, so the card does not
// flash open while the first connection test runs after launch.

export type CheckState = 'ok' | 'bad' | 'waiting' | 'pending'

export interface SetupCheck {
  id: string
  /** How the check reads once it passes ("Groq key saved"). */
  readyLabel: string
  state: CheckState
  /** What the card says while the check is not ok. */
  title: string
  desc: string
  action?: { label: string; ariaLabel?: string; primary?: boolean; disabled?: boolean; onClick: () => void }
}

export type SetupStatusValue = 'ok' | 'bad' | 'pending'

export function setupStatus(checks: SetupCheck[]): SetupStatusValue {
  if (checks.some((c) => c.state === 'bad')) return 'bad'
  if (checks.some((c) => c.state !== 'ok')) return 'pending'
  return 'ok'
}

export function FinishSetup(props: { checks: SetupCheck[] }): React.JSX.Element {
  const ready = props.checks.filter((c) => c.state === 'ok')
  const open = props.checks.filter((c) => c.state !== 'ok')
  return (
    <section className="finish" id="finish-setup" aria-labelledby="finish-title">
      <div className="finish-head">
        <div>
          <h2 className="finish-title" id="finish-title">
            Finish setup
          </h2>
          <p className="finish-sub">
            {ready.length} of {props.checks.length} ready
          </p>
        </div>
        <div className="meter" aria-hidden="true">
          {props.checks.map((c) => (
            <span key={c.id} className={`meter-cell meter-${c.state}`} />
          ))}
        </div>
      </div>
      {open.map((c) => (
        <div key={c.id} className={`fix fix-${c.state}`}>
          <span className="fix-dot" aria-hidden="true" />
          <div className="fix-text">
            <div className="fix-title">{c.title}</div>
            <div className="fix-desc">{c.desc}</div>
          </div>
          {c.action && (
            <button
              className={`btn ${c.action.primary ? 'btn-primary' : ''}`}
              aria-label={c.action.ariaLabel}
              disabled={c.action.disabled}
              onClick={c.action.onClick}
            >
              {c.action.label}
            </button>
          )}
        </div>
      ))}
      {ready.length > 0 && (
        <p className="finish-ready">Ready: {ready.map((c) => c.readyLabel).join(', ')}</p>
      )}
    </section>
  )
}
