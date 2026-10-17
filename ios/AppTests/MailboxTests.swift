// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Suite struct MailboxTests {
    let mailbox = Mailbox(file: FileManager.default.temporaryDirectory.appending(path: "mailbox-\(UUID().uuidString).json"))
    let take = UUID()
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    @Test func anEmptyMailboxHoldsNothing() {
        #expect(mailbox.read() == nil)
        #expect(mailbox.claim() == nil)
    }

    @Test func whatTheAppWritesTheKeyboardReads() {
        let entry = MailboxEntry(take: take, phase: .working, words: nil, at: at)
        mailbox.write(entry)
        #expect(mailbox.read() == entry)
    }

    /// The first claim gets the words and clears them; a second gets
    /// nothing, so a take never inserts twice.
    @Test func wordsAreClaimedOnce() {
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "Send the invoice.", at: at))
        #expect(mailbox.claim(take) == "Send the invoice.")
        #expect(mailbox.claim(take) == nil)
        #expect(mailbox.claim() == nil)
        #expect(mailbox.read()?.words == nil)
        #expect(mailbox.read()?.phase == .ready)
    }

    @Test func aClaimForAnotherTakeGetsNothing() {
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "Send the invoice.", at: at))
        #expect(mailbox.claim(UUID()) == nil)
        #expect(mailbox.claim(take) == "Send the invoice.")
    }

    @Test func onlyReadyWordsAreClaimed() {
        mailbox.write(MailboxEntry(take: take, phase: .working, words: "not yet", at: at))
        #expect(mailbox.claim(take) == nil)
    }

    /// The keyboard's ask is answered once, with its own id.
    /// Words you deleted in murmur are never offered as Insert last: only
    /// the matching words go, or all with Clear all, and a take still
    /// running is left alone.
    @Test func forgottenWordsAreNeverOffered() {
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "Secret words.", at: at))
        mailbox.forget(["Other words."])
        #expect(mailbox.read()?.words == "Secret words.")
        mailbox.forget(["Secret words."])
        #expect(mailbox.read()?.words == nil)
        #expect(mailbox.claim() == nil)
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "More words.", at: at))
        mailbox.forget(nil)
        #expect(mailbox.claim() == nil)
        mailbox.write(MailboxEntry(take: take, phase: .listening, words: nil, at: at))
        mailbox.forget(nil)
        #expect(mailbox.read()?.phase == .listening)
    }

    /// A claim notes that the words were typed, and Insert last notes that
    /// they were offered (IOS-014), only for the take's own ready words.
    @Test func whatTheKeyboardDidIsNoted() {
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "Send the invoice.", at: at))
        mailbox.offer(UUID())
        #expect(mailbox.read()?.typed == nil)
        mailbox.offer(take)
        #expect(mailbox.read()?.typed == .offered)
        #expect(mailbox.read()?.words == "Send the invoice.")
        #expect(mailbox.claim(take) == "Send the invoice.")
        #expect(mailbox.read()?.typed == .inserted)
        mailbox.offer(take)
        #expect(mailbox.read()?.typed == .inserted)
        mailbox.write(MailboxEntry(take: take, phase: .working, words: nil, at: at))
        mailbox.offer(take)
        #expect(mailbox.read()?.typed == nil)
    }

    @Test func anAskIsAnsweredOnce() {
        mailbox.ask(take, at: at)
        #expect(mailbox.answer(within: 3, now: at.addingTimeInterval(1)) == TakeAsk(take: take, note: false))
        #expect(mailbox.answer(within: 3, now: at.addingTimeInterval(1)) == nil)
    }

    /// Note in the pill's menu (IOS-023): the ask says to keep the take as a note.
    @Test func aNoteAskIsAnsweredAsANote() {
        mailbox.ask(take, note: true, at: at)
        #expect(mailbox.answer(within: 3, now: at.addingTimeInterval(1)) == TakeAsk(take: take, note: true))
    }

    /// An ask left by a keyboard from before notes reads as a take to type.
    @Test func anAskWithoutNoteIsATakeToType() throws {
        let old = Data("{\"take\":\"\(take.uuidString)\",\"at\":\(at.timeIntervalSinceReferenceDate)}".utf8)
        try old.write(to: mailbox.requestFile)
        #expect(mailbox.answer(within: 3, now: at.addingTimeInterval(1)) == TakeAsk(take: take, note: false))
    }

    /// An ask that waited too long, sent while murmur was not running, is
    /// dropped, and so is no ask at all.
    @Test func aStaleAskIsDropped() {
        mailbox.ask(take, at: at)
        #expect(mailbox.answer(within: 3, now: at.addingTimeInterval(10)) == nil)
        #expect(mailbox.answer(within: 3, now: at) == nil)
    }

    /// The real mailbox sits in the app group, where the keyboard can read it.
    @Test func theRealMailboxIsInTheAppGroup() throws {
        let shared = try #require(Mailbox.shared)
        #expect(shared.file.deletingLastPathComponent().standardizedFileURL == AppGroup.containerURL?.standardizedFileURL)
    }
}
