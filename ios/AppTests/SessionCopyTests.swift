// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Suite struct SessionCopyTests {
    @Test func theLengthsReadAsPeopleSayThem() {
        #expect(Session.Length.allCases.map(SessionCopy.name) == ["5 minutes", "15 minutes", "1 hour"])
    }

    @Test func theStatusSaysWhenListeningEnds() {
        #expect(SessionCopy.status(until: nil) == "No session is running.")
        let until = Date(timeIntervalSince1970: 1_790_000_000)
        #expect(SessionCopy.status(until: until) == "Listening until \(until.formatted(date: .omitted, time: .shortened)).")
    }

    /// murmur stays lowercase, and no line uses a dash between clauses.
    @Test func everyLineFollowsTheWritingRules() {
        let lines = [
            SessionCopy.explain, SessionCopy.length, SessionCopy.lengthFooter, SessionCopy.end, SessionCopy.start, SessionCopy.startFooter,
            SessionCopy.recording, SessionCopy.starting, SessionCopy.stop, SessionCopy.guide, SessionCopy.guideStill, SessionCopy.micOff, SessionCopy.close
        ]
        for line in lines {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}
