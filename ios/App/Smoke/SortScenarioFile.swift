// SPDX-License-Identifier: GPL-3.0-only
// shared/sort-scenarios.json as the smoke reads it (IOS-023): desktop's own
// sortNote over each note, with the replies its model gave, the requests
// it sent, and the files and report it left.
import Foundation

struct SortScenarioFile: Decodable {
    struct When: Decodable {
        let date: String
        let time: String
    }

    struct Call: Decodable {
        let system: String
        let user: String
        let reply: StubProtocol.SortReply
    }

    struct Place: Decodable {
        let relative: String
    }

    struct Report: Decodable {
        let outcome: String
        let tasks: Int
        let ideas: Int
        let notes: Int
        let held: Int
        let reason: String?
        let places: [Place]
    }

    struct Scenario: Decodable {
        let name: String
        let text: String
        let todoBefore: String?
        let ideasBefore: String?
        let calls: [Call]
        let report: Report?
        let again: Report?
        let todo: String?
        let ideas: String?
    }

    let when: When
    let scenarios: [Scenario]
}
