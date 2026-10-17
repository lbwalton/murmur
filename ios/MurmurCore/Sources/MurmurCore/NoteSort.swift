// SPDX-License-Identifier: GPL-3.0-only
// Sorting one note (ios/prd.json IOS-023): desktop's sortNote
// (src/main/notes/sorter.ts) in Swift, with its files and its model
// passed in. Ask the chat model to label the note's numbered sentences,
// validate the reply strictly, look again piece by piece where a cut line
// was tied to a filed item, then copy tasks and ideas into their files
// with links back. It runs after the note is already in the inbox and
// writes nothing unless the whole labeling is valid. shared/sort-scenarios.json
// holds desktop's own requests and files for the same notes and replies.
import Foundation

/// A note to sort: its words, when it was saved, and its inbox file.
public struct NoteSortInput: Codable, Sendable, Equatable {
    /// Which note this is: held lines and settled lines belong to it.
    public let id: UUID
    public let text: String
    public let moment: NoteMoment
    public let inbox: String

    public init(id: UUID = UUID(), text: String, moment: NoteMoment, inbox: String) {
        self.id = id
        self.text = text
        self.moment = moment
        self.inbox = inbox
    }
}

/// A line a sort held in the inbox instead of filing, with what it was tied to.
public struct HeldLine: Codable, Sendable, Equatable, Identifiable {
    public let id: Int
    /// The sentence's position in the note.
    public let position: Int
    public let text: String
    public let label: SortLabel
    public let reason: HeldReason
    /// A cut sentence held whole: File it anyway lands one line per piece.
    public let pieces: [String]?
    /// The run's lead-in: File it anyway nests the line under it.
    public let lead: LeadIn?
    public let match: ContextItem?
    /// The tasks file as it was when the match was read: Tick it accepts
    /// the file only while it still starts with this.
    public let snapshot: String?
}

public enum SortOutcome: String, Codable, Sendable {
    case filed, rejected, failed, skipped
}

public struct SortReport: Codable, Sendable, Equatable {
    public let outcome: SortOutcome
    public let tasks: Int
    public let ideas: Int
    public let notes: Int
    public let held: Int
    public let reason: String?
    /// The files a filed sort wrote into, tasks first.
    public let places: [String]

    public init(outcome: SortOutcome, tasks: Int = 0, ideas: Int = 0, notes: Int = 0, held: Int = 0, reason: String? = nil, places: [String] = []) {
        self.outcome = outcome
        self.tasks = tasks
        self.ideas = ideas
        self.notes = notes
        self.held = held
        self.reason = reason
        self.places = places
    }
}

/// What sorting remembers about the newest note: the lines it settled, so
/// Sort again sends only the rest, and the lines it held, for their buttons.
public struct SortMemory: Codable, Sendable, Equatable {
    public var input: NoteSortInput?
    public var settled: Set<Int> = []
    public var held: [HeldLine] = []
    public var nextHeldId = 1
    public var topic = ""

    public init() {}

    /// Positions of the newest note no sort has settled yet.
    public var pending: [Int] {
        guard let input else { return [] }
        return Sorter.remaining(Sorter.splitUnits(input.text).sentences.count, settled: settled)
    }
}

/// The notes folder, relative paths inside it.
public protocol NoteFolder: Sendable {
    /// The file's text, nil when there is none.
    func read(_ relative: String) -> String?
    func append(_ relative: String, _ text: String) throws
    /// The whole file replaced, for the one in-place edit (Tick it).
    func replace(_ relative: String, _ text: String) throws
}

/// What the chat model said: its text, or why there is none.
public enum SortReply: Sendable, Equatable {
    case content(String)
    case failed(String)
}

public typealias SortAsk = @Sendable (_ system: String, _ user: String) async -> SortReply

/// Why a held line's button did nothing.
public enum HeldRefusal: String, Error, Sendable {
    case notHeld
    case noteStays
    case noBox
    case alreadyTicked
    case notRead
    case fileChanged
    case moved
    case gone
    case writeFailed
}

