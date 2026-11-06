// SPDX-License-Identifier: GPL-3.0-only
// Who may call what over IPC (US-139), free of Electron so it can be
// unit tested. Windows only ever show murmur's own pages, so in normal
// use nothing here refuses anything.

export type PageRole = 'settings' | 'audio' | 'overlay'

// All the audio window may send. Keep in step with src/preload/audio.ts;
// a unit test reads that file and fails if they drift.
export const AUDIO_SENDS: readonly string[] = [
  'audio:mic-choice',
  'audio:armed',
  'audio:cue-played',
  'audio:level',
  'audio:live',
  'audio:mics',
  'audio:ready',
  'audio:result'
]

export interface PageBases {
  /** file:// URL of the bundled pages' folder. */
  rendererRoot: string
  /** The dev server, in development only. */
  devServer?: string
}

const PAGE = /^\/(settings|audio|overlay)\/index\.html$/

const lower = (value: string): string => value.toLowerCase()

/** Which of murmur's own bundled pages a URL is, or null for anything else. */
export function pageRole(url: string, bases: PageBases): PageRole | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  let path: string
  if (parsed.protocol === 'file:') {
    const root = lower(bases.rendererRoot.replace(/\/$/, ''))
    const href = lower(`${parsed.protocol}//${parsed.pathname}`)
    if (!href.startsWith(`${root}/`)) return null
    path = parsed.pathname.slice(bases.rendererRoot.replace(/\/$/, '').length - 'file://'.length)
  } else if (bases.devServer !== undefined && parsed.origin === new URL(bases.devServer).origin) {
    path = parsed.pathname
  } else {
    return null
  }
  const match = PAGE.exec(path)
  return match === null ? null : (match[1] as PageRole)
}

/** The audio window sends its own short list, the overlay sends nothing,
 *  and the settings window sends everything else. */
export function channelAllowed(role: PageRole, channel: string): boolean {
  if (role === 'overlay') return false
  return AUDIO_SENDS.includes(channel) === (role === 'audio')
}

/** A string within a length limit, or null. */
export function boundedText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

export const MAX_KEY_CHARS = 4_096
export const MAX_URL_CHARS = 2_048
export const MAX_NAME_CHARS = 120
export const MAX_TEXT_CHARS = 1_000_000
