// SPDX-License-Identifier: GPL-3.0-only
import Testing
@testable import murmur

@Suite struct SmokeRequestTests {
    @Test func anOrdinaryLaunchIsNotASmoke() {
        #expect(SmokeRequest(arguments: ["murmur"]) == nil)
    }

    @Test func readsTheSharedCount() {
        #expect(SmokeRequest(arguments: ["murmur", "--smoke", "--shared-count=8"])?.sharedCount == 8)
    }

    @Test func aMissingCountCanNeverMatch() {
        #expect(SmokeRequest(arguments: ["murmur", "--smoke"])?.sharedCount == -1)
    }
}