public enum NoteSort {
    /// Sort one note, or, with only, the positions Sort again sends.
    /// Never throws: every outcome is a report.
    public static func sort(
        _ input: NoteSortInput, only: [Int]? = nil, memory: SortMemory, folder: some NoteFolder, rules: SorterRules, ask: SortAsk?
    ) async -> (report: SortReport, memory: SortMemory) {
        var memory = memory
        let units = Sorter.splitUnits(input.text)
        let all = units.sentences
        let positions = only ?? Array(all.indices)
        let sentences = positions.map { all[$0] }
        let unitLeads = positions.map { units.leads[$0] }
        if sentences.isEmpty { return (SortReport(outcome: .skipped, reason: "nothing to sort"), memory) }
        // Held and settled lines follow the note: a fresh note starts
        // empty, and a line sent again gets a fresh verdict.
        if memory.input?.id != input.id {
            let next = memory.nextHeldId
            memory = SortMemory()
            memory.nextHeldId = next
            memory.input = input
        } else {
            memory.held.removeAll { positions.contains($0.position) }
        }
        guard let ask else { return (SortReport(outcome: .failed, reason: "no connection"), memory) }

        let seams = sentences.map(Sorter.findSeams)
        let seamCounts = seams.map(\.count)
        let offerSeams = seamCounts.contains { $0 > 0 }
        let leadCounts = sentences.indices.map { Sorter.leadWords(sentences[$0], seams[$0], rules: rules).count }
        let offerLeads = leadCounts.contains { $0 > 0 }
        let tasksText = folder.read(rules.layout.tasks) ?? ""
        let items = Compare.context(tasks: tasksText, ideas: folder.read(rules.layout.ideas) ?? "", cap: rules.compareCap)

        var system = [rules.systemPrompt.joined(separator: " ")]
        if offerSeams { system.append(rules.seamsPrompt.joined(separator: " ")) }
        if offerLeads { system.append(rules.leadsPrompt.joined(separator: " ")) }
        if !items.isEmpty { system.append(rules.relationsPrompt.joined(separator: " ")) }
        var user = [Sorter.numberedList(sentences)]
        if offerSeams { user.append("Seams:\n" + Sorter.seamPrompt(sentences, seams)) }
        if offerLeads { user.append("Lead words:\n" + Sorter.leadPrompt(sentences, seams, rules: rules)) }
        if !items.isEmpty { user.append(Compare.contextPrompt(items, rules: rules)) }
        let reply = await ask(system.joined(separator: " "), user.joined(separator: "\n\n"))
        guard case let .content(content) = reply else {
            if case let .failed(reason) = reply { return (SortReport(outcome: .failed, reason: reason), memory) }
            return (SortReport(outcome: .failed), memory)
        }
        let reading = Sorter.validate(sentences.count, content, seamCounts: seamCounts, items: items.count, leadCounts: leadCounts)
        guard case let .labeled(verdict) = reading else {
            if case let .rejected(reason) = reading { return (SortReport(outcome: .rejected, reason: reason), memory) }
            return (SortReport(outcome: .rejected), memory)
        }

        // A chat model reports no confidence, so every line is sure.
        let sure = Array(sentences.indices)
        let picked = Compare.pickRelated(sure, labels: verdict.labels, relations: verdict.relations, items: items)
        let starts = verdict.starts ?? [:]
        let split = Compare.piecesToCompare(picked.related, sentences: sentences, labels: verdict.labels, seams: seams, votes: verdict.seams, starts: starts, group: "piece", rules: rules)
        var whole = split.whole
        var heldPieces: [HeldPiece] = []
        var filedPieces: [FiledPiece] = []
        var comparedKept: Set<Int> = []
        let keptRuns = items.isEmpty ? [] : Compare.runsToCompare(picked.kept, sentences: sentences, labels: verdict.labels, seams: seams, votes: verdict.seams, starts: starts, group: "piece", rules: rules)
        let compared = (split.cut + keptRuns).sorted { $0.local < $1.local }
        if !compared.isEmpty {
            let flat = Compare.flatten(compared)
            if let relations = await askRelations(flat.sentences, items: items, rules: rules, ask: ask) {
                (heldPieces, filedPieces) = Compare.assignPieceVotes(compared, relations: relations, items: items)
                comparedKept = Set(keptRuns.map(\.local))
            } else {
                for set in split.cut {
                    if let line = picked.related.first(where: { $0.local == set.local }) { whole.append(line) }
                }
            }
        }
        let wholePieces = Dictionary(split.cut.map { ($0.local, $0.pieces) }, uniquingKeysWith: { first, _ in first })
        let wholeLeads = Dictionary(split.cut.map { ($0.local, $0.lead) }, uniquingKeysWith: { first, _ in first })
        for line in whole {
            let lead = (wholeLeads[line.local] ?? nil) ?? unitLeads[line.local]
            memory.held.append(HeldLine(
                id: memory.nextHeldId, position: positions[line.local], text: sentences[line.local], label: verdict.labels[line.local],
                reason: Compare.heldReason(line.vote, item: line.item), pieces: wholePieces[line.local], lead: lead, match: line.item, snapshot: tasksText
            ))
            memory.nextHeldId += 1
        }
        for piece in heldPieces {
            memory.held.append(HeldLine(
                id: memory.nextHeldId, position: positions[piece.local], text: piece.text, label: piece.label,
                reason: Compare.heldReason(piece.vote, item: piece.item), pieces: nil, lead: piece.lead, match: piece.item, snapshot: tasksText
            ))
            memory.nextHeldId += 1
        }
        memory.held.sort { ($0.position, $0.id) < ($1.position, $1.id) }
        memory.settled = Sorter.settle(memory.settled, positions: positions, keptLocal: picked.related.map(\.local))
        let heldCount = whole.count + heldPieces.count

        // Filed in spoken order: a kept sentence whole or cut at its
        // confirmed seams, a compared sentence the pieces no vote tied.
        var expanded: (sentences: [String], labels: [SortLabel], leads: [LeadIn?]) = ([], [], [])
        for i in sure {
            if picked.kept.contains(i) && !comparedKept.contains(i) {
                let one = Sorter.applySplits(
                    [sentences[i]], [verdict.labels[i]], [seams[i]],
                    votes: verdict.seams[i + 1].map { [1: $0] } ?? [:], starts: starts[i + 1].map { [1: $0] } ?? [:],
                    group: "run-\(positions[i])", rules: rules
                )
                expanded.sentences += one.sentences
                expanded.labels += one.labels
                expanded.leads += one.leads.map { $0 ?? unitLeads[i] }
                continue
            }
            for piece in filedPieces where piece.local == i {
                expanded.sentences.append(piece.text)
                expanded.labels.append(piece.label)
                expanded.leads.append(piece.lead)
            }
        }
        memory.topic = ""
        let written = write(input, expanded.sentences, expanded.labels, leads: expanded.leads, topic: "", folder: folder, rules: rules)
        let keptLabels = picked.kept.map { verdict.labels[$0] }
        switch written {
        case let .failure(failure):
            let landed = failure.landed
            let keptLocal = picked.kept.enumerated().filter { k, _ in
                let label = keptLabels[k]
                return label == .note || (label == .task && landed.tasks > 0) || (label == .idea && landed.ideas > 0)
            }.map(\.element)
            memory.settled = Sorter.settle(memory.settled, positions: positions, keptLocal: keptLocal)
            return (SortReport(outcome: .failed, tasks: landed.tasks, ideas: landed.ideas, notes: landed.notes, held: heldCount, reason: failure.reason), memory)
        case let .success(done):
            memory.settled = Sorter.settle(memory.settled, positions: positions, keptLocal: picked.kept)
            return (SortReport(outcome: .filed, tasks: done.tasks, ideas: done.ideas, notes: done.notes, held: heldCount, places: done.places), memory)
        }
    }

