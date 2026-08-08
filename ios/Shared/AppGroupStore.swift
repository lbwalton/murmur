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
