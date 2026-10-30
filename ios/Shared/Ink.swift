// SPDX-License-Identifier: GPL-3.0-only
// The ink waveforms and pulse (ios/prd.json IOS-020): desktop's InkWave
// (src/renderer/overlay/InkWave.tsx: dabs, flecks, rings, ribbon) and
// PulseWave, as a scene that steps through time and paints with
// MurmurCore's Brush. One set of rules for every style, DESIGN.md's stage
// table: wet accent while live, drying to its dry color when the brush
// lifts, a sheen while processing, flat when inserted, a dry grey scrape
// for no speech, and clean red with no bristles for an error. The scene
// paints in points as desktop paints in CSS pixels: marks keep desktop's
// sizes, and what desktop sizes by the wave follows the pill they are in.
// A pill taller than desktop's 40 point wave (the screen murmur opens to)
// is desktop's pill magnified, so its marks grow with it.
import CoreGraphics
import Foundation
import MurmurCore
import UIKit

/// The pill's paint: wet while live, dry once the brush lifts.
struct PillPalette: Equatable, Sendable {
    var wet: RGBA
    var dry: RGBA

    static let standard = PillPalette(wet: .amber, dry: .brand)

    /// As desktop: signal amber (or no accent) dries to brand gold; any
    /// other accent dries to a darker shade of itself, the same pigment
    /// once it sets.
    init(accent: RGBA?) {
        guard let accent, !accent.isAmber else {
            self = .standard
            return
        }
        self.init(wet: accent, dry: accent.mix(.ink, 0.35))
    }

    init(wet: RGBA, dry: RGBA) {
        self.wet = wet
        self.dry = dry
    }
}

struct InkScene {
    enum Mode: Equatable {
        case idle, rec, proc, ins, err, nospeech

        init(_ stage: PillStage) {
            switch stage {
            case .idle: self = .idle
            case .recording: self = .rec
            case .processing: self = .proc
            case .inserted: self = .ins
            case .noSpeech: self = .nospeech
            case .error: self = .err
            }
        }
    }

    /// A new level column every 66 ms, the rhythm of the bars.
    static let pushMs = 66.0
    static let columnCount = 21
    static let ribbonSamples = 48
    /// How long a stage change keeps animating before the pill rests.
    static let settleMs = 1600.0
    /// Desktop's wave is 40 high; a taller pill paints it magnified.
    static let waveHeight = 40.0
    /// Desktop runs these updates once a frame at 60 a second.
    private static let frameMs = 1000.0 / 60

    private struct Column {
        var lv: Double
        var seed: Int
        var born: Double
    }

    private struct Ring {
        let born: Double
        let s: Double
        let seed: Int
    }

    private struct Fling {
        let dot: Int
        let vx, vy: Double
        let born: Double
        let r: Double
    }

    /// A fleck, its place as a fraction of the field.
    private struct Dot {
        let x, y, r, ph, sp, a: Double
        let warm: Bool
    }

    private static let dots: [Dot] = {
        var random = Brush.Random(seed: 4040)
        let cols = 14
        let rows = 6
        return (0..<(cols * rows)).map { i in
            let x = (Double(i % cols) + 0.2 + random.next() * 0.6) / Double(cols)
            let y = (Double(i / cols) + 0.2 + random.next() * 0.6) / Double(rows)
            let r = 0.6 + random.next() * 1.0
            let ph = random.next() * .pi * 2
            let sp = 0.4 + random.next() * 1.1
            let a = 0.22 + random.next() * 0.45
            return Dot(x: x, y: y, r: r, ph: ph, sp: sp, a: a, warm: random.next() < 0.16)
        }
    }()

    let style: PillStyle
    /// Reduce Motion: no flecks jitter, no rings or drops are born, no sheen.
    var reduced: Bool
    /// The scene's clock, in milliseconds.
    private(set) var now: Double
    private(set) var mode: Mode
    private var modeAt: Double
    private var seedN = 0
    private var cols: [Column]
    private var ribbon: [Double]
    /// Columns pushed since the scene began.
    private(set) var pushes = 0
    private var lastPush: Double
    private var snap: [RGBA] = []
    /// Where the columns sat when the brush lifted, so release never jumps.
    private var frozen = 0.0
    private var smoothed = 0.0
    private var rings: [Ring] = []
    private var lastBirth = 0.0
    private var flung: [Fling] = []
    private var lastFrame: Double
    /// Desktop throws drops with Math.random; here they are seeded.
    private var chance = Brush.Random(seed: 9091)

