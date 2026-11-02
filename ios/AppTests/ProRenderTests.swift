// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI
import Testing
@testable import murmur

/// Settings, murmur Pro (ios/prd.json IOS-025), free and bought, at the
/// default and the largest text size, with the whole page: each draws, and
/// with MURMUR_SHOTS set, saves pictures to read the footer for clipping.
@MainActor @Suite struct ProRenderTests {
    let shots = FirstRunRenderTests()

    @Test(arguments: [false, true])
    func proDrawsWithItsFooter(_ bought: Bool) async throws {
        let name = bought ? "pro-bought" : "pro-free"
        let screen = { NavigationStack { ProScreen(store: .preview(bought: bought)) }.preferredColorScheme(.dark) }
        let image = try await shots.render(screen(), settle: 0.5)
        try shots.save(image, name)
        #expect(try shots.inked(image) > 0.02)
        let page = try await shots.render(screen().dynamicTypeSize(.accessibility5), tall: true, settle: 0.5)
        try shots.save(page, "\(name)-largest-page")
        #expect(try shots.inked(page) > 0.02)
    }
}
