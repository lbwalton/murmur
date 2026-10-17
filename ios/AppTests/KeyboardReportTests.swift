// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Suite struct KeyboardReportTests {
    /// The keyboard's report reads back as written, and is absent until the
    /// keyboard has appeared with Full Access.
    @Test func theReportRoundTrips() {
        let file = FileManager.default.temporaryDirectory.appending(path: "keyboard-\(UUID().uuidString).json")
        #expect(KeyboardReport.read(from: file) == nil)
        let at = Date(timeIntervalSince1970: 1_790_000_000)
        KeyboardReport(fullAccess: true, at: at).write(to: file)
        #expect(KeyboardReport.read(from: file) == KeyboardReport(fullAccess: true, at: at))
    }

    /// The report lives in the app group, beside the mailbox.
    @Test func theReportSitsInTheAppGroup() {
        #expect(KeyboardReport.file?.lastPathComponent == "keyboard.json")
        #expect(KeyboardReport.file?.deletingLastPathComponent() == AppGroup.containerURL)
    }
}
