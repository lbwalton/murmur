import Foundation

// The only channel between the keyboard and the app (hard constraint: the
// App Group carries only what the keyboard needs). Two keys ride the suite:
// a pending session the keyboard wrote before bouncing, and the finished
// result the app wrote back. The keyboard is torn down while the user is in
// Murmur, so the pending token must survive in the store, not in memory.
// Results are consumed exactly once and stale entries expire.

struct BounceSession: Codable, Equatable {
    let token: String
    let createdAt: Date
}

struct BounceResult: Codable, Equatable {
    enum Status: String, Codable {
        case ok
        case error
    }

    let token: String
    let status: Status
    // The transcript when ok; a readable message when error.
    let text: String
    let createdAt: Date
}

final class AppGroupStore {

    static let suiteName = "group.com.labroi.murmur.ios"
    static let pendingKey = "murmur.bounce.pending"
    static let resultKey = "murmur.bounce.result"
    // A bounce older than this is an abandoned take, never inserted.
    static let staleAfter: TimeInterval = 120

    private let defaults: UserDefaults?

    init(defaults: UserDefaults? = UserDefaults(suiteName: AppGroupStore.suiteName)) {
        self.defaults = defaults
    }

    // ------------------------------------------------------------ pending

    func beginSession(token: String, now: Date = Date()) {
        write(BounceSession(token: token, createdAt: now), key: Self.pendingKey)
        defaults?.removeObject(forKey: Self.resultKey)
    }

    func pendingSession(now: Date = Date()) -> BounceSession? {
        guard let session: BounceSession = read(Self.pendingKey) else { return nil }
        guard now.timeIntervalSince(session.createdAt) <= Self.staleAfter else {
            clearSession()
            return nil
        }
        return session
    }

    // ------------------------------------------------------------- result

    func writeResult(_ result: BounceResult) {
        write(result, key: Self.resultKey)
    }

    // Exactly-once: a matching, fresh result is removed from the store the
    // moment it is returned, along with the pending session, so a second
    // read can never double-insert. Mismatched or stale entries clear.
    func consumeResult(token: String, now: Date = Date()) -> BounceResult? {
        guard let result: BounceResult = read(Self.resultKey) else { return nil }
        guard result.token == token,
              now.timeIntervalSince(result.createdAt) <= Self.staleAfter else {
            if now.timeIntervalSince(result.createdAt) > Self.staleAfter {
                defaults?.removeObject(forKey: Self.resultKey)
            }
            return nil
        }
        clearSession()
        return result
    }

    func clearSession() {
        defaults?.removeObject(forKey: Self.pendingKey)
        defaults?.removeObject(forKey: Self.resultKey)
    }

    // -------------------------------------------------------------- plumbing

    private func write<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults?.set(data, forKey: key)
    }

    private func read<T: Decodable>(_ key: String) -> T? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: - Hot mic (US-112)

// The keyboard still cannot touch the microphone. But once the first bounce
// has warmed the app's audio session, the app keeps recording from the
// background (UIBackgroundModes audio), and the keyboard drives it remotely:
// it drops a command in the App Group and pokes the app with a Darwin
// notification; the app writes back its state and the finished result. Only
// these small values cross into the keyboard, never audio or networking, so
// the lean-keyboard hard constraint still holds.

enum HotPhase: String, Codable {
    case cold        // no warm session: the mic key must bounce to the app
    case warm        // app resident with a live session, ready to record in place
    case listening   // capturing a take right now
    case processing  // transcribing and formatting a finished take
}

struct HotState: Codable, Equatable {
    var phase: HotPhase
    var warmUntil: Date?   // when the idle window releases the mic
    // The token of the take being captured or transcribed right now, nil
    // outside a take. The keyboard treats listening/processing as confirmation
    // of ITS take only when this matches; a stale claim left by a dead app
    // carries some other take's token (or none) and must not disarm the
    // watchdog (US-115).
    var takeToken: String? = nil
    static let cold = HotState(phase: .cold, warmUntil: nil)
}

