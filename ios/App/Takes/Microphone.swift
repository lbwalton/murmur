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
    /// Called when the microphone goes away on its own (the route lost its
    /// input); a take in progress keeps what it heard.
    var onLost: (@MainActor () -> Void)? { get set }
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
    var onLost: (@MainActor () -> Void)?

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
            // No input now (the route went away). The take keeps what it
            // heard; whoever holds the microphone hears it is gone, and the
            // session ends and processes the take.
            isWarm = false
            holdWarm = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            onLost?()
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