    /// Sort again: the newest note's unsettled lines only, or nil when none are left.
    public static func sortAgain(memory: SortMemory, folder: some NoteFolder, rules: SorterRules, ask: SortAsk?) async -> (report: SortReport, memory: SortMemory)? {
        guard let input = memory.input else { return nil }
        let pending = memory.pending
        guard !pending.isEmpty else { return nil }
        return await sort(input, only: pending, memory: memory, folder: folder, rules: rules, ask: ask)
    }

    /// The second, smaller request: the pieces against the same items. nil when it cannot be answered.
    static func askRelations(_ pieces: [String], items: [ContextItem], rules: SorterRules, ask: SortAsk) async -> [Int: RelationVote]? {
        let system = [rules.systemPrompt.joined(separator: " "), rules.relationsPrompt.joined(separator: " ")].joined(separator: " ")
        let user = [Sorter.numberedList(pieces), Compare.contextPrompt(items, rules: rules)].joined(separator: "\n\n")
        guard case let .content(content) = await ask(system, user) else { return nil }
        guard case let .labeled(verdict) = Sorter.validate(pieces.count, content, seamCounts: pieces.map { _ in 0 }, items: items.count) else { return nil }
        return verdict.relations
    }

    struct Landed {
        var tasks = 0
        var ideas = 0
        var notes = 0
    }

    struct WriteFailure: Error {
        let reason: String
        let landed: Landed
    }

    struct Written {
        let tasks: Int
        let ideas: Int
        let notes: Int
        let places: [String]
    }

