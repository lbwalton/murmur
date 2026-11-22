// SPDX-License-Identifier: GPL-3.0-only
// The window's theme as a grid of tiles (US-151), the way the waveform
// is (US-084): each tile previews its theme, a painted theme with a still
// frame of its painting and a colors-only theme with its own ground and
// card. Locked themes stay visible, dimmed, saying what unlocks them (its
// belt, or murmur Pro), so the grid also shows the path.
import { useEffect, useRef, useState } from 'react'
import type { CosmeticItem } from '../../shared/cosmetics'
import { type ThemeEntry, needsPro, themeById } from '../../shared/themes'
import { ScenePainting } from './ScenePainting'

type ThemeItem = CosmeticItem & { unlocked: boolean }

export function ThemeTiles(props: {
  themes: ThemeItem[]
  /** The saved pick. */
  value: string
  pro: boolean
  /** The murmur Pro mark for a Pro theme's name (US-107 rules). */
  proMark?: React.ReactNode
  onPick: (id: string) => void
}): React.JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([])
  const chosen = Math.max(
    0,
    props.themes.findIndex((t) => t.id === props.value)
  )
  const [focusAt, setFocusAt] = useState(chosen)
  useEffect(() => {
    if (!gridRef.current?.contains(document.activeElement)) setFocusAt(chosen)
  }, [chosen, props.themes.length])

  const move = (to: number): void => {
    const n = props.themes.length
    const next = (to + n) % n
    setFocusAt(next)
    tileRefs.current[next]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(focusAt + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(focusAt - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(props.themes.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div className="theme-tiles" role="radiogroup" aria-label="Theme" ref={gridRef} onKeyDown={onKeyDown}>
      {props.themes.map((item, i) => {
        const entry = themeById(item.id)
        const pro = entry ? needsPro(entry) : false
        const locked = !item.unlocked || (pro && !props.pro)
        const inUse = item.id === props.value && !locked
        const status = inUse
          ? 'in use'
          : locked
            ? pro && !props.pro
              ? 'murmur Pro'
              : `locked: ${item.hint}`
            : item.unlock?.rank
              ? `earned at ${item.unlock.rank} belt`
              : item.hint
        return (
          <button
            key={item.id}
            ref={(el) => {
              tileRefs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={inUse}
            aria-disabled={locked}
            tabIndex={i === focusAt ? 0 : -1}
            className="theme-tile"
            onFocus={() => setFocusAt(i)}
            onClick={() => {
              if (!locked && !inUse) props.onPick(item.id)
            }}
          >
            <ThemePreview entry={entry} id={item.id} />
            <span className="tile-name">
              {item.name}
              {pro && props.proMark}
            </span>
            <span className="tile-status">{status}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A theme in small: its painting, still, or its ground with a card. */
function ThemePreview(props: { entry: ThemeEntry | undefined; id: string }): React.JSX.Element {
  return (
    <span className="theme-preview" data-theme-preview={props.id} aria-hidden="true">
      {props.entry?.scene ? (
        <ScenePainting scene={props.entry.scene} theme={props.id} moving={false} speed={0} className="theme-preview-scene" />
      ) : null}
      <span className="theme-preview-card">
        <span className="theme-preview-label" />
        <span className="theme-preview-line" />
      </span>
    </span>
  )
}
