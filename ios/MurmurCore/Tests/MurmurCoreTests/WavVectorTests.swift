// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

struct WavCase: Decodable, Sendable, CustomTestStringConvertible {
    let name: String
    let sampleRate: Int
    let samples: [Double]
    let expectedHex: String
    var testDescription: String { name }

    static let all: [WavCase] = {
        struct File: Decodable { let cases: [WavCase] }
        return (try? SharedData(directory: repoShared).decode(File.self, from: "wav-vectors.json").cases) ?? []
    }()
}

@Suite struct WavVectorTests {
    @Test func theSharedFileLoads() {
        #expect(!WavCase.all.isEmpty)
    }

    /// Each JSON number becomes a 32-bit float the way a Float32Array
    /// makes one: parsed as a Double, then rounded to the nearest Float.
    @Test(arguments: WavCase.all)
    func bytesMatchDesktop(_ wavCase: WavCase) {
        let data = Wav.encodePcm16(wavCase.samples.map { Float($0) }, sampleRate: wavCase.sampleRate)
        #expect(data.map { String(format: "%02x", $0) }.joined() == wavCase.expectedHex)
    }

    @Test func aNaNSampleWritesZero() {
        #expect(Wav.pcm16(.nan) == 0)
        #expect(Wav.pcm16(.infinity) == 32767)
        #expect(Wav.pcm16(-.infinity) == -32767)
    }
}
