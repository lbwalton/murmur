// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// The notes' words (IOS-023): held lines and sort summaries say what
/// desktop's notes panel says.
@Suite struct NotesCopyTests {
    /// A held line as the notes' state keeps it.
    func held(_ reason: String, checkbox: Bool = true, done: Bool = false, file: String = "tasks") throws -> HeldLine {
        let json = """
        {"id":1,"position":1,"text":"I emailed Bob.","label":"task","reason":"\(reason)",\
        "match":{"number":2,"file":"\(file)","nth":1,"text":"Email Bob.","done":\(done),"checkbox":\(checkbox)}}
        """
        return try JSONDecoder().decode(HeldLine.self, from: Data(json.utf8))
    }

    @Test func aHeldLineSaysWhyInDesktopsWords() throws {
        #expect(NotesCopy.heldPhrase(try held("completes")) == "sounds like you finished: Email Bob.")
        #expect(NotesCopy.heldPhrase(try held("same")) == "looks like a duplicate of: Email Bob.")
        #expect(NotesCopy.heldPhrase(try held("done-before")) == "you finished this before: Email Bob.")
        #expect(NotesCopy.heldDetail(try held("same")) == "looks like a duplicate of: Email Bob. It stays in the inbox as you said it. File it anyway lands it as a task; Skip leaves it there.")
    }

    /// Tick it shows only for a line that finishes an open task with a box.
    @Test func tickItShowsOnlyForAnOpenBox() throws {
        #expect(NotesCopy.canTick(try held("completes")))
        #expect(!NotesCopy.canTick(try held("same")))
        #expect(!NotesCopy.canTick(try held("completes", checkbox: false)))
        #expect(!NotesCopy.canTick(try held("completes", done: true)))
        #expect(!NotesCopy.canTick(try held("completes", file: "ideas")))
    }

    @Test func aSortIsSummedUpAsOnDesktop() {
        #expect(NotesCopy.summary(SortReport(outcome: .filed, tasks: 2, ideas: 1, notes: 1)) == "Filed 2 tasks and 1 idea.")
        #expect(NotesCopy.summary(SortReport(outcome: .filed, tasks: 1, ideas: 0, notes: 0, held: 1)) == "Filed 1 task and 0 ideas, 1 line held in the inbox.")
        #expect(NotesCopy.summary(SortReport(outcome: .failed, reason: "no connection")) == "Sort failed (no connection), nothing filed.")
        #expect(NotesCopy.summary(SortReport(outcome: .rejected, reason: "missing sentence")) == "Sort rejected (missing sentence), nothing filed.")
    }
}
