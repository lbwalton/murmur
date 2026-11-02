// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
@testable import murmur

@Suite struct PadTests {
    let take = UUID()

    func entry(_ phase: MailboxEntry.Phase, words: String? = nil, take: UUID? = nil) -> MailboxEntry {
        MailboxEntry(take: take ?? self.take, phase: phase, words: words, at: Date(timeIntervalSince1970: 1_790_000_000))
    }

    func react(_ entry: MailboxEntry?, mine: UUID?, sameField: Bool = true, visible: Bool = true) -> Pad.Reaction {
        Pad.react(to: entry, mine: mine, sameField: sameField, visible: visible)
    }

    @Test func wordsForThisTakeInTheSameFieldAreInserted() {
        #expect(react(entry(.ready, words: "hi"), mine: take) == .insert(take))
    }

    /// You left the field before the words landed: Insert last.
    @Test func wordsAfterYouLeftTheFieldWaitAsInsertLast() {
        #expect(react(entry(.ready, words: "hi"), mine: take, sameField: false) == .offerInsertLast)
        // The keyboard came back later, not waiting on anything.
        #expect(react(entry(.ready, words: "hi"), mine: nil) == .offerInsertLast)
    }

    /// A keyboard that is not on screen does nothing, so it never takes
    /// words meant for the keyboard you are looking at.
    @Test func aKeyboardOffScreenDoesNothing() {
        #expect(react(entry(.ready, words: "hi"), mine: take, visible: false) == .none)
        #expect(react(entry(.listening), mine: take, visible: false) == .none)
    }

    @Test func claimedWordsOfferNothing() {
        #expect(react(entry(.ready), mine: take) == .none)
        #expect(react(nil, mine: take) == .none)
    }

    @Test func thisTakesProgressIsShown() {
        #expect(react(entry(.listening), mine: take) == .status("Listening"))
        #expect(react(entry(.working), mine: take) == .status("Working"))
        #expect(react(entry(.nothing), mine: take) == .status("Heard nothing"))
        #expect(react(entry(.failed), mine: take) == .status("That take did not work. Open murmur to see why."))
    }

    /// Another take's progress never shows as this one's, matched by the id
    /// the keyboard asked with.
    @Test func anotherTakeIsNotThisOne() {
        #expect(react(entry(.listening, take: UUID()), mine: take) == .none)
        #expect(react(entry(.listening), mine: nil) == .none)
        #expect(react(entry(.ready, words: "hi", take: UUID()), mine: take) == .offerInsertLast)
    }

    @Test func thePadsOwnLinesReadPlainly() {
        for line in [Pad.noAnswer, Pad.busy, Pad.stoppedAnswering, Pad.opening, Pad.openRefused, Pad.idleHint] {
            #expect(!line.contains("Murmur"))
        }
        #expect(Pad.openRefused == "Open murmur to start")
    }

    /// The take a keyboard waits on outlives the keyboard: the one you
    /// swipe back to from murmur knows it, until it grows too old.
    @Test func aWaitingTakeOutlivesTheKeyboard() throws {
        let defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        let start = Date(timeIntervalSince1970: 1_790_000_000)
        let waiting = Pad.Waiting(take: take, opened: true, field: nil, at: start)
        Pad.Waiting.save(waiting, to: defaults)
        #expect(Pad.Waiting.load(from: defaults, now: start.addingTimeInterval(60)) == waiting)
        #expect(Pad.Waiting.load(from: defaults, now: start.addingTimeInterval(Pad.Waiting.life + 1)) == nil)
        Pad.Waiting.save(nil, to: defaults)
        #expect(Pad.Waiting.load(from: defaults, now: start) == nil)
    }

    /// A take that opened murmur lands in the field you come back to; one
    /// started in place lands only in its own field.
    @Test func anOpenedTakeLandsWhereYouComeBack() {
        let field = UUID()
        let opened = Pad.Waiting(take: take, opened: true, field: nil, at: .now)
        #expect(opened.sameField(as: field))
        #expect(opened.sameField(as: nil))
        let inPlace = Pad.Waiting(take: take, opened: false, field: field, at: .now)
        #expect(inPlace.sameField(as: field))
        #expect(!inPlace.sameField(as: UUID()))
    }

    /// The pill shows the take it waits on; how the last take ended while
    /// that still shows; and rest otherwise, so a keyboard that comes back
    /// with no take never keeps an old stage, least of all Recording.
    @Test func thePillRestsWhenNoTakeIsWaiting() {
        #expect(Pad.stage(waiting: true, phase: .listening, ending: false) == .recording)
        #expect(Pad.stage(waiting: true, phase: nil, ending: true) == .idle)
        #expect(Pad.stage(waiting: false, phase: .listening, ending: false) == .idle)
        #expect(Pad.stage(waiting: false, phase: nil, ending: false) == .idle)
        #expect(Pad.stage(waiting: false, phase: nil, ending: true) == nil)
    }

    /// Leaving the keyboard drops a take still starting or listening,
    /// except on the trip to murmur an opened take is for; once a keyboard
    /// you came back to has taken it over, leaving drops it too.
    @Test func leavingDropsATakeYouWalkedAwayFrom() {
        let inPlace = Pad.Waiting(take: take, opened: false, field: UUID(), at: .now)
        #expect(inPlace.cancelsOnLeave(phase: nil))
        #expect(inPlace.cancelsOnLeave(phase: .listening))
        #expect(!inPlace.cancelsOnLeave(phase: .working))
        var opened = Pad.Waiting(take: take, opened: true, field: nil, at: .now)
        #expect(!opened.cancelsOnLeave(phase: nil))
        #expect(!opened.cancelsOnLeave(phase: .listening))
        let field = UUID()
        opened.adopt(field)
        #expect(opened.adopted)
        #expect(opened.field == field)
        #expect(opened.cancelsOnLeave(phase: .listening))
        #expect(!opened.cancelsOnLeave(phase: .working))
    }

    @Test(arguments: [
        (nil as String?, "hello", "hello"),
        ("", "hello", "hello"),
        ("Hi", "there", " there"),
        ("Done.", "Next", " Next"),
        ("Hi ", "there", "there"),
        ("line\n", "next", "next"),
        ("(", "aside", "aside"),
        ("\u{201C}", "quote", "quote"),
        ("word", ", and", ", and"),
        ("word", ".", ".")
    ])
    func aSpaceGoesFirstOnlyWhenNeeded(_ before: String?, _ words: String, _ inserted: String) {
        #expect(Pad.spaced(words, after: before) == inserted)
    }

    @Test func returnFollowsTheField() {
        #expect(Pad.returnTitle(.default) == "Return")
        #expect(Pad.returnTitle(.send) == "Send")
        #expect(Pad.returnTitle(.search) == "Search")
        #expect(Pad.returnTitle(.go) == "Go")
        #expect(Pad.returnTitle(.done) == "Done")
    }
}
