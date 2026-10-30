// SPDX-License-Identifier: GPL-3.0-only
// The pill as a view (ios/prd.json IOS-010), for the keyboard's pad and,
// wrapped, for the app's screens. It keeps the last moments of loudness and
// redraws about 30 times a second only while its stage moves; at rest it
// draws once and the display link stops.
import UIKit

final class PillView: UIView {
    var style: PillStyle = .bars {
        didSet {
            guard style != oldValue else { return }
            scene = InkScene.paints(style) ? InkScene(style: style, stage: stage, at: clock) : nil
            setNeedsDisplay()
            run()
        }
    }

    /// The accent's paint (IOS-020).
    var palette: PillPalette = .standard {
        didSet { if palette != oldValue { setNeedsDisplay() } }
    }

    /// Reads how loud the take is now, 0 to 1, while recording.
    var level: (@MainActor () -> Float)?

    private(set) var stage: PillStage = .idle
    private var levels = [Float](repeating: 0, count: Pill.barCount)
    private var smoothed: Float = 0
    private var began = CACurrentMediaTime()
    private var link: CADisplayLink?
    private var still = UIAccessibility.isReduceMotionEnabled
    /// The ink and pulse styles' scene, stepped as the display link ticks.
    private var scene: InkScene?

    /// The scene's clock, in milliseconds.
    private var clock: Double { CACurrentMediaTime() * 1000 }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        NotificationCenter.default.addObserver(self, selector: #selector(motionChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("PillView is built in code") }

    /// Shows a stage from now. A new recording starts from silence; the
    /// stages after it keep the take's last shape, so it dries and sinks
    /// where it was.
    func show(_ stage: PillStage) {
        guard stage != self.stage else { return }
        if stage == .recording {
            levels = [Float](repeating: 0, count: Pill.barCount)
            smoothed = 0
        }
        advance()
        scene?.show(stage, palette: palette)
        self.stage = stage
        began = CACurrentMediaTime()
        setNeedsDisplay()
        run()
    }

    /// Steps the scene to now with the voice as it is.
    private func advance() {
        scene?.step(to: clock, level: Double(stage == .recording ? level?() ?? 0 : 0))
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        Pill.paint(current, in: bounds, context: context)
    }

    /// The frame drawn now.
    var current: PillFrame {
        PillFrame(style: style, stage: stage, levels: levels, time: CACurrentMediaTime() - began, still: still, palette: palette, ink: scene)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        run()
    }

    /// Runs the display link while the stage moves and the view is on screen.
    private func run() {
        let moves = scene.map { $0.busy(still: still) } ?? Pill.moves(stage, at: CACurrentMediaTime() - began, still: still)
        let moving = window != nil && moves
        if moving, link == nil {
            let link = CADisplayLink(target: Tick(self), selector: #selector(Tick.fire(_:)))
            link.preferredFrameRateRange = CAFrameRateRange(minimum: 20, maximum: 30, preferred: 30)
            link.add(to: .main, forMode: .common)
            self.link = link
        } else if !moving {
            link?.invalidate()
            link = nil
        }
    }

    fileprivate func tick() {
        if scene != nil {
            advance()
        } else if stage == .recording, let level {
            smoothed += (level() - smoothed) * 0.35
            levels.removeFirst()
            levels.append(smoothed)
        }
        setNeedsDisplay()
        run()
    }

    @objc private func motionChanged() {
        still = UIAccessibility.isReduceMotionEnabled
        setNeedsDisplay()
        run()
    }
}

/// The display link's target, holding the view weakly so the link never
/// keeps it alive; once the view is gone, the link stops itself.
@MainActor private final class Tick: NSObject {
    weak var view: PillView?

    init(_ view: PillView) {
        self.view = view
    }

    @objc func fire(_ link: CADisplayLink) {
        guard let view else {
            link.invalidate()
            return
        }
        view.tick()
    }
}

extension PillStage {
    /// The pill's stage for a keyboard take, from the mailbox.
    init(_ phase: MailboxEntry.Phase?) {
        switch phase {
        case .listening?: self = .recording
        case .working?: self = .processing
        case .ready?, .noted?: self = .inserted
        case .nothing?: self = .noSpeech
        case .failed?: self = .error
        case nil: self = .idle
        }
    }
}

/// How loud the take is now, which the app writes about 30 times a second
/// while a keyboard take records, for the keyboard's pill: 8 bytes, the
/// level and a count. The keyboard reads nothing else about the audio.
struct LevelFile: Sendable {
    let url: URL?

    static let shared = LevelFile(url: AppGroup.containerURL?.appending(path: "level"))

    func write(_ level: Float, count: UInt32) {
        guard let url else { return }
        var bytes = Data()
        withUnsafeBytes(of: level.bitPattern.littleEndian) { bytes.append(contentsOf: $0) }
        withUnsafeBytes(of: count.littleEndian) { bytes.append(contentsOf: $0) }
        try? bytes.write(to: url, options: .completeFileProtectionUntilFirstUserAuthentication)
    }

    /// The level and its count, or nil when there is none.
    func read() -> (level: Float, count: UInt32)? {
        guard let url, let data = try? Data(contentsOf: url), data.count == 8 else { return nil }
        let bits = data.prefix(4).enumerated().reduce(UInt32(0)) { $0 | UInt32($1.element) << (8 * UInt32($1.offset)) }
        let count = data.suffix(4).enumerated().reduce(UInt32(0)) { $0 | UInt32($1.element) << (8 * UInt32($1.offset)) }
        return (Float(bitPattern: bits), count)
    }
}
