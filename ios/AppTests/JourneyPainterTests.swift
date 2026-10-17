// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
import WebKit
@testable import murmur

/// How two paintings differ, pixel by pixel: the share of color bytes that
/// differ and the largest difference. A canvas on the GPU can round a
/// blend by one level from run to run, which nobody can see.
struct PaintingDifference {
    let share: Double
    let largest: Int

    /// The same painting, give or take the GPU's rounding.
    var same: Bool { largest <= 2 && share < 0.005 }

    init(_ a: UIImage, _ b: UIImage) {
        let left = Self.bytes(a)
        let right = Self.bytes(b)
        guard left.count == right.count, !left.isEmpty else {
            share = 1
            largest = 255
            return
        }
        var differing = 0
        var largest = 0
        for index in left.indices where left[index] != right[index] {
            differing += 1
            largest = max(largest, abs(Int(left[index]) - Int(right[index])))
        }
        share = Double(differing) / Double(left.count)
        self.largest = largest
    }

    static func bytes(_ image: UIImage) -> [UInt8] {
        guard let cg = image.cgImage else { return [] }
        var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            return true
        }
        return drawn ? bytes : []
    }
}

extension JourneyPainter {
    /// A painter whose page has started. A shared CI runner can take far
    /// longer than a phone to start a web process, so tests that need the
    /// page give it ninety seconds, while the app keeps its own wait.
    static func started() async throws -> JourneyPainter {
        let painter = JourneyPainter()
        try await painter.waitUntilReady(seconds: 90)
        return painter
    }

    /// Puts the web view on screen at this size and waits until the page
    /// draws there (two animation frames), so what a test paints next is
    /// painted on screen, as the ceremony's and today's painting are.
    func onScreen(_ size: CGSize) async throws {
        let window = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first?.windows.first)
        web.frame = CGRect(origin: .zero, size: size)
        window.addSubview(web)
        _ = try await web.callAsyncJavaScript("await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))", arguments: [:], contentWorld: .page)
    }
}

/// The Journey's painter page in its web view (IOS-018).
@MainActor @Suite(.serialized) struct JourneyPainterTests {
    let standing = JourneyStanding(rank: "white-2", next: "white-3", words: 7380, days: 7)

    @Test func thePageIsInTheAppAndSaysReady() async throws {
        let url = try #require(JourneyPage.url)
        #expect(try String(contentsOf: url, encoding: .utf8).contains("murmurJourney"))
        try await JourneyPainter.started().waitUntilReady()
    }

