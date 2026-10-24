# The Listening Session (IOS-009) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A take from any app. With no session running, the first tap on the pill opens murmur, which is already recording; you swipe back and keep talking. Until the session ends, every tap starts a take right where you are.

**Architecture:** The keyboard still never touches the microphone.

With no session running, the keyboard leaves its usual ask in the mailbox and opens murmur through its window scene with a take link, `<bundle id>://take?id=<take>`. murmur then:
- starts a session;
- starts the take under that id through the keyboard bridge;
- covers the screen with Recording: the live waveform, the word Recording, Stop, and a guide along the bottom edge showing the swipe back.

The session holds the one device microphone warm. A tap gate sits between the microphone and the take: between takes every buffer is dropped as it arrives, so nothing from between takes exists in memory, on disk, or on the network.

The session publishes `session.json` (on until a time, or off) to the app group. While it says on, the keyboard signals start and stays in your app. The session's length counts again from the end of each take. End session can come from the app or from a long press on the pill. A call, Siri, or another app taking the microphone ends the session, and a take in progress is processed as if you had tapped stop.

**Tech Stack:** Swift 6, AVAudioEngine and AVAudioSession (background audio, interruptions, route changes), SwiftUI (`onOpenURL`, `fullScreenCover`, `Canvas`), UIKit (`UIScene.open`, `UIButton.menu`), Darwin notifications, Swift Testing.

**Spec:** `ios/prd.json` IOS-009, with `decisions.keyboard` and `conventions` (privacy, design, verify, docs), `CLAUDE.md`, and `DESIGN.md`. It builds on IOS-006 (the take model and microphone), IOS-007 (cleanup), and IOS-008 (the mailbox, the signals, the bridge, and the pad). The design skills were consulted for the two new screens: frontend-design, elite-saas-designer, and ui-skills-root. Night studio and DESIGN.md stay the authority.

**Proven before writing:** every block below ran in a throwaway copy of `feature/ios` at 41bc0ae before this plan was saved:
- `swift test` ran 104 MurmurCore tests, unchanged.
- `npm run ios:test` ran 143 app tests: 117 existing and 26 new. That build includes the keyboard extension, including its `UIScene.open` call.
- `npm run ios:smoke` printed eleven true checks, `session` among them. It ran main-actor work from the smoke's synchronous start by turning the main run loop.
- The Recording screen (recording, and microphone off) and the Session screen were rendered in the simulator and read. Two things were corrected:
  - with the microphone off, the swipe guide no longer says keep talking;
  - the Session screen's rows take the panel color, as the other screens' rows do.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The keyboard opens murmur through its window scene (`UIScene.open`).** That call compiles in a keyboard extension. On iOS 26 it works only with Full Access, which the pad already needs (KeyboardKit issues 966 and 968, checked 2026-10-12). When iOS refuses, the pill says Open murmur to start. If wrong: walk the responder chain to the application instead.
2. **The link's scheme is the bundle id, `com.lbwalton.murmur.ios`,** carried by both targets as `MurmurURLScheme`. It never collides with Undertone or a self-built copy. If wrong: a short scheme, with the collision risk.
3. **A take that opened murmur lands in the first field the keyboard comes back to.** A field's identity across an app switch is not reliable. The keyboard keeps the take it waits on in its own defaults, for at most 10 minutes. Leaving the keyboard does not cancel such a take, because leaving is the point. If wrong: words could land in another field you went to first.
4. **When the session file says on but murmur does not answer within 2 seconds** (murmur was closed), the keyboard cancels its start and opens murmur with the same take. The bridge treats the same link twice as one take. If wrong: the pad would say Open murmur, then tap the pill again.
5. **The Session screen gets Start session.** It is the way in that works today when iOS refuses the link, and the docs point there until IOS-016 adds more. If wrong: drop the button and the doc answer's last steps.
6. **An interruption without a session still stops and processes a Dictate take.** The microphone is gone either way. If wrong: such a take would sit recording silence.
7. **A route change mid take (AirPods connecting) restarts the warm microphone on the new route.** The take goes on in the new format with nothing lost. If the input went away, the take ends with what it heard and the session goes cold. If wrong: takes would go silent after a route change.
8. **The Recording screen has Stop, in live amber,** and closes itself when the take ends, so murmur never records with no way to stop. With the microphone off, it shows the fix and Close, and no guide.
9. **The waveform here is plain bars in live amber.** The signature ink waveforms are IOS-010.
10. **The battery answer ships without a number until LaBroi measures one.** Measuring is in the live check; the number goes into the doc after it, and the story stays open until then.
11. **The app says the session is off when it launches,** so a session never outlives the app that ran it.
12. **End session in the keyboard is a long-press menu on the pill,** present only while a session runs. IOS-023 and IOS-024 add Note and Transform to the same menu.
13. **The length lives in the app's own defaults;** the keyboard never needs it. `session.json` uses the after-first-unlock protection class, like the mailbox.

## Global Constraints

