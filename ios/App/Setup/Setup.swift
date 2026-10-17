// SPDX-License-Identifier: GPL-3.0-only
// First run (ios/prd.json IOS-011): three steps in order, allow the
// microphone, add a key, and add the murmur keyboard with Full Access, then a
// practice take. The key comes before the keyboard and the first take
// (LaBroi, 2026-10-16), and the keyboard and Full Access are one step, since
// both switches are on the same page in Settings (LaBroi, 2026-10-17). Each
// step's status comes from the world (the microphone permission, the
// keyboard's own report, a saved key) plus what you skipped here, so a step
// done in Settings checks itself when you come back. Any step can be
// skipped, and Home lists what is left until it is done.
import AVFoundation
import Foundation
import Observation

/// The microphone permission, read and asked for.
@MainActor protocol MicrophoneAccess {
    var status: Setup.Permission { get }
    func request() async -> Bool
}

@Observable @MainActor final class Setup {
    enum Step: String, CaseIterable, Sendable {
        case microphone, key, keyboard, practice
    }

    enum Status: Equatable, Sendable {
        case todo, done, skipped
        /// The microphone was refused; Settings can turn it on.
        case denied
    }

    enum Permission: Sendable {
        case granted, denied, undetermined
    }

    private(set) var statuses: [Step: Status] = [:]

    @ObservationIgnored private let microphone: any MicrophoneAccess
    @ObservationIgnored private let report: @MainActor () -> KeyboardReport?
    @ObservationIgnored private let hasKey: @MainActor () -> Bool
    @ObservationIgnored private let defaults: UserDefaults

    static let seenKey = "firstRunSeen"
    static let skippedKey = "firstRunSkipped"
    static let practicedKey = "firstRunPracticed"

    init(microphone: any MicrophoneAccess, report: @escaping @MainActor () -> KeyboardReport?, hasKey: @escaping @MainActor () -> Bool, defaults: UserDefaults = .standard) {
        self.microphone = microphone
        self.report = report
        self.hasKey = hasKey
        self.defaults = defaults
        refresh()
    }

    /// Whether first run has been shown once; after that, Home carries
    /// what is left.
    var seen: Bool {
        get { defaults.bool(forKey: Self.seenKey) }
        set { defaults.set(newValue, forKey: Self.seenKey) }
    }

    /// The steps not done yet, skipped ones included, in order.
    var remaining: [Step] {
        Step.allCases.filter { statuses[$0] != .done }
    }

    var isFinished: Bool { remaining.isEmpty }

    func status(_ step: Step) -> Status {
        statuses[step] ?? .todo
    }

    /// Checks every step again, as when you come back from Settings.
    func refresh() {
        let skipped = Set(defaults.stringArray(forKey: Self.skippedKey) ?? [])
        func open(_ step: Step) -> Status { skipped.contains(step.rawValue) ? .skipped : .todo }
        let microphone: Status = switch self.microphone.status {
        case .granted: .done
        case .denied: .denied
        case .undetermined: open(.microphone)
        }
        statuses = [
            .microphone: microphone,
            // The keyboard reports itself only with Full Access, and without
            // it the keyboard cannot hand a take to murmur, so only its report
            // does this step.
            .keyboard: report()?.fullAccess == true ? .done : open(.keyboard),
            .key: hasKey() ? .done : open(.key),
            .practice: defaults.bool(forKey: Self.practicedKey) ? .done : open(.practice)
        ]
    }

    func allowMicrophone() async {
        _ = await microphone.request()
        refresh()
    }

    func skip(_ step: Step) {
        var skipped = Set(defaults.stringArray(forKey: Self.skippedKey) ?? [])
        skipped.insert(step.rawValue)
        defaults.set(skipped.sorted(), forKey: Self.skippedKey)
        refresh()
    }

    /// Words landed in the practice box.
    func practiced() {
        defaults.set(true, forKey: Self.practicedKey)
        refresh()
    }

    /// The step after this one that is not done yet, skipped ones included,
    /// or nil at the end: a step done another way is passed over.
    func step(after step: Step) -> Step? {
        let all = Step.allCases
        guard let index = all.firstIndex(of: step) else { return nil }
        return all[(index + 1)...].first { status($0) != .done }
    }

    /// The step to show first: the first one not done or skipped, or the
    /// first one left.
    var next: Step? {
        remaining.first { status($0) == .todo || status($0) == .denied } ?? remaining.first
    }
}

/// The device's microphone permission.
struct DeviceMicrophoneAccess: MicrophoneAccess {
    var status: Setup.Permission {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: .granted
        case .denied: .denied
        default: .undetermined
        }
    }

    func request() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }
}

extension Setup {
    private static var shared: Setup?

    /// The app's one first run: the device's microphone, the keyboard's
    /// report in the app group, and a key for today's transcription provider.
    static func live() -> Setup {
        if let shared { return shared }
        let catalog = try? BundledRules.catalog()
        let ring = KeychainKeyRing()
        let setup = Setup(
            microphone: DeviceMicrophoneAccess(),
            report: { KeyboardReport.read() },
            hasKey: {
                guard let catalog else { return false }
                let baseUrl = ConnectionStore().load(catalog: catalog).transcription.baseUrl
                return ((try? ring.key(for: baseUrl)) ?? nil) != nil
            }
        )
        shared = setup
        return setup
    }
}
