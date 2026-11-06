// SPDX-License-Identifier: GPL-3.0-only
// Hidden audio capture page: glues the Recorder to the preload bridge.
import type { AudioApi } from '../../preload/audio'
import { Recorder } from './recorder'

declare global {
  interface Window {
    murmurAudio: AudioApi
  }
}

const params = new URLSearchParams(window.location.search)
const synthetic = params.get('synthetic') === '1'
// Smoke tightens the watchdog so recovery proves itself in seconds.
// The knobs only exist in synthetic mode; production always runs the
// liveness defaults.
const msParam = (name: string): number | undefined => {
  if (!synthetic) return undefined
  const value = Number(params.get(name))
  return Number.isFinite(value) && value > 0 ? value : undefined
}

const bridge = window.murmurAudio

// Forward waveform levels at most every 33ms, peak-held between sends.
let pendingLevel = 0
let lastLevelSentAt = 0
const recorder = new Recorder({
  synthetic,
  watchTickMs: msParam('watchTickMs'),
  stallMs: msParam('stallMs'),
  armTimeoutMs: msParam('armTimeoutMs'),
  silentMs: msParam('silentMs'),
  minSignalChunks: msParam('minSignalChunks'),
  maxSilentRearms: msParam('maxSilentRearms'),
  deviceChangeMs: msParam('deviceChangeMs'),
  keepReady: params.get('micMode') !== 'press',
  onLive: (ms) => bridge.live(ms),
  // Settings shows the inputs and the one in use (US-110); names only.
  onMics: (report) => bridge.mics(report),
  onLevel: (rms) => {
    pendingLevel = Math.max(pendingLevel, rms)
    const now = performance.now()
    if (now - lastLevelSentAt >= 33) {
      bridge.level(pendingLevel)
      pendingLevel = 0
      lastLevelSentAt = now
    }
  }
})

bridge.onStart(() => {
  recorder.start()
})

bridge.onStop(() => {
  bridge.result(recorder.stop())
})

bridge.onCancel(() => {
  recorder.cancel()
})

bridge.onRearm(() => {
  void recorder
    .rearm()
    .then((ok) => bridge.armed(ok))
    .catch(() => bridge.armed(false))
})

bridge.onMic((choice) => {
  recorder.setMicChoice(choice)
})

bridge.onMicMode((keepReady) => {
  recorder.setKeepReady(keepReady)
})

if (synthetic) {
  bridge.onSimulateOutage((failures) => {
    recorder.simulateOutage(failures)
    // Ack so the smoke check can prove the graph was actually broken
    // before it credits the recovery.
    bridge.armed(false)
  })
  bridge.onSimulateSilence((count) => {
    recorder.simulateSilence(count)
    bridge.armed(false)
  })
  bridge.onSimulateHang((count) => {
    recorder.simulateHang(count)
    bridge.armed(false)
  })
  bridge.onSimulateDefaultMove((announce, slowMs) => {
    recorder.simulateDefaultMove(announce, slowMs)
  })
}

// Sound cues share this window's audio stack. A dedicated context so
// cue playback never touches the capture graph.
let cueContext: AudioContext | null = null
bridge.onCue((cue, volume) => {
  void (async () => {
    const { playCue, CUE_NAMES } = await import('./cues')
    if (!CUE_NAMES.includes(cue as never)) return
    cueContext ??= new AudioContext()
    if (cueContext.state === 'suspended') await cueContext.resume()
    playCue(cueContext, cue as never, volume)
    bridge.cuePlayed(cue)
  })()
})

// Ready means the page is wired and the first arm attempt has settled,
// not that it succeeded: a wake-time reload often fails its first arm
// and the watchdog recovers after. Welding ready to arm success would
// leave main "not ready" forever in exactly that case.
// The pick comes first (US-110), so a picked mic is the first one
// opened; main answers at once, and a second at most stands in for it.
const firstChoice = Promise.race([
  bridge.micChoice(),
  new Promise<{ id: string; label: string; keepReady?: boolean }>((resolve) => setTimeout(() => resolve({ id: '', label: '' }), 1_000))
]).catch((): { id: string; label: string; keepReady?: boolean } => ({ id: '', label: '' }))
void firstChoice
  .then((choice) => {
    recorder.setMicChoice(choice)
    // The address keeps the launch's mode across a revive, so this answer
    // is what counts, and it arrives before anything opens.
    if (choice.keepReady !== undefined) recorder.setKeepReady(choice.keepReady)
    return recorder.armIfReady()
  })
  .then(
    () => bridge.ready(),
    () => {
      bridge.armed(false)
      bridge.ready()
    }
  )
