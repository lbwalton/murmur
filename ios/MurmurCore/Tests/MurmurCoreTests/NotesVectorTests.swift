// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/notes-vectors.json: desktop's pure note rules on fixed inputs.
struct NotesVectors: Decodable {
    struct Lead: Decodable, Equatable {
        let text: String
        let group: String
    }

    struct Split: Decodable, Sendable {
        let text: String
        let sentences: [String]
        let leads: [Lead?]
    }

    struct Sides: Decodable, Equatable {
        let left: String
        let right: String
    }

    struct SeamCase: Decodable, Sendable {
        let sentence: String
        let sides: [Sides]
        let leadWords: [String]
    }

    struct CutCase: Decodable, Sendable {
        let sentence: String
        let confirmed: [Int]
        let start: Int?
        let lead: String?
        let pieces: [String]
    }

    struct Vote: Decodable, Equatable {
        let relation: String
        let item: Int
    }

    struct Verdict: Decodable {
        let ok: Bool
        let reason: String?
        let labels: [String]?
        let seams: [String: [Int]]?
        let relations: [String: Vote]?
        let starts: [String: Int]?
    }

    struct Options: Decodable {
        let seamCounts: [Int]?
        let items: Int?
        let leadCounts: [Int]?
    }

    struct ReplyCase: Decodable, Sendable {
        let count: Int
        let candidate: String
        let opts: Options
        let verdict: Verdict
    }

    struct Item: Decodable, Equatable {
        let text: String
        let done: Bool
        let group: String
        let checkbox: Bool?
    }

    struct FileCase: Decodable, Sendable {
        let text: String
        let todo: [Item]
        let list: [Item]
    }

    struct TickResult: Decodable {
        let ok: Bool
        let text: String?
        let reason: String?
    }

    struct TickCase: Decodable, Sendable {
        let text: String
        let nth: Int
        let result: TickResult
    }

    struct ReminderCase: Decodable, Sendable {
        let text: String
        let maxChars: Int?
        let body: String
    }

    struct ReceiptCase: Decodable, Sendable {
        let text: String
        let line: String
    }

    struct PlaceCase: Decodable, Sendable {
        let relative: String
        let location: String
        let placeName: String
        let pillPlace: String
    }

    struct EntryCase: Decodable, Sendable {
        let text: String
        let entry: String
    }

    struct SeparatorCase: Decodable, Sendable {
        let tail: String?
        let separator: String
    }

    let split: [Split]
    let seams: [SeamCase]
    let cuts: [CutCase]
    let replies: [ReplyCase]
    let files: [FileCase]
    let ticks: [TickCase]
    let reminders: [ReminderCase]
    let receipts: [ReceiptCase]
    let places: [PlaceCase]
    let entries: [EntryCase]
    let separators: [SeparatorCase]

    static let file: NotesVectors? = try? SharedData(directory: repoShared).decode(NotesVectors.self, from: "notes-vectors.json")
    static let rules: SorterRules? = try? SharedData(directory: repoShared).decode(SorterRules.self, from: "sorter.json")
}

extension NotesVectors.Split: CustomTestStringConvertible {
    var testDescription: String { text }
}

extension NotesVectors.ReplyCase: CustomTestStringConvertible {
    var testDescription: String { candidate }
}

@Suite struct NotesVectorTests {
    @Test func theVectorsLoad() throws {
        let file = try #require(NotesVectors.file)
        #expect(file.split.count >= 10 && file.replies.count >= 20)
        #expect(NotesVectors.rules != nil)
    }

    @Test(arguments: NotesVectors.file?.split ?? [])
    func notesSplitAsOnDesktop(_ c: NotesVectors.Split) {
        let units = Sorter.splitUnits(c.text)
        #expect(units.sentences == c.sentences)
        #expect(units.leads.map { $0.map { NotesVectors.Lead(text: $0.text, group: $0.group) } } == c.leads)
    }

