// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
@testable import murmur

@MainActor @Suite struct PillTests {
    let size = CGSize(width: 360, height: 56)
    let loud = [Float](repeating: 0.9, count: Pill.barCount)

    /// Paint in an image of the pill, counted by color over the pixels
    /// clearly painted on the ink.
    struct Paint {
        var amber = 0, gold = 0, red = 0, neutral = 0
    }

    func pixels(_ frame: PillFrame) -> [UInt8] {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            renderer.cgContext.setFillColor(UIColor(Tokens.ink).cgColor)
            renderer.cgContext.fill(CGRect(origin: .zero, size: size))
            Pill.paint(frame, in: CGRect(origin: .zero, size: size), context: renderer.cgContext)
        }
        let width = Int(size.width * 2), height = Int(size.height * 2)
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        bytes.withUnsafeMutableBytes { raw in
            let context = CGContext(
                data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
            context?.draw(image.cgImage!, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return bytes
    }

    func paint(_ frame: PillFrame) -> Paint {
        let bytes = pixels(frame)
        var paint = Paint()
        for i in stride(from: 0, to: bytes.count, by: 4) {
            // How far each channel rose above the ink (15, 14, 17).
            let r = Double(bytes[i]) - 15, g = Double(bytes[i + 1]) - 14, b = Double(bytes[i + 2]) - 17
            guard max(r, g, b) >= 40, r > 0 else { continue }
            let green = g / r, blue = b / r
            if green < 0.45 { paint.red += 1 }
            // Fainter paint's 8 bit ratio wobbles across the line between
            // amber and gold (the ink's faintest bristles), so only clear
            // paint is told apart by hue (IOS-020).
            else if max(r, g, b) < 64, green < 0.88 { continue }
            else if green >= 0.58, green <= 0.705, blue < 0.4 { paint.amber += 1 }
            else if green > 0.715, green <= 0.82, blue < 0.4 { paint.gold += 1 }
            else if green > 0.88 { paint.neutral += 1 }
        }
        return paint
    }

    func frame(_ style: PillStyle, _ stage: PillStage, at time: TimeInterval = 0.5, still: Bool = false) -> PillFrame {
        PillFrame(style: style, stage: stage, levels: loud, time: time, still: still)
    }

    @Test(arguments: PillStyle.allCases)
    func idleIsDryAndNeverAmber(style: PillStyle) {
        let idle = paint(frame(style, .idle))
        #expect(idle.amber == 0)
        #expect(idle.gold == 0)
        #expect(idle.red == 0)
        #expect(idle.neutral > 0)
    }

    @Test(arguments: PillStyle.allCases)
    func recordingIsWetAmber(style: PillStyle) {
        #expect(paint(frame(style, .recording)).amber > 0)
    }

    /// The bars stand at the voice's level: louder draws more paint.
    @Test func barsFollowTheVoice() {
        let quiet = paint(PillFrame(style: .bars, stage: .recording, levels: [Float](repeating: 0.1, count: Pill.barCount), time: 0.5, still: false))
        let loudPaint = paint(frame(.bars, .recording))
        #expect(loudPaint.amber + loudPaint.gold > 2 * (quiet.amber + quiet.gold))
    }

    @Test(arguments: PillStyle.allCases)
    func processingDriesToGold(style: PillStyle) {
        let dry = paint(frame(style, .processing, at: 1.5))
        #expect(dry.amber == 0)
        #expect(dry.gold > 0)
    }

    @Test(arguments: PillStyle.allCases)
    func theEndsAreNeverAmber(style: PillStyle) {
        let inserted = paint(frame(style, .inserted, at: 1))
        #expect(inserted.amber == 0 && inserted.red == 0)
        let nothing = paint(frame(style, .noSpeech))
        #expect(nothing.amber == 0 && nothing.gold == 0 && nothing.red == 0)
        #expect(nothing.neutral > 0)
        let error = paint(frame(style, .error))
        #expect(error.red > 0)
        #expect(error.amber == 0 && error.gold == 0)
    }

    /// Reduce Motion shows each stage as one still frame: time and the
    /// voice change nothing.
    @Test(arguments: PillStyle.allCases)
    func stillFramesNeverMove(style: PillStyle) {
        for stage in [PillStage.idle, .recording, .processing, .inserted, .noSpeech, .error] {
            let early = PillFrame(style: style, stage: stage, levels: loud, time: 0.1, still: true)
            let late = PillFrame(style: style, stage: stage, levels: [Float](repeating: 0.2, count: Pill.barCount), time: 7.3, still: true)
            #expect(pixels(early) == pixels(late))
            #expect(!Pill.moves(stage, at: 0.1, still: true))
        }
    }

    /// The same frame draws the same pill, for previews, tests, and shots.
    @Test func framesAreDeterministic() {
        let frame = frame(.speckle, .recording, at: 1.234)
        #expect(pixels(frame) == pixels(frame))
    }

    @Test func onlyMovingStagesRedraw() {
        #expect(Pill.moves(.recording, at: 30, still: false))
        #expect(Pill.moves(.processing, at: 60, still: false))
        #expect(!Pill.moves(.processing, at: 200, still: false))
        #expect(Pill.moves(.inserted, at: 0.1, still: false))
        #expect(!Pill.moves(.inserted, at: 1, still: false))
        for stage in [PillStage.idle, .noSpeech, .error] {
            #expect(!Pill.moves(stage, at: 0, still: false))
        }
    }

    /// One sheen as the paint dries, a softer one every 2 seconds after, and
    /// none after 2 minutes, as on desktop.
    @Test func theSheenComesOnceThenEveryTwoSeconds() throws {
        let first = try #require(Sheen.at(0.3))
        #expect(abs(first.center - 0.343) < 0.01 && first.alpha == 0.4)
        #expect(Sheen.at(1.5) == nil)
        let again = try #require(Sheen.at(2.35))
        #expect(abs(again.center - 0.45) < 0.01 && again.alpha == 0.22)
        #expect(Sheen.at(118.3)?.alpha == 0.22)
        #expect(Sheen.at(121) == nil)
    }

    /// VoiceOver reads the pill as a button with its stage.
    @Test func voiceOverReadsTheStage() {
        let stages: [PillStage] = [.idle, .recording, .processing, .inserted, .noSpeech, .error]
        #expect(stages.map(Pill.label) == ["Start dictation", "Recording", "Working", "Words added", "Heard nothing", "Failed, retry in murmur"])
    }

    @Test func theLookIsRememberedForTheKeyboard() {
        let file = FileManager.default.temporaryDirectory.appending(path: "pill-\(UUID().uuidString).json")
        #expect(PillLook.read(from: file) == PillLook(style: .bars, accent: "amber", color: nil))
        let blue = RGBA(r: 0.36, g: 0.51, b: 0.85)
        let look = PillLook(style: .ribbon, accent: "belt", color: blue.hex)
        look.write(to: file)
        #expect(PillLook.read(from: file) == look)
        #expect(PillLook.read(from: file).palette == PillPalette(accent: RGBA(hex: blue.hex)))
    }

    /// A look written before the accents keeps its style; one with a style
    /// this build does not draw keeps its accent.
    @Test func anOlderOrNewerLookKeepsWhatItCan() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "pill-\(UUID().uuidString).json")
        try Data(#"{"style":"speckle"}"#.utf8).write(to: file)
        #expect(PillLook.read(from: file) == PillLook(style: .speckle, accent: "amber", color: nil))
        try Data(#"{"style":"sparkles","accent":"ember"}"#.utf8).write(to: file)
        #expect(PillLook.read(from: file) == PillLook(style: .bars, accent: "ember", color: nil))
        try Data("not json".utf8).write(to: file)
        #expect(PillLook.read(from: file) == PillLook(style: .bars))
    }

    /// Signal amber, or no color, dries to brand gold; any other accent
    /// dries to a darker shade of itself, as on desktop.
    @Test func theAccentDriesAsOnDesktop() {
        let blue = RGBA(r: 0.36, g: 0.51, b: 0.85)
        #expect(PillPalette(accent: blue) == PillPalette(wet: blue, dry: blue.mix(.ink, 0.35)))
        #expect(PillPalette(accent: nil) == .standard)
        #expect(PillPalette(accent: .amber) == .standard)
        #expect(PillPalette(accent: RGBA.amber.mix(.text, 0.004)) == .standard)
        #expect(PillPalette(accent: RGBA.amber.mix(.text, 0.05)) != .standard)
        #expect(PillLook(style: .bars, accent: "x", color: "not a color").palette == .standard)
    }

    @Test func theKeyboardFollowsTheMailbox() {
        let phases: [MailboxEntry.Phase?] = [nil, .listening, .working, .ready, .nothing, .failed]
        #expect(phases.map(PillStage.init) == [.idle, .recording, .processing, .inserted, .noSpeech, .error])
    }

    /// The level file carries the level and a count, and nothing else.
    @Test func theLevelFileCarriesOnlyTheLevel() throws {
        let file = LevelFile(url: FileManager.default.temporaryDirectory.appending(path: "level-\(UUID().uuidString)"))
        #expect(file.read() == nil)
        file.write(0.42, count: 7)
        let read = try #require(file.read())
        #expect(read.level == 0.42 && read.count == 7)
        #expect(try Data(contentsOf: try #require(file.url)).count == 8)
    }

    @Test func theAppFollowsTheTake() {
        let states: [TakeModel.State] = [.idle, .recording(since: .now), .transcribing, .words("hi"), .heardNothing(sent: true), .micOff]
        #expect(states.map(PillStage.init) == [.idle, .recording, .processing, .inserted, .noSpeech, .error])
    }

    /// The capture script draws every stage of every style.
    @Test func theShotsCoverEveryStage() {
        let covered = Set(PillShots.shots.map { "\($0.frame.style) \($0.frame.stage)" })
        #expect(covered.count == PillStyle.allCases.count * 6)
        #expect(Set(PillShots.shots.map(\.name)).count == PillShots.shots.count)
        #expect(PillShots.image(PillShots.shots[0].frame).size == CGSize(width: 236, height: 56))
    }
}
