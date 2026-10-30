// SPDX-License-Identifier: GPL-3.0-only
// What the keyboard says about itself (ios/prd.json IOS-011): that it has
// appeared with Full Access, and when. A keyboard can write to the app
// group only with Full Access, so the report itself is the proof first run
// looks for; murmur reads nothing about other keyboards.
import Foundation

struct KeyboardReport: Codable, Equatable, Sendable {
    var fullAccess: Bool
    var at: Date

    static var file: URL? {
        AppGroup.containerURL?.appending(path: "keyboard.json")
    }

    static func read(from file: URL? = file) -> KeyboardReport? {
        guard let file, let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(KeyboardReport.self, from: data)
    }

    func write(to file: URL? = KeyboardReport.file) {
        guard let file, let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
