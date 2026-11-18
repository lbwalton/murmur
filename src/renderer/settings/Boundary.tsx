// SPDX-License-Identifier: GPL-3.0-only
// A problem while drawing 1 part of the window stays in that part
// (US-163). React calls this an error boundary: it catches a throw while
// drawing, in an effect or in an effect's cleanup (the 83e3683 blackout
// was a cleanup), shows a short note in that part's place with a way
// back, and leaves everything else working. A throw inside a click
// handler unmounts nothing, so it needs no note. The 1 log line goes out
// as a console error, which window-watch writes to murmur.log.
// A note catches what its own part draws: problems in a section's child
// components, effects and cleanups. A section whose body App builds
// inline is still part of App's own drawing, so a throw there reaches
// the whole-window note (US-155 moves section bodies into components).
import React from 'react'

export type CrashKind = 'section' | 'page' | 'window'

export const CRASH_TEXT: Record<CrashKind, { title: string; detail: string }> = {
  section: {
    title: 'This section hit a problem',
    detail: 'Dictation still works, and murmur noted the problem in its log.'
  },
  page: {
    title: 'This page hit a problem',
    detail: 'Dictation still works, and murmur noted the problem in its log.'
  },
  window: {
    title: 'This window hit a problem',
    detail: 'Dictation still works, and murmur noted the problem in its log. Reload to bring the window back.'
  }
}

/** The log line: where, the error's name, and the start of its message,
 *  cut at the first quote, backtick or slash and at 80 characters.
 *  Error messages can echo what code was handed (JSON.parse quotes the
 *  text it choked on, a bad pattern quotes the pattern), so the message
 *  stops before anything it quotes. Nothing else rides along. */
export function crashLine(where: string, error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? '' : String(error)
  const message = raw.split(/["'`/]/)[0].replace(/\s+/g, ' ').trim().slice(0, 80)
  return `[settings] problem in ${where}: ${name}${message ? `: ${message}` : ''}`
}

/** createRoot options: a problem a note caught is logged once, by the
 *  note, instead of again by React with its whole stack. */
export const ROOT_OPTIONS = {
  onCaughtError: (): void => undefined
}

export function CrashNote(props: {
  kind: CrashKind
  onRetry?: () => void
  focusRef?: React.Ref<HTMLButtonElement>
}): React.JSX.Element {
  const text = CRASH_TEXT[props.kind]
  const note = (
    <div className="panel crash-note" role="alert" data-crashed={props.kind}>
      <p className="crash-title">{text.title}</p>
      <p className="crash-line">{text.detail}</p>
      <div className="crash-actions">
        {props.onRetry && (
          <button type="button" className="btn" ref={props.focusRef} onClick={props.onRetry}>
            Try again
          </button>
        )}
        <button
          type="button"
          className="btn"
          ref={props.onRetry ? undefined : props.focusRef}
          onClick={() => window.location.reload()}
        >
          Reload window
        </button>
      </div>
    </div>
  )
  return props.kind === 'window' ? <div className="crash-window">{note}</div> : note
}

type Props = {
  kind: CrashKind
  where: string
  children: React.ReactNode
  /** Log only, never a note: around a page as it closes, so a cleanup
   *  that throws on the way out is noted without blanking the next page
   *  or the window (review gate). Safe only while everything mounted
   *  under it sits inside a boundary of its own (the keyed page note):
   *  an effect directly under it that throws on every render would
   *  rerun until React gives up. */
  logOnly?: boolean
  /** Wraps the note, so a section's own component keeps its title. */
  wrapNote?: (note: React.ReactNode) => React.ReactNode
}
type State = { failed: boolean }

export class Boundary extends React.Component<Props, State> {
  state: State = { failed: false }
  private focusTarget = React.createRef<HTMLButtonElement>()

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error(crashLine(this.props.where, error))
    if (this.props.logOnly) return
    // After the frame settles: a 2nd problem in the same unmount (a
    // cleanup that throws too) redraws the note and would drop focus
    // given any sooner.
    requestAnimationFrame(() => {
      this.takeFocus()
    })
  }

  // Only when the problem took focus with it: a part that breaks while
  // someone types elsewhere must not pull them away.
  private takeFocus(): void {
    if (!document.hasFocus()) return
    const active = document.activeElement
    if (active === null || active === document.body) this.focusTarget.current?.focus({ preventScroll: true })
  }

  render(): React.ReactNode {
    if (!this.state.failed || this.props.logOnly) return this.props.children
    const note = (
      <CrashNote
        kind={this.props.kind}
        focusRef={this.focusTarget}
        onRetry={this.props.kind === 'window' ? undefined : () => this.setState({ failed: false })}
      />
    )
    return this.props.wrapNote ? this.props.wrapNote(note) : note
  }
}
