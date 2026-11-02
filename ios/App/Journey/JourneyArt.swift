// SPDX-License-Identifier: GPL-3.0-only
// The Journey's paintings (ios/prd.json IOS-018), asked of the painter page
// for where practice stands: the belt, the road, the two gates, and a
// stamp per achievement. Until a picture arrives, or if the page fails,
// the screen keeps its plain native drawing, so the Journey always reads.
import MurmurCore
import Observation
import UIKit

@MainActor @Observable final class JourneyArt {
    /// Desktop's belt is 560 by 120; on iPhone it is set at half that.
    static let beltSize = CGSize(width: 280, height: 60)
    static let wordsHeight: Double = 34
    static let talliesHeight: Double = 44
    static let stampSize: Double = 76
    /// Frames of the tape drop, played over desktop's 520 ms.
    static let tapeFrames = 13
    static let tapeDuration = 0.52

    private(set) var belt: UIImage?
    private(set) var road: JourneyPicture?
    private(set) var words: UIImage?
    private(set) var tallies: UIImage?
    private(set) var stamps: [String: UIImage] = [:]
    /// How many paintings have landed: each one fades in as it does.
    private(set) var painted = 0

    @ObservationIgnored private let painter: JourneyPainter

    init(painter: JourneyPainter = .shared) {
        self.painter = painter
    }

    /// Paints everything for this report. The gates take the row's width.
    /// A picture that fails keeps the one already there.
    func paint(_ report: ProgressReport, rules: JourneyRules, earned: Set<String>, gateWidth: Double, scale: CGFloat) async {
        let standing = Journey.standing(report)
        let size = Self.beltSize
        if let image = await image(.belt(belt: report.rank.belt, stripes: report.rank.stripes, width: size.width, height: size.height, drop: nil), scale) {
            belt = image
        }
        if let picture = try? await painter.picture(.road(standing), scale: scale) {
            road = picture
            painted += 1
        }
        if report.practice.next != nil, gateWidth > 0 {
            if let image = await image(.words(standing, width: gateWidth, height: Self.wordsHeight), scale) { words = image }
            if let image = await image(.tallies(standing, width: gateWidth, height: Self.talliesHeight), scale) { tallies = image }
        }
        for (index, spec) in rules.achievements.achievements.enumerated() {
            let got = earned.contains(spec.id)
            let artwork = JourneyArtwork.stamp(id: spec.id, got: got, seed: Journey.stampSeed(index), size: Self.stampSize)
            if let image = await image(artwork, scale) { stamps[spec.id] = image }
        }
    }

    /// One picture's image, counted as landed when it arrives.
    private func image(_ artwork: JourneyArtwork, _ scale: CGFloat) async -> UIImage? {
        guard let image = try? await painter.picture(artwork, scale: scale).image else { return nil }
        painted += 1
        return image
    }
}

/// A new stripe's tape dropping onto the belt (IOS-018), as desktop slaps
/// it on: the frames are painted first, the first one holding the belt
/// without its new tape, then they play once over desktop's 520 ms, after
/// the ceremony if there is one. A play cancelled midway lands at once.
@MainActor @Observable final class TapeDrop {
    /// The frame on show: the first while the drop waits to play, then each
    /// in turn; nil once the tape has landed.
    private(set) var frame: UIImage?
    /// The stripe whose tape is expected.
    private(set) var pending: RankSpec?

    @ObservationIgnored private var frames: [UIImage] = []
    @ObservationIgnored private let painter: JourneyPainter

    init(painter: JourneyPainter = .shared) {
        self.painter = painter
    }

    /// A stripe is waiting for its frames.
    var waiting: Bool { pending != nil && frames.isEmpty }

    /// Expects this stripe's tape; a different stripe replaces the last.
    func expect(_ stripe: RankSpec) {
        guard pending?.id != stripe.id else { return }
        pending = stripe
        frames = []
        frame = nil
    }

    /// Paints the expected stripe's frames and holds the first. If the page
    /// cannot paint them, the stripe is simply on the belt.
    func prepare(scale: CGFloat) async {
        guard let stripe = pending, frames.isEmpty else { return }
        let size = JourneyArt.beltSize
        var painted: [UIImage] = []
        for index in 0..<JourneyArt.tapeFrames {
            let k = Double(index) / Double(JourneyArt.tapeFrames - 1)
            let artwork = JourneyArtwork.belt(belt: stripe.belt, stripes: stripe.stripes, width: size.width, height: size.height, drop: k)
            guard let image = try? await painter.picture(artwork, scale: scale).image else {
                if pending?.id == stripe.id { pending = nil }
                return
            }
            painted.append(image)
        }
        // A newer stripe replaced this one while it was painting.
        guard pending?.id == stripe.id else { return }
        frames = painted
        frame = painted.first
    }

    /// Plays the tape once, if its frames are ready and the caller is not
    /// cancelled. Returns whether it played.
    @discardableResult func play(reduceMotion: Bool) async -> Bool {
        guard pending != nil, !frames.isEmpty, !Task.isCancelled else { return false }
        let frames = self.frames
        pending = nil
        self.frames = []
        defer { frame = nil }
        guard !reduceMotion else { return true }
        for image in frames {
            frame = image
            do {
                try await Task.sleep(for: .seconds(JourneyArt.tapeDuration / Double(frames.count)))
            } catch {
                return true
            }
        }
        return true
    }
}