    /// Tasks and ideas as lines with a link back, under the day's heading,
    /// tasks first; notes nowhere, the inbox already holds them.
    static func write(_ input: NoteSortInput, _ sentences: [String], _ labels: [SortLabel], leads: [LeadIn?], topic: String, folder: some NoteFolder, rules: SorterRules) -> Result<Written, WriteFailure> {
        let plan = Sorter.planFiling(sentences, labels, time: input.moment.time, inbox: input.inbox, tasks: rules.layout.tasks, ideas: rules.layout.ideas, leads: leads)
        var landed = Landed(notes: plan.notes.count)
        let heading = Sorter.filedHeading(rules.layout.heading, at: input.moment, topic: topic)
        var places: [String] = []
        let writes = [(rules.layout.tasks, plan.tasks, SortLabel.task), (rules.layout.ideas, plan.ideas, SortLabel.idea)].filter { !$0.1.isEmpty }
        for (file, lines, kind) in writes {
            let existing = folder.read(file) ?? ""
            let prefix = Sorter.headingPrefix(heading, existing: existing)
            let gap = !prefix.isEmpty && !JS.trim(existing).isEmpty ? "\n" : ""
            let tail = existing.isEmpty ? nil : String(decoding: [existing.utf16.last ?? 0], as: UTF16.self)
            do {
                try folder.append(file, NoteFiles.separator(tail) + gap + prefix + lines.joined(separator: "\n") + "\n")
            } catch {
                return .failure(WriteFailure(reason: "write \((error as NSError).code)", landed: landed))
            }
            if kind == .task { landed.tasks = lines.count } else { landed.ideas = lines.count }
            places.append(file)
        }
        return .success(Written(tasks: plan.tasks.count, ideas: plan.ideas.count, notes: plan.notes.count, places: places))
    }

    // MARK: Held lines

    /// File it anyway: land one held line, its pieces when it was cut.
    public static func file(_ id: Int, memory: SortMemory, folder: some NoteFolder, rules: SorterRules) -> Result<SortMemory, HeldRefusal> {
        guard let input = memory.input, let entry = memory.held.first(where: { $0.id == id }) else { return .failure(.notHeld) }
        if entry.label == .note { return .failure(.noteStays) }
        let lines = (entry.pieces?.count ?? 0) > 1 ? entry.pieces ?? [] : [entry.text]
        let written = write(input, lines, lines.map { _ in entry.label }, leads: lines.map { _ in entry.lead }, topic: memory.topic, folder: folder, rules: rules)
        if case .failure = written { return .failure(.writeFailed) }
        return .success(dropped(entry, from: memory))
    }

    /// Skip: the line stays in the inbox and is not sent again.
    public static func skip(_ id: Int, memory: SortMemory) -> Result<SortMemory, HeldRefusal> {
        guard memory.input != nil, let entry = memory.held.first(where: { $0.id == id }) else { return .failure(.notHeld) }
        return .success(dropped(entry, from: memory))
    }

    /// Tick it: the matched box in the tasks file becomes [x], every other
    /// byte kept, refused when the file changed in place since the match
    /// was read.
    public static func tick(_ id: Int, memory: SortMemory, folder: some NoteFolder, rules: SorterRules) -> Result<SortMemory, HeldRefusal> {
        guard memory.input != nil, let entry = memory.held.first(where: { $0.id == id }) else { return .failure(.notHeld) }
        guard let match = entry.match, match.file == .tasks, match.checkbox else { return .failure(.noBox) }
        if match.done { return .failure(.alreadyTicked) }
        guard let snapshot = entry.snapshot else { return .failure(.notRead) }
        let current = folder.read(rules.layout.tasks) ?? ""
        guard current.utf16.starts(with: snapshot.utf16) else { return .failure(.fileChanged) }
        let items = Todo.items(current)
        guard match.nth < items.count, JS.same(items[match.nth].text, match.text) else { return .failure(.moved) }
        let ticked = Todo.tick(current, nth: match.nth)
        guard let text = ticked.text else { return .failure(ticked.alreadyDone ? .alreadyTicked : .gone) }
        do {
            try folder.replace(rules.layout.tasks, text)
        } catch {
            return .failure(.writeFailed)
        }
        return .success(dropped(entry, from: memory))
    }

    static func dropped(_ entry: HeldLine, from memory: SortMemory) -> SortMemory {
        var next = memory
        next.settled = Sorter.settle(next.settled, positions: [entry.position], keptLocal: [0])
        next.held.removeAll { $0.id == entry.id }
        return next
    }
}