    init(style: PillStyle, stage: PillStage = .idle, at now: Double, reduced: Bool = false) {
        self.style = style
        self.reduced = reduced
        self.now = now
        mode = Mode(stage)
        modeAt = now
        lastPush = now
        lastFrame = now
        cols = (0..<Self.columnCount).map { Column(lv: 0, seed: $0, born: -1e9) }
        seedN = Self.columnCount
        ribbon = Array(repeating: 0, count: Self.ribbonSamples)
    }

    /// The styles this scene paints.
    static func paints(_ style: PillStyle) -> Bool {
        switch style {
        case .bars, .speckle: false
        case .pulse, .dabs, .flecks, .rings, .ribbon: true
        }
    }

    // MARK: Time

    /// Moves to a new stage now, as desktop's setMode does.
    mutating func show(_ stage: PillStage, palette: PillPalette) {
        let m = Mode(stage)
        guard m != mode else { return }
        snap = cols.map { colorRec($0, palette) }
        if mode == .rec { frozen = Brush.clamp((now - lastPush) / Self.pushMs, 0, 1) }
        mode = m
        modeAt = now
        // Errors and no speech start clean: no ring or flung drop carries over.
        if m == .err || m == .nospeech {
            rings.removeAll()
            flung.removeAll()
        }
        if m == .rec || m == .idle {
            frozen = 0
            for i in cols.indices {
                cols[i].lv = 0
                cols[i].born = -1e9
            }
            ribbon = Array(repeating: 0, count: Self.ribbonSamples)
            rings.removeAll()
            flung.removeAll()
            smoothed = 0
            lastPush = now
        }
    }

    /// Steps the clock to `time` with the voice at `level` (0 to 1): columns
    /// push every 66 ms while recording, and the frame by frame updates run
    /// at desktop's 60 a second whatever the screen's rate.
    mutating func step(to time: Double, level: Double) {
        guard time > now else { return }
        let level = min(1, max(0, level))
        if mode == .rec {
            // A long gap pushes no more than the wave can hold.
            let behind = ((time - lastPush) / Self.pushMs).rounded(.down) - Double(Self.ribbonSamples)
            if behind > 0 {
                lastPush += behind * Self.pushMs
                pushes += Int(behind)
                seedN += Int(behind)
            }
            while time - lastPush >= Self.pushMs {
                lastPush += Self.pushMs
                push(level, at: lastPush)
            }
        }
        // A long gap (the pill was off screen) jumps ahead instead of
        // replaying every frame it missed.
        if time - lastFrame > 1000 { lastFrame = time - Self.frameMs }
        while lastFrame + Self.frameMs <= time {
            lastFrame += Self.frameMs
            frame(at: lastFrame, level: level)
        }
        now = time
        rings.removeAll { (now - $0.born) / 1400 >= 1 }
        flung.removeAll { now - $0.born > 420 }
    }

    private mutating func push(_ lv: Double, at time: Double) {
        cols.removeFirst()
        cols.append(Column(lv: lv, seed: seedN % 64, born: time))
        seedN += 1
        ribbon.removeFirst()
        ribbon.append(lv)
        pushes += 1
    }

    /// One of desktop's frames: the smoothed voice, rings born, drops thrown.
    private mutating func frame(at time: Double, level: Double) {
        let live = mode == .rec
        switch style {
        case .flecks:
            smoothed += ((live ? level : 0) - smoothed) * 0.25
            let e = min(1, smoothed * 1.3)
            if live, !reduced, chance.next() < e * 0.35 {
                let dot = min(Self.dots.count - 1, Int(chance.next() * Double(Self.dots.count)))
                let ang = chance.next() * .pi * 2
                let v = 0.05 + e * 0.12
                flung.append(Fling(dot: dot, vx: cos(ang) * v, vy: sin(ang) * v * 0.5, born: time, r: 0.8 + chance.next() * 1.2))
            }
        case .rings:
            smoothed += ((live ? level : 0) - smoothed) * 0.3
            let e = min(1, smoothed * 1.2)
            if live, !reduced, e > 0.08, time - lastBirth > 340 - e * 240 {
                rings.append(Ring(born: time, s: e, seed: pushes % 32))
                lastBirth = time
            }
        case .pulse:
            // Desktop's pulse reads the voice as it is, unsmoothed.
            let e = live ? level : 0
            smoothed = e
            if !reduced, e > 0.04, time - lastBirth > 340 - e * 240 {
                rings.append(Ring(born: time, s: e, seed: 0))
                lastBirth = time
            }
        case .bars, .speckle, .dabs, .ribbon:
            break
        }
    }

