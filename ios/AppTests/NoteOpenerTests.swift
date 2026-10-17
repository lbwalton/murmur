// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
@testable import murmur

/// New note from outside murmur's screens (IOS-023): the icon's quick
/// action and the New note intent open New note; nothing else does.
@MainActor @Suite(.serialized) struct NoteOpenerTests {
    @Test func theIconsNewNoteOpensNewNote() {
        NoteOpener.shared.showing = false
        #expect(QuickAction.perform(UIApplicationShortcutItem(type: "com.example.murmur.note", localizedTitle: "New note")))
        #expect(NoteOpener.shared.showing)
        NoteOpener.shared.showing = false
    }

    @Test func anotherQuickActionOpensNothing() {
        NoteOpener.shared.showing = false
        #expect(!QuickAction.perform(UIApplicationShortcutItem(type: "com.example.murmur.notebook", localizedTitle: "x")))
        #expect(!NoteOpener.shared.showing)
    }

    /// A second press of the Action Button while New note is still on screen
    /// asks it to listen again.
    @Test func eachOpenAsksAgain() {
        let before = NoteOpener.shared.request
        NoteOpener.shared.open()
        NoteOpener.shared.open()
        #expect(NoteOpener.shared.request == before + 2)
        #expect(NoteOpener.shared.showing)
        NoteOpener.shared.showing = false
    }

    /// The control, the Action Button, and Shortcuts run the intent in murmur.
    @Test func theNewNoteIntentOpensNewNote() async throws {
        NoteOpener.shared.showing = false
        _ = try await NewNoteIntent().perform()
        #expect(NoteOpener.shared.showing)
        NoteOpener.shared.showing = false
    }
}
