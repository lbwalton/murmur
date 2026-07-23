import Foundation
import Combine

// The app half of the bounce: recording starts the moment the murmur://
// dictate route lands, no taps, and whatever happens, a result lands in
// the App Group store so the keyboard never waits on silence. iOS has no
// public way to return to the previous app, so the finished state shows
// the swipe-back hint instead.
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
    private let store = AppGroupStore()

    init() {
        levelSink = recorder.$level.sink { [weak self] level in
            guard let self, case .recording = self.phase else { return }
            self.levels.removeFirst()
            self.levels.append(level)
        }
    }

    func begin(session: String, settings: PipelineSettings, spec: FormatSpec?, history: HistoryStore) {
        guard case .starting = phase else { return }
        Task {
            guard await recorder.requestPermission() else {
                finish(session: session, ok: false,
                       text: "Microphone access is off. Enable it in Settings, Murmur, Microphone.")
                return
            }
            do {
                try recorder.start()
                phase = .recording
                let cap = TimeInterval(max(10, settings.maxSeconds))
                maxTimer = Timer.scheduledTimer(withTimeInterval: cap, repeats: false) { [weak self] _ in
                    Task { @MainActor [weak self] in
                        self?.stop(session: session, settings: settings, spec: spec, history: history)
                    }
                }
            } catch {
                finish(session: session, ok: false,
                       text: "Could not start recording: \(error.localizedDescription)")
            }
        }
    }

    func stop(session: String, settings: PipelineSettings, spec: FormatSpec?, history: HistoryStore) {
        guard case .recording = phase else { return }
        maxTimer?.invalidate()
        maxTimer = nil
        guard let audio = recorder.stop(), audio.count >= 1200 else {
            recorder.discard()
            finish(session: session, ok: false, text: "No speech detected")
            return
        }
        guard let spec else {
            finish(session: session, ok: false, text: "format-spec.json is missing from the app bundle.")
            return
        }
        guard !settings.apiKey.isEmpty else {
            finish(session: session, ok: false, text: "No API key yet. Add your free Groq key in Murmur Settings.")
            return
        }
        phase = .processing
        Task {
            do {
                let text = try await Pipeline.run(audio: audio, settings: settings, spec: spec)
                if settings.historyEnabled {
                    history.add(text: text, model: settings.model)
                }
                finish(session: session, ok: true, text: text)
            } catch {
                finish(session: session, ok: false, text: Transcriber.friendlyMessage(for: error))
            }
        }
    }

    // Whatever happened, the keyboard hears about it: ok carries the
    // transcript, error carries the readable message.
    private func finish(session: String, ok: Bool, text: String) {
        store.writeResult(BounceResult(token: session,
                                       status: ok ? .ok : .error,
                                       text: text,
                                       createdAt: Date()))
        phase = .finished(ok: ok, message: text)
    }
}
