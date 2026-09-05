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

const bridge = window.murmurAudio

// Forward waveform levels at most every 33ms, peak-held between sends.
let pendingLevel = 0
let lastLevelSentAt = 0
const recorder = new Recorder({
  synthetic,
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
  void recorder.rearm().then((ok) => bridge.armed(ok))
})

void recorder
  .arm()
  .then(() => bridge.ready())
  .catch(() => bridge.armed(false))
