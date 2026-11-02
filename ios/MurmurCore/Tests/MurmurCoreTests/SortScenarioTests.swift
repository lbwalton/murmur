// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Synchronization
import Testing
@testable import MurmurCore

/// shared/sort-scenarios.json: desktop's own sortNote over fixed notes
/// and canned replies, with every request it sent and every file it left.
struct SortScenarios: Decodable {
    struct Reply: Decodable, Sendable {
        let content: String?
        let status: Int?
    }

    struct Call: Decodable, Sendable {
        let system: String
        let user: String
        let reply: Reply
    }

    struct Place: Decodable, Sendable {
        let kind: String
        let relative: String
    }

    struct Report: Decodable, Sendable {
        let outcome: String
        let tasks: Int
        let ideas: Int
        let notes: Int
        let held: Int
        let reason: String?
        let places: [Place]
    }

    struct Lead: Decodable, Equatable, Sendable {
        let text: String
        let group: String
    }

    struct Match: Decodable, Equatable, Sendable {
        let number: Int
        let file: String
        let nth: Int
        let text: String
        let done: Bool
        let checkbox: Bool
    }

    struct Held: Decodable, Equatable, Sendable {
        let position: Int
        let text: String
        let label: String
        let reason: String
        let pieces: [String]?
        let lead: Lead?
        let match: Match?
    }

    struct Scenario: Decodable, Sendable, CustomTestStringConvertible {
        let name: String
        let text: String
        let todoBefore: String?
        let ideasBefore: String?
        let calls: [Call]
        let report: Report
        let again: Report?
        let todo: String?
        let ideas: String?
        let held: [Held]

        var testDescription: String { name }
    }

    struct When: Decodable {
        let date: String
        let time: String
    }

    let when: When
    let inbox: String
    let scenarios: [Scenario]

    static let file: SortScenarios? = try? SharedData(directory: repoShared).decode(SortScenarios.self, from: "sort-scenarios.json")
}

/// A notes folder in memory.
final class MemoryFolder: NoteFolder {
    private let files: Mutex<[String: String]>

    init(_ files: [String: String] = [:]) {
        self.files = Mutex(files)
    }

    func read(_ relative: String) -> String? {
        files.withLock { $0[relative] }
    }

    func append(_ relative: String, _ text: String) throws {
        files.withLock { $0[relative, default: ""] += text }
    }

    func replace(_ relative: String, _ text: String) throws {
        files.withLock { $0[relative] = text }
    }
}

/// A chat model that answers from a script and keeps what it was asked.
final class ScriptedModel: Sendable {
    private let state: Mutex<(replies: [SortScenarios.Reply], asked: [(String, String)])>

    init(_ replies: [SortScenarios.Reply]) {
        state = Mutex((replies, []))
    }

    var asked: [(String, String)] {
        state.withLock { $0.asked }
    }

    var ask: SortAsk {
        { system, user in
            self.state.withLock { state in
                state.asked.append((system, user))
                guard !state.replies.isEmpty else { return .failed("http 599") }
                let reply = state.replies.removeFirst()
                if let content = reply.content { return .content(content) }
                return .failed("http \(reply.status ?? 0)")
            }
        }
    }
}

private func matches(_ got: SortReport?, _ want: SortScenarios.Report?, rules: SorterRules) -> Bool {
    guard let got, let want else { return got == nil && want == nil }
    let places = want.places.map(\.relative)
    return got.outcome.rawValue == want.outcome && got.tasks == want.tasks && got.ideas == want.ideas && got.notes == want.notes
        && got.held == want.held && got.reason == want.reason && got.places == places
}

@Suite struct SortScenarioTests {
    @Test func theScenariosLoad() throws {
        #expect(try #require(SortScenarios.file).scenarios.count >= 30)
    }

    @Test(arguments: SortScenarios.file?.scenarios ?? [])
    func eachNoteSortsAsOnDesktop(_ scenario: SortScenarios.Scenario) async throws {
        let file = try #require(SortScenarios.file)
        let rules = try #require(NotesVectors.rules)
        var start: [String: String] = [:]
        if let todo = scenario.todoBefore { start[rules.layout.tasks] = todo }
        if let ideas = scenario.ideasBefore { start[rules.layout.ideas] = ideas }
        let folder = MemoryFolder(start)
        let model = ScriptedModel(scenario.calls.map(\.reply))
        let input = NoteSortInput(text: scenario.text, moment: NoteMoment(date: file.when.date, time: file.when.time), inbox: file.inbox)
        let first = await NoteSort.sort(input, memory: SortMemory(), folder: folder, rules: rules, ask: model.ask)
        var memory = first.memory
        var again: SortReport?
        if scenario.again != nil {
            if let second = await NoteSort.sortAgain(memory: memory, folder: folder, rules: rules, ask: model.ask) {
                again = second.report
                memory = second.memory
            } else {
                // Desktop answers a Sort again with nothing left by giving the last report back.
                again = first.report
            }
        }
        #expect(model.asked.map(\.0) == scenario.calls.map(\.system))
        #expect(model.asked.map(\.1) == scenario.calls.map(\.user))
        #expect(matches(first.report, scenario.report, rules: rules), "\(first.report)")
        #expect(matches(again, scenario.again, rules: rules), "\(String(describing: again))")
        #expect(folder.read(rules.layout.tasks).map { Array($0.utf16) } == scenario.todo.map { Array($0.utf16) })
        #expect(folder.read(rules.layout.ideas).map { Array($0.utf16) } == scenario.ideas.map { Array($0.utf16) })
        let held = memory.held.map { h in
            SortScenarios.Held(
                position: h.position, text: h.text, label: h.label.rawValue, reason: h.reason.rawValue, pieces: h.pieces,
                lead: h.lead.map { SortScenarios.Lead(text: $0.text, group: $0.group) },
                match: h.match.map { SortScenarios.Match(number: $0.number, file: $0.file.rawValue, nth: $0.nth, text: $0.text, done: $0.done, checkbox: $0.checkbox) }
            )
        }
        #expect(held == scenario.held)
    }
}
