// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// Where notes live (IOS-023): murmur's own folder, out of backups, or one
/// you picked, such as an Obsidian vault, opened again from its bookmark.
@Suite struct NoteFolderTests {
    let root = FileManager.default.temporaryDirectory.appending(path: "note-folder-\(UUID().uuidString)", directoryHint: .isDirectory)
    let defaults = UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)")!

    @Test func theFolderNeverWritesOutsideItself() {
        let folder = NoteStore(root: root)
        #expect(folder.url("../escape.md") == nil)
        #expect(folder.url("murmur/../../escape.md") == nil)
        #expect(folder.url("") == nil)
        #expect(folder.url("murmur/todo.md") != nil)
        #expect(throws: (any Error).self) { try folder.append("../escape.md", "out") }
    }

    @Test func murmursOwnFolderIsOutOfBackups() throws {
        let folder = NoteStore(root: root)
        try folder.append("murmur/inbox/2026-09-18.md", "one\n")
        try folder.append("murmur/inbox/2026-09-18.md", "two\n")
        #expect(folder.read("murmur/inbox/2026-09-18.md") == "one\ntwo\n")
        #expect(try root.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        #expect(folder.inboxDays(try Self.bundledInbox()) == ["murmur/inbox/2026-09-18.md"])
    }

    static func bundledInbox() throws -> NoteInbox {
        NoteInbox(rules: try BundledRules.sorter(), at: NoteMoment(date: "2026-10-18", time: "09:00"))
    }

    /// The Notes screen lists the days in the changed inbox's folder, the
    /// files its template makes, and nothing else in that folder.
    @Test func inboxDaysFollowTheLayout() throws {
        let folder = NoteStore(root: root)
        try folder.append("murmur/notes/2026-10-17.txt", "one\n")
        try folder.append("murmur/notes/2026-10-18.TXT", "two\n")
        try folder.append("murmur/notes/readme.txt", "not a day\n")
        try folder.append("murmur/notes/murmur/todo.md", "a folder inside\n")
        let inbox = NoteInbox(template: "murmur/notes/{date}.TXT", today: "murmur/notes/2026-10-18.TXT")
        #expect(folder.inboxDays(inbox) == ["murmur/notes/2026-10-18.TXT", "murmur/notes/2026-10-17.txt"])
    }

    /// An inbox at the top of the folder lists its days, not every note
    /// in the vault, so a note link opens only an inbox day (review gate,
    /// 2026-10-18).
    @Test func anInboxAtTheTopListsOnlyItsDays() throws {
        let folder = NoteStore(root: root)
        try folder.append("2026-10-18.md", "a day\n")
        try folder.append("Brett.md", "not a day\n")
        #expect(folder.inboxDays(NoteInbox(template: "{date}.md", today: "2026-10-18.md")) == ["2026-10-18.md"])
    }

    /// In a picked murmur folder, an inbox right in murmur/ is the folder's
    /// top, where the notes land.
    @Test func aPickedMurmurFolderListsDaysWhereTheyLand() throws {
        let store = NoteStore(root: root, inside: true)
        try store.append("murmur/2026-10-18.md", "one\n")
        #expect(FileManager.default.fileExists(atPath: root.appending(path: "2026-10-18.md").path(percentEncoded: false)))
        #expect(store.inboxDays(NoteInbox(template: "murmur/{date}.md", today: "murmur/2026-10-18.md")) == ["murmur/2026-10-18.md"])
    }

    /// The murmur folder is the layout's in any case, as picking it is.
    @Test func aPickedMurmurFolderTakesItsNameInAnyCase() throws {
        let store = NoteStore(root: root, inside: true)
        try store.append("Murmur/notes/2026-10-18.md", "one\n")
        #expect(FileManager.default.fileExists(atPath: root.appending(path: "notes/2026-10-18.md").path(percentEncoded: false)))
    }

    /// A folder whose path starts /private, as a picked vault's does on an
    /// iPhone, takes a file that does not exist yet: the guard reads paths
    /// as text and never asks the disk which spelling is shorter (review
    /// gate, 2026-10-18).
    @Test func aFolderUnderPrivateTakesANewFile() throws {
        let under = URL(filePath: "/private/tmp/murmur-notes-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: under, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: under) }
        let folder = NoteStore(root: under)
        #expect(folder.url("murmur/inbox/2026-10-18.md") != nil)
        try folder.append("murmur/inbox/2026-10-18.md", "one\n")
        #expect(folder.read("murmur/inbox/2026-10-18.md") == "one\n")
    }

    /// A combining mark after a slash is still a slash to the guard, as it
    /// is to desktop's, so no path climbs out with one (review gate,
    /// 2026-10-18).
    @Test func aMarkAfterASlashCannotLeaveTheFolder() throws {
        let folder = NoteStore(root: root.appending(path: "notes", directoryHint: .isDirectory))
        #expect(folder.url("../\u{301}escape.md") == nil)
        #expect(folder.url("murmur/../\u{301}../escape.md") == nil)
        #expect(throws: (any Error).self) { try folder.append("../\u{301}escape.md", "out") }
        #expect(!FileManager.default.fileExists(atPath: root.appending(path: "\u{301}escape.md").path(percentEncoded: false)))
    }

    @Test func aPickedFolderIsKeptAndOpenedAgain() throws {
        let vault = root.appending(path: "My Vault", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: vault, withIntermediateDirectories: true)
        let choice = NotesFolderChoice(defaults)
        try choice.pick(vault)
        #expect(choice.name == "My Vault")
        let store = choice.store()
        #expect(store.picked && !store.lost)
        #expect(store.root.standardizedFileURL.path == vault.standardizedFileURL.path)
        try store.append("murmur/inbox/2026-09-18.md", "one\n")
        try store.append("murmur/inbox/2026-09-18.md", "two\n")
        #expect(store.read("murmur/inbox/2026-09-18.md") == "one\ntwo\n")
        #expect(try String(contentsOf: vault.appending(path: "murmur/inbox/2026-09-18.md"), encoding: .utf8) == "one\ntwo\n")
    }

    /// A pick murmur can no longer open reads nothing and refuses every
    /// write, so a note from the keyboard is typed instead of lost.
    @Test func aLostFolderReadsNothingAndWritesNothing() throws {
        defaults.set(Data("not a bookmark".utf8), forKey: NotesFolderChoice.bookmarkKey)
        defaults.set("My Vault", forKey: NotesFolderChoice.nameKey)
        let lost = NotesFolderChoice(defaults).store(own: NoteStore(root: root))
        #expect(lost.lost)
        #expect(throws: (any Error).self) { try lost.append("murmur/inbox/2026-09-18.md", "one\n") }
        #expect(lost.read("murmur/inbox/2026-09-18.md") == nil)
        #expect(!FileManager.default.fileExists(atPath: root.appending(path: "murmur").path(percentEncoded: false)))
    }

    /// A file murmur cannot read (an iCloud file that would not download, a
    /// permission error) is never replaced by the new entry alone.
    @Test func anAppendNeverReplacesAFileItCannotRead() throws {
        let folder = NoteStore(root: root)
        try folder.append("murmur/todo.md", "- [ ] Call the dentist.\n")
        let file = root.appending(path: "murmur/todo.md")
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: file.path(percentEncoded: false))
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: file.path(percentEncoded: false)) }
        #expect(throws: (any Error).self) { try folder.append("murmur/todo.md", "- [ ] Email Bob.\n") }
        try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: file.path(percentEncoded: false))
        #expect(folder.read("murmur/todo.md") == "- [ ] Call the dentist.\n")
    }

    /// An append adds bytes, as desktop's does: bytes that are not UTF-8
    /// stay exactly as they were.
    @Test func anAppendKeepsBytesItCannotReadAsText() throws {
        let folder = NoteStore(root: root)
        try folder.append("murmur/inbox/2026-09-18.md", "one\n")
        let file = root.appending(path: "murmur/inbox/2026-09-18.md")
        try Data([0x6F, 0x6E, 0x65, 0xFF, 0x0A]).write(to: file)
        try folder.append("murmur/inbox/2026-09-18.md", "two\n")
        #expect(try Data(contentsOf: file) == Data([0x6F, 0x6E, 0x65, 0xFF, 0x0A, 0x74, 0x77, 0x6F, 0x0A]))
        // Text that is not UTF-8 is not read as text, so nothing rewrites it.
        #expect(folder.read("murmur/inbox/2026-09-18.md") == nil)
    }

    /// A picked folder that was deleted or moved is never made again.
    @Test func aPickedFolderThatIsGoneIsNeverRecreated() throws {
        let vault = root.appending(path: "vault", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: vault, withIntermediateDirectories: true)
        let store = NoteStore(root: vault, picked: true)
        try FileManager.default.removeItem(at: vault)
        #expect(throws: (any Error).self) { try store.append("murmur/inbox/2026-09-18.md", "one\n") }
        #expect(!FileManager.default.fileExists(atPath: vault.path(percentEncoded: false)))
    }

    /// Picking the murmur folder itself (LaBroi, 2026-10-18), the one the
    /// Mac made in the vault, writes into it: the same files the Mac
    /// writes, not a murmur folder inside it. A pick made before this
    /// counts too.
    @Test func pickingTheMurmurFolderWritesIntoIt() throws {
        let folder = root.appending(path: "Vault/murmur", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let choice = NotesFolderChoice(defaults)
        try choice.pick(folder)
        let store = choice.store()
        try store.append("murmur/inbox/2026-10-18.md", "one\n")
        #expect(try String(contentsOf: folder.appending(path: "inbox/2026-10-18.md"), encoding: .utf8) == "one\n")
        #expect(!FileManager.default.fileExists(atPath: folder.appending(path: "murmur").path(percentEncoded: false)))
        #expect(store.read("murmur/inbox/2026-10-18.md") == "one\n")
        #expect(store.inboxDays(try Self.bundledInbox()) == ["murmur/inbox/2026-10-18.md"])
    }

    /// A vault that is itself named murmur nests as the Mac does.
    @Test func aVaultNamedMurmurStillNests() throws {
        let vault = root.appending(path: "Murmur", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: vault.appending(path: ".obsidian"), withIntermediateDirectories: true)
        let store = NoteStore.picked(vault)
        try store.append("murmur/inbox/2026-10-18.md", "one\n")
        #expect(FileManager.default.fileExists(atPath: vault.appending(path: "murmur/inbox/2026-10-18.md").path(percentEncoded: false)))
    }

    @Test func keepNotesInMurmurForgetsThePick() throws {
        let vault = root.appending(path: "vault", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: vault, withIntermediateDirectories: true)
        let choice = NotesFolderChoice(defaults)
        try choice.pick(vault)
        choice.forget()
        let own = NoteStore(root: root.appending(path: "own", directoryHint: .isDirectory))
        #expect(choice.name == nil)
        #expect(choice.store(own: own).root == own.root)
        #expect(!choice.store(own: own).picked)
    }
}
