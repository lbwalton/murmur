// SPDX-License-Identifier: GPL-3.0-only
// The capture engine. The mic stream stays armed the whole session (warm
// mic) with a rolling pre-roll buffer, so the first syllable of a fast
// press-and-speak is already captured when recording starts. Smoke mode
// swaps the mic for an oscillator so no permission or hardware is needed.
//
// Liveness: a healthy graph delivers worklet chunks continuously, even
// in silence. A watchdog re-arms whenever chunks stop, because every way
// the graph dies looks like that: sleep and wake, a yanked device, a
// driver reset, or getUserMedia failing or hanging while the OS audio
// stack is still waking up. Re-arm keeps retrying until chunks flow;
// a single failed attempt must never leave the mic dead for the session.
//
// A recording in progress survives graph death and rebuild: whatever was
// captured before the graph died still delivers at stop. Recordings are
// kept as rate-tagged segments so a rebuild onto a device with a
// different sample rate resamples each stretch correctly.
import { TARGET_SAMPLE_RATE, downsample, encodeWavPcm16 } from '../../shared/wav'
import { LIVENESS_DEFAULTS, livenessAction } from './liveness'

export interface RecorderOptions {
  synthetic: boolean
  preRollMs?: number
  /** Watchdog cadence; see liveness.ts for the defaults. */
  watchTickMs?: number
  stallMs?: number
  armTimeoutMs?: number
  /** Called with the RMS level of each chunk while recording is active. */
  onLevel?: (rms: number) => void
}

interface RecordingSegment {
  rate: number
  chunks: Float32Array[]
}

