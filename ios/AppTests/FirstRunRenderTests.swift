// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI
import Testing
import UIKit
@testable import murmur

/// First run in each of its states at the largest accessibility text size
/// (ios/prd.json conventions.design): every state draws a full screen, and
/// with MURMUR_SHOTS set to a folder, each saves two pictures there to read
/// for clipping: the screen as it opens, and the whole page in a window tall
/// enough that nothing has to scroll.
@MainActor @Suite struct FirstRunRenderTests {
    /// Shows the view in a window, as the app does, tall when the whole page
    /// should show, and draws it once something is on screen, looking every
    /// tenth of a second for up to three seconds. A settle draws it again
    /// that many seconds later, for a screen whose motion should show.
    func render(_ view: some View, tall: Bool = false, height: CGFloat = 3_200, settle: Double = 0) async throws -> UIImage {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        if tall { window.frame.size.height = height }
        window.rootViewController = UIHostingController(rootView: view)
        window.isHidden = false
        defer { window.isHidden = true }
        // A window taller than the screen draws nothing as a snapshot, so
        // the whole page draws its layers instead.
        let draw = {
            UIGraphicsImageRenderer(bounds: window.bounds).image { renderer in
                if tall {
                    window.layer.render(in: renderer.cgContext)
                } else {
                    _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
                }
            }
        }
        var image = UIImage()
        for _ in 0..<30 {
            try await Task.sleep(for: .seconds(0.1))
            image = draw()
            if try inked(image) > 0.02 { break }
        }
        if settle > 0 {
            try await Task.sleep(for: .seconds(settle))
            image = draw()
        }
        return image
    }

    /// The share of a small copy of the picture that is not the ink ground.
    func inked(_ image: UIImage) throws -> Double {
        let cg = try #require(image.cgImage)
        let width = 60, height = 130
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = try #require(CGContext(
            data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        // The ink ground is near black; anything brighter is drawn on it.
        var lit = 0
        for index in stride(from: 0, to: pixels.count, by: 4) {
            let red = Int(pixels[index]), green = Int(pixels[index + 1]), blue = Int(pixels[index + 2])
            if red + green + blue > 120 { lit += 1 }
        }
        return Double(lit) / Double(width * height)
    }

    func save(_ image: UIImage, _ name: String) throws {
        guard let folder = ProcessInfo.processInfo.environment["MURMUR_SHOTS"] else { return }
        try image.pngData()?.write(to: URL(filePath: folder).appending(path: "\(name).png"))
    }

    @Test(arguments: FirstRunPreview.Moment.allCases)
    func eachStepDrawsAtTheLargestTextSize(_ moment: FirstRunPreview.Moment) async throws {
        let image = try await render(FirstRunPreview(moment).dynamicTypeSize(.accessibility5))
        try save(image, "first-run-\(moment)-largest")
        #expect(try inked(image) > 0.02)
        let page = try await render(FirstRunPreview(moment).dynamicTypeSize(.accessibility5), tall: true)
        try save(page, "first-run-\(moment)-largest-page")
        #expect(try inked(page) > 0.02)
    }

    /// Finish later and Skip for now take the tap across their whole
    /// frame, at least 44 points each way: the frame sits inside the button,
    /// in its style, where a frame outside it grows the layout but leaves the
    /// tap on the words. SwiftUI shows tests no tap area, so this pins the
    /// style's size.
    @Test func quietButtonsAreFullTapTargets() {
        func size(_ button: some View) -> CGSize {
            UIHostingController(rootView: button).sizeThatFits(in: CGSize(width: 400, height: 400))
        }
        let short = size(Button("Next") {}.buttonStyle(TapTargetStyle()))
        #expect(short.width >= 44 && short.height >= 44, "\(short)")
        let wide = size(Button("Skip for now") {}.buttonStyle(TapTargetStyle(fill: true)))
        #expect(wide.width == 400 && wide.height >= 44, "\(wide)")
    }

    /// The box shows its whole hint at the largest size: a text field's hint
    /// stops at its line limit, which cut the keyboard step's hint short.
    @Test func theBoxShowsItsWholeHint() {
        func height(_ view: some View) -> CGFloat {
            UIHostingController(rootView: view.dynamicTypeSize(.accessibility5))
                .sizeThatFits(in: CGSize(width: 300, height: 3_000)).height
        }
        let hint = height(Text(SetupCopy.checkBox).padding(14))
        let box = height(FirstRunBox(prompt: SetupCopy.checkBox, text: .constant("")))
        #expect(box >= hint, "the box is \(box) tall, its hint \(hint)")
    }

    /// Home's checklist icons grow with the text: a fixed column let the
    /// keyboard symbol run into its title at the largest size.
    @Test func checklistIconsGrowWithTheText() {
        func width(_ size: DynamicTypeSize) -> CGFloat {
            UIHostingController(rootView: StepIcon(step: .keyboard).dynamicTypeSize(size))
                .sizeThatFits(in: CGSize(width: 400, height: 400)).width
        }
        #expect(width(.accessibility5) > width(.large) * 2)
    }

    @Test func homesChecklistDrawsAtTheLargestTextSize() async throws {
        let image = try await render(SetupChecklistPreview().dynamicTypeSize(.accessibility5))
        try save(image, "first-run-checklist-largest")
        #expect(try inked(image) > 0.02)
    }
}
