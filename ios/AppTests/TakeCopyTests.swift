// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@Suite struct TakeCopyTests {
    /// Every kind a take can fail with has its own plain reason.
    @Test func everyFailureHasItsOwnReason() {
        let kinds = TranscriptionFailure.allCases.map(\.rawValue) + ["nospeech"]
        let reasons = kinds.map { TakeCopy.reason(TakeFailure(kind: $0, detail: "")) } + [TakeCopy.reason(.noKey)]
        #expect(Set(reasons).count == reasons.count)
        #expect(!reasons.contains(TakeCopy.reason(TakeFailure(kind: "something new", detail: ""))))
    }

    @Test func noKeyIsNotARejectedKey() {
        #expect(TakeCopy.reason(.noKey) == "No API key is saved for your provider.")
        #expect(TakeCopy.reason(TakeFailure(kind: "auth", detail: "http 401")) == "Your provider did not accept the key.")
    }

    @Test func aLengthReadsLikeDesktops() {
        #expect(TakeCopy.length(400) == "1s")
        #expect(TakeCopy.length(4_400) == "4s")
        #expect(TakeCopy.length(75_000) == "1m 15s")
    }

    @Test func aRetrySaysWhatHappened() {
        #expect(TakeCopy.retried(delivered: 1, failed: 0) == "Done: the words are above and on your clipboard.")
        #expect(TakeCopy.retried(delivered: 2, failed: 1) == "2 transcribed and on your clipboard, 1 still waiting.")
        #expect(TakeCopy.retried(delivered: 0, failed: 2).hasPrefix("Still could not transcribe."))
    }

    /// The product name stays lowercase even where a sentence starts.
    @Test func murmurStaysLowercase() {
        let kinds = TranscriptionFailure.allCases.map(\.rawValue) + ["nospeech", "other"]
        let words = kinds.map { TakeCopy.reason(TakeFailure(kind: $0, detail: "")) }
            + [TakeCopy.heardNothing(sent: true), TakeCopy.heardNothing(sent: false), TakeCopy.micOff, TakeCopy.micFailed, TakeCopy.lostAudio, TakeCopy.waitingIntro]
        for line in words {
            #expect(!line.contains("Murmur"))
        }
    }
}
