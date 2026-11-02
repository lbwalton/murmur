// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// A chat that answers from a script and keeps what it was asked.
final class ScriptedChat: @unchecked Sendable {
    private let lock = NSLock()
    private var replies: [SortReply]
    private(set) var asked = 0

    init(_ replies: [SortReply]) {
        self.replies = replies
    }

    var ask: SortAsk {
        { _, _ in
            self.lock.withLock {
                self.asked += 1
                return self.replies.isEmpty ? .failed("http 599") : self.replies.removeFirst()
            }
        }
    }
}

/// Notes on iPhone (IOS-023): the inbox first, then desktop's sort.
@MainActor @Suite struct NotesTests {
    let root = FileManager.default.temporaryDirectory.appending(path: "notes-\(UUID().uuidString)", directoryHint: .isDirectory)
    let rules: SorterRules
    /// 2026-09-18 10:32 UTC, the moment desktop's scenarios were recorded at.
    let at = Date(timeIntervalSince1970: 1_789_727_520)
    let utc = TimeZone(identifier: "UTC")!

    init() throws {
        rules = try BundledRules.sorter()
    }

    var folder: NoteStore { NoteStore(root: root.appending(path: "notes", directoryHint: .isDirectory)) }
    var stateFile: NotesStateFile { NotesStateFile(file: root.appending(path: "state.json")) }

    func notes(sort: Bool = true, chat: ScriptedChat? = nil, counts: Counts? = nil, layout: NoteLayout? = nil) -> Notes {
        Notes(
            folder: folder, rules: rules, stateFile: stateFile, sortOn: { sort }, ask: { chat?.ask },
            remind: { counts?.reminded += 1 }, timeZone: { [utc] in utc }, layout: { layout },
            keepAlive: {
                counts?.held += 1
                return { counts?.released += 1 }
            }
        )
    }

    @MainActor final class Counts {
        var reminded = 0
        var held = 0
        var released = 0
    }

    @Test func aNoteLandsInTodaysInboxAsDesktopWritesIt() throws {
        let notes = notes(sort: false)
        #expect(notes.save("Call the dentist.", at: at) == "inbox")
        notes.save("Email Bob.", at: at)
        #expect(folder.read("murmur/inbox/2026-09-18.md") == "## 10:32\n\nCall the dentist.\n\n## 10:32\n\nEmail Bob.\n\n")
        #expect(notes.state.newest?.line == "Email Bob.")
        #expect(notes.state.newest?.place == "inbox/2026-09-18.md")
    }

    @Test func aSortFilesTasksAndIdeasAsDesktopDoes() async throws {
        let chat = ScriptedChat([.content("```json\n{\"1\":\"task\",\"2\":\"idea\",\"3\":\"note\",\"4\":\"task\"}\n```")])
        let counts = Counts()
        let notes = notes(chat: chat, counts: counts)
        notes.save("Call the dentist. Maybe the wizard asks for the vault. Nice weather today. Email Bob.", at: at)
        await notes.settle()
        #expect(folder.read("murmur/todo.md") == "## 2026-09-18\n- [ ] Call the dentist. ([10:32](inbox/2026-09-18.md))\n- [ ] Email Bob. ([10:32](inbox/2026-09-18.md))\n")
        #expect(folder.read("murmur/ideas.md") == "## 2026-09-18\n- Maybe the wizard asks for the vault. ([10:32](inbox/2026-09-18.md))\n")
        #expect(notes.state.report?.outcome == .filed)
        #expect(notes.state.newest?.place == "inbox/2026-09-18.md, filed to todo.md and ideas.md")
        #expect(counts.reminded == 1)
    }

    /// LaBroi's Mac keeps its notes in murmur/notes (Settings, Notes, File
    /// layout, Inbox file; build 482 check, 2026-10-18): the iPhone's same
    /// setting puts every note there too, and its receipt says notes.
    @Test func aChangedInboxFileIsWhereNotesLand() throws {
        let notes = notes(sort: false, layout: NoteLayout(inbox: "murmur/notes/{date}.md", tasks: rules.layout.tasks, ideas: rules.layout.ideas))
        #expect(notes.save("Call the dentist.", at: at) == "notes")
        #expect(notes.keep("Email Bob.", at: at) == NoteKept(place: "notes", file: "murmur/notes/2026-09-18.md"))
        #expect(folder.read("murmur/notes/2026-09-18.md") == "## 10:32\n\nCall the dentist.\n\n## 10:32\n\nEmail Bob.\n\n")
        #expect(folder.read("murmur/inbox/2026-09-18.md") == nil)
        #expect(notes.state.newest?.place == "notes/2026-09-18.md")
        #expect(notes.inboxFile("murmur/notes/2026-09-18.md") == "murmur/notes/2026-09-18.md")
    }

