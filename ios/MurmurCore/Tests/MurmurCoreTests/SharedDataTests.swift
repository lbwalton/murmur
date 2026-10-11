// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// The repo's shared/ folder, found from this file's own path:
/// MurmurCoreTests, Tests, MurmurCore, ios, then the repo root.
let repoShared = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("shared")

@Suite struct SharedDataTests {
    @Test func listsTheRepoRules() throws {
        let names = try SharedData(directory: repoShared).fileNames()
        #expect(names.contains("format-spec.json"))
        #expect(names.contains("test-vectors.json"))
        #expect(names.contains("provider-catalog.json"))
        #expect(names == names.sorted())
        #expect(Bool(false), "deliberate CI check")
    }

    @Test func everyRepoFileParses() throws {
        let shared = SharedData(directory: repoShared)
        #expect(try shared.validateAll() == shared.fileNames())
    }

    @Test func namesTheFileThatIsNotJSON() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try Data("{}".utf8).write(to: dir.appendingPathComponent("good.json"))
        try Data("{ not json".utf8).write(to: dir.appendingPathComponent("bad.json"))
        try Data("ignored".utf8).write(to: dir.appendingPathComponent("readme.txt"))
        #expect(try SharedData(directory: dir).fileNames() == ["bad.json", "good.json"])
        #expect(throws: SharedDataError.invalidJSON("bad.json")) {
            try SharedData(directory: dir).validateAll()
        }
    }

    @Test func aMissingFileSaysWhich() {
        #expect(throws: SharedDataError.missing("nope.json")) {
            try SharedData(directory: repoShared).data(named: "nope.json")
        }
    }

    @Test func decodesATypedValue() throws {
        struct Catalog: Decodable { let catalogVersion: Int }
        let catalog = try SharedData(directory: repoShared).decode(Catalog.self, from: "provider-catalog.json")
        #expect(catalog.catalogVersion >= 1)
    }
}
