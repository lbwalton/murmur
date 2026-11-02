// SPDX-License-Identifier: GPL-3.0-only
// The pill (ios/prd.json IOS-010): one drawing for everywhere it appears,
// the keyboard, the screen murmur opens to, first-run practice, and later
// the Look grid. It follows DESIGN.md's stage table. Idle is small, dry,
// and still, and never amber, even while a session keeps the microphone
// warm. Recording is wet amber at the voice's level, cooling to brand gold
// as it ages. Processing cools with one sheen, then a softer sheen every 2
// seconds. Inserted sinks flat; no speech is a dry grey scrape; an error is
// plain red. Every frame is a pure function of its inputs, so previews,
// tests, and the capture script all see the same pill.
import CoreGraphics
import Foundation
import UIKit

enum PillStage: Equatable, Sendable {
    case idle, recording, processing, inserted, noSpeech, error
}

/// The styles, in shared/cosmetics.json's order: two free, and five
/// earned by belt (IOS-020).
enum PillStyle: String, CaseIterable, Codable, Sendable {
    case bars, speckle, pulse, dabs, flecks, rings, ribbon
}

/// One frame of the pill.
struct PillFrame {
    var style: PillStyle
    var stage: PillStage
    /// Recent loudness, oldest first, 0 to 1.
    var levels: [Float]
    /// Seconds since the stage began.
    var time: TimeInterval
    /// Reduce Motion: each stage as a still frame.
    var still: Bool
    /// The accent's wet and dry paint (IOS-020).
    var palette: PillPalette = .standard
    /// The ink and pulse styles' scene, stepped to now; nil paints a
    /// scripted one, for shots and stills.
    var ink: InkScene?
}

enum Pill {
    static let barCount = 21
    /// How long wet paint takes to dry to gold, and the pill to sink flat.
    static let dry: TimeInterval = 0.6
    static let sink: TimeInterval = 0.35

    /// What VoiceOver reads for the pill in each stage.
    static func label(_ stage: PillStage) -> String {
        switch stage {
        case .idle: "Start dictation"
        case .recording: "Recording"
        case .processing: "Working"
        case .inserted: "Words added"
        case .noSpeech: "Heard nothing"
        case .error: "Failed, retry in murmur"
        }
    }

    /// Whether the stage changes from frame to frame, so the view redraws
    /// only while it does.
    static func moves(_ stage: PillStage, at time: TimeInterval, still: Bool) -> Bool {
        guard !still else { return false }
        switch stage {
        case .recording: return true
        case .processing: return time < Sheen.limit + 1
        case .inserted: return time < sink
        case .idle, .noSpeech, .error: return false
        }
    }

    // MARK: Paint

    static func paint(_ frame: PillFrame, in rect: CGRect, context: CGContext) {
        guard rect.width > 0, rect.height > 0 else { return }
        context.saveGState()
        defer { context.restoreGState() }
        switch frame.style {
        case .bars: paintBars(frame, in: rect, context: context)
        case .speckle: paintSpeckle(frame, in: rect, context: context)
        case .pulse, .dabs, .flecks, .rings, .ribbon:
            let scene = frame.ink.flatMap { frame.still ? nil : $0 } ?? InkScene.scripted(frame.style, frame.stage, at: frame.still ? InkScene.stillTime(frame.stage) : frame.time, palette: frame.palette, still: frame.still)
            scene.paint(in: rect, context: context, palette: frame.palette)
        }
    }

    /// The levels a still pill shows: a steady voice's shape.
    static let stillLevels: [Float] = (0..<barCount).map { 0.25 + 0.45 * Float(abs(sin(Double($0) * 0.55))) }

    /// The last barCount levels, oldest first, padded with silence.
    static func recent(_ levels: [Float]) -> [Float] {
        let tail = levels.suffix(barCount).map { min(1, max(0, $0)) }
        return Array(repeating: 0, count: barCount - tail.count) + tail
    }

