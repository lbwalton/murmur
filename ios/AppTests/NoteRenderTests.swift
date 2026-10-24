// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI
import Testing
import UIKit
@testable import murmur

/// New note and the keyboard's pad in their states at the largest text
/// size (ios/prd.json conventions.design, IOS-023): each draws, and with
/// MURMUR_SHOTS set, saves pictures to read for clipping, as first run's do.
@MainActor @Suite struct NoteRenderTests {
    let shots = FirstRunRenderTests()

    @Test(arguments: NoteTakePreview.Scene.allCases)
    func newNoteDrawsAtTheLargestTextSize(_ scene: NoteTakePreview.Scene) async throws {
        let image = try await shots.render(NoteTakePreview(scene).dynamicTypeSize(.accessibility5))
        try shots.save(image, "new-note-\(scene)-largest")
        #expect(try shots.inked(image) > 0.02)
        let page = try await shots.render(NoteTakePreview(scene).dynamicTypeSize(.accessibility5), tall: true)
        try shots.save(page, "new-note-\(scene)-largest-page")
        #expect(try shots.inked(page) > 0.02)
    }

    /// Settings, Notes with File layout as shipped, changed, and broken.
    @Test(arguments: NotesSettingsPreview.Scene.allCases)
    func notesSettingsDrawAtTheLargestTextSize(_ scene: NotesSettingsPreview.Scene) async throws {
        let image = try await shots.render(NotesSettingsPreview(scene).dynamicTypeSize(.accessibility5))
        try shots.save(image, "notes-settings-\(scene)-largest")
        #expect(try shots.inked(image) > 0.02)
        // The settings page runs long at this size; File layout is last.
        let page = try await shots.render(NotesSettingsPreview(scene).dynamicTypeSize(.accessibility5), tall: true, height: 7_000)
        try shots.save(page, "notes-settings-\(scene)-largest-page")
        #expect(try shots.inked(page) > 0.02)
    }

    /// Open note, the pill, and the receipt all fit the keyboard's height at
    /// the largest text the pad takes, none over another, and Open note
    /// takes a tap across 44 points.
    @Test(arguments: PadPreview.Moment.allCases)
    func thePadFitsItsHeightAtTheLargestText(_ moment: PadPreview.Moment) async throws {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.traitOverrides.preferredContentSizeCategory = .accessibilityExtraExtraExtraLarge
        let pad = PadView(frame: CGRect(x: 0, y: 0, width: 375, height: PadPreview.height))
        window.addSubview(pad)
        window.isHidden = false
        defer { window.isHidden = true }
        PadPreview.stage(pad, moment)
        try await Task.sleep(for: .seconds(0.2))
        pad.layoutIfNeeded()
        // The pad's text stops growing at accessibility medium, as the
        // keyboard's height is fixed; the test is at that size, not below it.
        let largest = UIFont.preferredFont(forTextStyle: .footnote, compatibleWith: UITraitCollection(preferredContentSizeCategory: .accessibilityMedium))
        #expect(pad.status.font.pointSize == largest.pointSize, "status at \(pad.status.font.pointSize), largest \(largest.pointSize)")
        let shown = [pad.insertLast, pad.openNote, pad.pill, pad.status].filter { !$0.isHidden }
        let frames = shown.map { $0.convert($0.bounds, to: pad) }
        for (view, frame) in zip(shown, frames) {
            #expect(pad.bounds.contains(frame), "\(type(of: view)) at \(frame) is outside the pad")
        }
        for (index, frame) in frames.enumerated() {
            for other in frames.dropFirst(index + 1) {
                #expect(!frame.intersects(other), "\(frame) overlaps \(other)")
            }
        }
        if moment == .noted {
            #expect(pad.openNote.bounds.height >= 44)
            #expect(pad.status.text == "Noted to inbox")
        }
        let image = UIGraphicsImageRenderer(bounds: pad.bounds).image { pad.layer.render(in: $0.cgContext) }
        try shots.save(image, "pad-\(moment)-largest")
        #expect(try shots.inked(image) > 0.02)
    }
}
