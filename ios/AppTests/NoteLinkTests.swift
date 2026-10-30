// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

/// Opening a note from its receipt (IOS-023, LaBroi 2026-10-18): in
/// Obsidian when the notes are in a vault, in murmur otherwise.
@Suite struct NoteLinkTests {
    let root = FileManager.default.temporaryDirectory.appending(path: "note-link-\(UUID().uuidString)", directoryHint: .isDirectory)
    let day = "murmur/inbox/2026-10-18.md"
    /// Where Obsidian keeps a vault that syncs through iCloud.
    let icloud = "/private/var/mobile/Library/Mobile Documents/iCloud~md~obsidian/Documents"

    @Test func aNoteInAnICloudVaultLinksToObsidian() {
        let store = NoteStore(root: URL(filePath: "\(icloud)/LB Vault", directoryHint: .isDirectory), picked: true)
        #expect(store.obsidianLink(day)?.absoluteString == "obsidian://open?vault=LB%20Vault&file=murmur%2Finbox%2F2026-10-18.md")
    }

    /// The murmur folder inside a vault, picked on its own, keeps its path
    /// from the vault's top.
    @Test func theMurmurFolderInAVaultLinksWithItsPath() {
        let store = NoteStore(root: URL(filePath: "\(icloud)/LB Vault/murmur", directoryHint: .isDirectory), picked: true, inside: true)
        #expect(store.obsidianLink(day)?.absoluteString == "obsidian://open?vault=LB%20Vault&file=murmur%2Finbox%2F2026-10-18.md")
    }

    /// A vault anywhere else, On My iPhone for one, is known by the
    /// settings folder Obsidian keeps in it.
    @Test func aVaultFolderLinksToObsidian() throws {
        let vault = root.appending(path: "Notes Vault", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: vault.appending(path: ".obsidian"), withIntermediateDirectories: true)
        let store = NoteStore.picked(vault)
        #expect(store.obsidianLink(day)?.absoluteString == "obsidian://open?vault=Notes%20Vault&file=murmur%2Finbox%2F2026-10-18.md")
    }

    /// Obsidian on iPhone opens vaults only in its own folders, so a vault
    /// a Mac keeps elsewhere in iCloud Drive opens in murmur instead.
    @Test func aVaultElsewhereInICloudDriveHasNoObsidianLink() throws {
        let vault = root.appending(path: "Mobile Documents/com~apple~CloudDocs/Vault", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: vault.appending(path: ".obsidian"), withIntermediateDirectories: true)
        #expect(NoteStore.picked(vault).obsidianLink(day) == nil)
    }

    @Test func aFolderOutsideAVaultHasNoObsidianLink() throws {
        #expect(NoteStore(root: root).obsidianLink(day) == nil)
        let plain = root.appending(path: "Plain", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: plain, withIntermediateDirectories: true)
        #expect(NoteStore.picked(plain).obsidianLink(day) == nil)
        // A vault's own folder named Documents is not iCloud's.
        let documents = NoteStore(root: URL(filePath: "/Users/me/Documents/Vault", directoryHint: .isDirectory), picked: true)
        #expect(documents.obsidianLink(day) == nil)
    }

    /// Every reserved character reaches Obsidian intact, a slash as %2F
    /// (Obsidian's help, checked 2026-10-18).
    @Test func reservedCharactersAreEncoded() {
        let link = NoteLink.obsidian(vault: "A&B #1?+=", file: "murmur/inbox/x y.md")
        #expect(link?.absoluteString == "obsidian://open?vault=A%26B%20%231%3F%2B%3D&file=murmur%2Finbox%2Fx%20y.md")
        #expect(NoteLink.obsidian(vault: "", file: day) == nil)
        #expect(NoteLink.obsidian(vault: "Vault", file: "") == nil)
    }

