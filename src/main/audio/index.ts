// SPDX-License-Identifier: GPL-3.0-only
// Main-process side of the recording pipeline: owns the hidden capture
// window and exposes start/stop/cancel to the dictation flow. System
// resume triggers a re-arm so the warm mic survives sleep.
import { join } from 'node:path'
import { BrowserWindow, app, ipcMain, powerMonitor } from 'electron'
import { watchWindow } from '../window-watch'
import { IpcChannels } from '../../shared/ipc'
import { isDeadStream } from '../../shared/speech-gate'
import { parseWav } from '../../shared/wav'
import { isSmoke, registerSmokeCheck } from '../smoke'

let audioWindow: BrowserWindow | null = null

function aliveAudio(): BrowserWindow | null {
  return audioWindow && !audioWindow.isDestroyed() ? audioWindow : null
}
let readyResolvers: Array<() => void> = []
let ready = false
let reviveCount = 0
let lastCrashAt = 0

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

  // A dead capture renderer (GPU reset, OS kill during sleep) means no
  // dictation until it comes back, so bring it back. The delay
  // escalates by crash spacing, so a rapid crash loop backs off toward
  // 30s while an isolated crash revives fast; ready arriving cannot
  // reset the loop because escalation keys off the crashes themselves.
  audioWindow.webContents.on('render-process-gone', () => {
    ready = false
    const now = Date.now()
    if (now - lastCrashAt > 60_000) reviveCount = 0
    lastCrashAt = now
    const delay = Math.min(30_000, 250 * 2 ** reviveCount)
    reviveCount++
    setTimeout(() => {
      aliveAudio()?.webContents.reload()
    }, delay)
  })

  // Smoke tightens the liveness watchdog so outage recovery proves
  // itself inside the per-check timeout.
  const smokeParams =
    'synthetic=1&watchTickMs=100&stallMs=250&armTimeoutMs=2500&silentMs=250&maxSilentRearms=4'
  const query = isSmoke ? Object.fromEntries(new URLSearchParams(smokeParams)) : undefined
  watchWindow(audioWindow, 'audio')
  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    const suffix = isSmoke ? `?${smokeParams}` : ''
    void audioWindow.loadURL(`${devServer}/audio/index.html${suffix}`)
  } else {
    void audioWindow.loadFile(join(__dirname, '../renderer/audio/index.html'), { query })
  }

  registerSmokeCheck('recording', async () => {
    await whenAudioReady()
    // Let the warm-mic pre-roll fill before recording, as real use would.
    await new Promise((resolve) => setTimeout(resolve, 300))
    startRecording()
    // Generous window: chunk delivery lags wall time on a loaded machine
    // and this check flaked intermittently at 600ms.
    await new Promise((resolve) => setTimeout(resolve, 900))
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
      info.sampleCount > 2_500 &&
      info.peak > 0.05
    )
  })

  registerSmokeCheck('cues', async () => {
    await whenAudioReady()
    const played = new Promise<boolean>((resolve) => {
      ipcMain.once(IpcChannels.audioCuePlayed, (_event, cue: string) => resolve(cue === 'insert'))
    })
    // Near-silent volume: proves the synth path without waking anyone.
    aliveAudio()?.webContents.send(IpcChannels.audioCue, 'insert', 0.01)
    return played
  })

  registerSmokeCheck('recordingRearm', async () => {
    await whenAudioReady()
    const armed = new Promise<boolean>((resolve) => {
      ipcMain.once(IpcChannels.audioArmed, (_event, ok: boolean) => resolve(Boolean(ok)))
    })
    aliveAudio()?.webContents.send(IpcChannels.audioRearm)
    return armed
  })

  registerSmokeCheck('recordingRecovery', async () => {
    // The sleep/wake scenario end to end: the graph dies silently (no
    // events, chunks just stop) and the first re-arm attempts fail the
    // way a waking audio stack fails getUserMedia. The recorder must
    // recover on its own; main sends no rearm here on purpose.
    await whenAudioReady()
    // The renderer acks the outage with armed=false; without the ack the
    // check cannot distinguish "recovered" from "never damaged".
    const acked = new Promise<boolean>((resolve) => {
      ipcMain.once(IpcChannels.audioArmed, (_event, ok: boolean) => resolve(ok === false))
    })
    aliveAudio()?.webContents.send(IpcChannels.audioSimulateOutage, 2)
    if (!(await acked)) {
      console.error('smoke recordingRecovery: outage was not acknowledged')
      return false
    }
    // Outage teardown + stall detection + two failed attempts + rebuild,
    // then a beat for the pre-roll to refill.
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    startRecording()
    await new Promise((resolve) => setTimeout(resolve, 600))
    const wav = await stopRecording()
    if (!wav) {
      console.error('smoke recordingRecovery: stop returned null')
      return false
    }
    const info = parseWav(wav)
    return info.sampleCount > 1_000 && info.peak > 0.05
  })

  registerSmokeCheck('recordingSilentHeal', async () => {
    // The 2026-09-17 wake end to end: the graph rebuilds and chunks
    // flow, but the stream is dead-flat. The chunk watchdog reads this
    // as healthy on purpose; the signal watchdog must notice and re-arm
    // until the stream carries sound, with no press and no message from
    // main after the seam. Three silent graphs against a budget of four.
    await whenAudioReady()
    const acked = new Promise<boolean>((resolve) => {
      ipcMain.once(IpcChannels.audioArmed, (_event, ok: boolean) => resolve(ok === false))
    })
    aliveAudio()?.webContents.send(IpcChannels.audioSimulateSilence, 3)
    if (!(await acked)) {
      console.error('smoke recordingSilentHeal: silence was not acknowledged')
      return false
    }
    // Proof of damage first: a recording through the silent graphs must
    // show chunks arriving (the chunk watchdog's view) with nothing in
    // them (the signal watchdog's). Without it the check could pass on
    // a graph the seam never touched. The signal watchdog holds while a
    // take is open, so this recording can never overlap a live graph
    // however long it runs; 700ms simply leaves room for install latency
    // and chunk lag above the 1000-sample floor.
    startRecording()
    await new Promise((resolve) => setTimeout(resolve, 700))
    const silent = await stopRecording()
    if (!silent) {
      console.error('smoke recordingSilentHeal: silent stop returned null')
      return false
    }
    const damage = parseWav(silent)
    if (damage.sampleCount < 1_000 || !isDeadStream(damage.peak)) {
      console.error(
        `smoke recordingSilentHeal: seam did not produce a dead-flat stream (samples=${damage.sampleCount} peak=${damage.peak})`
      )
      return false
    }
    // The rebuild chain starts only now (the watchdog held during the
    // take): three silent windows plus their rebuilds land the live graph
    // around 1.7s out and its pre-roll fills by ~2s. 2.5s keeps a 2x
    // margin on a loaded machine inside the 10s check cap.
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    startRecording()
    await new Promise((resolve) => setTimeout(resolve, 600))
    const wav = await stopRecording()
    if (!wav) {
      console.error('smoke recordingSilentHeal: stop returned null')
      return false
    }
    const info = parseWav(wav)
    return info.sampleCount > 1_000 && info.peak > 0.05
  })

  registerSmokeCheck('recordingPressHeal', async () => {
    // The 2026-09-24 report end to end: the mic goes dead after an idle
    // spell and every rebuild the signal watchdog tries comes back dead
    // too, so its budget runs out on a dead graph. The next press must
    // still capture: it rebuilds capture under the take. Five silent
    // graphs against a budget of four leave the recorder exhausted on
    // the fifth; the press's rebuild is the first live one.
    await whenAudioReady()
    const { existsSync, readFileSync } = await import('node:fs')
    const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
    const count = (needle: string): number =>
      existsSync(logFile) ? readFileSync(logFile, 'utf8').split(needle).length - 1 : 0
    const exhaustedBefore = count('stayed silent after')
    const pressBefore = count('press found a silent stream')
    const acked = new Promise<boolean>((resolve) => {
      ipcMain.once(IpcChannels.audioArmed, (_event, ok: boolean) => resolve(ok === false))
    })
    aliveAudio()?.webContents.send(IpcChannels.audioSimulateSilence, 5)
    if (!(await acked)) {
      console.error('smoke recordingPressHeal: silence was not acknowledged')
      return false
    }
    // Proof of damage: wait for the budget to run out (five silent
    // windows and their rebuilds, about 2s at smoke timings).
    const deadline = Date.now() + 6_000
    while (count('stayed silent after') === exhaustedBefore && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (count('stayed silent after') === exhaustedBefore) {
      console.error('smoke recordingPressHeal: the silent budget never ran out')
      return false
    }
    startRecording()
    await new Promise((resolve) => setTimeout(resolve, 900))
    const wav = await stopRecording()
    if (!wav) {
      console.error('smoke recordingPressHeal: stop returned null')
      return false
    }
    const info = parseWav(wav)
    const logged = count('press found a silent stream') > pressBefore
    if (!(info.peak > 0.05) || !logged) {
      console.error(`smoke recordingPressHeal: press did not recover capture (peak=${info.peak} logged=${logged})`)
      return false
    }
    return info.sampleCount > 1_000
  })

  registerSmokeCheck('recordingPressHang', async () => {
    // The review gate's race (2026-09-24): a press on a silent stream
    // starts a hot swap, and right after a wake the replacement's open
    // can hang. The watchdog abandons it, and its retry must keep the
    // old graph feeding the take; a cold retry would tear the take's
    // only source down and, if it hung too, leave seconds of the take
    // with no audio at all. Two hangs force two abandons (2.5s each at
    // smoke timings); the take must run unbroken across both.
    await whenAudioReady()
    const { existsSync, readFileSync } = await import('node:fs')
    const logFile = join(app.getPath('userData'), 'logs', 'murmur.log')
    const count = (needle: string): number =>
      existsSync(logFile) ? readFileSync(logFile, 'utf8').split(needle).length - 1 : 0
    const exhaustedBefore = count('stayed silent after')
    const ack = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        ipcMain.once(IpcChannels.audioArmed, (_event, ok: boolean) => resolve(ok === false))
      })
    const silenced = ack()
    aliveAudio()?.webContents.send(IpcChannels.audioSimulateSilence, 5)
    if (!(await silenced)) return false
    const deadline = Date.now() + 4_000
    while (count('stayed silent after') === exhaustedBefore && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (count('stayed silent after') === exhaustedBefore) {
      console.error('smoke recordingPressHang: the silent budget never ran out')
      return false
    }
    const hung = ack()
    aliveAudio()?.webContents.send(IpcChannels.audioSimulateHang, 2)
    if (!(await hung)) return false
    startRecording()
    await new Promise((resolve) => setTimeout(resolve, 5_800))
    const wav = await stopRecording()
    if (!wav) {
      console.error('smoke recordingPressHang: stop returned null')
      return false
    }
    // Unbroken is about 5.8s of 16k samples (~93k, less chunk lag); a
    // cold retry leaves only ~2.6s of the old graph plus the tail
    // (~50k). The third attempt installs a live graph, so the take
    // ends with sound.
    const info = parseWav(wav)
    if (info.sampleCount < 75_000 || !(info.peak > 0.05)) {
      console.error(`smoke recordingPressHang: take broken across the hung swap (samples=${info.sampleCount} peak=${info.peak})`)
      return false
    }
    return true
  })

  registerSmokeCheck('recordingRevive', async () => {
    // A dead audio renderer process (GPU reset, OS kill during sleep)
    // must come back on its own, and with it the warm mic.
    await whenAudioReady()
    const revived = new Promise<void>((resolve) => {
      ipcMain.once(IpcChannels.audioReady, () => resolve())
    })
    aliveAudio()?.webContents.forcefullyCrashRenderer()
    await revived
    // Let the fresh graph fill its pre-roll before recording through it.
    await new Promise((resolve) => setTimeout(resolve, 300))
    startRecording()
    await new Promise((resolve) => setTimeout(resolve, 600))
    const wav = await stopRecording()
    if (!wav) {
      console.error('smoke recordingRevive: stop returned null')
      return false
    }
    const info = parseWav(wav)
    return info.sampleCount > 1_000 && info.peak > 0.05
  })
}

export function startRecording(): void {
  aliveAudio()?.webContents.send(IpcChannels.audioStart)
}

/** Ask the capture window to rebuild its graph now. Safe between
 *  dictations: the recorder's generation machinery (US-008) already
 *  guards overlapping arms. Used by the silent-stream heal. */
export function rearmCapture(): void {
  aliveAudio()?.webContents.send(IpcChannels.audioRearm)
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

/** Play a sound cue, honoring the sounds setting. Fire and forget. */
export function playCue(
  cue: 'start' | 'stop' | 'insert' | 'error' | 'nospeech' | 'noteStart' | 'noted'
): void {
  void import('../settings').then(({ getSettings }) => {
    const sounds = getSettings().sounds
    if (!sounds.enabled) return
    aliveAudio()?.webContents.send(IpcChannels.audioCue, cue, sounds.volume)
  })
}

app.on('before-quit', () => {
  audioWindow?.destroy()
  audioWindow = null
})
