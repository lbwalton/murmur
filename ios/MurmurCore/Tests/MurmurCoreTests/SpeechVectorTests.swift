// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

struct SpeechVectors: Decodable, Sendable {
    struct Segment: Decodable, Sendable {
        let kind: String
        let samples: Int
        let amplitude: Double?
        let periodSamples: Int?
    }

    struct Signal: Decodable, Sendable, CustomTestStringConvertible {
        struct Expected: Decodable, Sendable {
            let voicedMs: Double
            let hasSpeech: Bool
            let trimmedSamples: Int
            let peak: Double
            let deadStream: Bool
        }

        let name: String
        let sampleRate: Int
        let segments: [Segment]
        let expected: Expected
        var testDescription: String { name }

        /// The audio the segments describe (speech-vectors.json comment).
        var samples: [Float] {
            var out: [Float] = []
            for segment in segments {
                guard segment.kind == "square", let amplitude = segment.amplitude, let period = segment.periodSamples else {
                    out.append(contentsOf: repeatElement(0, count: segment.samples))
                    continue
                }
                let level = Float(amplitude)
                for i in 0..<segment.samples { out.append((i / (period / 2)) % 2 == 0 ? level : -level) }
            }
            return out
        }
    }

    struct Verdict: Decodable, Sendable { let text: String; let expected: Bool }
    struct Strip: Decodable, Sendable { let text: String; let expected: String }

    let signals: [Signal]
    let hallucinations: [Verdict]
    let trailing: [Strip]

    static let file: SpeechVectors? = try? SharedData(directory: repoShared).decode(SpeechVectors.self, from: "speech-vectors.json")
}

let gateSpec: SpeechGateSpec? = try? SharedData(directory: repoShared).decode(SpeechGateSpec.self, from: "speech-gate.json")
let hallucinationList: HallucinationList? = try? SharedData(directory: repoShared).decode(HallucinationList.self, from: "hallucinations.json")

@Suite struct SpeechVectorTests {
    @Test func theSharedFilesLoad() throws {
        let file = try #require(SpeechVectors.file)
        #expect(!file.signals.isEmpty && !file.hallucinations.isEmpty && !file.trailing.isEmpty)
        #expect(gateSpec == SpeechGateSpec(windowMs: 30, rmsThreshold: 0.01, minVoicedMs: 200, paddingMs: 250, deadStreamPeak: 0.001))
        #expect(hallucinationList != nil)
    }

    @Test(arguments: SpeechVectors.file?.signals ?? [])
    func signalMatchesDesktop(_ signal: SpeechVectors.Signal) throws {
        let spec = try #require(gateSpec)
        let samples = signal.samples
        let peak = SpeechGate.peakLevel(samples)
        #expect(SpeechGate.voicedMs(samples, sampleRate: signal.sampleRate, spec: spec) == signal.expected.voicedMs)
        #expect(SpeechGate.hasSpeechEnergy(samples, sampleRate: signal.sampleRate, spec: spec) == signal.expected.hasSpeech)
        #expect(SpeechGate.trimSilence(samples, sampleRate: signal.sampleRate, spec: spec).count == signal.expected.trimmedSamples)
        #expect(peak == signal.expected.peak)
        #expect(SpeechGate.isDeadStream(peak: peak, spec: spec) == signal.expected.deadStream)
    }

    @Test func hallucinationsMatchDesktop() throws {
        let file = try #require(SpeechVectors.file)
        let list = try #require(hallucinationList)
        for verdict in file.hallucinations {
            #expect(SpeechGate.isHallucination(verdict.text, phrases: list.phrases) == verdict.expected, "\(verdict.text)")
        }
        for strip in file.trailing {
            expectSameUnits(SpeechGate.stripTrailingHallucinations(strip.text, phrases: list.artifactTails), strip.expected, strip.text)
        }
    }

    /// JavaScript compares code units, so a precomposed é never equals an e
    /// plus a combining accent: node gives false.
    @Test func hallucinationsCompareCodeUnits() {
        #expect(!SpeechGate.isHallucination("Caf\u{00E9}", phrases: ["cafe\u{0301}"]))
    }

    /// normalizeTranscript matches desktop only while every phrase is ASCII
    /// (lowercased() has no final sigma rule); a non-ASCII phrase needs one.
    @Test func everyHallucinationPhraseIsASCII() throws {
        let list = try #require(hallucinationList)
        let nonASCII = (list.phrases + list.artifactTails).filter { !$0.unicodeScalars.allSatisfy(\.isASCII) }
        #expect(nonASCII.isEmpty, "\(nonASCII)")
    }
}