- Swift 6 with strict concurrency; iOS 26 minimum. It must compile with Swift 6.3 (CI's Xcode 26.6): no closure-to-`Binding` conversions. Closures handed to C callbacks capture nothing.
- The keyboard makes no network requests, and the keyboard network test (`scripts/lib/keyboard-network.test.js`) stays green with the new shared files.
- Privacy: audio between takes is never kept, written, or sent. Only a take, from tap to tap, reaches the provider.
- Design: night studio tokens. Red is only for record, errors, and confirming a delete; gold is for actions; amber is only for live. VoiceOver labels everywhere; 44 point targets; Reduce Motion gets a still guide.
- Every `.swift` file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-009:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`. Nothing desktop runs changes, so `npm run smoke` is not required.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **Sound between takes reaching a take, or a file.** It never does: the gate drops it as it arrives. Pinned by `WarmMicrophoneTests.soundBetweenTakesNeverReachesATake` (Task 1) and the smoke's `session` check, which also finds no audio file anywhere (Task 7).
2. **The length running out mid take.** The take keeps the session until it ends, and the length counts again from then. Pinned by `SessionTests.aTakeInProgressHoldsTheSession` (Task 3).
3. **A call arriving mid take.** The session ends, and the take is processed with what it heard. Pinned by `SessionTests.anInterruptionEndsTheSession` and `anInterruptionStopsATakeWithoutASession` (Task 3).
4. **murmur killed while the session file still says on.** A new launch says off (`SessionTests.aNewAppSaysTheSessionIsOff`, Task 3). A keyboard that sent a start before that opens murmur after 2 seconds (Task 5; the controller is checked live).
5. **The ask the keyboard left before opening murmur starting a second take later.** The link uses it up, and the same link twice is one take. Pinned by `KeyboardBridgeTests.theLinksAskIsUsedUp` (Task 4).

---

### Task 1: The warm microphone

**Files:**
- Modify (whole file below): `ios/App/Takes/Microphone.swift`, `ios/App/Smoke/ScriptedMicrophone.swift`.
- Modify: `ios/App/Takes/TakeModel.swift`, `ios/App/Takes/TakeScreen.swift`.
- Test: `ios/AppTests/WarmMicrophoneTests.swift`.

**Interfaces:**
- Produces `Microphone.level: Float`, and `WarmMicrophone: Microphone`, with `isWarm`, `holdWarm`, `warmUp() throws`, and `coolDown()`.
- Produces `DeviceMicrophone.shared` (its initializer is private), `TapGate` (`tap`, `begin(_:)`, `end() -> Capture?`, `level`, `reformat(from:)`, `pass(_:)`), and `Capture.reformat(from:)`.
- Produces `ScriptedMicrophone: WarmMicrophone` (with a settable `level`), and `FedMicrophone: WarmMicrophone` (`init?(rate:)`, `hear(_ samples:)`, `lastTake`).
- Produces `TakeModel.level`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import AVFoundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct WarmMicrophoneTests {
    /// Half a second at 48 kHz of a steady 0.5, a sound no take may hold.
    let between = [Float](repeating: 0.5, count: 24_000)
    /// A second at 48 kHz of a 220 Hz tone at 0.3.
    let spoken = (0..<48_000).map { Float(0.3 * sin(2 * Double.pi * 220 * Double($0) / 48_000)) }

    /// Sound heard while warm between takes is dropped as it arrives: the
    /// take holds only what was said during it.
    @Test func soundBetweenTakesNeverReachesATake() throws {
        let microphone = try #require(FedMicrophone())
        microphone.holdWarm = true
        try microphone.warmUp()
        microphone.hear(between)
        try microphone.start()
        microphone.hear(spoken)
        let take = microphone.stop()
        microphone.hear(between)
        #expect(abs(take.count - Wav.targetSampleRate) < 400)
        #expect(take.allSatisfy { abs($0) < 0.35 })
        #expect(microphone.isWarm)
        try microphone.start()
        #expect(microphone.stop().allSatisfy { abs($0) < 0.01 })
    }

    @Test func aTakeWithoutASessionLetsTheMicrophoneGo() throws {
        let microphone = try #require(FedMicrophone())
        try microphone.start()
        microphone.hear(spoken)
        _ = microphone.stop()
        #expect(!microphone.isWarm)
    }

    /// The waveform moves only during a take.
    @Test func theLevelFollowsTheTakeOnly() throws {
        let microphone = try #require(FedMicrophone())
        microphone.holdWarm = true
        try microphone.warmUp()
        microphone.hear(between)
        #expect(microphone.level == 0)
        try microphone.start()
        microphone.hear(spoken)
        #expect(microphone.level > 0.5)
        _ = microphone.stop()
        #expect(microphone.level == 0)
    }

    /// AirPods connecting mid take change the input format; the take goes
    /// on in the new one and keeps everything.
    @Test func aTakeGoesOnAcrossARouteChange() throws {
        let first = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let second = try #require(AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1))
        let capture = try #require(Capture(from: first))
        for (format, frames) in [(first, 24_000), (second, 12_000)] {
            let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)))
            buffer.frameLength = AVAudioFrameCount(frames)
            for i in 0..<frames { buffer.floatChannelData![0][i] = 0.2 }
            capture.reformat(from: format)
            capture.append(buffer)
        }
        let samples = capture.finish()
        #expect(abs(samples.count - Wav.targetSampleRate) < 400)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'FedMicrophone' in scope`.

- [ ] **Step 3: Write the warm microphone**

`ios/App/Takes/Microphone.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The microphone (ios/prd.json IOS-006): it asks the first time a take
// needs it, records mono through AVAudioSession, and hands back the take
// at 16 kHz, the rate the speech gate and the WAV use. A listening session
// (IOS-009) keeps it warm between takes, so a take starts at once; what it
// hears between takes is dropped as it arrives and never exists anywhere.
import AVFoundation
import MurmurCore
import Synchronization

@MainActor protocol Microphone: AnyObject {
    /// Asks the first time; true when murmur may record.
    func allow() async -> Bool
    func start() throws
    /// Stops and returns the take at 16 kHz.
    func stop() -> [Float]
    /// How loud the take is right now, 0 to 1, for the live waveform.
    var level: Float { get }
}

/// A microphone a listening session can keep warm between takes.
@MainActor protocol WarmMicrophone: Microphone {
    var isWarm: Bool { get }
    /// Whether it stays warm when a take stops; a session sets it.
    var holdWarm: Bool { get set }
    /// Listens without keeping anything, so the next take starts at once.
    func warmUp() throws
    /// Stops listening, and iOS's orange dot goes out.
    func coolDown()
}

enum MicrophoneError: Error {
    case noInput
}

@MainActor final class DeviceMicrophone: WarmMicrophone {
    /// The one microphone, shared by takes and the session.
    static let shared = DeviceMicrophone()

    private let engine = AVAudioEngine()
    private let gate = TapGate()
    private(set) var isWarm = false
    var holdWarm = false

    private init() {
        // The engine stops when the route changes (AirPods connect or a
        // cable comes out). A warm microphone starts again on the new
        // route, and a take in progress keeps going.
        NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.rewarm() }
        }
    }

    func allow() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: true
        case .denied: false
        default: await AVAudioApplication.requestRecordPermission()
        }
    }

    /// Music that is playing keeps playing (mixWithOthers), and stays in
    /// Bluetooth headphones (allowBluetoothA2DP) while the iPhone's own
    /// mic records; without it, playAndRecord moves the music to the
    /// speaker for the length of the take.
    nonisolated static let sessionOptions: AVAudioSession.CategoryOptions = [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP]

    func warmUp() throws {
        guard !isWarm else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: Self.sessionOptions)
        try session.setActive(true)
        do {
            try listen()
        } catch {
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            throw error
        }
        isWarm = true
    }

    func coolDown() {
        guard isWarm else { return }
        _ = gate.end()
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isWarm = false
    }

    func start() throws {
        try warmUp()
        guard let capture = Capture(from: engine.inputNode.outputFormat(forBus: 0)) else { throw MicrophoneError.noInput }
        gate.begin(capture)
    }

    func stop() -> [Float] {
        let samples = gate.end()?.finish() ?? []
        if !holdWarm { coolDown() }
        return samples
    }

    var level: Float { gate.level }

    /// Installs the tap on the input's current format and starts the engine.
    private func listen() throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw MicrophoneError.noInput }
        gate.reformat(from: format)
        input.installTap(onBus: 0, bufferSize: 4096, format: format, block: gate.tap)
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw error
        }
    }

    private func rewarm() {
        guard isWarm else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        do {
            try listen()
        } catch {
            // No input now (the route went away): the take ends with what
            // it heard, and the session goes cold.
            holdWarm = false
            coolDown()
        }
    }
}

/// Where the microphone's buffers go: into the take while one is being
/// recorded, and nowhere at all between takes. It runs on the audio
/// thread, so nothing here belongs to the main actor.
final class TapGate: Sendable {
    private struct State {
        var capture: Capture?
        var level: Float = 0
    }

    private let state = Mutex(State())

    /// The tap's block, made here so it never inherits the main actor.
    var tap: AVAudioNodeTapBlock {
        { [self] buffer, _ in pass(buffer) }
    }

    func begin(_ capture: Capture) {
        state.withLock { $0 = State(capture: capture) }
    }

    /// Ends the take and hands back what it heard, or nil between takes.
    func end() -> Capture? {
        state.withLock { state in
            defer { state = State() }
            return state.capture
        }
    }

    var level: Float { state.withLock { $0.level } }

    /// A new route mid take: the take goes on in the new format.
    func reformat(from format: AVAudioFormat) {
        state.withLock { $0.capture?.reformat(from: format) }
    }

    func pass(_ buffer: AVAudioPCMBuffer) {
        state.withLock { state in
            guard let capture = state.capture else { return }
            capture.append(buffer)
            state.level = Self.level(of: buffer)
        }
    }

    /// The buffer's loudness, 0 to 1: its RMS, scaled so speech fills most
    /// of it.
    static func level(of buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData, buffer.frameLength > 0 else { return 0 }
        let frames = Int(buffer.frameLength)
        var sum: Float = 0
        for i in 0..<frames { sum += channel[0][i] * channel[0][i] }
        return min(1, (sum / Float(frames)).squareRoot() * 4)
    }
}

/// Turns the input's buffers into 16 kHz mono as they arrive, on the
/// audio thread, so nothing here belongs to the main actor. The
/// converter keeps its state between buffers, so a take converts as one
/// stream.
final class Capture: Sendable {
    private struct State: ~Copyable {
        var converter: AVAudioConverter
        let output: AVAudioFormat
        var samples: [Float] = []
    }

    private let state: Mutex<State>

    /// Nil for a format with no audio in it (no input device).
    init?(from input: AVAudioFormat) {
        guard let output = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(Wav.targetSampleRate), channels: 1, interleaved: false),
              let converter = Self.converter(from: input, to: output)
        else { return nil }
        state = Mutex(State(converter: converter, output: output))
    }

    private static func converter(from input: AVAudioFormat, to output: AVAudioFormat) -> AVAudioConverter? {
        guard input.sampleRate > 0, input.channelCount > 0, let converter = AVAudioConverter(from: input, to: output) else { return nil }
        converter.downmix = true
        return converter
    }

    /// The take, with the last samples the converter holds back flushed
    /// out. Call once, after the last buffer.
    func finish() -> [Float] {
        state.withLock { state in
            Self.flush(&state)
            return state.samples
        }
    }

    /// Goes on in a new input format: what the old converter held back is
    /// kept, and a format with no audio leaves the old one in place.
    func reformat(from input: AVAudioFormat) {
        state.withLock { state in
            guard input != state.converter.inputFormat, let next = Self.converter(from: input, to: state.output) else { return }
            Self.flush(&state)
            state.converter = next
        }
    }

    private static func flush(_ state: inout State) {
        guard let out = AVAudioPCMBuffer(pcmFormat: state.output, frameCapacity: 4_096) else { return }
        var error: NSError?
        let status = state.converter.convert(to: out, error: &error) { _, inputStatus in
            inputStatus.pointee = .endOfStream
            return nil
        }
        if status != .error, let channel = out.floatChannelData {
            state.samples.append(contentsOf: UnsafeBufferPointer(start: channel[0], count: Int(out.frameLength)))
        }
    }

    /// The tap's block, made here so it never inherits the main actor.
    var tap: AVAudioNodeTapBlock {
        { [self] buffer, _ in append(buffer) }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        state.withLock { state in
            guard buffer.format == state.converter.inputFormat else { return }
            let ratio = state.output.sampleRate / buffer.format.sampleRate
            let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 64
            guard let out = AVAudioPCMBuffer(pcmFormat: state.output, frameCapacity: capacity) else { return }
            var fed = false
            var error: NSError?
            let status = state.converter.convert(to: out, error: &error) { _, inputStatus in
                if fed {
                    inputStatus.pointee = .noDataNow
                    return nil
                }
                fed = true
                inputStatus.pointee = .haveData
                return buffer
            }
            guard status != .error, let channel = out.floatChannelData else { return }
            state.samples.append(contentsOf: UnsafeBufferPointer(start: channel[0], count: Int(out.frameLength)))
        }
    }
}
```

`ios/App/Smoke/ScriptedMicrophone.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// A stand-in microphone for the smoke and the tests: it hands back the
// samples it was given, so a take runs end to end with no hardware.
import AVFoundation
import Foundation
import MurmurCore

@MainActor final class ScriptedMicrophone: WarmMicrophone {
    var allowed = true
    var startError: (any Error)?
    var samples: [Float]
    var level: Float = 0
    var holdWarm = false
    private(set) var isWarm = false
    private(set) var asked = 0
    private(set) var started = 0

    init(samples: [Float] = []) {
        self.samples = samples
    }

    func allow() async -> Bool {
        asked += 1
        return allowed
    }

    func warmUp() throws {
        if let startError { throw startError }
        isWarm = true
    }

    func coolDown() { isWarm = false }

    func start() throws {
        try warmUp()
        started += 1
    }

    func stop() -> [Float] {
        if !holdWarm { coolDown() }
        return samples
    }

    /// A second of a 220 Hz tone at speaking level between half seconds
    /// of silence, at 16 kHz.
    nonisolated static let tone: [Float] = {
        let rate = Double(Wav.targetSampleRate)
        let quiet = [Float](repeating: 0, count: Wav.targetSampleRate / 2)
        let voiced = (0..<Wav.targetSampleRate).map { Float(0.3 * sin(2 * Double.pi * 220 * Double($0) / rate)) }
        return quiet + voiced + quiet
    }()

    /// Two seconds of nothing.
    nonisolated static let silence = [Float](repeating: 0, count: Wav.targetSampleRate * 2)
}

/// The device microphone's path with buffers handed in instead of heard:
/// the same gate and capture, so the smoke can show that sound arriving
/// between takes never reaches a take.
@MainActor final class FedMicrophone: WarmMicrophone {
    let format: AVAudioFormat
    private let gate = TapGate()
    private(set) var isWarm = false
    var holdWarm = false
    /// What the last take heard, at 16 kHz.
    private(set) var lastTake: [Float] = []

    init?(rate: Double = 48_000) {
        guard let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 1, interleaved: false) else { return nil }
        self.format = format
    }

    func allow() async -> Bool { true }

    func warmUp() throws {
        gate.reformat(from: format)
        isWarm = true
    }

    func coolDown() {
        _ = gate.end()
        isWarm = false
    }

    func start() throws {
        try warmUp()
        guard let capture = Capture(from: format) else { throw MicrophoneError.noInput }
        gate.begin(capture)
    }

    func stop() -> [Float] {
        lastTake = gate.end()?.finish() ?? []
        if !holdWarm { coolDown() }
        return lastTake
    }

    var level: Float { gate.level }

    /// Hands the gate what a warm microphone would hear; a cold one hears
    /// nothing.
    func hear(_ samples: [Float]) {
        guard isWarm, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)), let channel = buffer.floatChannelData else { return }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { channel[0].update(from: $0.baseAddress!, count: samples.count) }
        gate.pass(buffer)
    }
}
```

In `ios/App/Takes/TakeModel.swift`, before `/// Transcribing or retrying: one thing at a time.`, add:

```swift
    /// How loud the take is right now, 0 to 1, for the live waveform.
    var level: Float {
        microphone.level
    }

```

In `ios/App/Takes/TakeScreen.swift`, in `TakeModel.live()`, change `microphone: DeviceMicrophone(), store` to `microphone: DeviceMicrophone.shared, store`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `WarmMicrophoneTests` passes (4 tests), `CaptureTests` still passes, and the app total is 121.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Takes/Microphone.swift ios/App/Smoke/ScriptedMicrophone.swift ios/App/Takes/TakeModel.swift ios/App/Takes/TakeScreen.swift ios/AppTests/WarmMicrophoneTests.swift
git commit -m "IOS-009: the microphone can stay warm between takes and keeps nothing it hears there"
```

### Task 2: The session's state, the take link, and End session's signal

**Files:**
- Create: `ios/Shared/SessionState.swift`, `ios/Shared/TakeLink.swift`.
- Modify: `ios/Shared/Signals.swift`, `ios/App/Keyboard/KeyboardBridge.swift`, `ios/project.yml`.
- Test: `ios/AppTests/TakeLinkTests.swift`; modify `ios/AppTests/SignalTests.swift`.

**Interfaces:**
- Produces `SessionState` (`until: Date?`, `isOn(at:)`, `.off`, `.file`, `read(from:)`, `write(to:)`).
- Produces `TakeLink` (`scheme`, `url(for:scheme:) -> URL?`, `take(in:scheme:) -> UUID?`).
- Produces `Signal.end`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Suite struct TakeLinkTests {
    let take = UUID()

    @Test func aLinkCarriesTheKeyboardsTake() throws {
        let url = try #require(TakeLink.url(for: take, scheme: "com.example.murmur"))
        #expect(url.absoluteString == "com.example.murmur://take?id=\(take.uuidString)")
        #expect(TakeLink.take(in: url, scheme: "com.example.murmur") == take)
    }

    /// Only our own scheme and host, with a real id, start a take.
    @Test func otherLinksStartNothing() throws {
        let scheme = "com.example.murmur"
        for link in ["https://murmurapp.app/take?id=\(take.uuidString)", "\(scheme)://settings?id=\(take.uuidString)", "\(scheme)://take?id=nope", "\(scheme)://take"] {
            #expect(TakeLink.take(in: try #require(URL(string: link)), scheme: scheme) == nil)
        }
        #expect(TakeLink.url(for: take, scheme: "") == nil)
    }

    /// The app's own build carries its scheme, the bundle id.
    @Test func theAppKnowsItsScheme() {
        #expect(TakeLink.scheme == Bundle.main.bundleIdentifier)
    }

    @Test func theSessionReadsOffUntilTold() {
        let file = FileManager.default.temporaryDirectory.appending(path: "state-\(UUID().uuidString).json")
        #expect(SessionState.read(from: file) == .off)
        SessionState(until: .now.addingTimeInterval(60)).write(to: file)
        #expect(SessionState.read(from: file).isOn())
        #expect(!SessionState(until: .now.addingTimeInterval(-1)).isOn())
        #expect(!SessionState.off.isOn())
    }
}
```

In `ios/AppTests/SignalTests.swift`, change `#expect(Set(Signal.allCases.map(\.name)).count == 5)` to `== 6`.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'TakeLink' in scope`.

- [ ] **Step 3: Write the state, the link, and the signal**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The listening session as the keyboard sees it (ios/prd.json IOS-009):
// on until a time, or off. The app writes it to the app group; the
// keyboard reads it to know whether a tap can start a take without leaving
// your app.
import Foundation

struct SessionState: Codable, Equatable, Sendable {
    /// When the session ends unless another take comes first; nil when off.
    var until: Date?

    func isOn(at now: Date = .now) -> Bool {
        until.map { $0 > now } ?? false
    }

    static let off = SessionState(until: nil)

    /// session.json in the app group, or nil without the entitlement.
    static var file: URL? {
        AppGroup.containerURL?.appending(path: "session.json")
    }

    /// The state in the file, off when there is none.
    static func read(from file: URL? = file) -> SessionState {
        guard let file, let data = try? Data(contentsOf: file) else { return .off }
        return (try? JSONDecoder().decode(SessionState.self, from: data)) ?? .off
    }

    func write(to file: URL? = SessionState.file) {
        guard let file, let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The link the keyboard opens murmur with when no session is running
// (ios/prd.json IOS-009): <scheme>://take?id=<the keyboard's take id>. The
// scheme is MURMUR_BUNDLE_ID from project.yml, which both targets'
// Info.plist carry as MurmurURLScheme, so a self-built copy never opens
// ours.
import Foundation

enum TakeLink {
    static let scheme = Bundle.main.object(forInfoDictionaryKey: "MurmurURLScheme") as? String ?? ""

    static func url(for take: UUID, scheme: String = scheme) -> URL? {
        guard !scheme.isEmpty else { return nil }
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = "take"
        parts.queryItems = [URLQueryItem(name: "id", value: take.uuidString)]
        return parts.url
    }

    /// The take a link asks for, or nil for any other link.
    static func take(in url: URL, scheme: String = scheme) -> UUID? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == scheme.lowercased(), parts.host == "take",
              let id = parts.queryItems?.first(where: { $0.name == "id" })?.value
        else { return nil }
        return UUID(uuidString: id)
    }
}
```

In `ios/Shared/Signals.swift`, change `case start, stop, cancel, changed, busy` to `case start, stop, cancel, changed, busy, end`. In the file's opening comment, change "The keyboard says start, stop, and cancel;" to "The keyboard says start, stop, cancel, and end (End session, IOS-009);".

In `ios/App/Keyboard/KeyboardBridge.swift`, change `case .changed, .busy:` to `case .changed, .busy, .end:`, so the switch stays exhaustive.

In `ios/project.yml`, in the `murmur` target's `info.properties`, after `MurmurAppGroup: $(MURMUR_APP_GROUP)`, add:

```yaml
        # The keyboard opens murmur with <scheme>://take (IOS-009); the
        # bundle id keeps the scheme unique to each build.
        MurmurURLScheme: $(MURMUR_BUNDLE_ID)
        CFBundleURLTypes:
          - CFBundleURLName: $(MURMUR_BUNDLE_ID)
            CFBundleURLSchemes: [$(MURMUR_BUNDLE_ID)]
```

In the `murmurKeyboard` target's `info.properties`, after `MurmurAppGroup: $(MURMUR_APP_GROUP)`, add `MurmurURLScheme: $(MURMUR_BUNDLE_ID)`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `TakeLinkTests` passes (4 tests), `SignalTests` passes, and the app total is 125. Run `npm run test` too: the keyboard network test passes with the new shared files.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Shared/SessionState.swift ios/Shared/TakeLink.swift ios/Shared/Signals.swift ios/App/Keyboard/KeyboardBridge.swift ios/project.yml ios/AppTests/TakeLinkTests.swift ios/AppTests/SignalTests.swift
git commit -m "IOS-009: the keyboard can read whether a session runs, open murmur with its take, and say end"
```

### Task 3: The session

**Files:** Create `ios/App/Session/Session.swift`. Test `ios/AppTests/SessionTests.swift`.

**Interfaces:**
- Consumes `WarmMicrophone` (Task 1), `SessionState` and `Signal.end` (Task 2), and `TakeModel`.
- Produces `Session`:
  - `Length` (`.five`, `.fifteen`, `.hour`; `seconds`);
  - `until`, `length`, and `isOn`;
  - `init(microphone:model:defaults:stateFile:seconds:announce:)`;
  - `listen()`, `begin() async -> Bool`, `end()`, `choose(_:)`, and `interrupted()`;
  - `Session.live()`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import AVFoundation
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct SessionTests {
    let groq = "https://api.groq.com/openai/v1"
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let file = FileManager.default.temporaryDirectory.appending(path: "session-\(UUID().uuidString).json")
    let announced = Announced()

    @MainActor final class Announced {
        var signals: [Signal] = []
    }

    init() throws {
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        CleanupStore(defaults: defaults).save(CleanupSettings(polish: false))
    }

    func model(_ provider: FakeProvider) throws -> TakeModel {
        TakeModel(
            microphone: microphone,
            store: WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "session-takes-\(UUID().uuidString)", directoryHint: .isDirectory)),
            rules: try BundledRules.takeRules(), catalog: try BundledRules.catalog(),
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: provider.send, copy: { _ in }
        )
    }

    /// A session whose every length lasts the given seconds.
    func session(_ model: TakeModel, lasting seconds: TimeInterval = 60) -> Session {
        let session = Session(microphone: microphone, model: model, defaults: defaults, stateFile: file, seconds: { _ in seconds }) { [announced] signal in
            announced.signals.append(signal)
        }
        session.listen()
        return session
    }

    func waitUntil(_ done: @MainActor () -> Bool) async throws {
        for _ in 0..<150 where !done() {
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    @Test func aSessionKeepsTheMicrophoneWarmBetweenTakes() async throws {
        let model = try model(.says("One."))
        let session = session(model)
        #expect(await session.begin())
        #expect(microphone.isWarm)
        #expect(SessionState.read(from: file).isOn())
        await model.start()
        await model.stop()
        #expect(model.state == .words("One."))
        #expect(microphone.isWarm)
        #expect(session.isOn)
    }

    @Test func withoutASessionATakeLetsTheMicrophoneGo() async throws {
        let model = try model(.says("One."))
        _ = session(model)
        await model.start()
        await model.stop()
        #expect(!microphone.isWarm)
    }

    @Test func theSessionEndsByItselfAfterItsLength() async throws {
        let session = session(try model(.says("x")), lasting: 0.2)
        #expect(await session.begin())
        try await waitUntil { !session.isOn }
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
        #expect(SessionState.read(from: file) == .off)
        #expect(announced.signals.last == .changed)
    }

    /// The length counts from the end of your last take.
    @Test func eachTakeCountsTheLengthAgain() async throws {
        let model = try model(.says("x"))
        let session = session(model, lasting: 0.5)
        #expect(await session.begin())
        let first = try #require(session.until)
        try await Task.sleep(for: .milliseconds(300))
        await model.start()
        await model.stop()
        try await waitUntil { session.until != first }
        #expect(try #require(session.until) > first.addingTimeInterval(0.2))
        #expect(session.isOn)
    }

    /// A take still recording when the length runs out keeps the session
    /// until it ends.
    @Test func aTakeInProgressHoldsTheSession() async throws {
        let model = try model(.says("A long thought."))
        let session = session(model, lasting: 0.2)
        #expect(await session.begin())
        await model.start()
        try await Task.sleep(for: .milliseconds(400))
        #expect(session.isOn)
        #expect(model.isRecording)
        await model.stop()
        #expect(model.state == .words("A long thought."))
        try await waitUntil { !session.isOn }
        #expect(!session.isOn)
    }

    /// End session finishes a take in progress as if you tapped stop.
    @Test func endSessionProcessesATakeInProgress() async throws {
        let model = try model(.says("Keep these words."))
        let session = session(model)
        #expect(await session.begin())
        await model.start()
        session.end()
        try await waitUntil { model.state == .words("Keep these words.") }
        #expect(model.state == .words("Keep these words."))
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
        #expect(SessionState.read(from: file) == .off)
    }

    /// A call, Siri, or another app taking the microphone ends the session,
    /// and the take in progress is processed.
    @Test func anInterruptionEndsTheSession() async throws {
        let model = try model(.says("Before the call."))
        let session = session(model)
        #expect(await session.begin())
        await model.start()
        NotificationCenter.default.post(
            name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue]
        )
        try await waitUntil { model.state == .words("Before the call.") }
        #expect(model.state == .words("Before the call."))
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
    }

    /// Without a session, an interruption still processes the take.
    @Test func anInterruptionStopsATakeWithoutASession() async throws {
        let model = try model(.says("Before the call."))
        let session = session(model)
        await model.start()
        session.interrupted()
        try await waitUntil { model.state == .words("Before the call.") }
        #expect(model.state == .words("Before the call."))
    }

    @Test func theLengthDefaultsToFifteenMinutesAndIsRemembered() throws {
        let model = try model(.says("x"))
        let first = session(model)
        #expect(first.length == .fifteen)
        first.choose(.five)
        #expect(session(model).length == .five)
        #expect(Session.Length.allCases.map(\.seconds) == [300, 900, 3600])
    }

    @Test func aDeniedMicrophoneStartsNoSession() async throws {
        microphone.allowed = false
        let session = session(try model(.says("x")))
        #expect(await session.begin() == false)
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
    }

    /// A session never outlives the app that ran it: a new app says off.
    @Test func aNewAppSaysTheSessionIsOff() throws {
        SessionState(until: .now.addingTimeInterval(600)).write(to: file)
        _ = session(try model(.says("x")))
        #expect(SessionState.read(from: file) == .off)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'Session' in scope`.

- [ ] **Step 3: Write the session**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The listening session (ios/prd.json IOS-009): while it runs, the
// microphone stays warm in the background (iOS shows its orange dot), so
// a tap on the pill in any app starts a take at once. It ends by itself
// after the length you picked, counted from your last take, when you end
// it here or from the keyboard, or when a call, Siri, or another app takes
// the microphone. Nothing it hears between takes is kept, written, or
// sent: the warm microphone drops it as it arrives.
import AVFoundation
import Foundation
import Observation

@Observable @MainActor final class Session {
    enum Length: Int, CaseIterable, Sendable {
        case five = 5, fifteen = 15, hour = 60

        var seconds: TimeInterval { TimeInterval(rawValue) * 60 }
    }

    static let lengthKey = "sessionLength"

    /// When the session ends unless another take comes first; nil when off.
    private(set) var until: Date?
    private(set) var length: Length

    var isOn: Bool { until != nil }

    @ObservationIgnored private let microphone: any WarmMicrophone
    @ObservationIgnored private let model: TakeModel
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let stateFile: URL?
    /// A length in seconds; only the smoke and the tests shorten it.
    @ObservationIgnored private let seconds: @MainActor (Length) -> TimeInterval
    @ObservationIgnored private let announce: @MainActor (Signal) -> Void
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var listener: SignalListener?
    @ObservationIgnored private var interruptions: (any NSObjectProtocol)?

    init(
        microphone: any WarmMicrophone, model: TakeModel, defaults: UserDefaults = .standard, stateFile: URL? = SessionState.file,
        seconds: @escaping @MainActor (Length) -> TimeInterval = { $0.seconds }, announce: @escaping @MainActor (Signal) -> Void = { $0.post() }
    ) {
        self.microphone = microphone
        self.model = model
        self.defaults = defaults
        self.stateFile = stateFile
        self.seconds = seconds
        self.announce = announce
        length = Length(rawValue: defaults.integer(forKey: Self.lengthKey)) ?? .fifteen
    }

    /// Hears End session from the keyboard and interruptions from iOS,
    /// follows the takes, and says the session is off: a session never
    /// outlives the app that ran it.
    func listen() {
        listener = SignalListener([.end]) { [weak self] _ in self?.end() }
        interruptions = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            guard type == AVAudioSession.InterruptionType.began.rawValue else { return }
            MainActor.assumeIsolated { self?.interrupted() }
        }
        follow()
        publish()
    }

    /// Starts the session, or counts its length again from now. False when
    /// murmur may not use the microphone, or there is none.
    func begin() async -> Bool {
        guard await microphone.allow() else { return false }
        microphone.holdWarm = true
        do {
            try microphone.warmUp()
        } catch {
            microphone.holdWarm = false
            return false
        }
        extend()
        return true
    }

    /// Ends the session at once. A take still recording stops and is
    /// processed, as if you had tapped stop.
    func end() {
        timer?.cancel()
        timer = nil
        microphone.holdWarm = false
        if model.isRecording {
            Task { await model.stop() }
        } else {
            microphone.coolDown()
        }
        guard until != nil else { return }
        until = nil
        publish()
    }

    func choose(_ length: Length) {
        self.length = length
        defaults.set(length.rawValue, forKey: Self.lengthKey)
        if isOn { extend() }
    }

    /// A call, Siri, or another app took the microphone: the session ends,
    /// and a take in progress is processed with what it heard.
    func interrupted() {
        if isOn {
            end()
        } else if model.isRecording {
            Task { await model.stop() }
        }
    }

    /// Counts the length from now.
    private func extend() {
        let wait = seconds(length)
        until = .now.addingTimeInterval(wait)
        publish()
        timer?.cancel()
        timer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard !Task.isCancelled else { return }
            self?.lapse()
        }
    }

    /// The length ran out. A take still running keeps the session until it
    /// ends, and the length counts again from then.
    private func lapse() {
        guard isOn, !model.isRecording, !model.isBusy else { return }
        end()
    }

    /// Each take that ends counts the length again from its end.
    private func follow() {
        withObservationTracking {
            _ = model.state
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if self.isOn, !self.model.isRecording, !self.model.isBusy { self.extend() }
                self.follow()
            }
        }
    }

    private func publish() {
        SessionState(until: until).write(to: stateFile)
        announce(.changed)
    }
}