export class Recorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private sampleRate: number | null = null
  private preRoll: Float32Array[] = []
  private preRollSamples = 0
  private maxPreRollSamples = 0
  private active: RecordingSegment[] | null = null
  private arming: Promise<void> | null = null
  private armingSince: number | null = null
  private lastChunkAt = Date.now()
  // Bumped to invalidate an arm attempt: whatever a stale attempt
  // acquires after the bump gets released instead of installed.
  private generation = 0
  private watchdog: ReturnType<typeof setInterval> | null = null
  private outageLogged = false
  private failNextArms = 0

  constructor(private readonly opts: RecorderOptions) {}

  /** (Re)acquire the source and start feeding the pre-roll buffer. */
  arm(): Promise<void> {
    this.watchdog ??= setInterval(
      () => this.tick(),
      this.opts.watchTickMs ?? LIVENESS_DEFAULTS.watchTickMs
    )
    if (!this.arming) {
      const attempt = this.doArm().finally(() => {
        // An abandoned attempt must not clear its successor's slot.
        if (this.arming === attempt) {
          this.arming = null
          this.armingSince = null
        }
      })
      this.arming = attempt
      this.armingSince = Date.now()
    }
    return this.arming
  }

  /**
   * Smoke-only seam: kill the capture graph the way sleep does (chunks
   * just stop) and make the next N arm attempts fail the way a waking
   * audio stack fails getUserMedia. No-op outside synthetic mode.
   */
  simulateOutage(failures: number): void {
    if (!this.opts.synthetic) return
    this.failNextArms = Math.max(0, Math.floor(failures))
    this.generation++
    this.arming = null
    this.armingSince = null
    void this.teardown()
  }

  private tick(): void {
    const action = livenessAction(
      { now: Date.now(), lastChunkAt: this.lastChunkAt, armingSince: this.armingSince },
      {
        stallMs: this.opts.stallMs ?? LIVENESS_DEFAULTS.stallMs,
        armTimeoutMs: this.opts.armTimeoutMs ?? LIVENESS_DEFAULTS.armTimeoutMs
      }
    )
    if (action === 'healthy') {
      this.outageLogged = false
      return
    }
    if (action === 'wait') return
    if (action === 'abandon') {
      // The attempt hung (getUserMedia can, right after wake). Orphan it
      // and try fresh; the generation bump makes it release whatever it
      // eventually acquires, and stream-first acquisition means a hung
      // getUserMedia holds no AudioContext in the meantime.
      this.generation++
      this.arming = null
      this.armingSince = null
    }
    if (!this.outageLogged) {
      this.outageLogged = true
      // One line per outage, not per retry: window-watch mirrors
      // renderer errors into the rotating log.
      console.error('[murmur] audio capture stalled; re-arming until the mic returns')
    }
    void this.arm().catch(() => undefined)
  }

  private async doArm(): Promise<void> {
    const gen = ++this.generation
    await this.teardown()
    if (gen !== this.generation) return
    if (this.opts.synthetic && this.failNextArms > 0) {
      this.failNextArms--
      throw new Error('simulated arm failure')
    }

    // Build on locals and install at the end: an attempt invalidated
    // mid-flight (watchdog abandon, outage) must release its resources
    // instead of clobbering a newer attempt's graph.
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    const release = async (): Promise<void> => {
      for (const track of stream?.getTracks() ?? []) track.stop()
      if (ctx) await ctx.close().catch(() => undefined)
    }

    try {
      if (!this.opts.synthetic) {
        // The stream comes first: a getUserMedia that hangs until the
        // watchdog abandons this attempt is holding no AudioContext,
        // so abandoned attempts cannot exhaust the per-page context cap.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
        })
        if (gen !== this.generation) return void (await release())
        const track = stream.getAudioTracks()[0]
        // A yanked or slept device ends the track: re-arm without a
        // restart. Failure lands on the watchdog, which keeps retrying.
        track.addEventListener('ended', () => void this.arm().catch(() => undefined))
      }

      const audioCtx = new AudioContext()
      ctx = audioCtx
      await audioCtx.audioWorklet.addModule(
        new URL('../worklet.js', window.location.href).toString()
      )
      if (gen !== this.generation) return void (await release())

      let source: AudioNode
      if (stream) {
        source = audioCtx.createMediaStreamSource(stream)
      } else {
        const osc = new OscillatorNode(audioCtx, { frequency: 440 })
        osc.start()
        source = osc
      }

      const node = new AudioWorkletNode(audioCtx, 'murmur-forward')
      node.port.onmessage = (event) => {
        // A superseded graph must not feed the shared buffers: its
        // chunks may carry a different sample rate.
        if (gen === this.generation) this.onChunk(event.data as Float32Array)
      }
      const mute = audioCtx.createGain()
      mute.gain.value = 0
      source.connect(node)
      node.connect(mute)
      mute.connect(audioCtx.destination)

      audioCtx.addEventListener('statechange', () => {
        if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => undefined)
      })
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      if (gen !== this.generation) return void (await release())
    } catch (error) {
      await release()
      throw error
    }

    this.ctx = ctx
    this.stream = stream
    this.sampleRate = ctx.sampleRate
    this.maxPreRollSamples = Math.round(((this.opts.preRollMs ?? 300) / 1000) * ctx.sampleRate)
    // A recording that survived the outage continues in a new segment
    // when the rebuilt device runs at a different rate.
    const last = this.active?.[this.active.length - 1]
    if (last && last.rate !== ctx.sampleRate) {
      this.active?.push({ rate: ctx.sampleRate, chunks: [] })
    }
    // Fresh graphs get a full stall window to deliver their first chunk.
    this.lastChunkAt = Date.now()
  }

  private onChunk(chunk: Float32Array): void {
    this.lastChunkAt = Date.now()
    if (this.active) {
      this.active[this.active.length - 1].chunks.push(chunk)
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
    this.active = [
      { rate: this.sampleRate ?? TARGET_SAMPLE_RATE, chunks: [...this.preRoll] }
    ]
  }

  cancel(): void {
    this.active = null
  }

  /**
   * Finish recording and encode 16k mono PCM16 WAV. Null if not
   * recording. A dead graph still delivers whatever was captured before
   * it died; a transcription is never lost to a mid-take outage.
   */
  stop(): Uint8Array | null {
    const segments = this.active
    this.active = null
    if (!segments) return null
    const parts = segments.map(({ rate, chunks }) => {
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const merged = new Float32Array(total)
      let offset = 0
      for (const c of chunks) {
        merged.set(c, offset)
        offset += c.length
      }
      return downsample(merged, rate, TARGET_SAMPLE_RATE)
    })
    const total = parts.reduce((n, p) => n + p.length, 0)
    const all = new Float32Array(total)
    let offset = 0
    for (const p of parts) {
      all.set(p, offset)
      offset += p.length
    }
    return encodeWavPcm16(all, TARGET_SAMPLE_RATE)
  }

  isArmed(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  async rearm(): Promise<boolean> {
    await this.arm()
    return this.isArmed()
  }

  private async teardown(): Promise<void> {
    // Shared state clears synchronously, before any await: a slow
    // close() must never null out a successor's freshly installed graph
    // or orphan its stream. An in-flight recording survives teardown on
    // purpose; see stop().
    const ctx = this.ctx
    const stream = this.stream
    this.ctx = null
    this.stream = null
    this.preRoll = []
    this.preRollSamples = 0
    for (const track of stream?.getTracks() ?? []) track.stop()
    if (ctx) await ctx.close().catch(() => undefined)
  }
}