    private static func paintBars(_ frame: PillFrame, in rect: CGRect, context: CGContext) {
        let n = barCount
        let width = rect.width / (CGFloat(n) + 0.7 * CGFloat(n - 1))
        let gap = width * 0.7
        let low = max(width, rect.height * 0.12)
        let high = rect.height * 0.9
        // A still pill never gathers levels, so it shows a steady voice's
        // finished shape: never a blank space.
        let levels = frame.still ? stillLevels : recent(frame.levels)
        let dried = frame.still ? 1 : ease(frame.time / dry)
        let sunk = frame.still ? 1 : ease(frame.time / sink)
        let sheen = frame.stage == .processing && !frame.still ? Sheen.at(frame.time) : nil
        var scrape = Seeded(7)
        for i in 0..<n {
            let age = CGFloat(n - 1 - i) / CGFloat(n - 1)
            let level = CGFloat(levels[i])
            let height: CGFloat
            let color: RGBA
            switch frame.stage {
            case .idle:
                height = low
                color = RGBA.cream22
            case .recording:
                height = low + level * (high - low)
                color = frame.palette.wet.mix(frame.palette.dry, age * 0.7)
            case .processing:
                height = low + level * (high - low)
                color = frame.palette.wet.mix(frame.palette.dry, age * 0.7).mix(frame.palette.dry, dried)
            case .inserted:
                height = low + level * (high - low) * (1 - sunk)
                color = frame.palette.dry.mix(RGBA.cream22, sunk)
            case .noSpeech:
                height = low * (0.7 + 0.6 * scrape.next())
                color = RGBA.grey
            case .error:
                height = low
                color = RGBA.red
            }
            let x = rect.minX + CGFloat(i) * (width + gap)
            let bar = CGRect(x: x, y: rect.midY - height / 2, width: width, height: height)
            let path = CGPath(roundedRect: bar, cornerWidth: width / 2, cornerHeight: min(width / 2, height / 2), transform: nil)
            context.setFillColor(color.cgColor)
            context.addPath(path)
            context.fillPath()
            if let sheen {
                let glow = sheen.alpha * gauss((x + width / 2 - rect.minX) / rect.width - sheen.center)
                if glow > 0.01 {
                    context.setFillColor(RGBA.text.with(alpha: glow).cgColor)
                    context.addPath(path)
                    context.fillPath()
                }
            }
        }
    }

    /// The speckle field: 84 dots on a jittered grid, the same dots every
    /// time, a few of them warm sparks that show amber only while live.
    private static let dots: [Dot] = {
        var random = Seeded(31)
        let cols = 14
        let rows = 6
        return (0..<(cols * rows)).map { i in
            Dot(
                x: (CGFloat(i % cols) + 0.2 + 0.6 * random.next()) / CGFloat(cols),
                y: (CGFloat(i / cols) + 0.2 + 0.6 * random.next()) / CGFloat(rows),
                radius: 0.5 + 0.9 * random.next(),
                phase: random.next() * .pi * 2,
                speed: 0.4 + 1.1 * random.next(),
                alpha: 0.16 + 0.42 * random.next(),
                warm: random.next() < 0.16
            )
        }
    }()

    private struct Dot {
        let x, y, radius, phase, speed, alpha: CGFloat
        let warm: Bool
    }

    private static func paintSpeckle(_ frame: PillFrame, in rect: CGRect, context: CGContext) {
        // The phone's pill is smaller than desktop's, so the dust is a touch
        // larger for its size, and the warm sparks carry their full color.
        let scale = rect.height / 24
        let t = CGFloat(frame.time)
        let level = frame.still ? 0.5 : CGFloat(recent(frame.levels).last ?? 0)
        let energy = min(1, level * 1.1)
        let dried = frame.still ? 1 : ease(frame.time / dry)
        let sunk = frame.still ? 1 : ease(frame.time / sink)
        let sheen = frame.stage == .processing && !frame.still ? Sheen.at(frame.time) : nil
        for dot in dots {
            var x = rect.minX + dot.x * rect.width
            var y = rect.minY + dot.y * rect.height
            var radius = dot.radius * scale
            var alpha = dot.alpha
            var color = RGBA.text
            switch frame.stage {
            case .idle:
                alpha *= 0.45
            case .recording:
                let jitter = frame.still ? 0 : (1 + energy * 4) * scale
                x += sin(t / 0.19 * dot.speed + dot.phase) * jitter
                y += cos(t / 0.16 * dot.speed + dot.phase * 1.7) * jitter
                radius *= 1 + energy * 0.8
                if dot.warm {
                    color = frame.palette.wet
                    alpha = 0.55 + 0.45 * energy
                } else {
                    alpha *= 0.4 + energy * 0.6
                }
            case .processing:
                if dot.warm {
                    color = frame.palette.wet.mix(frame.palette.dry, dried)
                    alpha = 0.7
                } else {
                    alpha *= 0.55
                }
            case .inserted:
                y += (rect.midY - y) * sunk
                alpha *= 0.55 * (1 - 0.5 * sunk)
                color = frame.palette.dry.mix(RGBA.text, sunk)
            case .noSpeech:
                y = rect.midY + (y - rect.midY) * 0.15
                alpha *= 0.6
                color = RGBA.grey
            case .error:
                alpha = 0.5 + alpha * 0.5
                color = RGBA.red
            }
            alpha *= fade(x - rect.minX, rect.width, edge: 7 * scale) * fade(y - rect.minY, rect.height, edge: 8 * scale)
            if let sheen {
                alpha = min(1, alpha + sheen.alpha * gauss((x - rect.minX) / rect.width - sheen.center))
            }
            guard alpha > 0.005 else { continue }
            context.setFillColor(color.with(alpha: color.a * alpha).cgColor)
            context.fillEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
        }
    }

    // MARK: Helpers

