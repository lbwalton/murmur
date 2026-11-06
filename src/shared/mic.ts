// SPDX-License-Identifier: GPL-3.0-only
// Which microphone the warm mic belongs on (US-110), kept free of the
// DOM so it can be unit tested. Live-found 2026-10-20 to 10-23: a
// display wake blipped the Elgato Wave:3, the warm stream reopened on
// whatever was default in that instant (a dock's headset jack), and
// nothing ever moved it back. That jack's hiss cleared the dead-stream
// floor, so every watchdog read the stream as healthy while dictations
// peaked at 0.01 to 0.18. The rule now: the stream follows the system
// default, or the mic you picked whenever it is plugged in, and it only
// ever moves between takes.

/** One audio input as Chromium lists it (enumerateDevices). */
export interface MicDevice {
  deviceId: string
  groupId: string
  label: string
}

/** The mic picked in Settings. Empty id and label follow the system default. */
export interface MicChoice {
  id: string
  label: string
}

/** What the live track says about itself (MediaStreamTrack.getSettings). */
export interface LiveMic {
  deviceId: string
  groupId: string
}

export interface MicTarget {
  /** The device to open by id, or null to open the system default. */
  deviceId: string | null
  /** The physical device the stream belongs on ('' when unknown). */
  groupId: string
  /** Its name, for the log and Settings ('' when unknown). */
  label: string
  /** A pick exists but is unplugged: the default stands in until it returns. */
  standIn: boolean
}

// Chromium's stand-ins for whatever the OS calls default. They are not
// devices of their own: each mirrors a real input and carries its group.
const ALIASES = new Set(['default', 'communications'])

/** The real inputs, without Chromium's default and communications entries. */
export function realMics(devices: readonly MicDevice[]): MicDevice[] {
  return devices.filter((d) => d.deviceId !== '' && !ALIASES.has(d.deviceId))
}

/** Chromium labels its alias entries "Default - <name>" (and on Windows
 *  "Communications - <name>"); the name alone is the device's own label. */
export function aliasName(label: string): string {
  return label.replace(/^(Default|Communications) - /, '')
}

/** The real input the system default points at right now, or null. */
export function defaultMic(devices: readonly MicDevice[]): MicDevice | null {
  const mics = realMics(devices)
  const alias = devices.find((d) => d.deviceId === 'default')
  // Chromium lists the default alias on macOS and Windows; without one
  // (other platforms) it lists the default input first.
  if (!alias) return mics[0] ?? null
  const name = aliasName(alias.label)
  const match =
    mics.find((d) => d.groupId === alias.groupId && d.label === name) ??
    mics.find((d) => name !== '' && d.label === name) ??
    mics.find((d) => d.groupId === alias.groupId)
  // An alias with no real twin still says which group is default.
  return match ?? { deviceId: 'default', groupId: alias.groupId, label: name }
}

/** Whether a pick is set at all. */
export function isPicked(choice: MicChoice): boolean {
  return choice.id !== '' || choice.label !== ''
}

/**
 * Where the stream belongs: the picked mic when it is plugged in (by id,
 * or by name when the id changed), else the system default.
 */
export function micTarget(devices: readonly MicDevice[], choice: MicChoice): MicTarget {
  const mics = realMics(devices)
  if (isPicked(choice)) {
    // Two inputs with the same name resolve to the first of them when
    // the id no longer matches; the id match comes first for that reason.
    const pick =
      mics.find((d) => choice.id !== '' && d.deviceId === choice.id) ??
      mics.find((d) => choice.label !== '' && d.label === choice.label)
    if (pick) return { deviceId: pick.deviceId, groupId: pick.groupId, label: pick.label, standIn: false }
  }
  const fallback = defaultMic(devices)
  return {
    deviceId: null,
    groupId: fallback?.groupId ?? '',
    label: fallback?.label ?? '',
    standIn: isPicked(choice)
  }
}

/** A stable name for a target, so a move that did not stick is tried once. */
export function targetKey(target: MicTarget): string {
  return target.deviceId !== null ? `pick:${target.deviceId}` : `default:${target.groupId}`
}

/** Whether the live stream is already where it belongs. Unknown never churns. */
export function onTarget(live: LiveMic, target: MicTarget): boolean {
  if (target.deviceId !== null) return live.deviceId === target.deviceId
  if (target.groupId === '' || live.groupId === '') return true
  return live.groupId === target.groupId
}

/**
 * The move tried without an outside event since the last one. A target
 * the stream cannot reach is tried once, then tried again after the next
 * device change or re-arm, never in a loop on its own: right after a
 * wake the input list and the open can briefly disagree, so a later
 * event deserves a fresh try.
 */
export class MoveTries {
  private tried = ''

  /** What moveAction compares against. */
  get key(): string {
    return this.tried
  }

  record(target: MicTarget): void {
    this.tried = targetKey(target)
  }

  /** A device change, a re-arm, or the stream landing where it belongs. */
  reset(): void {
    this.tried = ''
  }
}

export type MoveAction = 'stay' | 'move' | 'after-take'

/**
 * What to do about the stream's device. A take in progress is never
 * moved underneath (half a sentence on each mic is worse than either);
 * the move waits for it to end. A move already tried for this same
 * target is not repeated, so a device the stream cannot reach can
 * never make capture rebuild in a loop.
 */
export function moveAction(
  live: LiveMic | null,
  target: MicTarget,
  takeOpen: boolean,
  triedKey: string
): MoveAction {
  if (!live || onTarget(live, target)) return 'stay'
  if (triedKey === targetKey(target)) return 'stay'
  return takeOpen ? 'after-take' : 'move'
}

/** The picker's view of the inputs: real devices by name, in OS order. */
export interface MicReport {
  devices: Array<{ id: string; label: string }>
  /** The input capture is on right now ('' before the first arm). */
  current: string
  /** The picked mic is unplugged and the default stands in. */
  standIn: boolean
  /** Whether a capture stream exists right now. */
  open: boolean
  /** With the mic closed between takes, how long the last press took
   *  to go live. Null before the first one. */
  openMs: number | null
}

/** Bound what a renderer report can carry before main stores it. */
export function sanitizeMicReport(value: unknown): MicReport {
  const empty: MicReport = { devices: [], current: '', standIn: false, open: false, openMs: null }
  if (typeof value !== 'object' || value === null) return empty
  const v = value as Record<string, unknown>
  const devices = Array.isArray(v.devices)
    ? v.devices
        .filter(
          (d): d is { id: string; label: string } =>
            typeof d === 'object' &&
            d !== null &&
            typeof (d as Record<string, unknown>).id === 'string' &&
            typeof (d as Record<string, unknown>).label === 'string'
        )
        .slice(0, 64)
        .map((d) => ({ id: d.id.slice(0, 256), label: d.label.slice(0, 256) }))
    : []
  return {
    devices,
    current: typeof v.current === 'string' ? v.current.slice(0, 256) : '',
    standIn: v.standIn === true,
    open: v.open === true,
    openMs: typeof v.openMs === 'number' && Number.isFinite(v.openMs) && v.openMs >= 0 ? Math.round(v.openMs) : null
  }
}
