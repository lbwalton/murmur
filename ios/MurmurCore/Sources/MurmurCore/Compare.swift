// SPDX-License-Identifier: GPL-3.0-only
// Comparing a new note against what is already filed (ios/prd.json
// IOS-023): desktop's src/shared/compare.ts and pieces.ts in Swift. The
// most recent items of the tasks and ideas files ride the request,
// numbered, and the model votes per sentence: new, the same as item N, or
// item N finished. A line the vote ties to an item is held in the inbox
// with the item quoted; nothing is merged or edited without a tap. A
// malformed vote means new, so a bad reply can never hide a line.
import Foundation

public enum ContextFile: String, Codable, Sendable {
    case tasks, ideas
}

/// An item already filed, as the model sees it.
public struct ContextItem: Codable, Equatable, Sendable {
    /// The number the model sees, across both files.
    public let number: Int
    public let file: ContextFile
    /// A checkbox's position among the file's checkboxes; a plain
    /// bullet's position among all of the file's items.
    public let nth: Int
    public let text: String
    public let done: Bool
    public let checkbox: Bool
}

public enum Relation: String, Codable, Sendable {
    case same, completes
}

public struct RelationVote: Codable, Equatable, Sendable {
    public let relation: Relation
    /// The item's number in the context.
    public let item: Int
}

public enum HeldReason: String, Codable, Sendable {
    case unsure, same, completes
    case doneBefore = "done-before"
}

/// A sure line a vote tied to a filed item.
public struct RelatedLine: Equatable, Sendable {
    /// Index among the sentences sent.
    public let local: Int
    public let vote: RelationVote
    public let item: ContextItem
}

/// A related or kept sentence cut into its run, compared piece by piece.
public struct PieceSet: Equatable, Sendable {
    public let local: Int
    public let label: SortLabel
    public let pieces: [String]
    public let lead: LeadIn?
}

public struct HeldPiece: Equatable, Sendable {
    public let local: Int
    public let text: String
    public let label: SortLabel
    public let vote: RelationVote
    public let item: ContextItem
    public let lead: LeadIn?
}

public struct FiledPiece: Equatable, Sendable {
    public let local: Int
    public let text: String
    public let label: SortLabel
    public let lead: LeadIn?
}

public enum Compare {
    /// The most recent items of each file, numbered in file order, tasks first.
    public static func context(tasks: String, ideas: String, cap: Int) -> [ContextItem] {
        var out: [ContextItem] = []
        func take(_ text: String, _ file: ContextFile) {
            let items = Todo.listItems(text)
            var boxes = -1
            for (index, item) in items.enumerated() {
                if item.checkbox { boxes += 1 }
                if index < items.count - cap { continue }
                out.append(ContextItem(number: out.count + 1, file: file, nth: item.checkbox ? boxes : index, text: item.text, done: item.done, checkbox: item.checkbox))
            }
        }
        take(tasks, .tasks)
        take(ideas, .ideas)
        return out
    }

    /// The items as the chat model sees them.
    public static func contextPrompt(_ items: [ContextItem], rules: SorterRules) -> String {
        if items.isEmpty { return "" }
        let header = rules.contextHeader.replacingOccurrences(of: "{cap}", with: String(rules.compareCap))
        let lines = items.map { "\($0.number). [\($0.done ? "x" : " ")] \($0.text)" }
        return header + "\n" + lines.joined(separator: "\n")
    }

    /// The relations key: anything that is not a clean pair naming a real
    /// sentence and a real item means new for that sentence only.
    static func readRelationVotes(_ raw: JSValue?, sentenceCount: Int, itemCount: Int) -> [Int: RelationVote] {
        var votes: [Int: RelationVote] = [:]
        guard let object = raw?.object, itemCount > 0 else { return votes }
        for (key, value) in object.entries {
            let sentence = JS.number(key)
            guard JS.isInteger(sentence), sentence >= 1, sentence <= Double(sentenceCount) else { continue }
            guard let pair = value.array, pair.count == 2, let code = pair[0].number, let item = pair[1].number else { continue }
            let relation: Relation? = code == 1 ? .same : code == 2 ? .completes : nil
            guard let relation, JS.isInteger(item), item >= 1, item <= Double(itemCount) else { continue }
            votes[Int(sentence)] = RelationVote(relation: relation, item: Int(item))
        }
        return votes
    }

