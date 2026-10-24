// SPDX-License-Identifier: GPL-3.0-only
import MurmurCore
import SwiftUI
import Testing
import UIKit
@testable import murmur

/// The App Store screenshots (ios/prd.json IOS-026): murmur's own screens
/// with sample takes written for them, drawn full screen on murmur's
/// simulator (an iPhone 17, 1206 by 2622, the size Apple requires) without
/// an alpha channel. They run only when npm run ios:store-shots sets
/// MURMUR_STORE_SHOTS to the folder they go in, and nothing records,
/// reads real data, or leaves the Mac.
@MainActor @Suite struct StoreShotsTests {
    nonisolated static let folder = ProcessInfo.processInfo.environment["MURMUR_STORE_SHOTS"]
    let shots = FirstRunRenderTests()

    /// Sample takes, as a person might dictate them over 2 days.
    static let takes = [
        "Running 10 minutes late, start without me and I'll catch up on the notes.",
        "Can you send me the deck before Friday? I want to read it on the train.",
        "Remind me to book the flights for the conference this week.",
        "The new logo looks great. Let's ship it with the next release.",
        "Pick up oat milk, bananas, and coffee on the way home.",
        "Thanks for the intro. I'll reach out to Maya on Monday.",
        "Moving the team lunch to Thursday at noon, same place as last time."
    ]

    /// Draws the view in a full screen window, opaque, once it has drawn
    /// something, and again after the settle, then saves it.
    func capture(_ view: some View, _ name: String, settle: Double = 0.5) async throws {
        let folder = try #require(Self.folder)
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UIHostingController(rootView: view)
        window.isHidden = false
        defer { window.isHidden = true }
        let format = UIGraphicsImageRendererFormat(for: window.traitCollection)
        format.opaque = true
        let draw = {
            UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
                _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            }
        }
        var image = draw()
        for _ in 0..<30 {
            try await Task.sleep(for: .seconds(0.1))
            image = draw()
            if try shots.inked(image) > 0.02 { break }
        }
        try await Task.sleep(for: .seconds(settle))
        image = draw()
        #expect(try shots.inked(image) > 0.01, "\(name) drew almost nothing")
        try #require(image.pngData()).write(to: URL(filePath: folder).appending(path: "\(name).png"))
    }

    /// A history of the sample takes, the last few today.
    static func history(_ name: String, days: Int = 2, perDay: Int = 4) -> History {
        let store = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "store-shots-\(name)-\(UUID().uuidString).jsonl"))
        var index = 0
        for day in stride(from: days - 1, through: 0, by: -1) {
            for take in 0..<perDay {
                let at = Date.now.addingTimeInterval(-Double(day) * 86_400 - Double(perDay - take) * 2_400)
                let words = takes[index % takes.count]
                try? store.append(HistoryEntry(at: at, durationMs: 3_000 + words.count * 45, words: words))
                index += 1
            }
        }
        return History(store: store)
    }

    @Test(.enabled(if: folder != nil)) func dictateWithTheLivePill() async throws {
        try await capture(TakePreview(.recording), "1-dictate", settle: 1.5)
    }

    @Test(.enabled(if: folder != nil)) func theKeyboard() async throws {
        let view = VStack(spacing: 0) {
            NavigationStack { KeyboardScreen() }
            PadPreview(.rest).frame(height: PadPreview.height)
        }
        .background(Tokens.ink)
        .preferredColorScheme(.dark)
        try await capture(view, "2-keyboard")
    }

    @Test(.enabled(if: folder != nil)) func dictateWithItsWords() async throws {
        try await capture(TakePreview(.words), "3-words", settle: 1)
    }

    @Test(.enabled(if: folder != nil)) func home() async throws {
        let access = ScriptedAccess(answer: true)
        access.status = .granted
        let defaults = try #require(UserDefaults(suiteName: "store-shots-home-\(UUID().uuidString)"))
        let setup = Setup(microphone: access, report: { KeyboardReport(fullAccess: true, at: .now) }, hasKey: { true }, defaults: defaults)
        setup.practiced()
        setup.seen = true
        let view = NavigationStack {
            HomeScreen(history: Self.history("home", days: 8, perDay: 6), session: nil, model: nil, setup: setup, paintings: nil, notes: nil) { _ in }
                .navigationTitle("murmur")
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        try await capture(view, "4-home")
    }

    @Test(.enabled(if: folder != nil)) func notes() async throws {
        try await capture(NotesPreview(.sorted), "5-notes", settle: 1)
    }

    /// The Journey's painted path is a web view, which a window snapshot
    /// cannot draw, so the waveform grid stands in for the art.
    @Test(.enabled(if: folder != nil)) func theLook() async throws {
        let view = NavigationStack { LookRoute() }
            .tint(Tokens.brand)
            .preferredColorScheme(.dark)
        try await capture(view, "6-look", settle: 1)
    }

    @Test(.enabled(if: folder != nil)) func cleanup() async throws {
        try await capture(CleanupPreview(.correctionsOn), "7-cleanup")
    }
}
