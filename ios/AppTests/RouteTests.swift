// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI
import Testing
import UIKit
@testable import murmur

/// A screen built as it opens asks for its model as soon as it shows. A
/// route with nothing to draw before its model never ran the task that
/// builds it, and stayed blank (Add your key in first run, LaBroi on
/// TestFlight build 473, 2026-10-16).
@MainActor @Suite struct RouteTests {
    /// Shows the route in a window, as the app does, and waits up to two
    /// seconds for it to ask for its model.
    func asks(_ route: some View, _ asked: Cell<Bool>) async throws -> Bool {
        let host = UIHostingController(rootView: NavigationStack { route })
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.rootViewController = host
        window.isHidden = false
        defer { window.isHidden = true }
        for _ in 0..<20 where !asked.value {
            try await Task.sleep(for: .seconds(0.1))
        }
        return asked.value
    }

    @Test func providerAndKeyBuildsItsScreen() async throws {
        let asked = Cell(false)
        let route = ProviderRoute(make: {
            asked.value = true
            return nil
        })
        #expect(try await asks(route, asked))
    }

    @Test func cleanupBuildsItsScreen() async throws {
        let asked = Cell(false)
        let defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        let route = CleanupRoute(make: {
            asked.value = true
            return CleanupModel(store: CleanupStore(defaults: defaults), polishModel: "")
        })
        #expect(try await asks(route, asked))
    }

    @Test func dictateBuildsItsScreen() async throws {
        let asked = Cell(false)
        let route = TakeRoute(make: {
            asked.value = true
            return nil
        })
        #expect(try await asks(route, asked))
    }

    @Test func newNoteBuildsItsScreen() async throws {
        let asked = Cell(false)
        let route = NoteTakeRoute(make: {
            asked.value = true
            return (nil, nil)
        })
        #expect(try await asks(route, asked))
    }
}