    /// The sure lines a vote tied to a filed item, and the ones that file.
    /// A note is compared for completion only: it files nowhere, so it is
    /// never a repeat of one.
    public static func pickRelated(_ sure: [Int], labels: [SortLabel], relations: [Int: RelationVote], items: [ContextItem]) -> (related: [RelatedLine], kept: [Int]) {
        var related: [RelatedLine] = []
        var kept: [Int] = []
        for i in sure {
            let label = labels[i]
            let vote = relations[i + 1]
            let item = vote.flatMap { $0.item >= 1 && $0.item <= items.count ? items[$0.item - 1] : nil }
            let compared = label != .note || vote?.relation == .completes
            if compared, let vote, let item {
                related.append(RelatedLine(local: i, vote: vote, item: item))
            } else {
                kept.append(i)
            }
        }
        return (related, kept)
    }

    /// Why a related line is held: a match to a finished item is done before.
    public static func heldReason(_ vote: RelationVote, item: ContextItem) -> HeldReason {
        item.done ? .doneBefore : vote.relation == .same ? .same : .completes
    }

    // MARK: Pieces

    static func cutSet(_ local: Int, sentences: [String], labels: [SortLabel], seams: [[Seam]], votes: [Int: [Int]], starts: [Int: Int], group: String, rules: SorterRules) -> PieceSet? {
        let label = labels[local]
        guard label != .note, let confirmed = votes[local + 1], !confirmed.isEmpty else { return nil }
        let run = Sorter.cutRun(sentences[local], local < seams.count ? seams[local] : [], confirmed: confirmed, start: starts[local + 1], rules: rules)
        guard run.pieces.count >= 2 else { return nil }
        return PieceSet(local: local, label: label, pieces: run.pieces, lead: run.lead.map { LeadIn(text: $0, group: "\(group)-\(local + 1)") })
    }

    /// The related lines to compare piece by piece, and the ones held whole.
    public static func piecesToCompare(_ related: [RelatedLine], sentences: [String], labels: [SortLabel], seams: [[Seam]], votes: [Int: [Int]], starts: [Int: Int], group: String, rules: SorterRules) -> (cut: [PieceSet], whole: [RelatedLine]) {
        var cut: [PieceSet] = []
        var whole: [RelatedLine] = []
        for line in related {
            if let set = cutSet(line.local, sentences: sentences, labels: labels, seams: seams, votes: votes, starts: starts, group: group, rules: rules) {
                cut.append(set)
            } else {
                whole.append(line)
            }
        }
        return (cut, whole)
    }

    /// The kept lines that are runs, cut for the same piece-by-piece look.
    public static func runsToCompare(_ kept: [Int], sentences: [String], labels: [SortLabel], seams: [[Seam]], votes: [Int: [Int]], starts: [Int: Int], group: String, rules: SorterRules) -> [PieceSet] {
        kept.compactMap { cutSet($0, sentences: sentences, labels: labels, seams: seams, votes: votes, starts: starts, group: group, rules: rules) }
    }

    /// The pieces as one numbered list, each with its sentence's label.
    public static func flatten(_ cut: [PieceSet]) -> (sentences: [String], labels: [SortLabel]) {
        (cut.flatMap(\.pieces), cut.flatMap { set in set.pieces.map { _ in set.label } })
    }

    /// The second request's votes read back onto the pieces.
    public static func assignPieceVotes(_ cut: [PieceSet], relations: [Int: RelationVote], items: [ContextItem]) -> (held: [HeldPiece], filed: [FiledPiece]) {
        let owners = cut.flatMap { set in set.pieces.map { FiledPiece(local: set.local, text: $0, label: set.label, lead: set.lead) } }
        let flat = flatten(cut)
        let picked = pickRelated(Array(flat.sentences.indices), labels: flat.labels, relations: relations, items: items)
        let held = picked.related.map { r in
            let owner = owners[r.local]
            return HeldPiece(local: owner.local, text: owner.text, label: owner.label, vote: r.vote, item: r.item, lead: owner.lead)
        }
        return (held, picked.kept.map { owners[$0] })
    }
}