    /// Rings and pulse rings still spreading.
    var ringCount: Int { rings.count }
    /// Drops thrown off the flecks, still flying.
    var dropCount: Int { flung.count }

    /// Whether the scene still changes from frame to frame.
    func busy(still: Bool) -> Bool {
        guard !still else { return false }
        let t = now - modeAt
        return mode == .rec || (mode == .proc && !reduced && t < Sheen.limit * 1000) || t < Self.settleMs || !rings.isEmpty || !flung.isEmpty
    }

    // MARK: Scripted

    /// How far into a stage a still frame is kept: recording after its
    /// first stretch of voice, the others once they have settled.
    static func stillTime(_ stage: PillStage) -> TimeInterval {
        stage == .recording ? 0 : settleMs / 1000
    }

    /// A scene that recorded the made-up voice for 1.6 seconds, then moved
    /// to the stage and ran `time` seconds into it: the same scene every
    /// time, for shots, tests, and still frames.
    static func scripted(_ style: PillStyle, _ stage: PillStage, at time: TimeInterval, palette: PillPalette, still: Bool = false) -> InkScene {
        var scene = InkScene(style: style, at: 0)
        scene.show(.recording, palette: palette)
        let recorded = settleMs + (stage == .recording ? time * 1000 : 0)
        scene.run(to: recorded) { DemoVoice.voice($0 / 1000) }
        if stage != .recording {
            scene.show(stage, palette: palette)
            scene.run(to: recorded + time * 1000) { _ in 0 }
        }
        // A still holds every fleck where it lies; the rings and drops
        // born while it recorded stay painted.
        scene.reduced = still
        return scene
    }

    private mutating func run(to end: Double, voice: (Double) -> Double) {
        while now < end {
            let next = min(end, now + Self.frameMs)
            step(to: next, level: voice(next))
        }
    }

    // MARK: Paint

    private func colorRec(_ c: Column, _ p: PillPalette) -> RGBA {
        let age = now - c.born
        return age < 260 ? p.wet : p.wet.mix(p.dry, Brush.clamp((age - 260) / 900, 0, 1))
    }

    private func tint(_ base: RGBA, _ p: PillPalette) -> RGBA {
        switch mode {
        case .rec: base
        case .proc: base.mix(p.dry, Brush.easeOut(Brush.clamp((now - modeAt) / 600, 0, 1)))
        case .ins: p.dry
        case .err: .red
        case .nospeech: .grey
        case .idle: .text
        }
    }

