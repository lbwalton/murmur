// SPDX-License-Identifier: GPL-3.0-only
// The line under the Cleanup group (US-154): which of notes sorting and
// Transform ride the cleanup connection and which run on their own, by
// the same rules the pipeline uses (connectionsNow), with a link to
// where each is set. It never says a slot has its own connection while
// that slot really rides cleanup (review gate, 2026-11-08).
import type { ProviderCatalog } from '../../shared/catalog'
import { type KeysKnown, connectionsNow, providerName } from '../../shared/profiles'
import type { Settings } from '../../shared/settings'
import { jumpToRow } from './controls'

/** Glow a setting's row when it is on the page, else bring its section's
 *  heading to the top, the way the rail does. Never the red flash: red is
 *  for recording, errors, and confirming a delete. */
export function jumpToSetting(rowId: string, sectionId: string): void {
  if (document.getElementById(rowId)) {
    jumpToRow(rowId, { tone: 'glow' })
    return
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(sectionId)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}

const SLOTS = [
  {
    slot: 'notes sorting',
    label: 'Notes sorting',
    row: 'row-sort-connection',
    section: 'sec-notes',
    where: 'Notes'
  },
  {
    slot: 'Transform',
    label: 'Transform',
    row: 'row-transform-connection',
    section: 'sec-transform',
    where: 'Transform'
  }
] as const

export function CleanupShares(props: {
  settings: Settings
  catalog: ProviderCatalog | null
  keys: KeysKnown
}): React.JSX.Element | null {
  const now = connectionsNow(props.settings, props.keys)
  const link = (s: (typeof SLOTS)[number]): React.JSX.Element => (
    <button className="link-btn" onClick={() => jumpToSetting(s.row, s.section)}>
      {s.where}
    </button>
  )
  const active = SLOTS.filter((s) => now[s.slot] !== null)
  if (active.length === 0) return null
  const riders = active.filter((s) => !now[s.slot]?.own)
  const parts: React.ReactNode[] = []
  if (riders.length > 0) {
    parts.push(
      <span key="ride">
        {riders.map((s) => s.label).join(' and ')} {riders.length > 1 ? 'use' : 'uses'} this connection too.{' '}
      </span>
    )
  }
  for (const s of active) {
    const c = now[s.slot]
    if (c?.own) {
      parts.push(
        <span key={s.slot}>
          {s.label} runs on its own, {providerName(props.catalog, c.baseUrl)} · {c.model}, set in {link(s)}.{' '}
        </span>
      )
    } else if (c?.waiting) {
      parts.push(
        <span key={s.slot}>
          {s.label} is set to its own connection in {link(s)}, but it needs a base URL, a model, and a key first.{' '}
        </span>
      )
    }
  }
  const plain = riders.filter((s) => !now[s.slot]?.waiting)
  if (plain.length > 0) {
    parts.push(
      <span key="change">
        Give {plain.length > 1 ? 'either' : 'it'} its own in{' '}
        {plain.map((s, i) => (
          <span key={s.slot}>
            {i > 0 ? ' or ' : ''}
            {link(s)}
          </span>
        ))}
        .
      </span>
    )
  }
  return <>{parts}</>
}
