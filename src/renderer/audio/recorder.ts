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
// Signal: chunks can flow and still be empty. A waking Mac or a
// reconfigured managed device hands back a stream with nothing behind it
// (a flat 0.0002, under any room's noise floor). A second watchdog holds
// every fresh graph to one rule: carry sustained signal within a short
// window or be rebuilt, budgeted per outage so a hardware-muted mic
// cannot keep the app rebuilding. A graph that has proven itself is
// trusted from then on: going quiet later is a pause or a noise gate
// (those output digital zero between words), and a stream that truly
// dies mid-session is the press-time heal's job (dictation.ts).
//
// A recording in progress survives graph death and rebuild: whatever was
// captured before the graph died still delivers at stop. Recordings are
// kept as rate-tagged segments so a rebuild onto a device with a
// different sample rate resamples each stretch correctly.
import { isDeadStream, peakLevel } from '../../shared/speech-gate'
import { TARGET_SAMPLE_RATE, downsample, encodeWavPcm16 } from '../../shared/wav'
import { LIVENESS_DEFAULTS, livenessAction, signalAction } from './liveness'

export interface RecorderOptions {
  synthetic: boolean
  preRollMs?: number
  /** Watchdog cadence; see liveness.ts for the defaults. */
  watchTickMs?: number
  stallMs?: number
  armTimeoutMs?: number
  silentMs?: number
  minSignalChunks?: number
  maxSilentRearms?: number
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
  // Signal watchdog state: when the current graph was installed, how
  // many of its chunks carried signal (counted only until it proves
  // itself), and the silent re-arms spent on the current outage.
  private armedAt = 0
  private signalChunks = 0
  private silentRearms = 0
  private readonly minSignalChunks: number
  // Bumped to invalidate an arm attempt: whatever a stale attempt
  // acquires after the bump gets released instead of installed.
  private generation = 0
  private watchdog: ReturnType<typeof setInterval> | null = null
  private outageLogged = false
  private silenceLogged = false
  private exhaustedLogged = false
  private failNextArms = 0
  private silentNextArms = 0

  constructor(private readonly opts: RecorderOptions) {
    this.minSignalChunks = opts.minSignalChunks ?? LIVENESS_DEFAULTS.minSignalChunks
  }

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

  /**
   * Smoke-only seam: make the next N graphs flow dead-flat (a constant
   * 0.0002, the live incident's reading) the way a waking Mac or a
   * reconfigured managed device hands back a stream with nothing behind
   * it. Chunks keep arriving, so the chunk watchdog reads healthy; only
   * the signal watchdog can recover. Any in-flight arm is orphaned so
   * the seam cannot be swallowed by it. No-op outside synthetic mode.
   */
  simulateSilence(count: number): void {
    if (!this.opts.synthetic) return
    this.silentNextArms = Math.max(0, Math.floor(count))
    this.silentRearms = 0
    this.silenceLogged = false
    this.exhaustedLogged = false
    this.generation++
    this.arming = null
    this.armingSince = null
    void this.arm().catch(() => undefined)
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
      this.probeSignal()
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

  /**
   * The second watchdog. Runs only while the chunk watchdog reads
   * healthy, only for an installed graph (a failed arm leaves none, and
   * that is the chunk watchdog's case), and only between recordings: a
   * take in progress is never torn down underneath, a clean no-speech
   * and the press-time heal beat a half-captured sentence inserted as
   * if whole. A fresh graph that flows a whole window without proving
   * itself is rebuilt, up to the budget; then the stream is left alone
   * until signal arrives or main asks for a re-arm (resume, the
   * press-time heal), which reopens it. One log line per outage, one
   * more if the budget runs out.
   */
  private probeSignal(): void {
    if (this.ctx === null || this.active) return
    const action = signalAction(
      {
        lastChunkAt: this.lastChunkAt,
        armedAt: this.armedAt,
        signalChunks: this.signalChunks,
        silentRearms: this.silentRearms
      },
      {
        silentMs: this.opts.silentMs ?? LIVENESS_DEFAULTS.silentMs,
        minSignalChunks: this.minSignalChunks,
        maxSilentRearms: this.opts.maxSilentRearms ?? LIVENESS_DEFAULTS.maxSilentRearms
      }
    )
    if (action === 'probing') return
    if (action === 'live') {
      this.silentRearms = 0
      this.silenceLogged = false
      this.exhaustedLogged = false
      return
    }
    if (action === 'exhausted') {
      if (!this.exhaustedLogged) {
        this.exhaustedLogged = true
        console.error(
          `[murmur] audio capture stayed silent after ${this.silentRearms} re-arms; waiting for signal, a press, or a wake`
        )
      }
      return
    }
    this.silentRearms++
    if (!this.silenceLogged) {
      this.silenceLogged = true
      console.error('[murmur] audio capture is silent; re-arming until the stream carries sound')
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
      } else if (this.silentNextArms > 0) {
        // A stream with nothing behind it: chunks flow at the live
        // incident's flat 0.0002, under the dead-stream floor. A started
        // constant source is always actively processing, so the worklet
        // keeps receiving (empty) input exactly as a real dead mic does.
        this.silentNextArms--
        const flat = new ConstantSourceNode(audioCtx, { offset: 0.0002 })
        flat.start()
        source = flat
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
    // Fresh graphs get a full stall window to deliver their first chunk
    // and a full silent window to prove they carry signal. The proof
    // starts from zero on every install on purpose: an install is grace,
    // not signal, or a stream that comes back dead every time would
    // reopen its own budget.
    this.lastChunkAt = Date.now()
    this.armedAt = Date.now()
    this.signalChunks = 0
  }

  private onChunk(chunk: Float32Array): void {
    this.lastChunkAt = Date.now()
    // Signal means the stream is real. A quiet room's noise floor clears
    // the dead-stream threshold by design (see speech-gate), so only a
    // stream with nothing behind it fails to count up. The peak scan
    // stops once the graph has proven itself: the steady state costs one
    // comparison per chunk.
    if (this.signalChunks < this.minSignalChunks && !isDeadStream(peakLevel(chunk))) {
      this.signalChunks++
    }
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
    // Main is asking (resume, the press-time heal, smoke): a new
    // situation, so the silent-rearm budget reopens and a second round
    // gets its own log lines (a heal that did not help is worth seeing).
    this.silentRearms = 0
    this.silenceLogged = false
    this.exhaustedLogged = false
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