extension Session {
    private static var shared: Session?

    /// The one session for the app's life, on the app's take model and the
    /// device microphone.
    static func live() -> Session? {
        if let shared { return shared }
        guard let model = TakeModel.live() else { return nil }
        let session = Session(microphone: DeviceMicrophone.shared, model: model)
        session.listen()
        shared = session
        return session
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `SessionTests` passes (11 tests), and the app total is 136.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Session/Session.swift ios/AppTests/SessionTests.swift
git commit -m "IOS-009: a session keeps the microphone warm until its length runs out after your last take"
```

### Task 4: The bridge takes a take from a link

**Files:**
- Modify (whole file below): `ios/App/Keyboard/KeyboardBridge.swift`.
- Modify: `ios/App/ContentView.swift`, `ios/AppTests/KeyboardBridgeTests.swift`.

**Interfaces:**
- Produces `KeyboardBridge.opened(_ id: UUID)` and `KeyboardBridge.live() -> KeyboardBridge?`, which replaces `startOnce()`.

- [ ] **Step 1: Write the failing tests**

In `ios/AppTests/KeyboardBridgeTests.swift`, before `/// A stop with no keyboard take running does nothing.`, add:

```swift
    /// The keyboard opened murmur with a link (IOS-009): the take starts
    /// however long murmur took to open.
    @Test func anOpenedTakeStartsFromItsLink() async throws {
        let model = try model(.says("From the link."))
        let bridge = bridge(model)
        let take = UUID()
        mailbox.ask(take, at: .now.addingTimeInterval(-30))
        bridge.opened(take)
        #expect(try await waitFor(.listening)?.take == take)
        try await waitUntilRecording(model)
        bridge.hear(.stop)
        let ready = try #require(try await waitFor(.ready))
        #expect(ready.take == take)
        #expect(ready.words == "From the link.")
    }

    /// The ask the keyboard left before opening murmur is used up by the
    /// link, so a start after it never begins a second take, and the same
    /// link twice is one take.
    @Test func theLinksAskIsUsedUp() async throws {
        let model = try model(.says("x"))
        let bridge = bridge(model)
        let take = UUID()
        mailbox.ask(take)
        bridge.opened(take)
        bridge.opened(take)
        #expect(announced.signals.contains(.busy) == false)
        try await waitUntilRecording(model)
        model.cancel()
        #expect(try await waitFor(.nothing)?.take == take)
        bridge.hear(.start)
        try await Task.sleep(for: .milliseconds(100))
        #expect(!model.isRecording)
        #expect(mailbox.read()?.phase == .nothing)
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `value of type 'KeyboardBridge' has no member 'opened'`.

- [ ] **Step 3: Write the link's way in**

`ios/App/Keyboard/KeyboardBridge.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The app's side of the keyboard (ios/prd.json IOS-008): it hears the
// keyboard's start, stop, and cancel, runs the take on the app's one take
// model under the id the keyboard asked with, and tells the keyboard how
// it goes through the mailbox. Only a take the keyboard started goes to
// the mailbox, so a take made on the Dictate screen never turns up in
// another app.
import Foundation
import Observation

@MainActor final class KeyboardBridge {
    /// How long a keyboard's ask stays good. One that waited longer, sent
    /// while murmur was not running, is dropped.
    static let askLife: TimeInterval = 3

    private let model: TakeModel
    private let mailbox: Mailbox
    private let announce: @MainActor (Signal) -> Void
    private var listener: SignalListener?
    /// The take the keyboard asked for, until it ends.
    private var take: UUID?
    /// A cancel heard while the take was still starting.
    private var cancelled = false
    private var startedAt = Date.distantPast

    init(model: TakeModel, mailbox: Mailbox, announce: @escaping @MainActor (Signal) -> Void = { $0.post() }) {
        self.model = model
        self.mailbox = mailbox
        self.announce = announce
    }

    /// Hears the keyboard from now on and follows the take model.
    func listen() {
        listener = SignalListener([.start, .stop, .cancel]) { [weak self] signal in
            self?.hear(signal)
        }
        follow()
    }

    func hear(_ signal: Signal) {
        switch signal {
        case .start:
            guard let id = mailbox.answer(within: Self.askLife) else { return }
            begin(id)
        case .stop:
            guard take != nil, model.isRecording else { return }
            Task { await model.stop() }
        case .cancel:
            guard take != nil else { return }
            if model.isRecording { model.cancel() } else { cancelled = true }
        case .changed, .busy, .end:
            break
        }
    }

    /// The keyboard opened murmur with a take link (IOS-009). The link is
    /// the ask, however long murmur took to open, so the ask it left in
    /// the mailbox is used up here and never starts a second take.
    func opened(_ id: UUID) {
        _ = mailbox.answer(within: .infinity)
        // The same link twice (the keyboard opened murmur after a start it
        // sent went unanswered) is one take.
        guard take != id else { return }
        begin(id)
    }

    private func begin(_ id: UUID) {
        guard take == nil, !model.isRecording, !model.isBusy else {
            announce(.busy)
            return
        }
        take = id
        startedAt = .now
        cancelled = false
        // Written here, not read from the model, whose state may still
        // be the last take's words.
        write(.listening)
        Task { await settle(id) }
    }

    /// Settles how the start went. A start that did not record ends failed
    /// here: the model's state may not change at all (denied twice), and
    /// following it alone would leave the take open forever.
    private func settle(_ id: UUID) async {
        await model.start()
        guard take == id else { return }
        if cancelled {
            model.cancel()
            write(.nothing, ends: true)
        } else if !model.isRecording {
            write(.failed, ends: true)
        }
    }

    /// Publishes each change of the take model's state, for as long as the
    /// bridge lives.
    private func follow() {
        withObservationTracking {
            _ = model.state
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.publish()
                self?.follow()
            }
        }
    }

    private func publish() {
        guard take != nil else { return }
        switch model.state {
        case .recording: write(.listening)
        case .transcribing: write(.working)
        case .words(let text): write(.ready, words: text, ends: true)
        case .heardNothing: write(.nothing, ends: true)
        case .failed, .micOff, .micFailed: write(.failed, ends: true)
        // Idle again after the take began: it was cancelled.
        case .idle: write(.nothing, ends: true)
        }
    }

    private func write(_ phase: MailboxEntry.Phase, words: String? = nil, ends: Bool = false) {
        guard let take else { return }
        mailbox.write(MailboxEntry(take: take, phase: phase, words: words, at: startedAt))
        announce(.changed)
        if ends { self.take = nil }
    }
}

extension KeyboardBridge {
    private static var shared: KeyboardBridge?

