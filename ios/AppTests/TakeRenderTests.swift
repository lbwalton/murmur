// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI
import Testing
import UIKit
@testable import murmur

/// Dictate with the live pill (ios/prd.json IOS-031) in each state, in the
/// default style and an ink style, at the default and the largest text
/// size: each draws, and with MURMUR_SHOTS set, saves pictures to read for
/// clipping, as first run's do.
@MainActor @Suite struct TakeRenderTests {
    let shots = FirstRunRenderTests()

    nonisolated static let scenes: [TakePreview.Scene] = [.ready, .recording, .transcribing, .words, .silence]
    nonisolated static let styles: [PillStyle] = [.bars, .ribbon]

    @Test(arguments: scenes, styles)
    func dictateDrawsWithThePill(_ scene: TakePreview.Scene, _ style: PillStyle) async throws {
        // Recording and transcribing move, so their pictures wait for it.
        let settle = scene == .recording || scene == .transcribing ? 1.5 : 0
        let image = try await shots.render(TakePreview(scene, style: style), settle: settle)
        try shots.save(image, "dictate-\(scene)-\(style)")
        // At the default size, and on the tall page, Dictate is one card on
        // the ground: sparse, but a blank screen draws far less.
        #expect(try shots.inked(image) > 0.01)
        let largest = try await shots.render(TakePreview(scene, style: style).dynamicTypeSize(.accessibility5), settle: settle)
        try shots.save(largest, "dictate-\(scene)-\(style)-largest")
        #expect(try shots.inked(largest) > 0.02)
        let page = try await shots.render(TakePreview(scene, style: style).dynamicTypeSize(.accessibility5), tall: true)
        try shots.save(page, "dictate-\(scene)-\(style)-largest-page")
        #expect(try shots.inked(page) > 0.01)
    }

    /// After a tap, Copy words says Copied with a tick, at the largest text
    /// size too.
    @Test func copyWordsSaysCopied() async throws {
        var pictures: [Data] = []
        for copied in [false, true] {
            let card = List {
                Section {
                    Text("Send the invoice to Dana tomorrow morning.")
                    CopyWordsButton(words: "Send the invoice to Dana tomorrow morning.", copied: copied)
                }
                .listRowBackground(Tokens.panel)
            }
            .scrollContentBackground(.hidden)
            .background(Tokens.ink)
            .foregroundStyle(Tokens.text)
            .preferredColorScheme(.dark)
            let largest = try await shots.render(card.dynamicTypeSize(.accessibility5))
            try shots.save(largest, "copy-words-\(copied ? "copied" : "ready")-largest")
            #expect(try shots.inked(largest) > 0.01)
            pictures.append(try #require(largest.pngData()))
        }
        #expect(pictures[0] != pictures[1])
    }

    /// The transcribing scene holds its send, so the drying sheen shows.
    @Test func theTranscribingSceneHoldsTheSend() async throws {
        let model = try #require(await TakePreview.model(for: .transcribing))
        #expect(model.state == .transcribing)
        #expect(model.pillStage == .processing)
    }
}
