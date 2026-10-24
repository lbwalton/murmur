// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import SwiftUI
import Testing
import UIKit
@testable import murmur

/// When the ceremony closed, from its close button or its own clock.
@MainActor final class ClosedAt {
    var at: Date?
}

/// The promotion ceremony (IOS-018).
@MainActor @Suite(.serialized) struct CeremonyTests {
    /// The ceremony's clock starts when its painting does, so a painting
    /// slow to start never has its stroke cut short. The page is ready
    /// before the ceremony shows, so how fast the web process starts never
    /// matters; its painting takes 1.5 seconds to begin.
    @Test func theClockStartsWithThePainting() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "journey-slow-\(UUID().uuidString).html")
        try """
        <!doctype html><script>
        window.murmurJourney = { ceremony: () => new Promise((done) => setTimeout(() => done(true), 1500)) }
        window.webkit.messageHandlers.journey.postMessage({ type: 'ready' })
        </script>
        """.write(to: url, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: url) }
        let blue = try #require(BundledRules.journey().ranks.ranks.first { $0.id == "blue" })
        let closed = ClosedAt()
        let painter = JourneyPainter(page: url)
        try await painter.waitUntilReady(seconds: 60)
        let host = UIHostingController(rootView: CeremonyView(rank: blue, painter: painter, duration: 0.5) { closed.at = .now })
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.rootViewController = host
        window.isHidden = false
        defer { window.isHidden = true }
        let shown = Date.now
        for _ in 0..<80 where closed.at == nil {
            try await Task.sleep(for: .seconds(0.1))
        }
        let at = try #require(closed.at, "it never closed")
        #expect(at.timeIntervalSince(shown) >= 1.9, "it closed \(at.timeIntervalSince(shown)) seconds after it showed")
    }
}