    /// The one bridge for the app's life, on the app's take model, started
    /// by whichever comes first: the app's first screen or a take link.
    static func live() -> KeyboardBridge? {
        if let shared { return shared }
        guard let model = TakeModel.live(), let mailbox = Mailbox.shared else { return nil }
        let bridge = KeyboardBridge(model: model, mailbox: mailbox)
        bridge.listen()
        shared = bridge
        return bridge
    }
}
```

In `ios/App/ContentView.swift`, change `.task { KeyboardBridge.startOnce() }` to `.task { _ = KeyboardBridge.live() }`. Task 6 replaces the whole file.

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `KeyboardBridgeTests` passes (14 tests), and the app total is 138.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Keyboard/KeyboardBridge.swift ios/App/ContentView.swift ios/AppTests/KeyboardBridgeTests.swift
git commit -m "IOS-009: a take link starts the keyboard's take however long murmur took to open"
```

### Task 5: The pad opens murmur and remembers its take

**Files:**
- Modify: `ios/Shared/Pad.swift`, `ios/AppTests/PadTests.swift`.
- Modify (whole file below): `ios/Keyboard/KeyboardViewController.swift`.

**Interfaces:**
- Produces `Pad.opening`, `Pad.openRefused`, and `Pad.Waiting`:
  - fields `take`, `opened`, `field`, and `at`;
  - `life` and `key`;
  - `load(from:now:)`, `save(_:to:)`, and `sameField(as:)`.
- Consumes `SessionState`, `TakeLink`, and `Signal.end` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `ios/AppTests/PadTests.swift`, replace `thePadsOwnLinesReadPlainly` with these three tests:

```swift
    @Test func thePadsOwnLinesReadPlainly() {
        for line in [Pad.noAnswer, Pad.busy, Pad.stoppedAnswering, Pad.opening, Pad.openRefused] {
            #expect(!line.contains("Murmur"))
        }
        #expect(Pad.openRefused == "Open murmur to start")
    }

    /// The take a keyboard waits on outlives the keyboard: the one you
    /// swipe back to from murmur knows it, until it grows too old.
    @Test func aWaitingTakeOutlivesTheKeyboard() throws {
        let defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        let start = Date(timeIntervalSince1970: 1_790_000_000)
        let waiting = Pad.Waiting(take: take, opened: true, field: nil, at: start)
        Pad.Waiting.save(waiting, to: defaults)
        #expect(Pad.Waiting.load(from: defaults, now: start.addingTimeInterval(60)) == waiting)
        #expect(Pad.Waiting.load(from: defaults, now: start.addingTimeInterval(Pad.Waiting.life + 1)) == nil)
        Pad.Waiting.save(nil, to: defaults)
        #expect(Pad.Waiting.load(from: defaults, now: start) == nil)
    }

    /// A take that opened murmur lands in the field you come back to; one
    /// started in place lands only in its own field.
    @Test func anOpenedTakeLandsWhereYouComeBack() {
        let field = UUID()
        let opened = Pad.Waiting(take: take, opened: true, field: nil, at: .now)
        #expect(opened.sameField(as: field))
        #expect(opened.sameField(as: nil))
        let inPlace = Pad.Waiting(take: take, opened: false, field: field, at: .now)
        #expect(inPlace.sameField(as: field))
        #expect(!inPlace.sameField(as: UUID()))
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `type 'Pad' has no member 'opening'`.

- [ ] **Step 3: Write the pad's memory and the keyboard**

In `ios/Shared/Pad.swift`, after `static let stoppedAnswering = ...`, add:

```swift
    /// While iOS opens murmur for the first take of a session (IOS-009), and
    /// when iOS will not.
    static let opening = "Opening murmur"
    static let openRefused = "Open murmur to start"
```

Then, before `/// The return key's name, following the field's return key type.`, add:

```swift
    /// The take this keyboard is waiting on, kept in the keyboard's own
    /// defaults: opening murmur closes the keyboard, and the one you swipe
    /// back to is a new one that has to know the take is its own.
    struct Waiting: Codable, Equatable {
        let take: UUID
        /// Started by opening murmur, so the words land in the field you come
        /// back to, and leaving the keyboard does not cancel it.
        let opened: Bool
        /// The field the take began in; for an opened take, the field the
        /// keyboard came back to.
        var field: UUID?
        let at: Date

        /// A take waited on longer than this is let go: its words, if any,
        /// wait as Insert last.
        static let life: TimeInterval = 10 * 60
        static let key = "waitingTake"

        static func load(from defaults: UserDefaults, now: Date = .now) -> Waiting? {
            guard let data = defaults.data(forKey: key), let waiting = try? JSONDecoder().decode(Waiting.self, from: data),
                  now.timeIntervalSince(waiting.at) < life
            else { return nil }
            return waiting
        }

        static func save(_ waiting: Waiting?, to defaults: UserDefaults) {
            if let waiting, let data = try? JSONEncoder().encode(waiting) {
                defaults.set(data, forKey: key)
            } else {
                defaults.removeObject(forKey: key)
            }
        }

        /// Whether the cursor is in the take's field. An opened take adopts
        /// the first field the keyboard comes back to.
        func sameField(as current: UUID?) -> Bool {
            field == nil || field == current
        }
    }
```

`ios/Keyboard/KeyboardViewController.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The murmur keyboard, a dictation pad (ios/prd.json IOS-008, IOS-009):
// tap the pill to start a take and again to stop it. With no session
// running, the first tap opens murmur, which starts one already
// listening; you swipe back and keep talking. During a session a tap
// starts a take without leaving your app. The keyboard only asks the app
// for a take under its own id, signals it (start, stop, cancel, end), and
// reads the mailbox; it never touches the microphone or the network.
// Words land at the cursor once, or wait as Insert last when you left the
// field before they arrived.
import UIKit

final class KeyboardViewController: UIInputViewController {
    private let pad = PadView()
    private let memory = UserDefaults.standard
    private var listener: SignalListener?
    /// The take this keyboard is waiting on, kept across keyboards.
    private var waiting: Pad.Waiting? {
        didSet { Pad.Waiting.save(waiting, to: memory) }
    }
    /// The phase of that take, as the mailbox last said.
    private var phase: MailboxEntry.Phase?
    private var visible = false
    private var deleteRepeat: Timer?
    private var noAnswer: Timer?

    override func viewDidLoad() {
        super.viewDidLoad()
        pad.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(pad)
        let height = view.heightAnchor.constraint(equalToConstant: 236)
        height.priority = .defaultHigh
        NSLayoutConstraint.activate([
            height,
            pad.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            pad.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            pad.topAnchor.constraint(equalTo: view.topAnchor),
            pad.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        pad.globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        pad.pill.addTarget(self, action: #selector(tapPill), for: .touchUpInside)
        pad.space.addTarget(self, action: #selector(tapSpace), for: .touchUpInside)
        pad.returnKey.addTarget(self, action: #selector(tapReturn), for: .touchUpInside)
        pad.insertLast.addTarget(self, action: #selector(tapInsertLast), for: .touchUpInside)
        pad.delete.addTarget(self, action: #selector(deleteDown), for: .touchDown)
        pad.delete.addTarget(self, action: #selector(deleteUp), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        listener = SignalListener([.changed, .busy]) { [weak self] signal in
            signal == .busy ? self?.heardBusy() : self?.refresh()
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        visible = true
        pad.setFullAccess(hasFullAccess)
        waiting = Pad.Waiting.load(from: memory)
        // A take that opened murmur lands in the field you come back to.
        if var opened = waiting, opened.opened, opened.field == nil {
            opened.field = textDocumentProxy.documentIdentifier
            waiting = opened
        }
        refresh()
        // Back from murmur, its take should be in the mailbox by now.
        if waiting?.opened == true, phase == nil { expectAnswer(within: 3, else: Pad.noAnswer) }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        visible = false
        // A take still starting or listening when the keyboard goes away is
        // dropped; one being transcribed comes back as Insert last. A take
        // that opened murmur goes on: the keyboard left so you could go there.
        if let waiting, !waiting.opened, phase == nil || phase == .listening {
            Signal.cancel.post()
            end(nil)
        }
        noAnswer?.invalidate()
        deleteUp()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        pad.globe.isHidden = !needsInputModeSwitchKey
        setReturnTitle()
    }

    override func textDidChange(_ textInput: (any UITextInput)?) {
        super.textDidChange(textInput)
        setReturnTitle()
    }

    @objc private func tapPill() {
        switch (waiting, phase) {
        case (.some, .listening?):
            Signal.stop.post()
            // The app moves on to working within a moment; when it does not,
            // it is no longer there.
            expectAnswer(within: 4, else: Pad.stoppedAnswering)
        case (.some, _):
            // This keyboard's take is still starting or being transcribed.
            break
        case (nil, _):
            let take = UUID()
            guard let mailbox = Mailbox.shared else { return }
            mailbox.ask(take)
            pad.insertLast.isHidden = true
            phase = nil
            if SessionState.read().isOn() {
                waiting = Pad.Waiting(take: take, opened: false, field: textDocumentProxy.documentIdentifier, at: .now)
                pad.status.text = "Starting"
                Signal.start.post()
                // A running session answers within a moment; when it does not,
                // murmur was closed, so open it.
                expectAnswer(within: 2) { [weak self] in
                    Signal.cancel.post()
                    self?.openMurmur(take)
                }
            } else {
                openMurmur(take)
            }
        }
    }

    /// Opens murmur with the take's link; murmur starts the session and the
    /// take, and you swipe back.
    private func openMurmur(_ take: UUID) {
        Mailbox.shared?.ask(take)
        guard let url = TakeLink.url(for: take), let scene = view.window?.windowScene else {
            end(Pad.openRefused)
            return
        }
        waiting = Pad.Waiting(take: take, opened: true, field: nil, at: .now)
        pad.status.text = Pad.opening
        scene.open(url, options: nil) { [weak self] opened in
            MainActor.assumeIsolated {
                if !opened, self?.waiting?.take == take { self?.end(Pad.openRefused) }
            }
        }
    }

    /// Ends the take with a line when the mailbox has not moved on in time.
    private func expectAnswer(within seconds: TimeInterval, else line: String) {
        expectAnswer(within: seconds) { [weak self] in
            Signal.cancel.post()
            self?.end(line)
        }
    }

    private func expectAnswer(within seconds: TimeInterval, otherwise: @escaping @MainActor () -> Void) {
        let waitingOn = phase
        noAnswer?.invalidate()
        noAnswer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.visible, self.waiting != nil, self.phase == waitingOn else { return }
                otherwise()
            }
        }
    }

    private func heardBusy() {
        guard waiting != nil, phase == nil else { return }
        noAnswer?.invalidate()
        end(Pad.busy)
    }

    @objc private func tapInsertLast() {
        if let words = Mailbox.shared?.claim() { insert(words) }
        pad.insertLast.isHidden = true
    }

    @objc private func tapSpace() { textDocumentProxy.insertText(" ") }
    @objc private func tapReturn() { textDocumentProxy.insertText("\n") }

    /// Delete repeats while held, after a short pause.
    @objc private func deleteDown() {
        textDocumentProxy.deleteBackward()
        deleteRepeat?.invalidate()
        deleteRepeat = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.deleteRepeat = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
                    MainActor.assumeIsolated { self?.textDocumentProxy.deleteBackward() }
                }
            }
        }
    }

    @objc private func deleteUp() {
        deleteRepeat?.invalidate()
        deleteRepeat = nil
    }

    private func setReturnTitle() {
        let title = Pad.returnTitle(textDocumentProxy.returnKeyType ?? .default)
        guard pad.returnKey.configuration?.title != title else { return }
        var look = pad.returnKey.configuration
        look?.title = title
        pad.returnKey.configuration = look
        pad.returnKey.accessibilityLabel = title
    }

    /// A long press on the pill holds End session while one runs.
    private func setSessionMenu() {
        guard SessionState.read().isOn() else {
            pad.pill.menu = nil
            return
        }
        pad.pill.menu = UIMenu(children: [
            UIAction(title: "End session", image: UIImage(systemName: "stop.circle")) { _ in Signal.end.post() }
        ])
    }

    /// Reads the mailbox and does what the newest entry asks, only while
    /// this keyboard is on screen.
    private func refresh() {
        guard visible, hasFullAccess, let mailbox = Mailbox.shared else { return }
        setSessionMenu()
        let entry = mailbox.read()
        if let entry, entry.take == waiting?.take, entry.phase != phase {
            phase = entry.phase
            noAnswer?.invalidate()
            // Transcribing and polish can take a while, but not forever.
            if phase == .working { expectAnswer(within: 90, else: Pad.stoppedAnswering) }
        }
        pad.setListening(waiting != nil && phase == .listening)
        let sameField = waiting?.sameField(as: textDocumentProxy.documentIdentifier) ?? false
        switch Pad.react(to: entry, mine: waiting?.take, sameField: sameField, visible: visible) {
        case .insert(let take):
            if let words = mailbox.claim(take) { insert(words) }
            end(nil)
        case .offerInsertLast:
            pad.insertLast.isHidden = false
            if entry?.take == waiting?.take { end(nil) }
        case .status(let line):
            pad.status.text = line
            if phase == .nothing || phase == .failed { end(line) }
        case .none:
            break
        }
    }

    private func insert(_ words: String) {
        textDocumentProxy.insertText(Pad.spaced(words, after: textDocumentProxy.documentContextBeforeInput))
    }

    private func end(_ line: String?) {
        waiting = nil
        phase = nil
        noAnswer?.invalidate()
        pad.setListening(false)
        pad.status.text = line
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `PadTests` passes, the keyboard extension builds with no warnings, and the app total is 140. Run `npm run test`: the keyboard network test passes.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Shared/Pad.swift ios/AppTests/PadTests.swift ios/Keyboard/KeyboardViewController.swift
git commit -m "IOS-009: the first tap opens murmur, and the keyboard you swipe back to knows its take"
```

### Task 6: The Recording and Session screens

**Files:**
- Create: `ios/App/Session/SessionCopy.swift`, `ios/App/Session/SessionScreen.swift`, `ios/App/Session/RecordingScreen.swift`.
- Modify (whole file below): `ios/App/ContentView.swift`.
- Test: `ios/AppTests/SessionCopyTests.swift`.

**Interfaces:**
- Produces `SessionCopy`, `SessionScreen(session:)`, `SessionRoute`, `RecordingScreen(model:)`, `LiveWave`, `SwipeGuide(still:)`, `TakeOpener` (`.shared`, `showing`, `open(_:) async`), and `RecordingRoute`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Suite struct SessionCopyTests {
    @Test func theLengthsReadAsPeopleSayThem() {
        #expect(Session.Length.allCases.map(SessionCopy.name) == ["5 minutes", "15 minutes", "1 hour"])
    }

    @Test func theStatusSaysWhenListeningEnds() {
        #expect(SessionCopy.status(until: nil) == "No session is running.")
        let until = Date(timeIntervalSince1970: 1_790_000_000)
        #expect(SessionCopy.status(until: until) == "Listening until \(until.formatted(date: .omitted, time: .shortened)).")
    }

    /// murmur stays lowercase, and no line uses a dash between clauses.
    @Test func everyLineFollowsTheWritingRules() {
        let lines = [
            SessionCopy.explain, SessionCopy.length, SessionCopy.lengthFooter, SessionCopy.end, SessionCopy.start, SessionCopy.startFooter,
            SessionCopy.recording, SessionCopy.stop, SessionCopy.guide, SessionCopy.guideStill, SessionCopy.micOff, SessionCopy.close
        ]
        for line in lines {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'SessionCopy' in scope`.

- [ ] **Step 3: Write the screens**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// What the session screens say (ios/prd.json IOS-009).
import Foundation

enum SessionCopy {
    static func name(_ length: Session.Length) -> String {
        switch length {
        case .five: "5 minutes"
        case .fifteen: "15 minutes"
        case .hour: "1 hour"
        }
    }

    static func status(until: Date?) -> String {
        guard let until else { return "No session is running." }
        return "Listening until \(until.formatted(date: .omitted, time: .shortened))."
    }

    static let explain = "Your first tap on the pill opens murmur and starts a session. Until it ends, a tap starts a take without leaving your app. murmur keeps nothing it hears between takes."
    static let length = "Keep listening for"
    static let lengthFooter = "Counted from your last take."
    static let end = "End session"
    static let start = "Start session"
    static let startFooter = "Starts listening now, so a tap on the pill in any app starts a take at once."

    static let recording = "Recording"
    static let stop = "Stop"
    static let guide = "Swipe right along the bottom edge to go back to your app. Keep talking; it all counts."
    static let guideStill = "Swipe right along the bottom edge to go back to your app."
    static let micOff = "murmur needs the microphone. Open Settings, then murmur, and turn on Microphone."
    static let close = "Close"
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Session screen (ios/prd.json IOS-009): whether a session is running,
// how long it keeps listening after your last take, and End session.
import SwiftUI

struct SessionScreen: View {
    @Bindable var session: Session
    @State private var refused = false

    var body: some View {
        List {
            Section {
                Text(SessionCopy.status(until: session.until))
                    .foregroundStyle(Tokens.text)
            } footer: {
                Text(SessionCopy.explain)
            }
            .listRowBackground(Tokens.panel)
            Section {
                ForEach(Session.Length.allCases, id: \.self) { length in
                    Button {
                        session.choose(length)
                    } label: {
                        HStack {
                            Text(SessionCopy.name(length)).foregroundStyle(Tokens.text)
                            Spacer()
                            if session.length == length {
                                Image(systemName: "checkmark").foregroundStyle(Tokens.brand)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .accessibilityAddTraits(session.length == length ? .isSelected : [])
                }
            } header: {
                Text(SessionCopy.length)
            } footer: {
                Text(SessionCopy.lengthFooter)
            }
            .listRowBackground(Tokens.panel)
            Section {
                if session.isOn {
                    Button(SessionCopy.end) { session.end() }
                        .foregroundStyle(Tokens.brand)
                } else {
                    Button(SessionCopy.start) {
                        Task { refused = await !session.begin() }
                    }
                    .foregroundStyle(Tokens.brand)
                }
            } footer: {
                if refused, !session.isOn {
                    Text(SessionCopy.micOff).foregroundStyle(Tokens.red)
                } else if !session.isOn {
                    Text(SessionCopy.startFooter)
                }
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .navigationTitle("Session")
    }
}

/// Opens the Session screen on the app's one session.
struct SessionRoute: View {
    var body: some View {
        if let session = Session.live() {
            SessionScreen(session: session)
        }
    }
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Where the keyboard's first tap lands (ios/prd.json IOS-009): murmur,
// already recording, with the live waveform large and a guide along the
// bottom edge showing the swipe right that takes you back to your app.
// Everything you say from the moment it opens counts. The screen closes
// itself when the take ends.
import SwiftUI

struct RecordingScreen: View {
    let model: TakeModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            if model.state == .micOff || model.state == .micFailed {
                Note(text: SessionCopy.micOff, color: Tokens.red, symbol: "mic.slash")
                Button(SessionCopy.close) { dismiss() }
                    .foregroundStyle(Tokens.brand)
                    .frame(minHeight: 44)
                Spacer()
            } else {
                LiveWave(model: model)
                    .frame(height: 160)
                    .accessibilityHidden(true)
                HStack(spacing: 10) {
                    Circle().fill(Tokens.amber).frame(width: 10, height: 10)
                    Text(SessionCopy.recording)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Tokens.text)
                }
                .accessibilityElement(children: .combine)
                Button {
                    Task { await model.stop() }
                } label: {
                    Text(SessionCopy.stop)
                        .font(.body.weight(.semibold))
                        .padding(.horizontal, 32)
                        .frame(minHeight: 44)
                        .overlay(Capsule().stroke(Tokens.amber, lineWidth: 1.5))
                }
                .foregroundStyle(Tokens.amber)
                .disabled(!model.isRecording)
                Spacer()
                SwipeGuide(still: reduceMotion)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.ink)
        .onChange(of: model.isRecording) { was, now in
            if was, !now { dismiss() }
        }
    }
}

/// The take's loudness over the last moments, as bars that scroll from
/// right to left, in live amber.
struct LiveWave: View {
    let model: TakeModel
    @State private var levels = [Float](repeating: 0, count: 48)

    var body: some View {
        Canvas { context, size in
            let gap: CGFloat = 4
            let width = (size.width - gap * CGFloat(levels.count - 1)) / CGFloat(levels.count)
            for (index, level) in levels.enumerated() {
                let height = max(width, CGFloat(level) * size.height)
                let bar = CGRect(x: CGFloat(index) * (width + gap), y: (size.height - height) / 2, width: width, height: height)
                context.fill(Path(roundedRect: bar, cornerRadius: width / 2), with: .color(Tokens.amber))
            }
        }
        .task {
            while !Task.isCancelled {
                levels.removeFirst()
                levels.append(model.isRecording ? model.level : 0)
                try? await Task.sleep(for: .milliseconds(33))
            }
        }
    }
}

/// The way back: a dot that slides right along a track at the bottom
/// edge, where the swipe goes, or with Reduce Motion a still arrow, and
/// one sentence either way.
struct SwipeGuide: View {
    let still: Bool
    @State private var moved = false

    var body: some View {
        VStack(spacing: 12) {
            Text(still ? SessionCopy.guideStill : SessionCopy.guide)
                .font(.footnote)
                .foregroundStyle(Tokens.textDim)
                .multilineTextAlignment(.center)
            if still {
                Image(systemName: "arrow.right")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Tokens.text)
                    .accessibilityHidden(true)
            } else {
                Capsule()
                    .fill(Tokens.cream14)
                    .frame(width: 160, height: 6)
                    .overlay(alignment: .leading) {
                        Circle()
                            .fill(Tokens.text)
                            .frame(width: 18, height: 18)
                            .offset(x: moved ? 142 : 0)
                    }
                    .accessibilityHidden(true)
                    .onAppear {
                        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: false)) { moved = true }
                    }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// What happens when the keyboard opens murmur with a take link: the
/// session starts, the take starts under the keyboard's id, and the
/// Recording screen shows until the take ends.
@Observable @MainActor final class TakeOpener {
    static let shared = TakeOpener()
    var showing = false

    func open(_ url: URL) async {
        guard let id = TakeLink.take(in: url), let session = Session.live(), let bridge = KeyboardBridge.live() else { return }
        showing = true
        _ = await session.begin()
        bridge.opened(id)
    }
}

/// The Recording screen on the app's one take model.
struct RecordingRoute: View {
    var body: some View {
        if let model = TakeModel.live() {
            RecordingScreen(model: model)
        }
    }
}
```

`ios/App/ContentView.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI

/// A quiet placeholder until Home (IOS-012) replaces it: the way to a
/// take, the keyboard, the session, Cleanup, and the Provider screen, and
/// nothing else. It starts the keyboard's bridge and the session, and shows
/// the Recording screen when the keyboard opens murmur.
struct ContentView: View {
    @State private var opener = TakeOpener.shared

    var body: some View {
        NavigationStack {
            List {
                Group {
                    NavigationLink("Dictate") { TakeRoute() }
                    NavigationLink("Keyboard") { KeyboardScreen() }
                    NavigationLink("Session") { SessionRoute() }
                    NavigationLink("Cleanup") { CleanupRoute() }
                    NavigationLink("Provider and key") { ProviderRoute() }
                }
                .listRowBackground(Tokens.panel)
            }
            .scrollContentBackground(.hidden)
            .background(Tokens.ink)
            .foregroundStyle(Tokens.text)
            .navigationTitle("murmur")
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task {
            _ = KeyboardBridge.live()
            _ = Session.live()
        }
        .onOpenURL { url in
            Task { await opener.open(url) }
        }
        .fullScreenCover(isPresented: $opener.showing) { RecordingRoute() }
    }
}

#Preview {
    ContentView()
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `SessionCopyTests` passes (3 tests), and the app total is 143.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Session/SessionCopy.swift ios/App/Session/SessionScreen.swift ios/App/Session/RecordingScreen.swift ios/App/ContentView.swift ios/AppTests/SessionCopyTests.swift
git commit -m "IOS-009: murmur opens recording with the way back shown, and Session sets how long it listens"
```

### Task 7: The smoke runs a session

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`.

The smoke check is the test here: Tasks 1 and 3 built and unit-tested what it exercises. The check runs it end to end in the launched app, with the real gate and capture and a shortened length.

- [ ] **Step 1: Add the check**

In `SmokeRunner.runAndExit`'s list, after `("mailbox", checkMailbox),`, add `("session", checkSession),`. Before `/// Fallback reasons, collected across the smoke's async bridge.`, add:

```swift
    /// A session at a shortened length, through the device microphone's own
    /// gate with sound handed in instead of heard: it starts warm, a take
    /// holds only what was said during it (a steady sound before and after
    /// never reaches it), and with no further take the session ends by
    /// itself and lets the microphone go. No audio file exists anywhere
    /// from between takes.
    static func checkSession() throws {
        if let failure = onMain({ await sessionFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func sessionFailure() async -> String? {
        guard let microphone = FedMicrophone(rate: Double(Wav.targetSampleRate)), let key = APIKey(StubProtocol.key),
              let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"),
              let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules()
        else { return "the stand-ins did not build" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-session-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: scratch) }
        let connections = ConnectionStore(defaults: defaults)
        let ring = MemoryKeyRing()
        try? ring.save(key, for: connections.load(catalog: catalog).transcription.baseUrl)
        let cleanup = CleanupStore(defaults: defaults)
        cleanup.save(CleanupSettings(polish: false))
        let model = TakeModel(
            microphone: microphone, store: WaitingStore(directory: scratch.appending(path: "takes", directoryHint: .isDirectory)),
            rules: rules, catalog: catalog, connections: connections, cleanup: cleanup, ring: ring,
            send: { request in (Data(#"{"text":"smoke session words"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) },
            copy: { _ in }
        )
        let file = scratch.appending(path: "session.json")
        try? FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        let session = Session(microphone: microphone, model: model, defaults: defaults, stateFile: file, seconds: { _ in 0.5 }, announce: { _ in })
        session.listen()
        guard await session.begin(), microphone.isWarm, SessionState.read(from: file).isOn() else { return "the session did not start warm" }
        let steady = [Float](repeating: 0.5, count: Wav.targetSampleRate / 2)
        microphone.hear(steady)
        await model.start()
        microphone.hear(ScriptedMicrophone.tone)
        await model.stop()
        microphone.hear(steady)
        guard case .words = model.state else { return "the take gave \(model.state)" }
        let take = microphone.lastTake
        guard abs(take.count - ScriptedMicrophone.tone.count) < 200, take.allSatisfy({ abs($0) < 0.35 }) else {
            return "the take held \(take.count) samples, peak \(take.map(abs).max() ?? 0)"
        }
        guard session.isOn, microphone.isWarm else { return "the session let go after a take" }
        for _ in 0..<150 where session.isOn {
            try? await Task.sleep(for: .milliseconds(20))
        }
        guard !session.isOn, !microphone.isWarm, SessionState.read(from: file) == .off else { return "the session did not end by itself" }
        var places = [scratch]
        if let container = AppGroup.containerURL { places.append(container) }
        for place in places {
            let audio = (FileManager.default.subpaths(atPath: place.path) ?? []).filter { $0.hasSuffix(".wav") }
            guard audio.isEmpty else { return "audio exists in \(place.lastPathComponent): \(audio)" }
        }
        return nil
    }

    /// Runs main-actor work to the end from the smoke's synchronous start
    /// on the main thread, turning the run loop so the work gets to run.
    private static func onMain<T: Sendable>(_ work: @escaping @MainActor () async -> T) -> T {
        let outcome = Mutex<(done: Bool, value: T?)>((false, nil))
        Task { @MainActor in
            let value = await work()
            outcome.withLock { $0 = (true, value) }
        }
        while !outcome.withLock({ $0.done }) {
            RunLoop.main.run(mode: .default, before: .now.addingTimeInterval(0.01))
        }
        guard let value = outcome.withLock({ $0.value }) else { preconditionFailure("the work finished without a value") }
        return value
    }
```

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT` lists eleven checks, all true, `session` among them.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-009: the smoke runs a session, a take, and a timeout, and finds no audio from between takes"
```

### Task 8: The docs, the live check, and the notes

**Files:** Modify `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json`.

- [ ] **Step 1: The docs**

In `ios/docs/iphone.md`, replace the paragraph "For now the pill works while murmur is open. Starting a take from another app comes with murmur's listening session." with "The first tap opens murmur, which starts a listening session; after that, taps start takes without leaving your app. The answers below explain how." Then add at the end:

```markdown
## Why does murmur open when I first tap the pill?

The keyboard is not allowed to use the microphone; only the murmur app is. So the first tap opens murmur, which starts listening at once and starts a session. Everything you say from that moment counts, even before you go back to your app.

While the session runs, murmur keeps the microphone ready in the background, so your next taps start a take right where you are, without opening murmur again.

## How do I get back to my app?

Swipe right along the bottom edge of the screen, the same swipe that switches between your recent apps. murmur shows it along the bottom while it records. Keep talking as you go: the take goes on, and when you tap the pill again your words land in your app.

If iOS shows your app's name as a back link in the top left corner, tapping it works too.

## Why is the orange dot on?

iOS shows an orange dot whenever an app has the microphone on. During a session murmur keeps the microphone ready between takes, so the dot stays on until the session ends.

Between takes murmur keeps nothing: the sound is dropped as it arrives, never saved, and never sent. Only a take, from your tap to your tap, goes to your provider.

## How long does murmur keep listening?

15 minutes after your last take, unless you change it. In murmur, open Session and pick 5 minutes, 15 minutes, or 1 hour. The time counts from the end of your last take, so a session lasts as long as you keep dictating.

To end it sooner, tap End session in murmur, or press and hold the pill in the keyboard and tap End session. A phone call, Siri, or another app taking the microphone ends it too. A take in progress when a session ends still goes through, as if you had tapped stop.

## How much battery does a session use?

Some, because the microphone stays on while a session runs. murmur does no work on the sound between takes: it is dropped as it arrives, and nothing is sent until you tap the pill. A session ends by itself after the length you pick, and End session stops it at once. If you dictate in short bursts, pick 5 minutes.

## What if the pill says Open murmur to start?

That means iOS did not let the keyboard open murmur. Check that Allow Full Access is on for murmur in Settings, then General, Keyboard, Keyboards. If it is, open murmur yourself, tap Session, and tap Start session. Then go back to your app and tap the pill: it starts a take right there while the session runs.
```

- [ ] **Step 2: The live check**

In `HANDOFF.md`, under `## Now`, after the IOS-008 live check, add:

```markdown
- [ ] IOS-009 live check, once TestFlight 1 is on your iPhone (IOS-015; added 2026-10-12). (1) Make sure the murmur keyboard is added with Full Access (the IOS-008 check, step 1). (2) Open Messages, tap the message box, and hold the globe key to pick murmur. (3) Tap Tap to talk and start talking right away. murmur should open, showing Recording and a moving waveform. (4) Keep talking while you swipe right along the bottom edge of the screen to go back to Messages. (5) Tap Stop on the keyboard. Everything you said, including before the swipe, should appear in the message box. (6) Tap Tap to talk again, say a second sentence, and tap Stop. This time murmur should not open, and the words should land after the first. The orange dot stays on at the top of the screen between takes. (7) Press and hold the pill and tap End session. The orange dot should go out. (8) In murmur, tap Session and pick 5 minutes. Go back to Messages, dictate once the same way, then leave the phone alone for 5 minutes. The orange dot should go out by itself. (9) Play music in your AirPods and dictate once from Messages. The music should keep playing in your AirPods. (10) Start a session, then ask Siri something. The orange dot should go out. (11) Battery: in murmur, tap Session and pick 1 hour, dictate once from any app, then lock the phone for an hour. Then open Settings, then Battery, and find murmur in the list. (12) Tell Claude what each step did, and the percentage next to murmur.
```

- [ ] **Step 3: The notes**

In `ios/prd.json`, set IOS-009's `notes` to say what was built and verified, every ruling above, that the battery number and the live check wait for LaBroi (`passes` stays false), and the final gate counts. Run `npm run roadmap` if it reads `ios/prd.json`, and commit any change it makes.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json
git commit -m "IOS-009: the iPhone docs answer why murmur opens, the way back, the orange dot, how long, and battery"
```
