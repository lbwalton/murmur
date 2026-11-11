// SPDX-License-Identifier: GPL-3.0-only
// The Shortcuts section of settings (US-164): every key combo murmur
// listens for on 1 screen. The 4 you can set are the same settings
// their own sections show (Dictation, Notes, Transform), so a change
// in either place is a change in both; the built-in keys are listed to
// read, not to set (LaBroi's pick, 2026-11-11).
import { useState } from 'react'
import type { HotkeysStatus, SettingsApi } from '../../preload/settings'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'
import { Group, Row, Section, jumpToRow } from './controls'

const bridge = (): SettingsApi => window.murmur

export type ShortcutKind = 'dictation' | 'pasteLast' | 'note' | 'transform'

export interface Shortcut {
  kind: ShortcutKind
  /** The kind as it reads in a row id. */
  slug: string
  label: string
  desc: string
  /** The saved combo; empty when none is set. */
  binding: string
  /** Saved but not listening: it clashes with another, or no longer parses. */
  disarmed: boolean
  /** The row in its own section, and that section's name. */
  home: { anchor: string; name: string }
}

/** The 4 shortcuts a person can set, in the order they are used. */
export function shortcutsOf(settings: Settings, hotkeys: HotkeysStatus | null): Shortcut[] {
  const off = (binding: string, valid: boolean | undefined): boolean => binding !== '' && valid === false
  return [
    {
      kind: 'dictation',
      slug: 'dictation',
      label: 'Dictation',
      desc: settings.hotkey.mode === 'hold' ? 'Hold it and speak.' : 'Tap it to start, tap again to stop.',
      binding: settings.hotkey.binding,
      disarmed: off(settings.hotkey.binding, hotkeys?.bindingValid),
      home: { anchor: 'row-hotkey', name: 'Dictation' }
    },
    {
      kind: 'pasteLast',
      slug: 'paste-last',
      label: 'Paste last dictation',
      desc: 'Pastes your newest dictation again, wherever your cursor is.',
      binding: settings.hotkey.pasteLastBinding,
      disarmed: off(settings.hotkey.pasteLastBinding, hotkeys?.pasteBindingValid),
      home: { anchor: 'row-paste-last-dictation', name: 'Dictation' }
    },
    {
      kind: 'note',
      slug: 'note',
      label: 'Note',
      desc: 'Hold it and speak: the words go to your notes folder instead of your cursor.',
      binding: settings.notes.binding,
      disarmed: off(settings.notes.binding, hotkeys?.noteBindingValid),
      home: { anchor: 'row-note-chord', name: 'Notes' }
    },
    {
      kind: 'transform',
      slug: 'transform',
      label: 'Transform',
      desc: 'Select text in any app, hold it, and say what to do.',
      binding: settings.transform.binding,
      disarmed: off(settings.transform.binding, hotkeys?.transformBindingValid),
      home: { anchor: 'row-transform-chord', name: 'Transform' }
    }
  ]
}

/** What to say when a capture is turned down. */
export function captureProblem(reason: string | undefined): string {
  if (reason === 'needs-modifier') {
    return 'single letters would fire while typing; add Ctrl, Alt, Shift, or Cmd (F-keys can stand alone)'
  }
  if (reason === 'needs-key') return 'this one needs a regular key too, like Ctrl+F12; modifiers alone fire by accident'
  if (reason === 'collides') {
    return 'that combo contains your dictation hotkey or is already another shortcut here; pick a different one'
  }
  return 'not captured; click and try again, Esc cancels'
}

/** The settings change that clears 1 shortcut. Dictation goes back to
 *  its default instead: murmur cannot run without that one. */
export function clearedShortcut(kind: ShortcutKind): Partial<Settings> {
  if (kind === 'dictation') return { hotkey: { binding: DEFAULT_SETTINGS.hotkey.binding } as Settings['hotkey'] }
  if (kind === 'pasteLast') return { hotkey: { pasteLastBinding: '' } as Settings['hotkey'] }
  if (kind === 'note') return { notes: { binding: '' } as Settings['notes'] }
  return { transform: { binding: '' } as Settings['transform'] }
}