    /// Ease out, clamped to 0 through 1.
    static func ease(_ progress: TimeInterval) -> CGFloat {
        let p = CGFloat(min(1, max(0, progress)))
        return 1 - (1 - p) * (1 - p) * (1 - p)
    }

    /// A soft band around 0, about a tenth of the pill wide.
    private static func gauss(_ distance: CGFloat) -> CGFloat {
        exp(-(distance / 0.12) * (distance / 0.12))
    }

    /// Fades toward both ends of a span, so a field melts into the pill.
    private static func fade(_ position: CGFloat, _ span: CGFloat, edge: CGFloat) -> CGFloat {
        let f = min(1, max(0, min(position, span - position) / edge))
        return f * f * (3 - 2 * f)
    }
}

/// The drying sheen, as on desktop (src/renderer/overlay/sheen.ts): one pass
/// as the paint dries, then a softer one every 2 seconds until the words
/// land, so a slow provider never looks frozen. None after 2 minutes.
enum Sheen {
    static let every: TimeInterval = 2
    static let limit: TimeInterval = 120

    /// Where the sheen is t seconds into processing, as a fraction of the
    /// pill's width, and how bright; nil between passes.
    static func at(_ t: TimeInterval) -> (center: CGFloat, alpha: CGFloat)? {
        guard t >= 0 else { return nil }
        let first = pass(t)
        if first < 1.4 { return (first, 0.4) }
        guard t >= every, t - t.truncatingRemainder(dividingBy: every) < limit else { return nil }
        let again = pass(t.truncatingRemainder(dividingBy: every))
        return again < 1.4 ? (again, 0.22) : nil
    }

    private static func pass(_ u: TimeInterval) -> CGFloat {
        CGFloat((u / 0.7 - 0.2) * 1.5)
    }
}

/// A color as components, for mixing paint.
struct RGBA: Equatable {
    var r, g, b, a: CGFloat

    init(r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat = 1) {
        (self.r, self.g, self.b, self.a) = (r, g, b, a)
    }

    init(_ color: UIColor) {
        var (r, g, b, a): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        self.init(r: r, g: g, b: b, a: a)
    }

    static let amber = RGBA(UIColor(Tokens.amber))
    static let brand = RGBA(UIColor(Tokens.brand))
    static let red = RGBA(UIColor(Tokens.red))
    static let text = RGBA(UIColor(Tokens.text))
    static let cream22 = RGBA(UIColor(Tokens.cream22))
    static let grey = RGBA(UIColor(Tokens.textDim))

    func mix(_ other: RGBA, _ amount: CGFloat) -> RGBA {
        let k = min(1, max(0, amount))
        return RGBA(r: r + (other.r - r) * k, g: g + (other.g - g) * k, b: b + (other.b - b) * k, a: a + (other.a - a) * k)
    }

    func with(alpha: CGFloat) -> RGBA {
        RGBA(r: r, g: g, b: b, a: alpha)
    }

    var cgColor: CGColor {
        CGColor(srgbRed: r, green: g, blue: b, alpha: a)
    }
}

/// A small seeded random source, so the same seed draws the same marks.
struct Seeded {
    private var state: UInt64

    init(_ seed: UInt64) {
        state = seed &+ 0x9E37_79B9_7F4A_7C15
    }

    /// The next value, 0 up to 1.
    mutating func next() -> CGFloat {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z ^= z >> 31
        return CGFloat(z >> 11) / CGFloat(1 << 53)
    }
}

/// The pill's look, chosen in murmur and read by the keyboard, in the app
/// group beside the session's state: the style, the accent chosen, and the
/// color that accent resolves to now, which the app keeps current as belts
/// and achievements come (IOS-020). The keyboard never reads the history.
struct PillLook: Codable, Equatable, Sendable {
    var style: PillStyle
    /// The accent's id in shared/cosmetics.json.
    var accent = "amber"
    /// The accent's color as #rrggbb; nil is signal amber.
    var color: String?

    init(style: PillStyle, accent: String = "amber", color: String? = nil) {
        self.style = style
        self.accent = accent
        self.color = color
    }

    /// Each field on its own, so a file from before the accents, or a
    /// style this build does not know, keeps what it can.
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        style = (try? container.decodeIfPresent(PillStyle.self, forKey: .style)) ?? .bars
        accent = (try? container.decodeIfPresent(String.self, forKey: .accent)) ?? "amber"
        color = try? container.decodeIfPresent(String.self, forKey: .color)
    }

    /// The paint the keyboard draws with.
    var palette: PillPalette {
        PillPalette(accent: color.flatMap(RGBA.init(hex:)))
    }

    static var file: URL? {
        AppGroup.containerURL?.appending(path: "pill.json")
    }

    static func read(from file: URL? = file) -> PillLook {
        guard let file, let data = try? Data(contentsOf: file), let look = try? JSONDecoder().decode(PillLook.self, from: data) else {
            return PillLook(style: .bars)
        }
        return look
    }

    func write(to file: URL? = PillLook.file) {
        guard let file, let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
