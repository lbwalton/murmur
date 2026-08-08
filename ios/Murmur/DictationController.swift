import Foundation
import Combine

// Drives the in-app dictation loop: hold to talk, or tap to toggle for
// long takes, then the full US-103 pipeline. Phases map straight onto the
// UI states; amber belongs to .recording alone.
@MainActor
final class DictationController: ObservableObject {

    enum Phase: Equatable {
        case idle
        case recording
        case processing
        case done(String)
        case error(String)
    }

    // A press shorter than this is a tap (toggle on); longer is a hold
    // (release stops), the same feel as the desktop hold key.
    static let holdThreshold: TimeInterval = 0.35

    @Published private(set) var phase: Phase = .idle
    // Rolling mic levels for the live waveform, newest last.
    @Published private(set) var levels: [Float] = Array(repeating: 0, count: 36)

    let recorder = Recorder()
    private var levelSink: AnyCancellable?
    private var pressStarted: Date?
    private var stoppedByPress = false

    init() {
        levelSink = recorder.$level.sink { [weak self] level in
            guard let self, case .recording = self.phase else { return }
            self.levels.removeFirst()
            self.levels.append(level)
        }
    }

    var isRecording: Bool { phase == .recording }

    // Pure decision, unit-tested: does releasing after `duration` stop the
    // take (hold) or leave it running (tap toggles)?
    static func releaseStops(afterPressOf duration: TimeInterval) -> Bool {
        duration >= holdThreshold
    }

    // ------------------------------------------------------------ input

    func pressBegan(settings: PipelineSettings, spec: FormatSpec?, history: HistoryStore) {
        if case .recording = phase {
            // A press while a toggled take runs is the stop tap.
            stoppedByPress = true
            finishTake(settings: settings, spec: spec, history: history)
            return
        }
        stoppedByPress = false
        pressStarted = Date()
        startRecording()
    }

    func pressEnded(settings: PipelineSettings, spec: FormatSpec?, history: HistoryStore) {
        guard !stoppedByPress else { stoppedByPress = false; return }
        guard case .recording = phase, let started = pressStarted else { return }
        if Self.releaseStops(afterPressOf: Date().timeIntervalSince(started)) {
            finishTake(settings: settings, spec: spec, history: history)
        }
        // Otherwise it was a tap: keep recording until the next tap.
    }

    func dismissResult() {
        if case .recording = phase { return }
        phase = .idle
    }

    // --------------------------------------------------------- the take

    private func startRecording() {
        Task {
            guard await recorder.requestPermission() else {
                phase = .error("Microphone access is off. Enable it in Settings, Murmur, Microphone.")
                return
            }
            do {
                try recorder.start()
                levels = Array(repeating: 0, count: levels.count)
                phase = .recording
            } catch {
                phase = .error("Could not start recording: \(error.localizedDescription)")
            }
        }
    }

    private func finishTake(settings: PipelineSettings, spec: FormatSpec?, history: HistoryStore) {
        guard let audio = recorder.stop(), audio.count >= 1200 else {
            recorder.discard()
            phase = .error("No speech detected")
            return
        }
        guard let spec else {
            phase = .error("format-spec.json is missing from the app bundle.")
            return
        }
        guard !settings.apiKey.isEmpty else {
            phase = .error("No API key yet. Add your free Groq key in Settings.")
            return
        }
        phase = .processing
        Task {
            do {
                let text = try await Pipeline.run(audio: audio, settings: settings, spec: spec)
                phase = .done(text)
                if settings.historyEnabled {
                    history.add(text: text, model: settings.model)
                }
            } catch {
                phase = .error(Transcriber.friendlyMessage(for: error))
            }
        }
    }
}
