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
//
// Device: the stream follows the system default input, or the mic picked
// in Settings whenever it is plugged in (US-110, shared/mic.ts). A device
// change moves it between takes, never under one, and a press that finds
// it off its device moves it under the take, the way a silent stream is
// healed. Each install names its device in the log.
import {
  type LiveMic,
  type MicChoice,
  type MicDevice,
  type MicReport,
  MoveTries,
  aliasName,
  micTarget,
  moveAction,
  onTarget,
  realMics
} from '../../shared/mic'
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
  /** How long a burst of device changes settles before the stream follows. */
  deviceChangeMs?: number
  /** Called with the inputs and the one in use whenever either may have changed. */
  onMics?: (report: MicReport) => void
  /** False closes the capture stream between takes (US-135). */
  keepReady?: boolean
  /** With the mic closed between takes: called with the milliseconds a
   *  press took to go live, once sound is really arriving. */
  onLive?: (ms: number) => void
}

// A device list that does not come back in this long is not waited for:
// the last one stands (enumeration can lag while a waking audio stack
// settles, and an arm must never hang on it).
const ENUMERATE_TIMEOUT_MS = 1_500

// Smoke's stand-in inputs: two devices and Chromium's default alias,
// which simulateDefaultMove points at one or the other.
const SYNTHETIC_MICS: MicDevice[] = [
  { deviceId: 'synthetic-a', groupId: 'synthetic-group-a', label: 'Synthetic A' },
  { deviceId: 'synthetic-b', groupId: 'synthetic-group-b', label: 'Synthetic B' }
]

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
  // The generation whose graph feeds the buffers: set when a graph is
  // installed, not when its attempt starts, so a hot swap (a press on a
  // silent stream) keeps the old graph feeding the take until the new
  // one is in place.
  private feedGen = 0
  private watchdog: ReturnType<typeof setInterval> | null = null
  private outageLogged = false
  private silenceLogged = false
  private exhaustedLogged = false
  private failNextArms = 0
  private silentNextArms = 0
  private hangNextArms = 0
  // Device state: the pick from Settings, the last input list, the
  // installed graph's device, the device last named in the log, the move
  // tried since the last outside event (never looped on its own), and
  // work held for a take in progress to end.
  private choice: MicChoice = { id: '', label: '' }
  private devices: MicDevice[] = []
  private live: LiveMic | null = null
  private liveLabel = ''
  private loggedLabel = ''
  private readonly tries = new MoveTries()
  private stuckLogged = ''
  private moveAfterTake = false
  private rearmAfterTake = false
  private followAfterArm = false
  private deviceTimer: ReturnType<typeof setTimeout> | null = null
  private syntheticDefault = 0
  private slowNextArmMs = 0
  // Closed between takes (US-135): whether the stream stays up, when a
  // press asked for it, and how long the last press took.
  private keepReady: boolean
  private openAskedAt: number | null = null
  private openMs: number | null = null

  constructor(private readonly opts: RecorderOptions) {
    this.minSignalChunks = opts.minSignalChunks ?? LIVENESS_DEFAULTS.minSignalChunks
    this.keepReady = opts.keepReady ?? true
    if (!opts.synthetic && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', () => this.deviceChanged())
    }
  }

  /** True between takes with the mic closed: nothing may open it. */
  private get closedForNow(): boolean {
    return !this.keepReady && this.active === null
  }

  /** The first arm after launch, which a closed mic skips. */
  armIfReady(): Promise<void> {
    return this.closedForNow ? Promise.resolve() : this.arm()
  }

  setKeepReady(keep: boolean): void {
    if (keep === this.keepReady) return
    this.keepReady = keep
    if (keep) void this.arm().then(() => this.report(), () => undefined)
    else if (this.active === null) void this.closeMic()
  }

  // The same release a dead graph gets, and the bump makes any attempt
  // still building give back whatever it acquires.
  private async closeMic(): Promise<void> {
    this.generation++
    this.live = null
    this.liveLabel = ''
    await this.teardown()
    this.report()
  }

  /** (Re)acquire the source and start feeding the pre-roll buffer.
   *  keepCurrent builds the new graph beside the old one and swaps at
   *  install, so a take in progress loses nothing while it builds. */
  arm(keepCurrent = false): Promise<void> {
    this.watchdog ??= setInterval(
      () => this.tick(),
      this.opts.watchTickMs ?? LIVENESS_DEFAULTS.watchTickMs
    )
    if (!this.arming) {
      const attempt = this.doArm(keepCurrent).finally(() => {
        // An abandoned attempt must not clear its successor's slot.
        if (this.arming === attempt) {
          this.arming = null
          this.armingSince = null
          if (this.followAfterArm) {
            this.followAfterArm = false
            void this.follow()
          }
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

  /**
   * Smoke-only seam: make the next N arm attempts hang forever the way a
   * waking audio stack's getUserMedia can, so the watchdog has to
   * abandon them. The installed graph is left alone. No-op outside
   * synthetic mode.
   */
  simulateHang(count: number): void {
    if (!this.opts.synthetic) return
    this.hangNextArms = Math.max(0, Math.floor(count))
  }

  /**
   * Smoke-only seam: the system default moves to the other stand-in
   * input, the way a display wake hands the default to a dock's jack and
   * back. Announced, it arrives the way devicechange announces it;
   * quiet, only the next press can find it. slowMs holds the next graph
   * that long before it installs, the way a waking audio stack is slow
   * to open, so a press can land in the middle of the move. No-op
   * outside synthetic mode.
   */
  simulateDefaultMove(announce: boolean, slowMs = 0): void {
    if (!this.opts.synthetic) return
    this.syntheticDefault = 1 - this.syntheticDefault
    this.slowNextArmMs = Math.max(0, Math.floor(slowMs))
    if (announce) this.deviceChanged()
  }

  /** The mic picked in Settings; empty follows the system default. */
  setMicChoice(choice: MicChoice): void {
    if (choice.id === this.choice.id && choice.label === this.choice.label) return
    this.choice = { id: choice.id, label: choice.label }
    this.tries.reset()
    void this.follow()
  }

  private deviceChanged(): void {
    // An outside event: a move that did not stick earns a fresh try.
    this.tries.reset()
    this.stuckLogged = ''
    // Plugging in a dock or waking a display fires a burst of changes;
    // follow once it settles.
    if (this.deviceTimer) clearTimeout(this.deviceTimer)
    this.deviceTimer = setTimeout(() => {
      this.deviceTimer = null
      void this.follow()
    }, this.opts.deviceChangeMs ?? 500)
  }

  private async refreshDevices(): Promise<MicDevice[]> {
    if (this.opts.synthetic) {
      const to = SYNTHETIC_MICS[this.syntheticDefault]
      this.devices = [{ deviceId: 'default', groupId: to.groupId, label: `Default - ${to.label}` }, ...SYNTHETIC_MICS]
      return this.devices
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const list = await Promise.race([
        navigator.mediaDevices.enumerateDevices(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ENUMERATE_TIMEOUT_MS)
        })
      ])
      if (list) {
        this.devices = list
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, groupId: d.groupId, label: d.label }))
      }
    } catch {
      // The last list stands; the next change or arm reads again.
    } finally {
      clearTimeout(timer)
    }
    return this.devices
  }

  private report(): void {
    this.opts.onMics?.({
      devices: realMics(this.devices).map((d) => ({ id: d.deviceId, label: d.label })),
      current: this.liveLabel,
      standIn: micTarget(this.devices, this.choice).standIn,
      open: this.ctx !== null,
      openMs: this.openMs
    })
  }

  /**
   * Puts the stream on the device it belongs on, between takes only. A
   * take in progress keeps its mic and the move waits for it to end. A
   * graph still building reads the list itself and checks again when it
   * installs; no graph at all is the watchdog's case.
   */
  private async follow(): Promise<void> {
    if (this.closedForNow) {
      // Listing inputs opens nothing, and Settings still wants the names.
      await this.refreshDevices()
      this.report()
      return
    }
    const devices = await this.refreshDevices()
    this.report()
    if (this.arming) {
      this.followAfterArm = true
      return
    }
    if (this.ctx === null || !this.live) return
    const target = micTarget(devices, this.choice)
    const from = this.liveLabel || 'an unnamed input'
    const to = target.label || 'the default input'
    if (onTarget(this.live, target)) {
      this.tries.reset()
      this.moveAfterTake = false
      return
    }
    const action = moveAction(this.live, target, this.active !== null, this.tries.key)
    if (action === 'stay') {
      // The move was tried and capture still came up elsewhere.
      if (this.stuckLogged !== this.tries.key) {
        this.stuckLogged = this.tries.key
        console.error(`[murmur] capture could not move to ${to}; staying on ${from}`)
      }
      return
    }
    if (action === 'after-take') {
      if (!this.moveAfterTake) console.error(`[murmur] capture belongs on ${to}, not ${from}; moving after this take`)
      this.moveAfterTake = true
      return
    }
    this.tries.record(target)
    this.moveAfterTake = false
    console.error(`[murmur] capture belongs on ${to}, not ${from}; moving between takes`)
    // Built beside the current graph and swapped in when ready: a press
    // that lands mid-move records on the old mic until then instead of
    // on nothing (review gate 2026-10-23).
    void this.arm(true).catch(() => undefined)
  }

  /** What a take held back runs once it ends. */
  private afterTake(): void {
    if (!this.keepReady) {
      this.rearmAfterTake = false
      this.moveAfterTake = false
      this.openAskedAt = null
      void this.closeMic()
    } else if (this.rearmAfterTake) {
      this.rearmAfterTake = false
      this.moveAfterTake = false
      void this.rearm().catch(() => false)
    } else if (this.moveAfterTake) {
      void this.follow()
    }
  }

  private tick(): void {
    if (this.closedForNow) return
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
    // An abandoned hot swap (a press on a silent stream whose rebuild
    // hung) left the old graph installed and feeding the take: the retry
    // must be a hot swap too, or its teardown would silence the very
    // take the swap exists to save (review gate 2026-09-24). A stall
    // means the installed graph delivers nothing, so it rebuilds cold.
    const keepFeeding = action === 'abandon' && this.active !== null && this.ctx !== null
    void this.arm(keepFeeding).catch(() => undefined)
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

  private async doArm(keepCurrent = false): Promise<void> {
    const gen = ++this.generation
    if (!keepCurrent) {
      await this.teardown()
      if (gen !== this.generation) return
    }
    if (this.opts.synthetic && this.hangNextArms > 0) {
      this.hangNextArms--
      await new Promise<void>(() => undefined)
    }
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

    // The device this graph belongs on, from a fresh list: a mic yanked a
    // moment ago must not be asked for by id.
    const target = micTarget(await this.refreshDevices(), this.choice)
    if (gen !== this.generation) return
    if (this.opts.synthetic && this.slowNextArmMs > 0) {
      const ms = this.slowNextArmMs
      this.slowNextArmMs = 0
      await new Promise((resolve) => setTimeout(resolve, ms))
      if (gen !== this.generation) return
    }
    let live: LiveMic = { deviceId: target.deviceId ?? 'default', groupId: target.groupId }
    let liveLabel = target.label

    try {
      if (!this.opts.synthetic) {
        // The stream comes first: a getUserMedia that hangs until the
        // watchdog abandons this attempt is holding no AudioContext,
        // so abandoned attempts cannot exhaust the per-page context cap.
        const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true }
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: target.deviceId ? { ...audio, deviceId: { exact: target.deviceId } } : audio
          })
        } catch (error) {
          // The pick vanished between the list and the open: the default
          // stands in, and the next device change brings the pick back.
          if (!target.deviceId) throw error
          stream = await navigator.mediaDevices.getUserMedia({ audio })
        }
        if (gen !== this.generation) return void (await release())
        const track = stream.getAudioTracks()[0]
        // A yanked or slept device ends the track: re-arm without a
        // restart. Failure lands on the watchdog, which keeps retrying.
        track.addEventListener('ended', () => void this.arm().catch(() => undefined))
        const settings = track.getSettings()
        live = { deviceId: settings.deviceId ?? '', groupId: settings.groupId ?? '' }
        liveLabel = aliasName(track.label)
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
        // Only the installed graph feeds the shared buffers: a superseded
        // one's chunks may carry a different sample rate, and a graph
        // still building must not interleave with the one it replaces.
        if (gen === this.feedGen) this.onChunk(event.data as Float32Array)
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

    // A hot swap releases the graph it replaces only now, after the new
    // one is ready: the take kept recording on it the whole time.
    const replaced = keepCurrent ? { ctx: this.ctx, stream: this.stream } : null
    this.ctx = ctx
    this.stream = stream
    this.feedGen = gen
    this.live = live
    this.liveLabel = liveLabel
    if (replaced) {
      this.preRoll = []
      this.preRollSamples = 0
      for (const track of replaced.stream?.getTracks() ?? []) track.stop()
      if (replaced.ctx) void replaced.ctx.close().catch(() => undefined)
    }
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
    // One line per device, not per rebuild: the log says which mic every
    // dictation after this one heard.
    if (liveLabel !== '' && liveLabel !== this.loggedLabel) {
      this.loggedLabel = liveLabel
      console.error(`[murmur] capture on ${liveLabel}`)
    }
    // The device may have changed while this graph was building: look
    // again once this attempt settles.
    this.followAfterArm = true
  }

  private onChunk(chunk: Float32Array): void {
    this.lastChunkAt = Date.now()
    if (this.openAskedAt !== null) {
      this.openMs = Date.now() - this.openAskedAt
      this.openAskedAt = null
      this.opts.onLive?.(this.openMs)
      this.report()
    }
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
    // Closed between takes: open now. The listening cue waits for onLive,
    // so nobody starts talking into a mic that is not there yet.
    if (!this.keepReady) {
      if (this.ctx === null) {
        this.openAskedAt = Date.now()
        void this.arm().catch(() => undefined)
      } else {
        this.opts.onLive?.(0)
      }
      return
    }
    // A press on a graph that has never carried signal (the signal
    // watchdog gave up on it, or a gated mic has not spoken since it was
    // installed) rebuilds capture under the take instead of recording
    // the whole press into it. Live-found 2026-09-24: after a wake or an
    // idle spell the budget ran out on dead graphs, the first press
    // recorded silence (peak 0.0002), and only the heal after it brought
    // the mic back, so the first press was always lost. The old graph
    // keeps feeding the take until the new one installs, so a gated mic
    // that was merely quiet loses nothing either.
    if (this.ctx !== null && !this.arming && this.signalChunks < this.minSignalChunks) {
      this.silentRearms = 0
      this.silenceLogged = false
      this.exhaustedLogged = false
      console.error('[murmur] press found a silent stream; rebuilding capture under the take')
      void this.arm(true).catch(() => undefined)
      return
    }
    // A press on a stream that is live but on the wrong mic moves it the
    // same way, so the words of this very press land on the right one
    // (US-110: after a wake the stream sat on a dock's hissing jack and
    // every dictation came back as a few garbled words). The list is read
    // fresh, since a default can change without a device change event;
    // the old graph feeds the take meanwhile.
    const take = this.active
    void this.refreshDevices().then((devices) => {
      if (this.active !== take || this.ctx === null || this.arming) return
      const target = micTarget(devices, this.choice)
      if (moveAction(this.live, target, false, this.tries.key) !== 'move') return
      this.tries.record(target)
      this.moveAfterTake = false
      console.error(
        `[murmur] press found capture on ${this.liveLabel || 'an unnamed input'}, not ${target.label || 'the default input'}; moving capture under the take`
      )
      void this.arm(true).catch(() => undefined)
    })
  }

  cancel(): void {
    const open = this.active !== null
    this.active = null
    if (open) this.afterTake()
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
    const wav = encodeWavPcm16(all, TARGET_SAMPLE_RATE)
    this.afterTake()
    return wav
  }

  isArmed(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  async rearm(): Promise<boolean> {
    if (this.closedForNow) return true
    // Never under a take: a wake or an unlock can land the instant a
    // press starts, and a cold rebuild then would cut its first words.
    // The re-arm runs as soon as the take ends.
    if (this.active) {
      this.rearmAfterTake = true
      return this.isArmed()
    }
    // Main is asking (resume, unlock, the press-time heal, smoke): a new
    // situation, so the silent-rearm budget reopens and a second round
    // gets its own log lines (a heal that did not help is worth seeing),
    // including which mic it came back on.
    this.silentRearms = 0
    this.silenceLogged = false
    this.exhaustedLogged = false
    this.loggedLabel = ''
    // And a move that did not stick (the list and the open can disagree
    // right after a wake) earns a fresh try.
    this.tries.reset()
    this.stuckLogged = ''
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
    // Nothing feeds until the next graph installs: a closing context can
    // still deliver a chunk or two while close() settles.
    this.feedGen = -1
    this.preRoll = []
    this.preRollSamples = 0
    for (const track of stream?.getTracks() ?? []) track.stop()
    if (ctx) await ctx.close().catch(() => undefined)
  }
}
