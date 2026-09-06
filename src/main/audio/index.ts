// SPDX-License-Identifier: GPL-3.0-only
// Main-process side of the recording pipeline: owns the hidden capture
// window and exposes start/stop/cancel to the dictation flow. System
// resume triggers a re-arm so the warm mic survives sleep.
import { join } from 'node:path'
import { BrowserWindow, app, ipcMain, powerMonitor } from 'electron'
import { IpcChannels } from '../../shared/ipc'
import { parseWav } from '../../shared/wav'
import { isSmoke, registerSmokeCheck } from '../smoke'

let audioWindow: BrowserWindow | null = null

function aliveAudio(): BrowserWindow | null {
  return audioWindow && !audioWindow.isDestroyed() ? audioWindow : null
}
let readyResolvers: Array<() => void> = []
let ready = false

function whenAudioReady(): Promise<void> {
  if (ready) return Promise.resolve()
  return new Promise((resolve) => readyResolvers.push(resolve))
}

export function initAudio(): void {
  audioWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/audio.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  ipcMain.on(IpcChannels.audioReady, () => {
    ready = true
    for (const resolve of readyResolvers) resolve()
    readyResolvers = []
  })

  powerMonitor.on('resume', () => {
    aliveAudio()?.webContents.send(IpcChannels.audioRearm)
  })

  const query = isSmoke ? { synthetic: '1' } : undefined
  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    const suffix = isSmoke ? '?synthetic=1' : ''
    void audioWindow.loadURL(`${devServer}/audio/index.html${suffix}`)
  } else {
    void audioWindow.loadFile(join(__dirname, '../renderer/audio/index.html'), { query })
  }

  registerSmokeCheck('recording', async () => {
    await whenAudioReady()
    // Let the warm-mic pre-roll fill before recording, as real use would.
    await new Promise((resolve) => setTimeout(resolve, 300))
    startRecording()
    await new Promise((resolve) => setTimeout(resolve, 600))
    const wav = await stopRecording()
    if (!wav) {
      console.error('smoke recording: stop returned null')
      return false
    }
    const info = parseWav(wav)
    // Oscillator source: full-scale tone, 16k mono, pre-roll included.
    // The count threshold stays loose: chunk delivery lags wall time.
    return (
      info.sampleRate === 16_000 &&
      info.channels === 1 &&
      info.bitsPerSample === 16 &&
      info.sampleCount > 4_000 &&
      info.peak > 0.05
    )
  })

  registerSmokeCheck('recordingRearm', async () => {
    await whenAudioReady()
    const armed = new Promise<boolean>((resolve) => {
      ipcMain.once(IpcChannels.audioArmed, (_event, ok: boolean) => resolve(Boolean(ok)))
    })
    aliveAudio()?.webContents.send(IpcChannels.audioRearm)
    return armed
  })
}

export function startRecording(): void {
  aliveAudio()?.webContents.send(IpcChannels.audioStart)
}

export function cancelRecording(): void {
  aliveAudio()?.webContents.send(IpcChannels.audioCancel)
}

const STOP_TIMEOUT_MS = 5_000

/** Stop and collect the WAV. Resolves null on cancel or timeout. */
export function stopRecording(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ipcMain.removeListener(IpcChannels.audioResult, onResult)
      resolve(null)
    }, STOP_TIMEOUT_MS)
    const onResult = (_event: Electron.IpcMainEvent, wav: Uint8Array | null): void => {
      clearTimeout(timer)
      resolve(wav ? Uint8Array.from(wav) : null)
    }
    ipcMain.once(IpcChannels.audioResult, onResult)
    aliveAudio()?.webContents.send(IpcChannels.audioStop)
  })
}

export function isAudioReady(): boolean {
  return ready
}

app.on('before-quit', () => {
  audioWindow?.destroy()
  audioWindow = null
})