    /// A page that never says ready fails in time, so the Journey keeps its
    /// plain drawing.
    @Test func aMissingPageFailsInTime() async {
        await #expect(throws: JourneyPainter.Failure.notReady) {
            try await JourneyPainter(page: nil).waitUntilReady(seconds: 0.3)
        }
    }

    /// A page that loads but never says ready fails once its time is up,
    /// and from then on fails at once, until the page starts over.
    @Test func aSilentPageFailsInTimeThenAtOnce() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "journey-silent-\(UUID().uuidString).html")
        try "<!doctype html><title>silent</title>".write(to: url, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: url) }
        let painter = JourneyPainter(page: url)
        let clock = ContinuousClock()
        let first = await clock.measure {
            await #expect(throws: JourneyPainter.Failure.notReady) { try await painter.waitUntilReady(seconds: 0.5) }
        }
        #expect(first >= .seconds(0.45))
        let again = await clock.measure {
            await #expect(throws: JourneyPainter.Failure.notReady) { try await painter.waitUntilReady(seconds: 30) }
        }
        #expect(again < .seconds(0.2))
    }

    /// A second ceremony on the same page, at a new size, stops the first
    /// one's strokes, so the old size never paints over the new. The web
    /// view is on screen, as the ceremony's is, so its animation frames run.
    @Test func aNewCeremonyStopsTheLastOne() async throws {
        let painter = try await JourneyPainter.started()
        try await painter.onScreen(CGSize(width: 390, height: 844))
        defer { painter.web.removeFromSuperview() }
        let size = CGSize(width: 320, height: 700)
        func ink() async throws -> Int {
            let sum = try await painter.web.evaluateJavaScript(
                "(() => { const c = document.getElementById('base'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i]; return n })()"
            )
            return (sum as? Int) ?? -1
        }
        try await painter.ceremony(rank: "blue", size: size, reduced: true)
        let once = try await ink()
        #expect(once > 0)
        try await painter.ceremony(rank: "blue", size: CGSize(width: 390, height: 844), reduced: false)
        try await painter.ceremony(rank: "blue", size: size, reduced: true)
        try await Task.sleep(for: .seconds(1.5))
        let after = try await ink()
        #expect(abs(after - once) <= once / 1000, "the finished painting went from \(once) to \(after)")
    }

    /// A picture comes back as an image of the size asked for, at the
    /// screen's scale, and the same request paints the same picture.
    @Test func aBeltIsPaintedAtItsSize() async throws {
        let painter = try await JourneyPainter.started()
        let request = JourneyArtwork.belt(belt: "blue", stripes: 2, width: 168, height: 40, drop: nil)
        let belt = try await painter.picture(request, scale: 2)
        #expect(belt.image.size == CGSize(width: 168, height: 40))
        #expect(belt.image.scale == 2)
        let again = try await painter.picture(request, scale: 2)
        #expect(PaintingDifference(again.image, belt.image).same)
    }

    /// Mid drop the newest tape is still in the air: the frame differs from
    /// the finished belt, and the last frame is the finished belt.
    @Test func theTapeDropsOntoTheBelt() async throws {
        let painter = try await JourneyPainter.started()
        let finished = try await painter.picture(.belt(belt: "white", stripes: 3, width: 140, height: 30, drop: nil), scale: 2)
        let middle = try await painter.picture(.belt(belt: "white", stripes: 3, width: 140, height: 30, drop: 0.3), scale: 2)
        let landed = try await painter.picture(.belt(belt: "white", stripes: 3, width: 140, height: 30, drop: 1), scale: 2)
        #expect(!PaintingDifference(middle.image, finished.image).same)
        #expect(PaintingDifference(landed.image, finished.image).same)
    }

    /// The road comes back without its words, and with where to set them.
    @Test func theRoadComesWithItsWords() async throws {
        let road = try await JourneyPainter.started().picture(.road(standing), scale: 2)
        #expect(road.image.size == CGSize(width: 1500, height: 120))
        #expect(road.groups.map(\.name).prefix(3) == ["white", "blue", "purple"])
        #expect(road.groups.map(\.name).contains("coral"))
        let you = try #require(road.you)
        #expect(you > 34 && you < 1500)
    }

    @Test func gatesAndStampsArePainted() async throws {
        let painter = try await JourneyPainter.started()
        for request in [
            JourneyArtwork.words(standing, width: 320, height: 34),
            .tallies(standing, width: 320, height: 44),
            .stamp(id: "streak-7", got: true, seed: 1209, size: 76),
            .stamp(id: "marathon", got: false, seed: 1290, size: 76)
        ] {
            let picture = try await painter.picture(request, scale: 3)
            #expect(picture.image.size.width > 0)
        }
    }

    /// The ceremony paints on the page's own canvases; an unknown rank
    /// paints nothing.
    @Test func theCeremonyPaints() async throws {
        let painter = try await JourneyPainter.started()
        try await painter.ceremony(rank: "blue", size: CGSize(width: 390, height: 844), reduced: true)
        await #expect(throws: JourneyPainter.Failure.badPicture) {
            try await painter.ceremony(rank: "gold-9", size: CGSize(width: 390, height: 844), reduced: true)
        }
    }

    /// The page the app ships carries its content policy.
    @Test func thePageCarriesItsContentPolicy() throws {
        let page = try String(contentsOf: try #require(JourneyPage.url), encoding: .utf8)
        #expect(page.contains(#"<meta http-equiv="Content-Security-Policy" content="default-src 'none';"#))
    }

    /// The page can fetch nothing: its content policy refuses the request
    /// before it leaves, even one that asks for no answer, and even a file
    /// beside it in the bundle.
    @Test func thePageCanFetchNothing() async throws {
        let painter = try await JourneyPainter.started()
        try await painter.waitUntilReady()
        for target in ["https://example.com", "journey.html"] {
            let answer = try await painter.web.callAsyncJavaScript(
                """
                const refused = []
                const listen = (event) => refused.push(event.violatedDirective)
                document.addEventListener('securitypolicyviolation', listen)
                let fetched = 'fetched'
                try { await fetch(target, { mode: 'no-cors' }) } catch { fetched = 'refused' }
                await new Promise((done) => setTimeout(done, 100))
                document.removeEventListener('securitypolicyviolation', listen)
                return fetched + (refused.length > 0 ? ' by the policy' : '')
                """,
                arguments: ["target": target], contentWorld: .page
            )
            #expect(answer as? String == "refused by the policy", "\(target)")
        }
    }

    /// The page cannot go anywhere: after its own file loads, every
    /// navigation is refused, and the painter keeps working.
    @Test func thePageCannotNavigate() async throws {
        let painter = try await JourneyPainter.started()
        try await painter.waitUntilReady()
        let page = painter.web.url
        for target in ["https://example.com", "about:blank", "journey.html"] {
            _ = try? await painter.web.evaluateJavaScript("location.href = '\(target)'; 1")
            try await Task.sleep(for: .milliseconds(400))
            #expect(painter.web.url == page)
        }
        let kind = try await painter.web.evaluateJavaScript("typeof window.murmurJourney")
        #expect(kind as? String == "object")
    }

    /// The page is one file in the bundle's web folder.
    @Test func thePageIsOneFileInTheBundle() throws {
        let page = try #require(JourneyPage.url)
        #expect(page.isFileURL)
        #expect(page.path().hasPrefix(Bundle.main.bundlePath))
        #expect(page.deletingLastPathComponent().lastPathComponent == "web")
    }
}
