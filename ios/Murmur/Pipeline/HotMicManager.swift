import Foundation
import AVFoundation
import Combine

// US-112, the hot mic. The keyboard cannot record, so after the first bounce
// warms this manager, the app keeps a live audio engine running and stays
// resident in the background (UIBackgroundModes audio). The keyboard then
// drives dictation in place, without switching apps, by dropping a command in
// the App Group and poking the app with a Darwin notification; this manager
// captures the take, runs the same pipeline as everywhere else, and writes the
// result back for the keyboard to insert.
//
// One audio system owns the microphone here. The foreground first take
// (BounceView) and every later background take share the same engine, so the
// session is never fought over. The engine keeps running for a rolling idle
// window (default 90s, reset on every take); when it lapses the mic is
// released so the orange indicator and the battery cost do not linger.
@MainActor
final class HotMicManager: ObservableObject {
    static let shared = HotMicManager()

    // Mirrors BounceController.Phase so BounceView can drive this instead.
    enum Phase: Equatable {
        case idle
        case starting
        case recording
        case processing
        case finished(ok: Bool, message: String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var levels: [Float] = Array(repeating: 0, count: 36)

    // Injected once at app launch so a background take can run with no view.
    private var settingsProvider: (() -> PipelineSettings)?
    private weak var history: HistoryStore?
    private let spec = try? FormatSpec.load()

    // Audio. The engine runs continuously while warm; the sink writes to a
    // file only while a take is actually being captured.
    private let engine = AVAudioEngine()
    private var sink: CaptureSink?
    private var tapInstalled = false
    private var currentFileURL: URL?

    // Warm window.
    private var warmSeconds: TimeInterval = 90
    private var idleTimer: Timer?
    private var currentToken: String?
    private var foregroundCompletion: ((Bool, String) -> Void)?
    private var bridged = false

    private init() {}

    // ---------------------------------------------------------- lifecycle

    // Called once from the app on launch: wire the pipeline inputs and start
    // listening for the keyboard's Darwin pokes.
    func configure(settingsProvider: @escaping () -> PipelineSettings, history: HistoryStore, warmSeconds: TimeInterval) {
        self.settingsProvider = settingsProvider
        self.history = history
        self.warmSeconds = warmSeconds <= 0 ? 0 : max(10, warmSeconds)
        guard !bridged else { return }
        bridged = true
        DarwinSignal.bridge(DarwinSignal.command)
        NotificationCenter.default.addObserver(
            self, selector: #selector(commandPoked),
            name: Notification.Name(DarwinSignal.command), object: nil)
    }

    func setWarmSeconds(_ seconds: TimeInterval) { warmSeconds = seconds <= 0 ? 0 : max(10, seconds) }

    var isWarm: Bool { AppGroupStore().readHotState().phase != .cold }

    // ------------------------------------------------------- foreground take

    // The first (cold) dictation runs here, in the app, driven by BounceView.
    // It warms the engine, captures immediately, and leaves the engine warm so
    // the swipe back lands on a hot mic.
    func beginForegroundTake(token: String, completion: @escaping (Bool, String) -> Void) {
        foregroundCompletion = completion
        phase = .starting
        levels = Array(repeating: 0, count: 36)
        Task {
            guard await ensureWarm() else {
                finish(ok: false, text: "Microphone access is off. Enable it in Settings, Murmur, Microphone.", token: token, foreground: true)
                return
            }
            startCapture(token: token, foreground: true)
        }
    }

    func stop() { stopCapture() }

    // ------------------------------------------------------- background take

    // The keyboard poked us: read the command and act. Runs while the app is
    // backgrounded but resident, because the running engine keeps it alive.
    @objc private func commandPoked() {
        Task { @MainActor in
            guard let command = AppGroupStore().consumeCommand() else { return }
            switch command.action {
            case .start:
                guard await ensureWarm() else {
                    finish(ok: false, text: "No microphone access.", token: command.token, foreground: false)
                    return
                }
                startCapture(token: command.token, foreground: false)
            case .stop:
                stopCapture()
            case .cancel:
                cancelCapture()
            }
        }
    }

    // ------------------------------------------------------------- engine

    private func ensureWarm() async -> Bool {
        if engine.isRunning { extendWarmWindow(); return true }
        guard await AVAudioApplication.requestRecordPermission() else { return false }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement,
                                    options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker])
            try session.setActive(true)

