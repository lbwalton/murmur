// SPDX-License-Identifier: GPL-3.0-only
// Audio capture window preload. Main drives start/stop/cancel/rearm;
// the renderer reports readiness, armed state, and finished WAVs.
// Channel names are literals on purpose: sandboxed preloads must bundle
// to a single file (no shared chunks), and the literals ARE this
// window's IPC allowlist. Keep them in sync with src/shared/ipc.ts.
import { contextBridge, ipcRenderer } from 'electron'

function micChoice(choice: { id?: unknown; label?: unknown } | null | undefined): { id: string; label: string } {
  return {
    id: typeof choice?.id === 'string' ? choice.id : '',
    label: typeof choice?.label === 'string' ? choice.label : ''
  }
}

const api = {
  onStart: (cb: () => void): void => {
    ipcRenderer.on('audio:start', () => cb())
  },
  onStop: (cb: () => void): void => {
    ipcRenderer.on('audio:stop', () => cb())
  },
  onCancel: (cb: () => void): void => {
    ipcRenderer.on('audio:cancel', () => cb())
  },
  onRearm: (cb: () => void): void => {
    ipcRenderer.on('audio:rearm', () => cb())
  },
  onSimulateOutage: (cb: (failures: number) => void): void => {
    ipcRenderer.on('audio:simulate-outage', (_e, failures: number) => cb(Number(failures)))
  },
  onSimulateSilence: (cb: (count: number) => void): void => {
    ipcRenderer.on('audio:simulate-silence', (_e, count: number) => cb(Number(count)))
  },
  onSimulateHang: (cb: (count: number) => void): void => {
    ipcRenderer.on('audio:simulate-hang', (_e, count: number) => cb(Number(count)))
  },
  onSimulateDefaultMove: (cb: (announce: boolean, slowMs: number) => void): void => {
    ipcRenderer.on('audio:simulate-default-move', (_e, announce: boolean, slowMs: number) =>
      cb(announce === true, Number(slowMs) || 0)
    )
  },
  /** The mic picked in Settings (US-110); empty id and label follow the default. */
  onMic: (cb: (choice: { id: string; label: string }) => void): void => {
    ipcRenderer.on('audio:mic', (_e, choice: { id?: unknown; label?: unknown } | null) => cb(micChoice(choice)))
  },
  /** Whether the stream stays up between takes (US-135). */
  onMicMode: (cb: (keepReady: boolean) => void): void => {
    ipcRenderer.on('audio:mic-mode', (_e, keepReady: unknown) => cb(keepReady !== false))
  },
  /** The stream is live after a press, this many milliseconds on. */
  live: (ms: number): void => {
    ipcRenderer.send('audio:live', ms)
  },
  /** The pick, asked for before the first arm so a picked mic opens first. */
  micChoice: async (): Promise<{ id: string; label: string }> => {
    return micChoice(await ipcRenderer.invoke('audio:mic-choice'))
  },
  /** The inputs by name and the one in use, for the Settings picker. */
  mics: (report: { devices: Array<{ id: string; label: string }>; current: string; standIn: boolean; open: boolean; openMs: number | null }): void => {
    ipcRenderer.send('audio:mics', report)
  },
  ready: (): void => {
    ipcRenderer.send('audio:ready')
  },
  armed: (ok: boolean): void => {
    ipcRenderer.send('audio:armed', ok)
  },
  result: (wav: Uint8Array | null): void => {
    ipcRenderer.send('audio:result', wav)
  },
  level: (rms: number): void => {
    ipcRenderer.send('audio:level', rms)
  },
  onCue: (cb: (cue: string, volume: number) => void): void => {
    ipcRenderer.on('audio:cue', (_e, cue: string, volume: number) => cb(cue, volume))
  },
  cuePlayed: (cue: string): void => {
    ipcRenderer.send('audio:cue-played', cue)
  }
}

export type AudioApi = typeof api

contextBridge.exposeInMainWorld('murmurAudio', api)
