// SPDX-License-Identifier: GPL-3.0-only
// The brush (ios/prd.json IOS-020): desktop's paint engine
// (src/renderer/brush.ts) in Swift, so the keyboard can paint the ink
// waveforms itself. A stroke is a bundle of bristles dragged along a path;
// each bristle carries its own load of paint, runs dry toward the tail in
// streaks, and wobbles a little. Everything is seeded, so a seed paints the
// same mark here as on desktop (shared/brush-vectors.json). A stroke comes
// back as marks (a wet body to fill, bristle lines to draw), so this file
// never touches a screen.
import Foundation
import Synchronization

public enum Brush {
    /// A color as red, green, and blue from 0 to 255, as desktop mixes paint.
    public struct RGB: Sendable, Equatable {
        public var r, g, b: Double

        public init(_ r: Double, _ g: Double, _ b: Double) {
            (self.r, self.g, self.b) = (r, g, b)
        }

        public static let white = RGB(255, 255, 255)
        public static let black = RGB(0, 0, 0)

        /// From #rrggbb or #rgb; nil for anything else.
        public init?(hex: String) {
            var digits = hex.trimmingCharacters(in: .whitespaces)
            guard digits.hasPrefix("#") else { return nil }
            digits.removeFirst()
            if digits.count == 3 { digits = digits.map { "\($0)\($0)" }.joined() }
            guard digits.count == 6, digits.allSatisfy(\.isHexDigit), let n = UInt32(digits, radix: 16) else { return nil }
            self.init(Double((n >> 16) & 255), Double((n >> 8) & 255), Double(n & 255))
        }
    }

    /// A color as desktop hands it to the canvas: whole channels, cut
    /// toward zero, and an opacity.
    public struct Paint: Sendable, Equatable {
        public let r, g, b: Int
        public let a: Double

        public init(_ rgb: RGB, _ a: Double = 1) {
            (r, g, b) = (Int(rgb.r), Int(rgb.g), Int(rgb.b))
            self.a = a
        }
    }

    public struct XY: Sendable, Equatable {
        public var x, y: Double

        public init(_ x: Double, _ y: Double) {
            (self.x, self.y) = (x, y)
        }
    }

    /// One painted piece of a stroke.
    public enum Mark: Sendable, Equatable {
        /// The wet body under the bristles, a closed shape.
        case fill(Paint, [XY])
        /// One bristle: its pen-down runs, drawn with butt ends and round joins.
        case lines(Paint, width: Double, runs: [[XY]])
    }

    // MARK: Random and noise

    /// A tiny seeded random generator (mulberry32), number for number desktop's.
    public struct Random: Sendable {
        private var a: UInt32

        public init(seed: Int) {
            a = UInt32(truncatingIfNeeded: seed)
        }

        /// The next value, 0 up to 1.
        public mutating func next() -> Double {
            a &+= 0x6D2B_79F5
            var t = (a ^ (a >> 15)) &* (1 | a)
            t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
            return Double(t ^ (t >> 14)) / 4_294_967_296
        }
    }

    /// Smooth 1D value noise in 0 to 1, seeded. Desktop keeps its table in
    /// 32 bit floats, so this one does too.
    public struct Noise: Sendable {
        private let table: [Float]

        public init(seed: Int) {
            var random = Random(seed: seed)
            table = (0..<256).map { _ in Float(random.next()) }
        }

        public func callAsFunction(_ x: Double) -> Double {
            let floor = x.rounded(.down)
            let f = x - floor
            let u = f * f * (3 - 2 * f)
            let i = Int(floor)
            let a = Double(table[i & 255])
            let b = Double(table[(i + 1) & 255])
            return a + (b - a) * u
        }
    }

    // MARK: Helpers

    public static func clamp(_ v: Double, _ a: Double, _ b: Double) -> Double {
        max(a, min(b, v))
    }