    /// One that would leave the folder lands in the default, as on desktop.
    @Test func anInboxFileThatCannotBeUsedFallsBack() throws {
        let notes = notes(sort: false, layout: NoteLayout(inbox: "../escape/{date}.md", tasks: rules.layout.tasks, ideas: rules.layout.ideas))
        #expect(notes.save("Call the dentist.", at: at) == "inbox")
        #expect(folder.read("murmur/inbox/2026-09-18.md") == "## 10:32\n\nCall the dentist.\n\n")
    }

    /// A sort files into the changed tasks and ideas files, resolved at the
    /// note's moment, with links back to the changed inbox.
    @Test func aSortFilesIntoTheChangedFiles() async throws {
        let chat = ScriptedChat([.content("```json\n{\"1\":\"task\",\"2\":\"idea\"}\n```")])
        let notes = notes(chat: chat, layout: NoteLayout(inbox: "murmur/notes/{date}.md", tasks: "murmur/tasks/{date}.md", ideas: "murmur/ideas.md"))
        notes.save("Call the dentist. Maybe the wizard asks for the vault.", at: at)
        await notes.settle()
        #expect(folder.read("murmur/tasks/2026-09-18.md") == "## 2026-09-18\n- [ ] Call the dentist. ([10:32](../notes/2026-09-18.md))\n")
        #expect(folder.read("murmur/ideas.md") == "## 2026-09-18\n- Maybe the wizard asks for the vault. ([10:32](notes/2026-09-18.md))\n")
        #expect(folder.read("murmur/todo.md") == nil)
        #expect(notes.rules(at: at).layout.tasks == "murmur/tasks/2026-09-18.md")
    }

    /// The newest note opens from its receipt even after the layout moved
    /// the inbox elsewhere.
    @Test func theNewestNoteOpensAfterTheLayoutChanges() throws {
        let box = LayoutBox(NoteLayout(inbox: "murmur/notes/{date}.md", tasks: rules.layout.tasks, ideas: rules.layout.ideas))
        let notes = Notes(folder: folder, rules: rules, stateFile: stateFile, sortOn: { false }, ask: { nil }, timeZone: { [utc] in utc }, layout: { box.layout })
        notes.save("Call the dentist.", at: at)
        box.layout = nil
        #expect(notes.inboxFile("murmur/notes/2026-09-18.md") == "murmur/notes/2026-09-18.md")
        #expect(notes.inboxFile("murmur/notes/2026-09-17.md") == nil)
    }

    /// A held line is ticked or filed in the files of its note's day, as on
    /// desktop, not today's, when the tasks file is dated.
    @Test func aHeldLineTicksInItsNotesDatedTasksFile() async throws {
        try folder.replace("murmur/tasks/2026-09-18.md", "## 2026-09-17\n- [ ] Call the dentist. ([09:00](../inbox/2026-09-17.md))\n- [ ] Email Bob. ([09:00](../inbox/2026-09-17.md))\n")
        let chat = ScriptedChat([.content("{\"1\":\"note\",\"2\":\"task\",\"relations\":{\"1\":[2,2]}}")])
        let notes = notes(chat: chat, layout: NoteLayout(inbox: rules.layout.inbox, tasks: "murmur/tasks/{date}.md", ideas: rules.layout.ideas))
        notes.save("I emailed Bob. Buy stamps.", at: at)
        await notes.settle()
        let held = try #require(notes.held.first)
        await notes.tick(held.id)
        #expect(notes.refused == nil)
        #expect(folder.read("murmur/tasks/2026-09-18.md")?.contains("- [x] Email Bob.") == true)
    }

    @MainActor final class LayoutBox {
        var layout: NoteLayout?
        init(_ layout: NoteLayout?) { self.layout = layout }
    }

    /// A sort holds background time from iOS until its files are written.
    @Test func aSortHoldsBackgroundTimeUntilItEnds() async throws {
        let counts = Counts()
        let notes = notes(chat: ScriptedChat([.content("{\"1\":\"task\"}")]), counts: counts)
        notes.save("Call the dentist.", at: at)
        await notes.settle()
        #expect(counts.held == 1)
        #expect(counts.released == 1)
        #expect(folder.read("murmur/todo.md") != nil)
    }

