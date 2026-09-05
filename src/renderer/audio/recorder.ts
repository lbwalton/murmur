// SPDX-License-Identifier: GPL-3.0-only
// The capture engine. The mic stream stays armed the whole session (warm
// mic) with a rolling pre-roll buffer, so the first syllable of a fast
// press-and-speak is already captured when recording starts. Smoke mode
// swaps the mic for an oscillator so no permission or hardware is needed.
import { TARGET_SAMPLE_RATE, downsample, encodeWavPcm16 } from '../../shared/wav'

export interface RecorderOptions {
  synthetic: boolean
  preRollMs?: number
  /** Called with the RMS level of each chunk while recording is active. */
  onLevel?: (rms: number) => void
}

export class Recorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private preRoll: Float32Array[] = []
  private preRollSamples = 0
  private maxPreRollSamples = 0
  private active: Float32Array[] | null = null
  private arming: Promise<void> | null = null

  constructor(private readonly opts: RecorderOptions) {}

  /** (Re)acquire the source and start feeding the pre-roll buffer. */
  arm(): Promise<void> {
    this.arming ??= this.doArm().finally(() => {
      this.arming = null
    })
    return this.arming
  }

  private async doArm(): Promise<void> {
    await this.teardown()
    const ctx = new AudioContext()
    this.ctx = ctx
    this.maxPreRollSamples = Math.round(((this.opts.preRollMs ?? 300) / 1000) * ctx.sampleRate)
    await ctx.audioWorklet.addModule(new URL('../worklet.js', window.location.href).toString())

    let source: AudioNode
    if (this.opts.synthetic) {
      const osc = new OscillatorNode(ctx, { frequency: 440 })
      osc.start()
      source = osc
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
      this.stream = stream
      const track = stream.getAudioTracks()[0]
      // A yanked or slept device ends the track: re-arm without a restart.
      track.addEventListener('ended', () => void this.arm())
      source = ctx.createMediaStreamSource(stream)
    }

    const node = new AudioWorkletNode(ctx, 'murmur-forward')
    node.port.onmessage = (event) => this.onChunk(event.data as Float32Array)
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(node)
    node.connect(mute)
    mute.connect(ctx.destination)

    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'suspended') void ctx.resume()
    })
    if (ctx.state === 'suspended') await ctx.resume()
  }

  private onChunk(chunk: Float32Array): void {
    if (this.active) {
      this.active.push(chunk)
      if (this.opts.onLevel) {
        let sum = 0
        for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
        this.opts.onLevel(Math.sqrt(sum / chunk.length))
      }
      return
    }
    this.preRoll.push(chunk)
    this.preRollSamples += chunk.length
    while (this.preRoll.length > 1 && this.preRollSamples - this.preRoll[0].length > this.maxPreRollSamples) {
      this.preRollSamples -= this.preRoll[0].length
      this.preRoll.shift()
    }
  }

  /** Begin recording, seeded with the warm-mic pre-roll. */
  start(): void {
    this.active = [...this.preRoll]
  }

  cancel(): void {
    this.active = null
  }

  /** Finish recording and encode 16k mono PCM16 WAV. Null if not recording. */
  stop(): Uint8Array | null {
    const chunks = this.active
    this.active = null
    if (!chunks || !this.ctx) return null
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const merged = new Float32Array(total)
    let offset = 0
    for (const c of chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    const resampled = downsample(merged, this.ctx.sampleRate, TARGET_SAMPLE_RATE)
    return encodeWavPcm16(resampled, TARGET_SAMPLE_RATE)
  }

  isArmed(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  async rearm(): Promise<boolean> {
    await this.arm()
    return this.isArmed()
  }

  private async teardown(): Promise<void> {
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.stream = null
    if (this.ctx) {
      await this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
    this.preRoll = []
    this.preRollSamples = 0
    this.active = null
  }
}
