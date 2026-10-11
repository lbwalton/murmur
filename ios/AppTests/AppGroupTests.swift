// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Test func theSharedDrawerOpens() throws {
    let container = try #require(AppGroup.containerURL)
    let probe = container.appendingPathComponent("test-\(UUID().uuidString).txt")
    defer { try? FileManager.default.removeItem(at: probe) }
    try Data("murmur".utf8).write(to: probe)
    #expect(try String(contentsOf: probe, encoding: .utf8) == "murmur")
}
