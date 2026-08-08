import Foundation
import AVFoundation

// Records mono compressed audio (AAC in an m4a container, 16 kHz, the
// cheapest thing Whisper transcribes happily) and exposes a live level for
// the waveform UI. All audio lives here in the app process; the keyboard
// extension never records (hard constraint).
@MainActor
final class Recorder: NSObject, ObservableObject {

    @Published private(set) var isRecording = false
    // Normalized 0...1 mic level for the waveform, updated ~30 Hz.
    @Published private(set) var level: Float = 0

    private var recorder: AVAudioRecorder?
    private var meterTimer: Timer?
    private(set) var fileURL: URL?

    static let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 16000,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 32000,
    ]

    func requestPermission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement)
        try session.setActive(true)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("dictation-\(UUID().uuidString).m4a")
        let rec = try AVAudioRecorder(url: url, settings: Self.settings)
        rec.isMeteringEnabled = true
        rec.record()
        recorder = rec
        fileURL = url
        isRecording = true
        meterTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.updateLevel() }
        }
    }

    private func updateLevel() {
        guard let rec = recorder, rec.isRecording else { return }
        rec.updateMeters()
        // averagePower is dBFS (-160...0); map the useful speech range
        // (-50...0 dB) onto 0...1 for the waveform.
        let db = rec.averagePower(forChannel: 0)
        level = max(0, min(1, (db + 50) / 50))
    }

    // Stops and returns the finished take, or nil if nothing was recorded.
    func stop() -> Data? {
        meterTimer?.invalidate()
        meterTimer = nil
        recorder?.stop()
        recorder = nil
        isRecording = false
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        guard let url = fileURL else { return nil }
        return try? Data(contentsOf: url)
    }

    func discard() {
        _ = stop()
        if let url = fileURL {
            try? FileManager.default.removeItem(at: url)
            fileURL = nil
        }
    }
}
