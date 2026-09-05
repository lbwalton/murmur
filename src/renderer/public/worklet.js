// SPDX-License-Identifier: GPL-3.0-only
// AudioWorklet processor: forwards mono 128-frame chunks to the page.
// Plain JS on purpose: worklet modules load outside the bundler pipeline.
class MurmurForwardProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length > 0) {
      // Copy: the engine reuses the underlying buffer between callbacks.
      this.port.postMessage(channel.slice(0))
    }
    return true
  }
}

registerProcessor('murmur-forward', MurmurForwardProcessor)