            let input = engine.inputNode
            let inputFormat = input.outputFormat(forBus: 0)
            let sink = CaptureSink(inputFormat: inputFormat)
            sink.onLevel = { [weak self] level in
                Task { @MainActor [weak self] in self?.pushLevel(level) }
            }
            self.sink = sink
            if !tapInstalled {
                input.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) { [weak sink] buffer, _ in
                    sink?.write(buffer)
                }
                tapInstalled = true
            }
            engine.prepare()
            try engine.start()
            if warmSeconds > 0 {
                publishState(.warm)
                extendWarmWindow()
            }
            return true
        } catch {
            return false
        }
    }

    private func startCapture(token: String, foreground: Bool) {
        guard engine.isRunning, let sink else { return }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("hot-\(UUID().uuidString).wav")
        guard let file = sink.beginFile(at: url) else {
            finish(ok: false, text: "Could not start recording.", token: token, foreground: foreground)
            return
        }
        _ = file
        currentFileURL = url
        currentToken = token
        phase = .recording
        publishState(.listening)
        extendWarmWindow()
    }

    private func stopCapture() {
        guard case .recording = phase, let token = currentToken, let sink else { return }
        sink.endFile()
        levels = Array(repeating: 0, count: 36)
        phase = .processing
        publishState(.processing)
        let url = currentFileURL
        let foreground = foregroundCompletion != nil
        Task { await process(url: url, token: token, foreground: foreground) }
    }

    private func cancelCapture() {
        guard case .recording = phase else { return }
        sink?.endFile()
        if let url = currentFileURL { try? FileManager.default.removeItem(at: url) }
        currentFileURL = nil
        currentToken = nil
        phase = .idle
        publishState(.warm)
        extendWarmWindow()
    }

    private func process(url: URL?, token: String, foreground: Bool) async {
        guard let url, let data = try? Data(contentsOf: url), data.count >= 1200 else {
            finish(ok: false, text: "No speech detected", token: token, foreground: foreground)
            return
        }
        defer { try? FileManager.default.removeItem(at: url) }
        guard let spec else {
            finish(ok: false, text: "format-spec.json is missing from the app bundle.", token: token, foreground: foreground)
            return
        }
        guard let settings = settingsProvider?() else {
            finish(ok: false, text: "Murmur is not configured yet.", token: token, foreground: foreground)
            return
        }
        guard !settings.apiKey.isEmpty else {
            finish(ok: false, text: "No API key yet. Add your free Groq key in Murmur Settings.", token: token, foreground: foreground)
            return
        }
        do {
            let text = try await Pipeline.run(audio: data, settings: settings, spec: spec)
            if settings.historyEnabled { history?.add(text: text, model: settings.model) }
            finish(ok: true, text: text, token: token, foreground: foreground)
        } catch {
            finish(ok: false, text: Transcriber.friendlyMessage(for: error), token: token, foreground: foreground)
        }
    }

    private func finish(ok: Bool, text: String, token: String, foreground: Bool) {
        // The keyboard hears about every take through the App Group, whether it
        // ran in the foreground (first bounce) or the background (in place).
        AppGroupStore().writeResult(BounceResult(token: token, status: ok ? .ok : .error,
                                                 text: text, createdAt: Date()))
        currentFileURL = nil
        currentToken = nil
        phase = .finished(ok: ok, message: text)
        if warmSeconds > 0 {
            // Stay warm for the next take; the engine keeps running.
            publishState(.warm)
            extendWarmWindow()
        } else {
            // Hot mic disabled: go cold after each take so the keyboard bounces.
            // Phase stays .finished so a foreground take still shows its guide.
            releaseEngine()
        }
        if foreground {
            foregroundCompletion?(ok, text)
            foregroundCompletion = nil
        } else {
            // No view is watching a background take; reset so the next one can
            // start cleanly.
            phase = .idle
        }
    }

    // -------------------------------------------------------- warm window

    private func extendWarmWindow() {
        guard warmSeconds > 0 else { return }   // hot mic disabled: never warm
        idleTimer?.invalidate()
        let deadline = Date().addingTimeInterval(warmSeconds)
        idleTimer = Timer.scheduledTimer(withTimeInterval: warmSeconds, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in self?.releaseIfIdle() }
        }
        // Publish the fresh deadline so the keyboard knows how long it stays hot.
        var state = AppGroupStore().readHotState()
        if state.phase == .cold { state = HotState(phase: .warm, warmUntil: deadline) }
        else { state.warmUntil = deadline }
        AppGroupStore().writeHotState(state)
    }

    private func releaseIfIdle() {
        // Only release when genuinely idle: never yank the mic mid-take.
        switch phase {
        case .recording, .processing, .starting:
            extendWarmWindow()
            return
        default:
            break
        }
        release()
    }

    // Stop the engine and release the session without touching the UI phase,
    // so a finished foreground take can keep showing its swipe guide while the
    // mic goes cold underneath it.
    private func releaseEngine() {
        idleTimer?.invalidate()
        idleTimer = nil
        sink?.endFile()
        if engine.isRunning { engine.stop() }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        publishState(.cold)
    }

    // Fully release the microphone and let the app suspend.
    func release() {
        releaseEngine()
        phase = .idle
        levels = Array(repeating: 0, count: 36)
    }

    // ------------------------------------------------------------ helpers

    private func pushLevel(_ level: Float) {
        guard case .recording = phase else { return }
        levels.removeFirst()
        levels.append(level)
    }

    private func publishState(_ phase: HotPhase) {
        let store = AppGroupStore()
        let existing = store.readHotState()
        let warmUntil = phase == .cold ? nil : (existing.warmUntil ?? Date().addingTimeInterval(warmSeconds))
        store.writeHotState(HotState(phase: phase, warmUntil: warmUntil))
        DarwinSignal.post(DarwinSignal.state)
    }
}

