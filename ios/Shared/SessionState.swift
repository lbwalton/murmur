// SPDX-License-Identifier: GPL-3.0-only
// The listening session as the keyboard sees it (ios/prd.json IOS-009):
// on until a time, or off. The app writes it to the app group; the
// keyboard reads it to know whether a tap can start a take without leaving
// your app.
import Foundation

struct SessionState: Codable, Equatable, Sendable {
    /// When the session ends unless another take comes first; nil when off.
    var until: Date?

    func isOn(at now: Date = .now) -> Bool {
        until.map { $0 > now } ?? false
    }

    static let off = SessionState(until: nil)

    /// session.json in the app group, or nil without the entitlement.
    static var file: URL? {
        AppGroup.containerURL?.appending(path: "session.json")
    }

    /// The state in the file, off when there is none.
    static func read(from file: URL? = file) -> SessionState {
        guard let file, let data = try? Data(contentsOf: file) else { return .off }
        return (try? JSONDecoder().decode(SessionState.self, from: data)) ?? .off
    }

    func write(to file: URL? = SessionState.file) {
        guard let file, let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
