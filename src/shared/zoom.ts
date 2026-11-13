// SPDX-License-Identifier: GPL-3.0-only
// Zoom for the settings window (US-111): Cmd or Ctrl plus, minus, and
// zero step through the factors a browser uses, up to Safari's 300
// percent. Pure, so main and the tests share one rule.

/** The factors a press steps through, smallest to largest. */
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const

export type ZoomAction = 'in' | 'out' | 'reset'

/** A stored factor snapped to the nearest step. Anything unreadable
 *  (a corrupt settings file, a hand edit) is 100 percent. */
export function normalizeZoom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  let best: number = ZOOM_STEPS[0]
  for (const step of ZOOM_STEPS) {
    if (Math.abs(step - value) < Math.abs(best - value)) best = step
  }
  return best
}

/** The factor after one press, held at the smallest and largest steps. */
export function nextZoom(current: number, action: ZoomAction): number {
  if (action === 'reset') return 1
  const i = ZOOM_STEPS.indexOf(normalizeZoom(current) as (typeof ZOOM_STEPS)[number])
  const j = action === 'in' ? Math.min(ZOOM_STEPS.length - 1, i + 1) : Math.max(0, i - 1)
  return ZOOM_STEPS[j]
}

/** The shape of Electron's before-input-event input this needs. */
export interface ZoomKeyInput {
  type: string
  key: string
  control: boolean
  meta: boolean
  alt: boolean
}

/**
 * The zoom a key press asks for where there is no menu bar to own the
 * shortcut (Windows and Linux): Ctrl with =, + (Shift = or the keypad),
 * - or 0. Every other key is null and passes through untouched.
 */
export function zoomActionForKey(input: ZoomKeyInput): ZoomAction | null {
  if (input.type !== 'keyDown' || !input.control || input.meta || input.alt) return null
  if (input.key === '=' || input.key === '+') return 'in'
  if (input.key === '-') return 'out'
  if (input.key === '0') return 'reset'
  return null
}

/** The smallest the settings window goes at 100 percent (LaBroi,
 *  2026-11-12: dragged narrower, the tabs stacked and cards ran off the
 *  edge). At this size the tabs fit on 1 line and buttons stay in
 *  their cards. */
export const SETTINGS_MIN = { width: 480, height: 400 }

/** The floor at a zoom: it grows with the zoom, so the page keeps the
 *  same room, but never past the screen it is on. */
export function minSizeAt(zoom: number, screen: { width: number; height: number }): { width: number; height: number } {
  const factor = Number.isFinite(zoom) && zoom > 1 ? zoom : 1
  return {
    width: Math.min(Math.round(SETTINGS_MIN.width * factor), screen.width),
    height: Math.min(Math.round(SETTINGS_MIN.height * factor), screen.height)
  }
}
