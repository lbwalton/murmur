// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
@testable import murmur

/// The ink and pulse scene (IOS-020): desktop's InkWave and PulseWave
/// stepping through time.
@MainActor @Suite struct InkSceneTests {
    /// A scene that recorded for `ms`, stepped as a screen at `every` ms
    /// would step it, at a steady level or the made-up voice.
    func recording(_ style: PillStyle, for ms: Double, every: Double = 1000.0 / 30, level: Double? = nil, reduced: Bool = false) -> InkScene {
        var scene = InkScene(style: style, at: 0, reduced: reduced)
        scene.show(.recording, palette: .standard)
        var now = 0.0
        while now < ms {
            now = min(ms, now + every)
            scene.step(to: now, level: level ?? DemoVoice.voice(now / 1000))
        }
        return scene
    }

    @Test func aColumnEvery66Milliseconds() {
        #expect(recording(.dabs, for: 660).pushes == 10)
        #expect(recording(.dabs, for: 659).pushes == 9)
    }

    /// Desktop updates once a frame at 60 a second; a screen stepping at 30
    /// a second gets the same rings, drops, and columns.
    @Test(arguments: [PillStyle.rings, .pulse, .flecks, .dabs])
    func theScreensRateChangesNothing(style: PillStyle) {
        let fast = recording(style, for: 3000, every: 1000.0 / 60, level: 0.6)
        let slow = recording(style, for: 3000, every: 1000.0 / 30, level: 0.6)
        #expect(fast.pushes == slow.pushes)
        #expect(fast.ringCount == slow.ringCount)
        #expect(fast.dropCount == slow.dropCount)
    }

    @Test func aVoiceBearsRingsAndDrops() {
        #expect(recording(.rings, for: 2000, level: 0.6).ringCount > 0)
        #expect(recording(.pulse, for: 2000, level: 0.6).ringCount > 0)
        #expect(recording(.flecks, for: 2000, level: 0.9).dropCount > 0)
    }

    /// Errors and no speech start clean: no ring or drop carries over.
    @Test func errorsAndNoSpeechStartClean() {
        for stage in [PillStage.error, .noSpeech] {
            var rings = recording(.rings, for: 1500, level: 0.6)
            rings.show(stage, palette: .standard)
            #expect(rings.ringCount == 0)
            var flecks = recording(.flecks, for: 1500, level: 0.9)
            flecks.show(stage, palette: .standard)
            #expect(flecks.dropCount == 0)
        }
    }

    /// Reduce Motion: no rings are born and no drops are thrown.
    @Test func reduceMotionBearsNothing() {
        #expect(recording(.rings, for: 2000, level: 0.6, reduced: true).ringCount == 0)
        #expect(recording(.pulse, for: 2000, level: 0.6, reduced: true).ringCount == 0)
        #expect(recording(.flecks, for: 2000, level: 0.9, reduced: true).dropCount == 0)
    }

    /// The pill redraws while recording, settles for 1.6 seconds after a
    /// stage change, then rests; a still pill never redraws.
    @Test func theSceneRestsOnceSettled() {
        var scene = recording(.dabs, for: 1000)
        #expect(scene.busy(still: false))
        #expect(!scene.busy(still: true))
        scene.show(.inserted, palette: .standard)
        scene.step(to: 2500, level: 0)
        #expect(scene.busy(still: false))
        scene.step(to: 2700, level: 0)
        #expect(!scene.busy(still: false))
    }

    /// Processing keeps its sheen coming every 2 seconds until the words
    /// land, and rests after 2 minutes; Reduce Motion has no sheen to wait for.
    @Test func processingRunsUntilTheSheenStops() {
        var scene = recording(.ribbon, for: 1000)
        scene.show(.processing, palette: .standard)
        scene.step(to: 61_000, level: 0)
        #expect(scene.busy(still: false))
        scene.step(to: 122_000, level: 0)
        #expect(!scene.busy(still: false))
        var reduced = recording(.ribbon, for: 1000, reduced: true)
        reduced.show(.processing, palette: .standard)
        reduced.step(to: 3000, level: 0)
        #expect(!reduced.busy(still: false))
    }

