// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

extension KeyboardBridgeTests {
    /// Note in the pill's menu (IOS-023): the take is saved as a note and the
    /// keyboard is told where, never given words to type.
    @Test func aNoteTakeIsSavedNotTyped() async throws {
        let model = try model(.says("Call the dentist."))
        var kept: [String] = []
        let bridge = KeyboardBridge(model: model, mailbox: mailbox, announce: { _ in }, keepNote: { words, _ in
            kept.append(words)
            return "inbox"
        })
        bridge.listen()
        let take = UUID()
        mailbox.ask(take, note: true)
        bridge.hear(.start)
        try await waitUntilRecording(model)
        bridge.hear(.stop)
        let noted = try #require(try await waitFor(.noted))
        #expect(noted.take == take)
        #expect(noted.noted == "inbox")
        #expect(noted.words == nil)
        #expect(kept == ["Call the dentist."])
        #expect(mailbox.claim(take) == nil)
    }

    /// A note that cannot be saved is typed instead, so the words are never lost.
    @Test func aNoteThatCannotBeSavedIsTyped() async throws {
        let model = try model(.says("Call the dentist."))
        let bridge = KeyboardBridge(model: model, mailbox: mailbox, announce: { _ in }, keepNote: { _, _ in nil })
        bridge.listen()
        let take = UUID()
        mailbox.ask(take, note: true)
        bridge.hear(.start)
        try await waitUntilRecording(model)
        bridge.hear(.stop)
        #expect(try await waitFor(.ready)?.words == "Call the dentist.")
    }

    /// A take asked without Note is typed as always.
    @Test func aTakeWithoutNoteIsNotSaved() async throws {
        let model = try model(.says("Send the invoice."))
        var kept = 0
        let bridge = KeyboardBridge(model: model, mailbox: mailbox, announce: { _ in }, keepNote: { _, _ in
            kept += 1
            return "inbox"
        })
        bridge.listen()
        start(bridge)
        try await waitUntilRecording(model)
        bridge.hear(.stop)
        #expect(try await waitFor(.ready)?.words == "Send the invoice.")
        #expect(kept == 0)
    }
}

@Suite struct NotePadTests {
    @Test func theKeyboardSaysWhereTheNoteLanded() {
        let take = UUID()
        let entry = MailboxEntry(take: take, phase: .noted, words: nil, at: .now, noted: "inbox")
        #expect(Pad.react(to: entry, mine: take, sameField: true, visible: true) == .status("Noted to inbox"))
        #expect(Pad.react(to: entry, mine: UUID(), sameField: true, visible: true) == .none)
        #expect(PillStage(.noted) == .inserted)
    }
}