    /// Paints the scene at its clock into the rect.
    func paint(in rect: CGRect, context: CGContext, palette p: PillPalette) {
        guard rect.width > 0, rect.height > 0 else { return }
        let k = max(1, rect.height / Self.waveHeight)
        let field = CGSize(width: rect.width / k, height: rect.height / k)
        context.saveGState()
        defer { context.restoreGState() }
        context.translateBy(x: rect.minX, y: rect.minY)
        context.scaleBy(x: k, y: k)
        // Desktop's canvas ends at the wave's edges; so does the scene.
        context.clip(to: CGRect(origin: .zero, size: field))
        let sheen = mode == .proc && !reduced ? Sheen.at((now - modeAt) / 1000) : nil
        // The sheen and the ribbon's tail work on the paint alone, so those
        // frames paint in a layer of their own first.
        let layered = sheen != nil || style == .ribbon
        if layered { context.beginTransparencyLayer(auxiliaryInfo: nil) }
        switch style {
        case .dabs: paintDabs(field, context, p)
        case .flecks: paintFlecks(field, context, p)
        case .rings: paintRings(field, context, p, brushed: true)
        case .pulse: paintRings(field, context, p, brushed: false)
        case .ribbon: paintRibbon(field, context, p)
        case .bars, .speckle: break
        }
        // A sheen crosses the paint as it dries, and again every 2 seconds
        // while processing runs long.
        if let sheen {
            let x = sheen.center * field.width
            let reach = field.width * 0.18
            let colors = [RGBA.text.with(alpha: 0).cgColor, RGBA.text.with(alpha: sheen.alpha).cgColor, RGBA.text.with(alpha: 0).cgColor] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors, locations: [0, 0.5, 1]) {
                context.setBlendMode(.sourceAtop)
                context.drawLinearGradient(gradient, start: CGPoint(x: x - reach, y: 0), end: CGPoint(x: x + reach, y: 0), options: [])
                context.setBlendMode(.normal)
            }
        }
        if layered { context.endTransparencyLayer() }
    }

    private func paintDabs(_ field: CGSize, _ ctx: CGContext, _ p: PillPalette) {
        let fw = field.width
        let fh = field.height
        let cy = fh / 2
        let gap = fw / Double(Self.columnCount)
        let maxH = fh * 0.94
        let mt = now - modeAt
        let phase = mode == .rec ? Brush.clamp((now - lastPush) / Self.pushMs, 0, 1) : frozen
        for i in 0..<Self.columnCount {
            let c = cols[i]
            var lv = c.lv
            var rgb = RGBA.text
            var alpha = 1.0
            let dry = mode == .nospeech ? 0.95 : 0.32
            switch mode {
            case .rec:
                rgb = colorRec(c, p)
                if lv < 0.05 { (rgb, alpha) = (.text, 0.3) }
            case .proc:
                rgb = (i < snap.count ? snap[i] : p.dry).mix(p.dry, Brush.easeOut(Brush.clamp(mt / 600, 0, 1)))
                if lv < 0.05 { (rgb, alpha) = (.text, 0.3) }
            case .ins:
                let k = Brush.easeOut(Brush.clamp(mt / 420, 0, 1))
                rgb = p.dry
                lv = Brush.lerp(lv, 0.05, k)
                alpha = 1 - 0.55 * k
            case .err:
                rgb = .red
                lv = 0.1 + (i % 4 == 0 ? 0.12 : 0)
            case .nospeech:
                rgb = .grey
                lv = 0.05 + 0.08 * abs(sin(Double(i) * 1.3))
                alpha = 0.9
            case .idle:
                lv = 0.05
                alpha = 0.32
            }
            let hh = max(3, 3 + lv * (maxH - 3))
            let x = (Double(i) + 0.5 - phase) * gap
            if x < 1 || x > fw - 1 { continue }
            if mode == .err {
                // Clean red: a plain rounded bar, no bristles.
                ctx.setStrokeColor(rgb.with(alpha: alpha).cgColor)
                ctx.setLineWidth(gap * 0.5)
                ctx.setLineCap(.round)
                ctx.strokeLineSegments(between: [CGPoint(x: x, y: cy + hh / 2), CGPoint(x: x, y: cy - hh / 2)])
                continue
            }
            let tilt = Double((c.seed * 37) % 7 - 3) * 0.22
            let path = Brush.path([Brush.XY(x + tilt, cy + hh / 2), Brush.XY(x - tilt, cy - hh / 2)], step: 1.3)
            var o = Brush.StrokeOptions(width: gap * 0.7, rgb: rgb.rgb255)
            o.alpha = alpha
            o.dry = dry
            o.ts = 0.18
            o.te = 0.3
            o.core = 0.35
            BrushCanvas.draw(Brush.stroke(path, Brush.cachedBrush(seed: c.seed % 64, count: 9), o), in: ctx)
        }
    }

    private func paintFlecks(_ field: CGSize, _ ctx: CGContext, _ p: PillPalette) {
        let fw = field.width
        let fh = field.height
        let live = mode == .rec
        let mt = now - modeAt
        let e = min(1, smoothed * 1.3)
        func fade(_ x: Double, _ y: Double) -> Double {
            let f = Brush.clamp(min(x, fw - x) / 7, 0, 1) * Brush.clamp(min(y, fh - y) / 6, 0, 1)
            return f * f * (3 - 2 * f)
        }
        for d in Self.dots {
            let warm = d.warm || d.r > 1.45
            var col = warm ? p.wet : RGBA.text
            var a = d.a
            var jit = 0.0
            switch mode {
            case .rec: jit = 1 + e * 6
            case .proc: col = col.mix(p.dry, Brush.easeOut(Brush.clamp(mt / 600, 0, 1)))
            case .ins:
                col = p.dry
                a *= 1 - 0.6 * Brush.easeOut(Brush.clamp(mt / 420, 0, 1))
            case .err:
                col = .red
                a = warm ? 0.9 : 0.35
            case .nospeech:
                col = .grey
                a *= 0.6
            case .idle:
                // At rest every fleck is plain: amber is for live paint only.
                col = .text
                a *= 0.5
            }
            if reduced { jit = 0 }
            let a1 = now / 190 * d.sp + d.ph
            let a2 = now / 160 * d.sp + d.ph * 1.7
            let x = d.x * fw + sin(a1) * jit
            let y = d.y * fh + cos(a2) * jit
            let f = fade(x, y)
            if f <= 0 { continue }
            ctx.setFillColor(col.with(alpha: min(1, a) * f).cgColor)
            if mode == .err {
                // Clean red: plain round dots, never paint flecks.
                let r = d.r * 0.8
                ctx.fillEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
                continue
            }
            // A fleck of paint: stretched along its motion, a satellite drop
            // trailing the bigger ones.
            let ang = reduced ? d.ph : atan2(-sin(a2) / 160, cos(a1) / 190)
            let st = 1 + e * 1.8
            let shape = CGMutablePath()
            shape.addEllipse(in: CGRect(x: -d.r * st * 1.45, y: -d.r * 0.95, width: d.r * st * 2.9, height: d.r * 1.9), transform: CGAffineTransform(translationX: x, y: y).rotated(by: ang))
            if warm {
                let back = d.r * st * 2.2
                let r = d.r * 0.4
                shape.addEllipse(in: CGRect(x: x - cos(ang) * back - r, y: y - sin(ang) * back - r, width: r * 2, height: r * 2))
            }
            ctx.addPath(shape)
            ctx.fillPath()
        }
        guard live || !flung.isEmpty else { return }
        for fl in flung {
            let age = now - fl.born
            guard age <= 420 else { continue }
            let d = Self.dots[fl.dot]
            let x = d.x * fw + fl.vx * age
            let y = d.y * fh + fl.vy * age
            let a = 1 - age / 420
            ctx.setStrokeColor(p.wet.with(alpha: 0.5 * a).cgColor)
            ctx.setLineWidth(fl.r)
            ctx.setLineCap(.round)
            ctx.strokeLineSegments(between: [CGPoint(x: x - fl.vx * 60, y: y - fl.vy * 60), CGPoint(x: x, y: y)])
            ctx.setFillColor(p.wet.with(alpha: a).cgColor)
            ctx.fillEllipse(in: CGRect(x: x - fl.r, y: y - fl.r, width: fl.r * 2, height: fl.r * 2))
        }
    }

    /// Ink rings (brushed) and pulse (plain arcs, desktop's PulseWave), on
    /// the stage table both.
    private func paintRings(_ field: CGSize, _ ctx: CGContext, _ p: PillPalette, brushed: Bool) {
        let fw = field.width
        let fh = field.height
        let cy = fh / 2
        let e = brushed ? min(1, smoothed * 1.2) : smoothed
        let col = tint(p.wet, p)
        let ox = 6.0
        // Only the part of an arc that can show gets painted.
        let halfH = fh / 2 + 3
        for r in rings.reversed() {
            let age = (now - r.born) / 1400
            guard age < 1 else { continue }
            if brushed {
                let rad = 4 + age * fw * 0.92
                let a = (1 - age) * 0.9 * (0.4 + r.s * 0.6)
                let amax = min(.pi / 2.6, asin(min(1, halfH / rad)))
                let pts = (0...12).map { j -> Brush.XY in
                    let ang = Brush.lerp(-amax, amax, Double(j) / 12)
                    return Brush.XY(ox + cos(ang) * rad, cy + sin(ang) * rad)
                }
                var o = Brush.StrokeOptions(width: 2 + r.s * 3.2, rgb: col.rgb255)
                o.alpha = a
                o.dry = 0.4 + age * 0.5
                o.core = 0.3
                o.ts = 0.2
                o.te = 0.35
                BrushCanvas.draw(Brush.stroke(Brush.path(pts, step: 1.4), Brush.cachedBrush(seed: 600 + r.seed, count: 7), o), in: ctx)
            } else {
                let radius = 4 + age * fw * 0.92
                let a = (1 - age) * 0.55 * (0.4 + r.s * 0.6)
                ctx.setStrokeColor(col.with(alpha: a).cgColor)
                ctx.setLineWidth(1.5 + r.s * 1.5)
                ctx.setLineCap(.butt)
                ctx.addArc(center: CGPoint(x: ox, y: cy), radius: radius, startAngle: -.pi / 2.6, endAngle: .pi / 2.6, clockwise: false)
                ctx.strokePath()
            }
        }
        // A steady heart at the origin, so the quiet stages are never empty.
        let heart = mode == .idle ? 0.35 : 0.5 + e * 0.5
        let radius = 2.5 + e * 2
        ctx.setFillColor(col.with(alpha: heart).cgColor)
        ctx.fillEllipse(in: CGRect(x: ox - radius, y: cy - radius, width: radius * 2, height: radius * 2))
    }

    private func paintRibbon(_ field: CGSize, _ ctx: CGContext, _ p: PillPalette) {
        let fw = field.width
        let fh = field.height
        let cy = fh / 2
        let mt = now - modeAt
        let live = mode == .rec
        let samples = Self.ribbonSamples
        let sp = fw / Double(samples - 2)
        let phase = live ? Brush.clamp((now - lastPush) / Self.pushMs, 0, 1) : frozen
        if mode == .err {
            // Clean red: one plain line, no bristles.
            ctx.setStrokeColor(RGBA.red.cgColor)
            ctx.setLineWidth(max(2, fh * 0.22))
            ctx.setLineCap(.round)
            ctx.strokeLineSegments(between: [CGPoint(x: fw * 0.08, y: cy), CGPoint(x: fw * 0.97, y: cy)])
            return
        }
        let flat = mode == .ins ? 1 - Brush.easeOut(Brush.clamp(mt / 420, 0, 1)) * 0.85 : 1
        let levels = ribbon
        let quiet = mode == .idle || mode == .nospeech
        let pts = (0..<samples).map { i in
            Brush.XY((Double(i) - phase) * sp, cy + sin(Double(pushes + i) * 0.45) * 1.1)
        }
        let path = Brush.path(pts, step: 1.2, raw: true)
        let pressure: @Sendable (Double) -> Double = { u in
            let x = u * Double(samples - 1)
            let i = Int(x.rounded(.down))
            let lv = Brush.lerp(levels[min(max(i, 0), samples - 1)], levels[min(max(i + 1, 0), samples - 1)], x - Double(i))
            let base = quiet ? 0.12 : 0.1 + 0.9 * lv * flat
            return base * Brush.clamp(u / 0.08, 0, 1) * (1 - 0.6 * Brush.clamp((u - 0.97) / 0.03, 0, 1))
        }
        let wet = live || mode == .proc || mode == .ins
        let body = wet ? p.dry : tint(p.dry, p)
        let sOff = Double(pushes) * sp
        var o = Brush.StrokeOptions(width: fh * 0.95, rgb: body.rgb255)
        o.alpha = mode == .idle ? 0.35 : 1
        o.dry = mode == .nospeech ? 0.95 : 0.35
        o.core = 0.4
        o.pressure = pressure
        o.sOff = sOff
        o.ts = 0.01
        o.te = 0.01
        BrushCanvas.draw(Brush.stroke(path, Brush.cachedBrush(seed: 777, count: 18), o), in: ctx)
        let headA = live ? 1 : mode == .proc ? 1 - Brush.easeOut(Brush.clamp(mt / 600, 0, 1)) : 0
        if headA > 0 {
            var head = Brush.StrokeOptions(width: fh * 0.95, rgb: p.wet.rgb255)
            head.alpha = headA
            head.dry = 0.3
            head.core = 0.35
            head.pressure = pressure
            head.sOff = sOff
            head.i0 = Int((Double(path.points.count) * 0.72).rounded(.down))
            head.ts = 0.01
            head.te = 0.01
            BrushCanvas.draw(Brush.stroke(path, Brush.cachedBrush(seed: 778, count: 14), head), in: ctx)
        }
        // The tail thins out to nothing on the left.
        let colors = [RGBA.ink.cgColor, RGBA.ink.with(alpha: 0).cgColor] as CFArray
        if let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors, locations: [0, 1]) {
            ctx.saveGState()
            ctx.setBlendMode(.destinationOut)
            ctx.clip(to: CGRect(x: -1, y: -fh, width: fw * 0.3 + 1, height: fh * 3))
            ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: fw * 0.3, y: 0), options: [])
            ctx.restoreGState()
        }
    }
}