    public static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
        a + (b - a) * t
    }

    public static func easeOut(_ t: Double) -> Double {
        1 - pow(1 - t, 3)
    }

    public static func mix(_ a: RGB, _ b: RGB, _ t: Double) -> RGB {
        RGB(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t))
    }

    // MARK: Paths

    public struct PathPoint: Sendable, Equatable {
        public var x, y: Double
        /// Arc length from the start.
        public var s: Double
        /// Unit normal.
        public var nx, ny: Double
    }

    public struct Path: Sendable {
        public let points: [PathPoint]
        public let total: Double
    }

    /// Catmull-Rom through the points, `per` samples a span.
    static func catmullRom(_ pts: [XY], per: Int) -> [XY] {
        var out: [XY] = []
        out.reserveCapacity((pts.count - 1) * per + 1)
        for k in 0..<(pts.count - 1) {
            let p0 = pts[max(k - 1, 0)]
            let p1 = pts[k]
            let p2 = pts[k + 1]
            let p3 = pts[min(k + 2, pts.count - 1)]
            for j in 0..<per {
                let u = Double(j) / Double(per)
                let u2 = u * u
                let u3 = u2 * u
                out.append(XY(spline(p0.x, p1.x, p2.x, p3.x, u, u2, u3), spline(p0.y, p1.y, p2.y, p3.y, u, u2, u3)))
            }
        }
        out.append(pts[pts.count - 1])
        return out
    }

    // Each term is its own typed value, so Swift 6.3 (CI) can check it.
    private static func spline(_ p0: Double, _ p1: Double, _ p2: Double, _ p3: Double, _ u: Double, _ u2: Double, _ u3: Double) -> Double {
        let a: Double = 2 * p1
        let b: Double = (-p0 + p2) * u
        let c: Double = (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
        let d: Double = (-p0 + 3 * p1 - 3 * p2 + p3) * u3
        return 0.5 * (a + b + c + d)
    }

    /// A path through the points, smoothed (unless raw) and resampled every
    /// `step`, with normals and arc length. Raw keeps sharp turns.
    public static func path(_ pts: [XY], step: Double = 2, raw: Bool = false) -> Path {
        guard !pts.isEmpty else { return Path(points: [], total: 0) }
        let dense = raw || pts.count <= 2 ? pts : catmullRom(pts, per: 28)
        var lens: [Double] = [0]
        lens.reserveCapacity(dense.count)
        for i in 1..<max(1, dense.count) {
            lens.append(lens[i - 1] + hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y))
        }
        let total = lens[lens.count - 1]
        let n = max(2, Int((total / step).rounded(.up)) + 1)
        var out: [PathPoint] = []
        out.reserveCapacity(n)
        var j = 1
        for i in 0..<n {
            let s = total * Double(i) / Double(n - 1)
            while j < lens.count - 1, lens[j] < s { j += 1 }
            let a = dense[max(0, min(j - 1, dense.count - 1))]
            let b = dense[min(j, dense.count - 1)]
            let lo = lens[max(0, min(j - 1, lens.count - 1))]
            let span = lens[min(j, lens.count - 1)] - lo
            let seg = span == 0 ? 1 : span
            let t = clamp((s - lo) / seg, 0, 1)
            out.append(PathPoint(x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), s: s, nx: 0, ny: 0))
        }
        for i in 0..<n {
            let a = out[max(0, i - 1)]
            let b = out[min(n - 1, i + 1)]
            let dx = b.x - a.x
            let dy = b.y - a.y
            let length = hypot(dx, dy)
            let d = length == 0 ? 1 : length
            out[i].nx = -dy / d
            out[i].ny = dx / d
        }
        return Path(points: out, total: total)
    }

    // MARK: Bristles

    public struct Bristle: Sendable {
        /// Position across the stroke, -1 to 1.
        public let off: Double
        public let w: Double
        public let a: Double
        /// How much paint it carries; low loads run dry sooner.
        public let load: Double
        public let tone: Double
        public let nz: Noise
        /// Streak length.
        public let lam: Double
        public let jit: Double
    }

    /// A brush of n bristles, spread evenly across its width.
    public static func brush(seed: Int, count n: Int = 30) -> [Bristle] {
        var r = Random(seed: seed &* 7919 &+ 13)
        return (0..<n).map { i in
            let off = (Double(i) + r.next()) / Double(n) * 2 - 1
            let w = 0.55 + r.next() * 0.9
            let a = 0.4 + r.next() * 0.55
            let load = (0.78 + r.next() * 0.6) * (1 - off * off * 0.45)
            let tone = r.next() * 2 - 1
            let nz = Noise(seed: seed &* 131 &+ i &* 17)
            let lam = 28 + r.next() * 120
            return Bristle(off: off, w: w, a: a, load: load, tone: tone, nz: nz, lam: lam, jit: r.next())
        }
    }

    private static let cache = Mutex<[Int: [Bristle]]>([:])

    /// A brush kept for its seed and size, as desktop's cachedBrush keeps
    /// them; callers keep seeds to a small set so this stays small.
    public static func cachedBrush(seed: Int, count n: Int) -> [Bristle] {
        let key = seed &* 1024 &+ n
        if let kept = cache.withLock({ $0[key] }) { return kept }
        let made = brush(seed: seed, count: n)
        cache.withLock { kept in
            if kept.count > 512 { kept.removeAll() }
            kept[key] = made
        }
        return made
    }

    /// Press in quickly, lift off slowly.
    public static func pressure(_ t: Double, ts: Double = 0.07, te: Double = 0.3) -> Double {
        var p = 1.0
        if t < ts { p = 0.35 + 0.65 * easeOut(t / ts) }
        if t > 1 - te { p *= 1 - 0.72 * pow((t - (1 - te)) / te, 1.4) }
        return p
    }

    // MARK: Strokes

    public struct StrokeOptions: Sendable {
        public var width: Double
        public var rgb: RGB
        /// 0 is wet and solid, 1 runs dry fast.
        public var dry: Double = 0.4
        public var alpha: Double = 1
        /// Opacity of the wet body; nil takes it from dryness.
        public var core: Double?
        public var noCore = false
        /// Attack and lift fractions for the default pressure.
        public var ts: Double = 0.07
        public var te: Double = 0.3
        /// A custom pressure along the stroke, 0 to 1 in, 0 to 1 out.
        public var pressure: (@Sendable (Double) -> Double)?
        /// Paint only these point indices.
        public var i0: Int?
        public var i1: Int?
        /// Shifts the bristle texture along the path, so a scrolling stroke keeps its pattern.
        public var sOff: Double = 0
        public var light: Double = 0.07
        public var dark: Double = 0.22

        public init(width: Double, rgb: RGB) {
            self.width = width
            self.rgb = rgb
        }
    }

    /// Paints bristles along a path, as desktop's stroke does.
    public static func stroke(_ path: Path, _ bristles: [Bristle], _ o: StrokeOptions) -> [Mark] {
        let points = path.points
        let n = points.count
        let w = o.width
        let i0 = o.i0 ?? 0
        let i1 = o.i1 ?? n - 1
        guard n > 1, i1 > i0, o.alpha > 0 else { return [] }
        let span = Double(n - 1)
        let pf: (Double) -> Double = o.pressure ?? { pressure($0, ts: o.ts, te: o.te) }
        var marks: [Mark] = []
        marks.reserveCapacity(bristles.count + 1)
        let core = o.core ?? 0.5 * (1 - o.dry)
        if core > 0, !o.noCore {
            var shape: [XY] = []
            shape.reserveCapacity((i1 - i0 + 1) * 2)
            for i in i0...i1 {
                let p = points[i]
                let h = w * 0.3 * pf(Double(i) / span)
                shape.append(XY(p.x + p.nx * h, p.y + p.ny * h))
            }
            for i in stride(from: i1, through: i0, by: -1) {
                let p = points[i]
                let h = w * 0.3 * pf(Double(i) / span)
                shape.append(XY(p.x - p.nx * h, p.y - p.ny * h))
            }
            marks.append(.fill(Paint(o.rgb, core * o.alpha), shape))
        }
        let unit = w * 2.4 / Double(max(1, bristles.count))
        let cap = 2.2 + w * 0.012
        for b in bristles {
            let color = b.tone > 0 ? mix(o.rgb, .white, b.tone * o.light) : mix(o.rgb, .black, -b.tone * o.dark)
            var runs: [[XY]] = []
            var pen = false
            for i in i0...i1 {
                let pt = points[i]
                let t = Double(i) / span
                let ink: Double = b.load * 1.1 - pow(t, 1.6) * o.dry * 1.35 + (1 - o.dry) * 0.2
                if b.nz((pt.s + o.sOff) / b.lam) < ink {
                    let wobble: Double = (b.nz((pt.s + o.sOff) / 90 + 40) - 0.5) * min(w, 36) * 0.18 * b.jit
                    let off = b.off * w * 0.5 * pf(t) + wobble
                    let at = XY(pt.x + pt.nx * off, pt.y + pt.ny * off)
                    if pen {
                        runs[runs.count - 1].append(at)
                    } else {
                        runs.append([at])
                        pen = true
                    }
                } else {
                    pen = false
                }
            }
            marks.append(.lines(Paint(color, b.a * o.alpha), width: max(0.5, min(b.w * unit, cap)), runs: runs))
        }
        return marks
    }
}
