// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Suite struct TakeLinkTests {
    let take = UUID()

    @Test func aLinkCarriesTheKeyboardsTake() throws {
        let url = try #require(TakeLink.url(for: take, scheme: "com.example.murmur"))
        #expect(url.absoluteString == "com.example.murmur://take?id=\(take.uuidString)")
        #expect(TakeLink.take(in: url, scheme: "com.example.murmur") == take)
    }

    /// Only our own scheme and host, with a real id, start a take.
    @Test func otherLinksStartNothing() throws {
        let scheme = "com.example.murmur"
        for link in ["https://murmurapp.app/take?id=\(take.uuidString)", "\(scheme)://settings?id=\(take.uuidString)", "\(scheme)://take?id=nope", "\(scheme)://take"] {
            #expect(TakeLink.take(in: try #require(URL(string: link)), scheme: scheme) == nil)
        }
        #expect(TakeLink.url(for: take, scheme: "") == nil)
    }

    /// The app's own build carries its scheme, the bundle id.
    @Test func theAppKnowsItsScheme() {
        #expect(TakeLink.scheme == Bundle.main.bundleIdentifier)
    }

    @Test func theSessionReadsOffUntilTold() {
        let file = FileManager.default.temporaryDirectory.appending(path: "state-\(UUID().uuidString).json")
        #expect(SessionState.read(from: file) == .off)
        SessionState(until: .now.addingTimeInterval(60)).write(to: file)
        #expect(SessionState.read(from: file).isOn())
        #expect(!SessionState(until: .now.addingTimeInterval(-1)).isOn())
        #expect(!SessionState.off.isOn())
    }
}
