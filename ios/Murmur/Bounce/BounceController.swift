import Foundation
import Combine

// The instant-take engine: recording starts the moment begin() runs, no
// taps, auto-stops at the configurable cap, and every exit path reports a
// result through the completion. The keyboard bounce wires completion to
// the App Group store; the Action Button intent wires it to the clipboard.
@MainActor
final class BounceController: ObservableObject {

    enum Phase: Equatable {
        case starting
        case recording
        case processing
        case finished(ok: Bool, message: String)
    }

    @Published private(set) var phase: Phase = .starting
    @Published private(set) var levels: [Float] = Array(repeating: 0, count: 36)

    let recorder = Recorder()
    private var levelSink: AnyCancellable?
    private var maxTimer: Timer?
    private var settings: PipelineSettings?
    private var spec: FormatSpec?
    private var history: HistoryStore?
    private var completion: ((Bool, String) -> Void)?

    init() {
        levelSink = recorder.$level.sink { [weak self] level in
            guard let self, case .recording = self.phase else { return }
            self.levels.removeFirst()
            self.levels.append(level)
        }
    }

    func begin(settings: PipelineSettings, spec: FormatSpec?, history: HistoryStore,
               completion: @escaping (Bool, String) -> Void) {
        guard case .starting = phase else { return }
        self.settings = settings
        self.spec = spec
        self.history = history
        self.completion = completion
        Task {
            guard await recorder.requestPermission() else {
                finish(ok: false, text: "Microphone access is off. Enable it in Settings, Murmur, Microphone.")
                return
            }
            do {
                try recorder.start()
                phase = .recording
                let cap = TimeInterval(max(10, settings.maxSeconds))
                maxTimer = Timer.scheduledTimer(withTimeInterval: cap, repeats: false) { [weak self] _ in
                    Task { @MainActor [weak self] in self?.stop() }
                }
            } catch {
                finish(ok: false, text: "Could not start recording: \(error.localizedDescription)")
            }
        }
    }

    func stop() {
        guard case .recording = phase, let settings else { return }
        maxTimer?.invalidate()
        maxTimer = nil
        guard let audio = recorder.stop(), audio.count >= 1200 else {
            recorder.discard()
            finish(ok: false, text: "No speech detected")
            return
        }
        guard let spec else {
            finish(ok: false, text: "format-spec.json is missing from the app bundle.")
            return
        }
        guard !settings.apiKey.isEmpty else {
            finish(ok: false, text: "No API key yet. Add your free Groq key in Murmur Settings.")
            return
        }
        phase = .processing
        Task {
            do {
                let text = try await Pipeline.run(audio: audio, settings: settings, spec: spec)
                if settings.historyEnabled {
                    history?.add(text: text, model: settings.model)
                }
                finish(ok: true, text: text)
            } catch {
                finish(ok: false, text: Transcriber.friendlyMessage(for: error))
            }
        }
    }

    private func finish(ok: Bool, text: String) {
        completion?(ok, text)
        completion = nil
        phase = .finished(ok: ok, message: text)
    }
}