    @Test func seamsAreDesktops() throws {
        let rules = try #require(NotesVectors.rules)
        for c in try #require(NotesVectors.file).seams {
            let seams = Sorter.findSeams(c.sentence)
            #expect(seams.map { NotesVectors.Sides(left: Sorter.sides(c.sentence, $0).left, right: Sorter.sides(c.sentence, $0).right) } == c.sides, "\(c.sentence)")
            #expect(Sorter.leadWords(c.sentence, seams, rules: rules) == c.leadWords, "\(c.sentence)")
        }
    }

    @Test func runsCutAsOnDesktop() throws {
        let rules = try #require(NotesVectors.rules)
        for c in try #require(NotesVectors.file).cuts {
            let run = Sorter.cutRun(c.sentence, Sorter.findSeams(c.sentence), confirmed: c.confirmed, start: c.start, rules: rules)
            #expect(run.lead == c.lead && run.pieces == c.pieces, "\(c.sentence) \(c.confirmed)")
        }
    }

    @Test(arguments: NotesVectors.file?.replies ?? [])
    func repliesReadAsOnDesktop(_ c: NotesVectors.ReplyCase) {
        let reading = Sorter.validate(c.count, c.candidate, seamCounts: c.opts.seamCounts ?? [], items: c.opts.items ?? 0, leadCounts: c.opts.leadCounts ?? [])
        switch reading {
        case let .rejected(reason):
            #expect(!c.verdict.ok && reason == c.verdict.reason)
        case let .labeled(verdict):
            #expect(c.verdict.ok)
            #expect(verdict.labels.map(\.rawValue) == c.verdict.labels)
            #expect(Dictionary(uniqueKeysWithValues: verdict.seams.map { (String($0.key), $0.value) }) == (c.verdict.seams ?? [:]))
            #expect(Dictionary(uniqueKeysWithValues: verdict.relations.map { (String($0.key), NotesVectors.Vote(relation: $0.value.relation.rawValue, item: $0.value.item)) }) == (c.verdict.relations ?? [:]))
            #expect(verdict.starts.map { Dictionary(uniqueKeysWithValues: $0.map { (String($0.key), $0.value) }) } == c.verdict.starts)
        }
    }

    @Test func filesReadAsOnDesktop() throws {
        for c in try #require(NotesVectors.file).files {
            #expect(Todo.items(c.text).map { NotesVectors.Item(text: $0.text, done: $0.done, group: $0.group, checkbox: nil) } == c.todo, "\(c.text)")
            #expect(Todo.listItems(c.text).map { NotesVectors.Item(text: $0.text, done: $0.done, group: $0.group, checkbox: $0.checkbox) } == c.list, "\(c.text)")
        }
    }

    @Test func boxesTickAsOnDesktop() throws {
        for c in try #require(NotesVectors.file).ticks {
            let ticked = Todo.tick(c.text, nth: c.nth)
            if c.result.ok {
                #expect(ticked.text.map { Array($0.utf16) } == c.result.text.map { Array($0.utf16) }, "\(c.text)")
            } else {
                #expect(ticked.text == nil && ticked.alreadyDone == (c.result.reason == "already done"), "\(c.text)")
            }
        }
    }

    @Test func remindersReadAsOnDesktop() throws {
        let rules = try #require(NotesVectors.rules)
        for c in try #require(NotesVectors.file).reminders {
            #expect(Todo.reminderBody(Todo.items(c.text), maxChars: c.maxChars ?? rules.reminderMaxChars) == c.body)
        }
    }

    @Test func receiptsReadAsOnDesktop() throws {
        let rules = try #require(NotesVectors.rules)
        let file = try #require(NotesVectors.file)
        for c in file.receipts {
            #expect(Receipt.line(c.text, max: rules.receiptLineMax) == c.line, "\(c.text)")
        }
        for c in file.places {
            #expect(Receipt.placeName(c.relative) == c.placeName)
            if c.location == "folder" { #expect(Receipt.pillPlace(c.relative, max: rules.pillPlaceMax) == c.pillPlace) }
        }
    }

    @Test func entriesReadAsOnDesktop() throws {
        let rules = try #require(NotesVectors.rules)
        let file = try #require(NotesVectors.file)
        let moment = NoteMoment(date: "2026-09-18", time: "10:32")
        for c in file.entries {
            #expect(Array(NoteFiles.entry(c.text, at: moment, template: rules.layout.entry).utf16) == Array(c.entry.utf16), "\(c.text)")
        }
        for c in file.separators {
            #expect(NoteFiles.separator(c.tail) == c.separator)
        }
        #expect(NoteFiles.inbox(moment, rules: rules) == "murmur/inbox/2026-09-18.md")
    }

    /// JavaScript's JSON.parse and Number, which the reply reading leans on.
    @Test func jsonReadsAsJavaScriptDoes() {
        #expect(JSValue.parse("{\"b\":1,\"2\":2,\"a\":3,\"1\":4,\"b\":5}")?.object?.entries.map(\.key) == ["1", "2", "b", "a"])
        #expect(JSValue.parse("{\"b\":1,\"b\":5}")?.object?["b"] == .number(5))
        #expect(JSValue.parse("[1, 2,]") == nil)
        #expect(JSValue.parse(" {\"a\":\"\\u00e9\\n\"} ")?.object?["a"] == .string("é\n"))
        #expect(JSValue.parse("01") == nil && JSValue.parse("1.") == nil && JSValue.parse("-0.5e2") == .number(-50))
        #expect(JS.number(" 2 ") == 2 && JS.number("0x1F") == 31 && JS.number("1.0") == 1 && JS.number("") == 0)
        #expect(JS.number("5.") == 5 && JS.number(".5") == 0.5 && JS.number("1e3") == 1000)
        #expect(JS.number("1_000").isNaN && JS.number("abc").isNaN && JS.number("-0x1").isNaN)
    }
}
