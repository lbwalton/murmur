// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// New note's takes (IOS-023): the take model keeps a take as a note only
/// when New note started it, once, at the time it was spoken. Keyboard and
/// Dictate takes share the model and are never kept as notes.
extension TakeModelTests {
    @MainActor final class Kept {
        var notes: [(words: String, at: Date)] = []
        var place: String? = "inbox"
    }

    func noteModel(_ provider: FakeProvider, kept: Kept) -> TakeModel {
        TakeModel(
            microphone: microphone, store: store, rules: rules, catalog: catalog,
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring, send: provider.send,
            copy: { [sink] text in sink.copied.append(text) },
            now: { [sink] in sink.now },
            record: { [sink] entry in sink.kept.append(entry) },
            keepNote: { words, at in
                kept.notes.append((words, at))
                return kept.place
            }
        )
    }

    @Test func aNoteTakeIsKeptOnceAtTheTimeItWasSpoken() async {
        let kept = Kept()
        let model = noteModel(.says("Call the dentist."), kept: kept)
        let spoken = sink.now
        await model.start(as: .note)
        pass(2)
        await model.stop()
        #expect(kept.notes.map(\.words) == ["Call the dentist."])
        #expect(kept.notes.map(\.at) == [spoken])
        #expect(model.kept == KeptNote(words: "Call the dentist.", place: "inbox"))
        #expect(sink.kept.map(\.words) == ["Call the dentist."])
    }

    /// A keyboard or Dictate take that lands while New note is on screen is
    /// never kept as a note.
    @Test func aTakeNotStartedAsANoteIsNeverKept() async {
        let kept = Kept()
        let model = noteModel(FakeProvider([(200, #"{"text":"Call the dentist."}"#), (200, #"{"text":"Send the invoice."}"#)]), kept: kept)
        await model.start(as: .note)
        pass(2)
        await model.stop()
        await take(model)
        #expect(kept.notes.map(\.words) == ["Call the dentist."])
        #expect(model.kept == nil)
        #expect(model.state == .words("Send the invoice."))
    }

    @Test func aNoteThatCannotBeSavedSaysSo() async {
        let kept = Kept()
        kept.place = nil
        let model = noteModel(.says("Call the dentist."), kept: kept)
        await model.start(as: .note)
        await model.stop()
        #expect(model.kept == KeptNote(words: "Call the dentist.", place: nil))
    }

    /// Leaving New note drops only a take New note started.
    @Test func leavingNewNoteCancelsOnlyItsOwnTake() async {
        let model = noteModel(.says("Send the invoice."), kept: Kept())
        await model.start()
        model.cancel(ifFor: .note)
        #expect(model.isRecording)
        model.cancel()
        await model.start(as: .note)
        model.cancel(ifFor: .note)
        #expect(model.state == .idle)
    }
}
