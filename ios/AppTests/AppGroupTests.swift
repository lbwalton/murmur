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

/// The group id lives once, as MURMUR_APP_GROUP in project.yml, so a
/// self-built copy changes it in one place.
@Test func theGroupComesFromTheBuildSettings() {
    #expect(AppGroup.identifier == Bundle.main.object(forInfoDictionaryKey: "MurmurAppGroup") as? String)
    #expect(AppGroup.identifier.hasPrefix("group."))
}