    @Test func sortingOffKeepsTheInboxOnly() async throws {
        let chat = ScriptedChat([.content("{\"1\":\"task\"}")])
        let counts = Counts()
        let notes = notes(sort: false, chat: chat, counts: counts)
        notes.save("Call the dentist.", at: at)
        await notes.settle()
        #expect(chat.asked == 0)
        #expect(counts.held == 0)
        #expect(folder.read("murmur/todo.md") == nil)
    }

    @Test func aHeldLineTicksTheTaskItFinishes() async throws {
        try folder.replace("murmur/todo.md", "## 2026-09-17\n- [ ] Call the dentist. ([09:00](inbox/2026-09-17.md))\n- [ ] Email Bob. ([09:00](inbox/2026-09-17.md))\n")
        let chat = ScriptedChat([.content("{\"1\":\"note\",\"2\":\"task\",\"relations\":{\"1\":[2,2]}}")])
        let notes = notes(chat: chat)
        notes.save("I emailed Bob. Buy stamps.", at: at)
        await notes.settle()
        let held = try #require(notes.held.first)
        #expect(held.reason == .completes)
        #expect(held.match?.text == "Email Bob.")
        await notes.tick(held.id)
        #expect(notes.held.isEmpty)
        #expect(folder.read("murmur/todo.md")?.contains("- [x] Email Bob. ([09:00](inbox/2026-09-17.md))") == true)
        #expect(notes.refused == nil)
    }

    @Test func aRefusedActionSaysWhy() async throws {
        try folder.replace("murmur/todo.md", "## 2026-09-17\n- [ ] Call the dentist. ([09:00](inbox/2026-09-17.md))\n- [ ] Email Bob. ([09:00](inbox/2026-09-17.md))\n")
        let chat = ScriptedChat([.content("{\"1\":\"note\",\"2\":\"task\",\"relations\":{\"1\":[2,2]}}")])
        let notes = notes(chat: chat)
        notes.save("I emailed Bob. Buy stamps.", at: at)
        await notes.settle()
        let held = try #require(notes.held.first)
        await notes.file(held.id)
        #expect(notes.refused == .noteStays)
        #expect(notes.held.count == 1)
    }

    @Test func withoutAConnectionTheNoteWaitsForSortAgain() async throws {
        let notes = notes(chat: nil)
        notes.save("Call the dentist.", at: at)
        await notes.settle()
        #expect(notes.state.report == SortReport(outcome: .failed, reason: "no connection"))
        #expect(notes.canSortAgain)
        #expect(folder.read("murmur/inbox/2026-09-18.md") != nil)
    }

    @Test func heldLinesAndTheNewestNoteSurviveARelaunch() async throws {
        try folder.replace("murmur/todo.md", "## 2026-09-17\n- [ ] Email Bob. ([09:00](inbox/2026-09-17.md))\n")
        let chat = ScriptedChat([.content("{\"1\":\"note\",\"2\":\"task\",\"relations\":{\"1\":[2,1]}}")])
        let first = notes(chat: chat)
        first.save("I emailed Bob. Buy stamps.", at: at)
        await first.settle()
        let again = notes(chat: nil)
        #expect(again.state == first.state)
        #expect(again.held.count == first.held.count)
    }

    @Test func aNoteThatCannotBeWrittenSaysSo() throws {
        let blocked = root.appending(path: "blocked")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("a file where the folder would be".utf8).write(to: blocked)
        let notes = Notes(folder: NoteStore(root: blocked), rules: rules, stateFile: stateFile, sortOn: { false }, ask: { nil }, timeZone: { [utc] in utc })
        #expect(notes.save("Call the dentist.", at: at) == nil)
        #expect(notes.state.newest == nil)
    }

    /// A note kept from the keyboard says which day's file it landed in, for
    /// Open note under the pill (LaBroi, 2026-10-18).
    @Test func aKeptNoteSaysWhereToOpenIt() {
        let notes = notes(sort: false)
        #expect(notes.keep("Call the dentist.", at: at) == NoteKept(place: "inbox", file: "murmur/inbox/2026-09-18.md"))
    }

