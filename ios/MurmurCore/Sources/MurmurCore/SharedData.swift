// SPDX-License-Identifier: GPL-3.0-only
// The shared rules: shared/*.json at the repo root, bundled into the app
// at build time. Swift never keeps its own copy of a rule; everything
// that decides behavior is read from these files (ios/prd.json
// conventions.parity).
import Foundation

public enum SharedDataError: Error, Equatable, CustomStringConvertible {
    case missing(String)
    case invalidJSON(String)

    public var description: String {
        switch self {
        case .missing(let name): "shared rule \(name) is missing"
        case .invalidJSON(let name): "shared rule \(name) is not valid JSON"
        }
    }
}

public struct SharedData: Sendable {
    public let directory: URL

    public init(directory: URL) {
        self.directory = directory
    }

    /// Every .json file in the folder, sorted by name.
    public func fileNames() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasSuffix(".json") }
            .sorted()
    }

    public func data(named name: String) throws -> Data {
        let url = directory.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: url.path) else { throw SharedDataError.missing(name) }
        return try Data(contentsOf: url)
    }

    public func decode<T: Decodable>(_ type: T.Type, from name: String) throws -> T {
        try JSONDecoder().decode(type, from: data(named: name))
    }

    /// Parses every file and returns their names; throws for the first
    /// one that is not JSON, naming it.
    public func validateAll() throws -> [String] {
        let names = try fileNames()
        for name in names {
            do {
                _ = try JSONSerialization.jsonObject(with: data(named: name))
            } catch {
                throw SharedDataError.invalidJSON(name)
            }
        }
        return names
    }
}
