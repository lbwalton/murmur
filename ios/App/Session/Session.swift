// SPDX-License-Identifier: GPL-3.0-only
// The listening session (ios/prd.json IOS-009): while it runs, the
// microphone stays warm in the background (iOS shows its orange dot), so
// a tap on the pill in any app starts a take at once. It ends by itself
// after the length you picked, counted from your last take, when you end
// it here or from the keyboard, or when a call, Siri, or another app takes
// the microphone. Nothing it hears between takes is kept, written, or
// sent: the warm microphone drops it as it arrives. While it runs, its
// Live Activity says so on the Lock Screen and in the Dynamic Island
// (IOS-016).
import AVFoundation
import Foundation
import Observation

@Observable @MainActor final class Session {
    enum Length: Int, CaseIterable, Sendable {
        case five = 5, fifteen = 15, hour = 60

        var seconds: TimeInterval { TimeInterval(rawValue) * 60 }
    }

    static let lengthKey = "sessionLength"
    /// How often a length that ran out during a take or a retry looks again.
    static let recheck: TimeInterval = 1

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
    /// Shows the session's Live Activity, or ends it with nil (IOS-016).
    @ObservationIgnored private let present: @MainActor (SessionActivity.ContentState?) -> Void
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var listener: SignalListener?
    @ObservationIgnored private var interruptions: (any NSObjectProtocol)?

    init(
        microphone: any WarmMicrophone, model: TakeModel, defaults: UserDefaults = .standard, stateFile: URL? = SessionState.file,
        seconds: @escaping @MainActor (Length) -> TimeInterval = { $0.seconds }, announce: @escaping @MainActor (Signal) -> Void = { $0.post() },
        present: @escaping @MainActor (SessionActivity.ContentState?) -> Void = { _ in }
    ) {
        self.microphone = microphone
        self.model = model
        self.defaults = defaults
        self.stateFile = stateFile
        self.seconds = seconds
        self.announce = announce
        self.present = present
        length = Length(rawValue: defaults.integer(forKey: Self.lengthKey)) ?? .fifteen
    }

    /// Hears End session from the keyboard and interruptions from iOS,
    /// follows the takes, and says the session is off: a session never
    /// outlives the app that ran it.
    func listen() {
        listener = SignalListener([.end]) { [weak self] _ in self?.end() }
        microphone.onLost = { [weak self] in self?.interrupted() }
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

    /// A call, Siri, or another app took the microphone, or the microphone
    /// went away: the session ends, and a take in progress is processed
    /// with what it heard.
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
    /// ends, and the length counts again from then. Work that ends without
    /// a new take (a retry that fails again) changes nothing to follow, so
    /// while anything runs the session looks again shortly.
    private func lapse() {
        guard isOn else { return }
        guard !model.isRecording, !model.isBusy else {
            timer = Task { [weak self] in
                try? await Task.sleep(for: .seconds(Self.recheck))
                guard !Task.isCancelled else { return }
                self?.lapse()
            }
            return
        }
        end()
    }

    /// Each take that ends counts the length again from its end, and the
    /// Live Activity follows Ready and Recording.
    private func follow() {
        withObservationTracking {
            _ = model.state
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if self.isOn, !self.model.isRecording, !self.model.isBusy {
                    self.extend()
                } else {
                    self.show()
                }
                self.follow()
            }
        }
    }

    private func publish() {
        SessionState(until: until).write(to: stateFile)
        announce(.changed)
        show()
    }

    /// What the Live Activity shows: nothing while off.
    private func show() {
        present(until.map { SessionActivity.ContentState(recording: model.isRecording, until: $0) })
    }
}

extension Session {
    private static var shared: Session?

    /// The one session for the app's life, on the app's take model and the
    /// device microphone.
    static func live() -> Session? {
        if let shared { return shared }
        guard let model = TakeModel.live() else { return nil }
        let session = Session(microphone: DeviceMicrophone.shared, model: model, present: { LiveSession.shared.show($0) })
        session.listen()
        shared = session
        return session
    }
}