/// A made-up voice where there is none to hear (the Look tiles, shots, and
/// still frames), desktop's (src/renderer/settings/fakeVoice.ts) at the
/// level the pill reads: syllables at about four a second, grouped into
/// words and phrases with real pauses between them.
enum DemoVoice {
    static func voice(_ t: Double) -> Double {
        let tau = Double.pi * 2
        // Phrases of about two and a half seconds, then a breath.
        let phrase = t.truncatingRemainder(dividingBy: 3.4) / 3.4
        if phrase > 0.74 { return 0.004 * 3.2 }
        // Words: short dips between them.
        let word: Double = sin(tau * 0.9 * t + 0.6)
        let wordGate: Double = word > -0.82 ? 1 : 0.15
        // Syllables, sharpened so each reads as a push of air.
        let syllable: Double = pow(0.5 + 0.5 * sin(tau * 4.1 * t), 1.6)
        let swell: Double = 0.62 + 0.38 * sin(tau * 0.31 * t + 1.1)
        let level: Double = 0.012 + 0.28 * syllable * wordGate * swell
        return min(1, level * 3.2)
    }

    /// The voice now, for live tiles.
    @MainActor static func level() -> Float {
        Float(voice(CACurrentMediaTime()))
    }

    /// A take's worth of levels, the same every time: desktop's still
    /// frame, the voice at fixed moments.
    static let levels: [Float] = (0..<Pill.barCount).map { i in
        Float(min(1, voice(0.4 + Double(i) * 0.061) / 3.2 * 3))
    }
}