    /// murmur's note link opens only an inbox day murmur wrote: a link
    /// from any other app naming another file opens nothing.
    @Test func aLinkOutsideTheInboxOpensNothing() {
        let notes = notes(sort: false)
        notes.save("Call the dentist.", at: at)
        #expect(notes.inboxFile("murmur/inbox/2026-09-18.md") == "murmur/inbox/2026-09-18.md")
        #expect(notes.inboxFile("murmur/inbox/2026-09-19.md") == nil)
        #expect(notes.inboxFile("murmur/todo.md") == nil)
        #expect(notes.inboxFile("murmur/inbox/../todo.md") == nil)
    }

    /// A folder chosen in Settings takes the next note; the last stays put.
    @Test func aNewFolderTakesTheNextNote() async throws {
        let counts = Counts()
        let notes = notes(sort: false, counts: counts)
        notes.save("Call the dentist.", at: at)
        let vault = NoteStore(root: root.appending(path: "vault", directoryHint: .isDirectory), picked: true)
        try FileManager.default.createDirectory(at: vault.root, withIntermediateDirectories: true)
        let before = notes.revision
        await notes.use(vault)
        #expect(notes.revision > before)
        #expect(counts.reminded == 1)
        notes.save("Email Bob.", at: at)
        #expect(vault.read("murmur/inbox/2026-09-18.md") == "## 10:32\n\nEmail Bob.\n\n")
        #expect(folder.read("murmur/inbox/2026-09-18.md") == "## 10:32\n\nCall the dentist.\n\n")
    }

    @MainActor final class Switch {
        var on = true
    }

    /// With sorting turned off, Sort again sends nothing: a note's words
    /// leave the phone for sorting only while sorting is on.
    @Test func sortAgainSendsNothingWithSortingOff() async throws {
        let sorting = Switch()
        let chat = ScriptedChat([.content("{\"1\":\"task\"}")])
        let connected = Switch()
        connected.on = false
        let notes = Notes(
            folder: folder, rules: rules, stateFile: stateFile, sortOn: { sorting.on }, ask: { connected.on ? chat.ask : nil },
            timeZone: { [utc] in utc }
        )
        notes.save("Call the dentist.", at: at)
        await notes.settle()
        #expect(notes.canSortAgain)
        sorting.on = false
        connected.on = true
        #expect(!notes.canSortAgain)
        await notes.sortAgain()
        #expect(chat.asked == 0)
    }

    /// Sort again offers only the newest note's lines, never an older note's
    /// while a newer one is on screen.
    @Test func sortAgainIsOnlyForTheNewestNote() async throws {
        let sorting = Switch()
        let notes = Notes(folder: folder, rules: rules, stateFile: stateFile, sortOn: { sorting.on }, ask: { nil }, timeZone: { [utc] in utc })
        notes.save("Call the dentist.", at: at)
        await notes.settle()
        sorting.on = false
        notes.save("Email Bob.", at: at)
        sorting.on = true
        #expect(!notes.canSortAgain)
    }

    /// A folder that comes back after murmur found it lost is used again.
    @Test func aFolderMurmurCanReachAgainIsUsedAgain() async throws {
        let counts = Counts()
        let lost = NoteStore(root: root.appending(path: "vault", directoryHint: .isDirectory), picked: true, lost: true)
        let notes = Notes(folder: lost, rules: rules, stateFile: stateFile, sortOn: { false }, ask: { nil }, remind: { counts.reminded += 1 }, timeZone: { [utc] in utc })
        await notes.recheck(lost)
        #expect(counts.reminded == 0)
        let found = NoteStore(root: lost.root, picked: true)
        await notes.recheck(found)
        #expect(!notes.folder.lost)
        #expect(counts.reminded == 1)
    }

    /// The Notes screen's files are read away from the main thread, so an
    /// iCloud vault downloading a file never holds the screen.
    @Test func theScreensFilesAreReadInOneGo() async throws {
        try folder.replace("murmur/todo.md", "- [ ] Call the dentist.\n")
        try folder.replace("murmur/inbox/2026-09-18.md", "## 10:32\n\nCall the dentist.\n\n")
        try folder.replace("murmur/inbox/2026-09-17.md", "## 09:00\n\nEmail Bob.\n\n")
        let files = await NotesFiles.load(folder, rules: rules, inbox: NoteInbox(rules: rules, at: NoteMoment(at, timeZone: utc)))
        #expect(files == NotesFiles(tasks: "- [ ] Call the dentist.\n", ideas: nil, days: ["murmur/inbox/2026-09-18.md", "murmur/inbox/2026-09-17.md"]))
    }
}
