// SPDX-License-Identifier: GPL-3.0-only
// The Model field as a searchable list (US-158, LaBroi's pick 2026-11-09):
// our suggestions on top, then every text model the provider offers, read
// from the provider when the list first opens. Any typed id still saves,
// so a model the list does not show is never out of reach. Keyboard: the
// arrows move, Enter picks (or saves what was typed), Escape closes.
import { useEffect, useId, useRef, useState } from 'react'
import type { ModelListResult } from '../../shared/catalog'

/** Past this many matches below the suggestions, the list says how many
 *  more there are instead of drawing them all. */
export const MAX_SHOWN = 100

export interface ComboOptions {
  suggested: string[]
  rest: string[]
  /** Matches below the suggestions that were not drawn. */
  more: number
}

/**
 * What the list shows. Suggestions the provider no longer lists are left
 * out once its list is in; until then (or if it never comes) they all
 * show. A query narrows both groups; an empty query shows everything.
 */
export function comboOptions(suggestions: string[], list: ModelListResult | null, query: string): ComboOptions {
  const live = list?.ok ? list.ids : null
  const offered = live ? new Set(live) : null
  const q = query.trim().toLowerCase()
  const match = (id: string): boolean => q === '' || id.toLowerCase().includes(q)
  const suggested = suggestions.filter((id) => (offered ? offered.has(id) : true) && match(id))
  const wanted = new Set(suggestions)
  const all = (live ?? []).filter((id) => !wanted.has(id) && match(id))
  return { suggested, rest: all.slice(0, MAX_SHOWN), more: Math.max(0, all.length - MAX_SHOWN) }
}

export function ModelCombo(props: {
  value: string
  suggestions: string[]
  /** The accessible name. */
  label: string
  placeholder?: string
  /** Who the list comes from: OpenRouter, or this provider. */
  providerName: string
  /** Where the list comes from (the base URL); a new one drops the list
   *  read from the old one. */
  source: string
  load: () => Promise<ModelListResult>
  /** Opens the provider's models page; absent when the catalog has none. */
  onOpenPage?: () => void
  onCommit: (value: string) => void
}): React.JSX.Element {
  const base = useId()
  const listId = `${base}-list`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(props.value)
  // True once the user types: until then the field holds the saved id
  // and the list shows everything.
  const [typed, setTyped] = useState(false)
  const [list, setList] = useState<ModelListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  // Mirrors a commit until the settings round trip lands, so the field
  // never flashes the old id for a render.
  const [pending, setPending] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pending !== null && props.value === pending) setPending(null)
  }, [props.value, pending])
  const effective = pending ?? props.value
  useEffect(() => {
    if (!open) setQuery(effective)
  }, [effective, open])
  // A different provider is a different list.
  useEffect(() => setList(null), [props.source])
  useEffect(() => activeRef.current?.scrollIntoView({ block: 'nearest' }), [active])

  const options = comboOptions(props.suggestions, list, typed ? query : '')
  const flat = [...options.suggested, ...options.rest]

  const show = (): void => {
    if (open) return
    setOpen(true)
    setActive(-1)
    if (list === null && !loading) {
      setLoading(true)
      void props
        .load()
        .then(setList, () => setList({ ok: false, detail: 'network error' }))
        .finally(() => setLoading(false))
    }
  }
  const close = (): void => {
    setOpen(false)
    setTyped(false)
    setActive(-1)
  }
  const commit = (id: string): void => {
    const next = id.trim()
    if (next !== '' && next !== effective) {
      setPending(next)
      props.onCommit(next)
    }
    setQuery(next === '' ? effective : next)
    close()
  }

  const optionId = (i: number): string => `${base}-opt-${i}`
  const option = (id: string, i: number): React.JSX.Element => (
    <div
      key={id}
      id={optionId(i)}
      ref={i === active ? activeRef : undefined}
      role="option"
      aria-selected={i === active}
      className={`combo-option${i === active ? ' combo-option-active' : ''}${id === effective ? ' combo-option-current' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => commit(id)}
    >
      <span>{id}</span>
      {id === effective && <span className="combo-tag">in use</span>}
    </div>
  )

  let status: string | null = null
  if (loading) status = `Reading ${props.providerName}'s models…`
  else if (list && !list.ok) status = `Could not read ${props.providerName}'s list: ${list.detail}. Type any model id it offers.`
  else if (flat.length === 0 && typed && query.trim() !== '') status = 'No model by that name here. Enter saves it as typed.'

  return (
    <div
      className="combo"
      ref={wrapRef}
      onBlur={(e) => {
        if (wrapRef.current?.contains(e.relatedTarget as Node | null)) return
        if (open && typed) commit(query)
        else close()
      }}
    >
      <div className="combo-field">
        <input
          ref={inputRef}
          className="field combo-input"
          role="combobox"
          aria-label={props.label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          placeholder={props.placeholder}
          spellCheck={false}
          autoComplete="off"
          value={open ? query : effective}
          onClick={show}
          onChange={(e) => {
            setQuery(e.target.value)
            setTyped(true)
            setActive(-1)
            show()
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (!open) {
                show()
                return
              }
              if (flat.length === 0) return
              const step = e.key === 'ArrowDown' ? 1 : -1
              setActive((i) => (i + step + flat.length) % flat.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (open && active >= 0 && active < flat.length) commit(flat[active])
              else commit(query)
            } else if (e.key === 'Escape' && open) {
              e.preventDefault()
              e.stopPropagation()
              setQuery(effective)
              close()
            }
          }}
        />
        <button
          type="button"
          className="combo-toggle"
          tabIndex={-1}
          aria-label={`Show ${props.providerName}'s models`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) close()
            else {
              inputRef.current?.focus()
              show()
            }
          }}
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="combo-pop">
          <div className="combo-list" id={listId} role="listbox" aria-label={props.label}>
            {options.suggested.length > 0 && (
              <div role="group" aria-labelledby={`${base}-g1`}>
                <div className="combo-group" id={`${base}-g1`}>
                  suggested
                </div>
                {options.suggested.map((id, i) => option(id, i))}
              </div>
            )}
            {options.rest.length > 0 && (
              <div role="group" aria-labelledby={`${base}-g2`}>
                <div className="combo-group" id={`${base}-g2`}>
                  everything {props.providerName} offers
                </div>
                {options.rest.map((id, i) => option(id, options.suggested.length + i))}
              </div>
            )}
          </div>
          {options.more > 0 && <p className="combo-note">{options.more} more. Type to narrow the list.</p>}
          {status && (
            <p className="combo-note" role="status">
              {status}
            </p>
          )}
          {props.onOpenPage && (
            <button
              type="button"
              className="link-btn combo-page"
              onMouseDown={(e) => e.preventDefault()}
              onClick={props.onOpenPage}
            >
              Prices and details on {props.providerName}'s site ↗
            </button>
          )}
        </div>
      )}
    </div>
  )
}