export function ShortcutsSection(props: {
  settings: Settings
  hotkeys: HotkeysStatus | null
  onUpdate: (partial: Partial<Settings>) => Promise<void>
  onRefresh: () => Promise<unknown>
}): React.JSX.Element {
  const [capturing, setCapturing] = useState<ShortcutKind | null>(null)
  const [problem, setProblem] = useState<{ kind: ShortcutKind; why: string } | null>(null)
  const mac = navigator.platform.toLowerCase().includes('mac')
  const shortcuts = shortcutsOf(props.settings, props.hotkeys)

  const capture = async (kind: ShortcutKind): Promise<void> => {
    if (capturing) return
    setCapturing(kind)
    setProblem(null)
    try {
      const result = await bridge().captureHotkey(kind)
      if (result.ok) await props.onRefresh()
      else setProblem({ kind, why: captureProblem(result.reason) })
    } finally {
      setCapturing(null)
    }
  }

  const handsFree = props.settings.hotkey.mode === 'hold' && props.settings.hotkey.doubleTap

  return (
    <Section id="shortcuts" title="Shortcuts" sub="Every key combo murmur listens for, in 1 place.">
      <Group id="shortcuts-yours" title="Yours to set">
        {shortcuts.map((s) => {
          const said = problem?.kind === s.kind ? problem.why : null
          const canClear = s.kind === 'dictation' ? s.binding !== DEFAULT_SETTINGS.hotkey.binding : s.binding !== ''
          return (
            // A second view of a setting its own section owns: search
            // lists the setting once, there.
            <div className="row" id={`row-shortcut-${s.slug}`} data-mirror="" key={s.kind}>
              <div className="row-text">
                <div className="row-label">{s.label}</div>
                <div className="row-desc">
                  {said ??
                    (s.disarmed
                      ? 'Not listening: it clashes with another shortcut here, or no longer parses. Capture a new one.'
                      : s.desc)}
                </div>
                <div className="row-also">
                  also under{' '}
                  <button
                    className="link-btn"
                    aria-label={`${s.label}, under ${s.home.name}`}
                    onClick={() => jumpToRow(s.home.anchor, { tone: 'glow', focusControl: true })}
                  >
                    {s.home.name}
                  </button>
                </div>
              </div>
              <div className="row-control">
                <div className="inline">
                  <button
                    className={`field capture ${capturing === s.kind ? 'capture-live' : ''}`}
                    aria-label={`${s.label} shortcut, ${s.binding === '' ? 'not set' : s.binding}. Click to change.`}
                    onClick={() => void capture(s.kind)}
                  >
                    {capturing === s.kind ? 'press keys…' : s.binding === '' ? 'not set' : s.binding}
                  </button>
                  {canClear && (
                    <button
                      className={s.kind === 'dictation' ? 'btn' : 'btn btn-remove'}
                      aria-label={s.kind === 'dictation' ? 'Reset the dictation shortcut' : `Clear the ${s.label} shortcut`}
                      onClick={() => {
                        setProblem(null)
                        void props.onUpdate(clearedShortcut(s.kind))
                      }}
                    >
                      {s.kind === 'dictation' ? 'Reset' : 'Clear'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </Group>

      <Group id="shortcuts-built-in" title="Built in" sub="Keys murmur always uses. These cannot be changed.">
        <Row
          label="Hands-free"
          anchor="row-shortcut-hands-free"
          keywords="double tap lock"
          desc={
            handsFree
              ? 'Tap the dictation or note shortcut twice to keep talking without holding it. Tap once more to stop.'
              : 'Off. Turn on Double-tap for hands-free under Dictation, with Trigger on Hold to talk.'
          }
        >
          <span className="mono-dim">{handsFree ? 'double-tap' : 'off'}</span>
        </Row>
        <Row
          label="Cancel a hands-free take"
          anchor="row-shortcut-cancel"
          keywords="escape esc stop discard"
          desc="The take waits on Home to retry. Esc also backs out while murmur is capturing a new shortcut."
        >
          <span className="mono-dim">Esc</span>
        </Row>
        <Row
          label="Zoom the murmur window"
          anchor="row-shortcut-zoom"
          keywords="bigger smaller text size magnify"
          desc="Bigger, smaller, and back to normal size."
        >
          <span className="mono-dim">{mac ? 'Cmd +, Cmd −, Cmd 0' : 'Ctrl +, Ctrl −, Ctrl 0'}</span>
        </Row>
      </Group>
    </Section>
  )
}
