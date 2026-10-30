// SPDX-License-Identifier: GPL-3.0-only
// The notes' words (ios/prd.json IOS-023), desktop's notes panel's where
// the iPhone shows the same thing.
import Foundation
import MurmurCore

enum NotesCopy {
    static let title = "Notes"
    static let newNote = "New note"
    static let newNoteHint = "Talk, then tap stop. Your words are kept as a note in today's inbox, not typed."
    static let newest = "Newest note"
    static let held = "Held for you"
    static let tasks = "Tasks"
    static let ideas = "Ideas"
    static let inbox = "Inbox"
    static let sortAgain = "Sort again"
    static let sorting = "Sorting…"
    static let fileIt = "File it anyway"
    static let skip = "Skip"
    static let tickIt = "Tick it"
    static let noTasks = "No tasks yet. Say one in a note and a sort files it here."
    static let noIdeas = "No ideas yet. Say one in a note and a sort files it here."
    static let noNotes = "No notes yet."
    /// What a tap on a note's receipt does (LaBroi, 2026-10-18).
    static let opensInObsidian = "Opens the note in Obsidian"
    static let opensHere = "Opens the note"
    static let howTo = "Tap New note and talk, or press and hold the pill on the murmur keyboard and tap Note: your next take is kept here instead of typed."
    static let notSaved = "murmur could not save that note. Your words are in your takes on Home."
    /// What Send one now says when a reminder would stay quiet.
    static let nothingOpen = "Nothing open right now, so a reminder would stay quiet."
    static let noTasksToRemind = "No tasks yet, so there is nothing to remind you of."

    static func plural(_ n: Int, _ one: String, _ many: String) -> String {
        "\(n) \(n == 1 ? one : many)"
    }

    /// Why a line was held, with the item it was tied to.
    static func heldPhrase(_ line: HeldLine) -> String {
        let item = line.match?.text ?? ""
        switch line.reason {
        case .same: return "looks like a duplicate of: \(item)"
        case .completes: return "sounds like you finished: \(item)"
        case .doneBefore: return "you finished this before: \(item)"
        default: return "the model was not sure what this is"
        }
    }

    /// The held line's own words, with its lead when it had one.
    static func heldLabel(_ line: HeldLine) -> String {
        guard let lead = line.lead else { return line.text }
        let text = lead.text.hasSuffix(":") ? String(lead.text.dropLast()) : lead.text
        return "\(text): \(line.text)"
    }

    /// A held line's choices, as desktop says them.
    static func heldDetail(_ line: HeldLine) -> String {
        var out = withStop(heldPhrase(line)) + " It stays in the inbox as you said it."
        if line.label != .note {
            let pieces = line.pieces?.count ?? 0
            out += " File it anyway lands it as " + (pieces > 1 ? "\(pieces) \(line.label.rawValue)s, one per item" : "a \(line.label.rawValue)") + ";"
        }
        out += " Skip leaves it there."
        if canTick(line) { out += " Tick it marks that item done in your tasks file, one box and nothing else." }
        return out
    }

    /// Tick it shows for a line that finishes an open task with a box.
    static func canTick(_ line: HeldLine) -> Bool {
        guard line.reason == .completes, let match = line.match else { return false }
        return match.file == .tasks && match.checkbox && !match.done
    }

    /// One phrase for how the newest sort went.
    static func summary(_ report: SortReport) -> String {
        let reason = report.reason ?? "unknown"
        let held = report.held > 0 ? ", \(plural(report.held, "line", "lines")) held in the inbox" : ""
        switch report.outcome {
        case .filed:
            return "Filed \(plural(report.tasks, "task", "tasks")) and \(plural(report.ideas, "idea", "ideas"))\(held)."
        case .rejected where report.reason == "low confidence":
            return "Held every line in the inbox as unsure (\(plural(report.held, "line", "lines"))), nothing filed."
        case .rejected:
            return "Sort rejected (\(reason)), nothing filed."
        case .failed:
            let landed = report.tasks + report.ideas
            return landed > 0
                ? "Sort failed (\(reason)) after \(plural(report.tasks, "task", "tasks")) and \(plural(report.ideas, "idea", "ideas")) landed."
                : "Sort failed (\(reason)), nothing filed."
        case .skipped:
            return "Sort skipped (\(reason))."
        }
    }

    /// Why a held line's button did nothing.
    static func refusal(_ refusal: HeldRefusal) -> String {
        switch refusal {
        case .notHeld: "Nothing is held at that line."
        case .noteStays: "A note stays in the inbox; tick its match, or skip it."
        case .noBox: "That line has no box in the tasks file to tick."
        case .alreadyTicked: "That item is already ticked."
        case .notRead: "The tasks file has not been read for that line."
        case .fileChanged: "The tasks file changed since murmur read it, so murmur left it alone."
        case .moved: "That item is no longer where murmur read it, so murmur left it alone."
        case .gone: "That item is no longer in the file."
        case .writeFailed: "murmur could not write the file. Try again."
        }
    }

    static func withStop(_ phrase: String) -> String {
        guard let last = phrase.last else { return phrase }
        return ".!?".contains(last) ? phrase : phrase + "."
    }
}