struct HotCommand: Codable, Equatable {
    enum Action: String, Codable { case start, stop, cancel }
    let action: Action
    let token: String
    let createdAt: Date
}

extension AppGroupStore {
    static let hotStateKey = "murmur.hot.state"
    static let hotCommandKey = "murmur.hot.command"

    func writeHotState(_ state: HotState) { write(state, key: Self.hotStateKey) }

    // An expired warm window reads as cold whatever phase was stored, so a
    // keyboard that missed the release still does the right thing (bounce).
    func readHotState(now: Date = Date()) -> HotState {
        guard let s: HotState = read(Self.hotStateKey) else { return .cold }
        if let until = s.warmUntil, now > until { return .cold }
        return s
    }

    func writeCommand(_ command: HotCommand) { write(command, key: Self.hotCommandKey) }

    // Consume-once: the app reads a command and clears it, ignoring anything
    // older than the bounce stale window so a stuck command never fires late.
    func consumeCommand(now: Date = Date()) -> HotCommand? {
        guard let command: HotCommand = read(Self.hotCommandKey) else { return nil }
        defaults?.removeObject(forKey: Self.hotCommandKey)
        guard now.timeIntervalSince(command.createdAt) <= Self.staleAfter else { return nil }
        return command
    }

    // The live mic level (0...1), shared so the keyboard's in-place waveform is
    // driven by real audio, not a canned animation, and so a flat waveform
    // tells the user Murmur is not actually hearing them. NOT UserDefaults:
    // live testing (2026-08-09, L0.00 readout) showed the suite's cross-process
    // sync starves under a ~23 Hz write stream, serving the extension a stale
    // snapshot until the writes stop; per-event values (state, commands,
    // results) cross fine, a fast-changing one does not. Preferences are not
    // IPC. A 4-byte file in the group container, written atomically so a read
    // can never tear, is the honest transport.
    private static var levelFileURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: suiteName)?
            .appendingPathComponent("hot.level")
    }

    func writeLevel(_ level: Float) {
        guard let url = Self.levelFileURL else { return }
        var value = level
        let data = Data(bytes: &value, count: MemoryLayout<Float>.size)
        try? data.write(to: url, options: .atomic)
    }

    // Nil means the file does not exist or cannot be read (writer never ran,
    // container mismatch), as opposed to a real zero from a quiet mic. The
    // keyboard's diagnostic readout renders the difference.
    func readLevelIfPresent() -> Float? {
        guard let url = Self.levelFileURL,
              let data = try? Data(contentsOf: url),
              data.count >= MemoryLayout<Float>.size else { return nil }
        return data.withUnsafeBytes { $0.loadUnaligned(as: Float.self) }
    }

    func readLevel() -> Float {
        readLevelIfPresent() ?? 0
    }
}

// Cross-process wake-ups. Darwin notifications are global to the device and
// carry no payload, so the real data rides the App Group and this just pokes
// the other side to re-read it.
enum DarwinSignal {
    static let command = "com.labroi.murmur.hot.command"   // keyboard -> app
    static let state = "com.labroi.murmur.hot.state"       // app -> keyboard

    static func post(_ name: String) {
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(name as CFString), nil, nil, true)
    }

    // Bridges a Darwin name onto NotificationCenter.default under the same
    // name so Swift objects observe it the ordinary way; the C callback can
    // capture nothing, hence the re-broadcast. Call once per name per process.
    static func bridge(_ name: String) {
        let callback: CFNotificationCallback = { _, _, cfName, _, _ in
            guard let cfName else { return }
            let raw = cfName.rawValue as String
            NotificationCenter.default.post(name: Notification.Name(raw), object: nil)
        }
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            nil, callback, name as CFString, nil, .deliverImmediately)
    }
}