// Nonisolated, thread-safe bridge between the real-time audio tap and the
// manager. The tap thread calls write(); the main actor toggles capture by
// swapping the file. A lock guards the file and the capturing flag; the
// converter is only ever touched on the audio thread.
private final class CaptureSink {
    var onLevel: ((Float) -> Void)?

    private let lock = NSLock()
    private var file: AVAudioFile?
    private let converter: AVAudioConverter?
    private let procFormat: AVAudioFormat

    // Whisper wants 16 kHz mono; AVAudioFile encodes the float buffers we
    // write into 16-bit PCM WAV on disk.
    private static let recordSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: 16000,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
    ]

    init(inputFormat: AVAudioFormat) {
        procFormat = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1)
            ?? inputFormat
        converter = AVAudioConverter(from: inputFormat, to: procFormat)
    }

    func beginFile(at url: URL) -> AVAudioFile? {
        guard let f = try? AVAudioFile(forWriting: url, settings: Self.recordSettings) else { return nil }
        lock.lock(); file = f; lock.unlock()
        return f
    }

    func endFile() {
        lock.lock(); file = nil; lock.unlock()
    }

    func write(_ input: AVAudioPCMBuffer) {
        onLevel?(level(of: input))
        lock.lock(); defer { lock.unlock() }
        guard let file, let converter else { return }
        let ratio = procFormat.sampleRate / input.format.sampleRate
        let capacity = AVAudioFrameCount(Double(input.frameLength) * ratio) + 128
        guard let out = AVAudioPCMBuffer(pcmFormat: procFormat, frameCapacity: capacity) else { return }
        var consumed = false
        var convError: NSError?
        let status = converter.convert(to: out, error: &convError) { _, inputStatus in
            if consumed { inputStatus.pointee = .noDataNow; return nil }
            consumed = true
            inputStatus.pointee = .haveData
            return input
        }
        if status == .haveData, out.frameLength > 0 {
            try? file.write(from: out)
        }
    }

    private func level(of buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<count { let s = channel[i]; sum += s * s }
        let rms = (sum / Float(count)).squareRoot()
        let db = 20 * log10(max(rms, 1e-7))
        return max(0, min(1, (db + 50) / 50))
    }
}
