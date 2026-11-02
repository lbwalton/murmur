// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/brush-vectors.json: desktop's brush engine on fixed inputs.
struct BrushVectors: Decodable {
    struct Randoms: Decodable {
        let seed: Int
        let values: [Double]
    }

    struct Noises: Decodable {
        let seed: Int
        let xs: [Double]
        let values: [Double]
    }

    struct PathCase: Decodable, CustomTestStringConvertible {
        struct Out: Decodable {
            let total: Double
            let points: [[Double]]
        }

        let name: String
        let pts: [[Double]]
        let step: Double
        let raw: Bool
        let out: Out

        var testDescription: String { name }
        var path: Brush.Path { Brush.path(pts.map { Brush.XY($0[0], $0[1]) }, step: step, raw: raw) }
    }

    struct BrushCase: Decodable {
        struct Bristle: Decodable {
            let off, w, a, load, tone, lam, jit: Double
            let nz: [Double]
        }

        let seed: Int
        let n: Int
        let bristles: [Bristle]
    }

    struct Pressures: Decodable {
        let ts: Double
        let te: Double
        let values: [Double]
    }

    struct StrokeCase: Decodable, CustomTestStringConvertible {
        struct Options: Decodable {
            let width: Double
            let rgb: [Double]
            let alpha, dry, core, ts, te, sOff, light, dark: Double?
            let noCore: Bool?
            let i0, i1: Int?
            let pfn: String?
        }

        struct Op: Decodable {
            let fill: [Double]?
            let points: [[Double]]?
            let stroke: [Double]?
            let width: Double?
            let lines: [[[Double]]]?
        }

        let name: String
        let path: Int
        let seed: Int
        let n: Int
        let options: Options
        let ops: [Op]

        var testDescription: String { name }
    }

    let mulberries: [Randoms]
    let noises: [Noises]
    let paths: [PathCase]
    let brushes: [BrushCase]
    let pressures: [Pressures]
    let strokes: [StrokeCase]

    static let file: BrushVectors? = try? SharedData(directory: repoShared).decode(BrushVectors.self, from: "brush-vectors.json")
}

/// Near enough: libm and V8 may differ in the last bit or so.
private func near(_ a: Double, _ b: Double, _ tolerance: Double = 1e-9) -> Bool {
    abs(a - b) <= tolerance * max(1, abs(a), abs(b))
}

@Suite struct BrushVectorTests {
    @Test func theVectorsLoad() throws {
        let file = try #require(BrushVectors.file)
        #expect(file.mulberries.count >= 5)
        #expect(file.strokes.count >= 5)
    }

    @Test func randomNumbersMatchDesktop() throws {
        for vector in try #require(BrushVectors.file).mulberries {
            var random = Brush.Random(seed: vector.seed)
            #expect(vector.values.map { _ in random.next() } == vector.values, "seed \(vector.seed)")
        }
    }

    @Test func noiseMatchesDesktop() throws {
        for vector in try #require(BrushVectors.file).noises {
            let noise = Brush.Noise(seed: vector.seed)
            #expect(vector.xs.map { noise($0) } == vector.values, "seed \(vector.seed)")
        }
    }

    @Test(arguments: BrushVectors.file?.paths ?? [])
    func pathsMatchDesktop(_ vector: BrushVectors.PathCase) {
        let path = vector.path
        #expect(near(path.total, vector.out.total))
        #expect(path.points.count == vector.out.points.count)
        for (point, expected) in zip(path.points, vector.out.points) {
            let got = [point.x, point.y, point.s, point.nx, point.ny]
            #expect(zip(got, expected).allSatisfy { near($0, $1) }, "\(got) against \(expected)")
        }
    }

    @Test func brushesMatchDesktop() throws {
        for vector in try #require(BrushVectors.file).brushes {
            let bristles = Brush.brush(seed: vector.seed, count: vector.n)
            #expect(bristles.count == vector.bristles.count)
            for (b, e) in zip(bristles, vector.bristles) {
                #expect([b.off, b.w, b.a, b.load, b.tone, b.lam, b.jit] == [e.off, e.w, e.a, e.load, e.tone, e.lam, e.jit], "seed \(vector.seed)")
                #expect([0.5, 3.2, 40.7, 300.1].map { b.nz($0) } == e.nz, "seed \(vector.seed)")
            }
        }
    }

    /// A kept brush is the brush its seed makes, every time it is asked for.
    @Test func aKeptBrushIsTheSameBrush() {
        let made = Brush.brush(seed: 612, count: 7)
        for kept in [Brush.cachedBrush(seed: 612, count: 7), Brush.cachedBrush(seed: 612, count: 7)] {
            #expect(kept.map(\.off) == made.map(\.off) && kept.map(\.lam) == made.map(\.lam))
            #expect(kept.map { $0.nz(12.5) } == made.map { $0.nz(12.5) })
        }
        #expect(Brush.cachedBrush(seed: 612, count: 9).count == 9)
    }

    @Test func pressureMatchesDesktop() throws {
        for vector in try #require(BrushVectors.file).pressures {
            let got = [0, 0.03, 0.1, 0.5, 0.8, 0.95, 1].map { Brush.pressure($0, ts: vector.ts, te: vector.te) }
            #expect(zip(got, vector.values).allSatisfy { near($0, $1) }, "\(vector.ts) \(vector.te)")
        }
    }

    @Test(arguments: BrushVectors.file?.strokes ?? [])
    func strokesPaintAsOnDesktop(_ vector: BrushVectors.StrokeCase) throws {
        let file = try #require(BrushVectors.file)
        let o = vector.options
        var options = Brush.StrokeOptions(width: o.width, rgb: Brush.RGB(o.rgb[0], o.rgb[1], o.rgb[2]))
        if let v = o.alpha { options.alpha = v }
        if let v = o.dry { options.dry = v }
        options.core = o.core
        if let v = o.ts { options.ts = v }
        if let v = o.te { options.te = v }
        if let v = o.sOff { options.sOff = v }
        if let v = o.light { options.light = v }
        if let v = o.dark { options.dark = v }
        if let v = o.noCore { options.noCore = v }
        options.i0 = o.i0
        options.i1 = o.i1
        if o.pfn == "sine" { options.pressure = { 0.5 + 0.5 * sin($0 * .pi) } }
        let marks = Brush.stroke(file.paths[vector.path].path, Brush.brush(seed: vector.seed, count: vector.n), options)
        #expect(marks.count == vector.ops.count)
        for (mark, op) in zip(marks, vector.ops) {
            switch mark {
            case let .fill(paint, shape):
                let color = try #require(op.fill)
                #expect([Double(paint.r), Double(paint.g), Double(paint.b)] == Array(color.prefix(3)))
                #expect(near(paint.a, color[3]))
                let points = try #require(op.points)
                #expect(shape.count == points.count)
                #expect(zip(shape, points).allSatisfy { near($0.x, $1[0]) && near($0.y, $1[1]) })
            case let .lines(paint, width, runs):
                let color = try #require(op.stroke)
                #expect([Double(paint.r), Double(paint.g), Double(paint.b)] == Array(color.prefix(3)))
                #expect(near(paint.a, color[3]))
                #expect(near(width, try #require(op.width)))
                let lines = try #require(op.lines)
                #expect(runs.map(\.count) == lines.map(\.count))
                for (run, line) in zip(runs, lines) {
                    #expect(zip(run, line).allSatisfy { near($0.x, $1[0]) && near($0.y, $1[1]) })
                }
            }
        }
    }
}