    /// The pill off screen for ten minutes catches up at once.
    @Test func aLongGapJumpsAhead() {
        var scene = recording(.dabs, for: 500)
        let started = Date.now
        scene.step(to: 600_000, level: 0.5)
        #expect(Date.now.timeIntervalSince(started) < 0.5)
        #expect(scene.pushes >= 9000)
        #expect(scene.busy(still: false))
    }

    /// The ink paints in the accent: wet in it while recording, a darker
    /// shade of it once dry, and never amber.
    @Test(arguments: [PillStyle.dabs, .flecks, .rings, .ribbon, .pulse])
    func theInkPaintsInTheAccent(style: PillStyle) {
        let blue = RGBA(r: 0.36, g: 0.51, b: 0.85)
        let palette = PillPalette(accent: blue)
        let test = PillTests()
        for (stage, time) in [(PillStage.recording, 0.5), (.processing, 1.5)] {
            let frame = PillFrame(style: style, stage: stage, levels: test.loud, time: time, still: false, palette: palette)
            let bytes = test.pixels(frame)
            var bluish = 0
            for i in stride(from: 0, to: bytes.count, by: 4) {
                let red = Int(bytes[i])
                let blue = Int(bytes[i + 2])
                if blue - red > 25 { bluish += 1 }
            }
            #expect(bluish > 0, "\(stage)")
            #expect(test.paint(frame).amber == 0, "\(stage)")
        }
    }

    /// Reduce Motion: every stage of every ink style is a finished still,
    /// never a blank space.
    @Test(arguments: [PillStyle.dabs, .flecks, .rings, .ribbon, .pulse])
    func aStillIsNeverBlank(style: PillStyle) {
        let test = PillTests()
        for stage in [PillStage.idle, .recording, .processing, .inserted, .noSpeech, .error] {
            let bytes = test.pixels(PillFrame(style: style, stage: stage, levels: test.loud, time: 0, still: true))
            // Any paint at all on the ink (15, 14, 17), however faint. Each
            // step is its own typed value: Swift 6.3 (CI) gives up type
            // checking the sum as one expression.
            var painted = 0
            for i in stride(from: 0, to: bytes.count, by: 4) {
                let red = Int(bytes[i])
                let green = Int(bytes[i + 1])
                let blue = Int(bytes[i + 2])
                let sum: Int = red + green + blue
                if sum > 94 { painted += 1 }
            }
            #expect(painted > 20, "\(stage)")
        }
    }

    /// A pill taller than desktop's 40 point wave (the screen murmur opens
    /// to) is desktop's pill magnified: its flecks, rings, and bristles grow
    /// with it instead of thinning to dust.
    @Test(arguments: [PillStyle.dabs, .flecks, .rings, .ribbon, .pulse])
    func aTallPillIsDesktopsMagnified(style: PillStyle) {
        let frame = PillFrame(style: style, stage: .recording, levels: DemoVoice.levels, time: 0.5, still: false)
        func pixels(_ size: CGSize, scale: CGFloat) -> Data? {
            let format = UIGraphicsImageRendererFormat()
            format.scale = scale
            format.opaque = true
            return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
                renderer.cgContext.setFillColor(UIColor(Tokens.ink).cgColor)
                renderer.cgContext.fill(CGRect(origin: .zero, size: size))
                Pill.paint(frame, in: CGRect(origin: .zero, size: size), context: renderer.cgContext)
            }.cgImage?.dataProvider?.data as Data?
        }
        let desktops = pixels(CGSize(width: 120, height: 40), scale: 3)
        let magnified = pixels(CGSize(width: 360, height: 120), scale: 1)
        #expect(desktops != nil && desktops == magnified)
    }

    /// The made-up voice is desktop's: phrases with a breath between them.
    @Test func theMadeUpVoiceBreathes() {
        #expect(DemoVoice.voice(2.6) < 0.05)
        let spoken = stride(from: 0.0, to: 2.4, by: 0.05).map(DemoVoice.voice)
        #expect(spoken.max() ?? 0 > 0.5)
        #expect(spoken.allSatisfy { $0 >= 0 && $0 <= 1 })
        #expect(DemoVoice.levels.count == Pill.barCount)
    }
}