    @Test func theMurmurLinkRoundTrips() throws {
        let scheme = "com.example.murmur"
        let link = try #require(NoteLink.murmur(file: day, scheme: scheme))
        #expect(NoteLink.file(in: link, scheme: scheme) == day)
        #expect(NoteLink.file(in: link, scheme: "other") == nil)
        #expect(NoteLink.file(in: try #require(TakeLink.url(for: UUID(), scheme: scheme)), scheme: scheme) == nil)
        #expect(NoteLink.murmur(file: day, scheme: "") == nil)
    }

    /// Open note under the pill opens murmur only: a keyboard may launch
    /// no other app (App Review Guidelines 4.4.1, checked 2026-10-18), so
    /// murmur hands the note on to Obsidian. With no file, nothing.
    @Test func openNoteOpensMurmur() throws {
        let scheme = "com.example.murmur"
        let murmur = try #require(NoteLink.murmur(file: day, scheme: scheme))
        let noted = MailboxEntry(take: UUID(), phase: .noted, at: .now, noted: "inbox", notedFile: day)
        #expect(Pad.noteLink(noted, scheme: scheme) == murmur)
        let older = MailboxEntry(take: UUID(), phase: .noted, at: .now, noted: "inbox")
        #expect(Pad.noteLink(older, scheme: scheme) == nil)
        let typed = MailboxEntry(take: UUID(), phase: .ready, words: "Hi.", at: .now, notedFile: day)
        #expect(Pad.noteLink(typed, scheme: scheme) == nil)
    }

    /// The receipt points out to Obsidian only when the notes are in a vault
    /// and Obsidian is there to take the link.
    @MainActor @Test func theReceiptOffersObsidianOnlyWhenItIsThere() {
        let store = NoteStore(root: URL(filePath: "\(icloud)/LB Vault", directoryHint: .isDirectory), picked: true)
        #expect(NoteReceipt.link(day, in: store, opens: { _ in true })?.scheme == "obsidian")
        #expect(NoteReceipt.link(day, in: store, opens: { _ in false }) == nil)
        #expect(NoteReceipt.link(nil, in: store, opens: { _ in true }) == nil)
    }
}

/// Opening a note: Obsidian when it takes the link, murmur when it does
/// not or there is none (LaBroi: "If the user doesn't have Obsidian, then
/// it should open to the app where it's saved locally").
@MainActor @Suite struct NoteOpeningTests {
    let day = "murmur/inbox/2026-10-18.md"
    let obsidian = URL(string: "obsidian://open?vault=V&file=f")!

    @Test func aNoteOpensInObsidianWhenItTakesTheLink() {
        var asked: [URL] = []
        var shown: [String] = []
        NoteOpening.open(day, link: obsidian, with: { url, done in
            asked.append(url)
            done(true)
        }, show: { shown.append($0) })
        #expect(asked == [obsidian])
        #expect(shown.isEmpty)
    }

    @Test func aRefusedLinkOpensTheNoteInMurmur() {
        var shown: [String] = []
        NoteOpening.open(day, link: obsidian, with: { _, done in done(false) }, show: { shown.append($0) })
        #expect(shown == [day])
    }

    @Test func withoutALinkTheNoteOpensInMurmur() {
        var asked = 0
        var shown: [String] = []
        NoteOpening.open(day, link: nil, with: { _, done in
            asked += 1
            done(true)
        }, show: { shown.append($0) })
        #expect(asked == 0)
        #expect(shown == [day])
    }
}

/// The space above the pill holds one offer at a time, Insert last or
/// Open note, so the pad never runs out of height.
@MainActor @Suite struct PadOfferTests {
    @Test func thePadOffersOneThingAtATime() {
        let pad = PadView()
        pad.offer(.openNote)
        #expect(!pad.openNote.isHidden && pad.insertLast.isHidden)
        pad.offer(.insertLast)
        #expect(pad.openNote.isHidden && !pad.insertLast.isHidden)
        pad.offer(nil)
        #expect(pad.openNote.isHidden && pad.insertLast.isHidden)
    }
}