/// Draws a stroke's marks into a context.
enum BrushCanvas {
    static func draw(_ marks: [Brush.Mark], in ctx: CGContext) {
        for mark in marks {
            switch mark {
            case let .fill(paint, shape):
                guard let first = shape.first else { continue }
                ctx.setFillColor(paint.cgColor)
                ctx.move(to: CGPoint(x: first.x, y: first.y))
                for point in shape.dropFirst() { ctx.addLine(to: CGPoint(x: point.x, y: point.y)) }
                ctx.closePath()
                ctx.fillPath()
            case let .lines(paint, width, runs):
                ctx.setStrokeColor(paint.cgColor)
                ctx.setLineWidth(width)
                ctx.setLineCap(.butt)
                ctx.setLineJoin(.round)
                for run in runs where run.count > 1 {
                    ctx.move(to: CGPoint(x: run[0].x, y: run[0].y))
                    for point in run.dropFirst() { ctx.addLine(to: CGPoint(x: point.x, y: point.y)) }
                }
                ctx.strokePath()
            }
        }
    }
}

extension Brush.Paint {
    var cgColor: CGColor {
        CGColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: a)
    }
}

extension RGBA {
    static let ink = RGBA(UIColor(Tokens.ink))

    /// As the brush mixes it, 0 to 255.
    var rgb255: Brush.RGB {
        Brush.RGB((r * 255).rounded(), (g * 255).rounded(), (b * 255).rounded())
    }

    /// Signal amber, or near enough that it is the default, as desktop
    /// tells them apart.
    var isAmber: Bool {
        let amber = RGBA.amber
        return abs(r - amber.r) * 255 + abs(g - amber.g) * 255 + abs(b - amber.b) * 255 < 6
    }

    /// As the shared data writes a color, #rrggbb.
    var hex: String {
        let rgb = rgb255
        return "#" + [rgb.r, rgb.g, rgb.b].map { String(format: "%02x", Int($0)) }.joined()
    }

    /// From the shared data's #rrggbb.
    init?(hex: String) {
        guard let rgb = Brush.RGB(hex: hex) else { return nil }
        self.init(r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255)
    }
}
