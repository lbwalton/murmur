// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// A second of a 220 Hz tone at speaking level, padded with silence.
func spokenSecond(sampleRate: Int = 16_000, padding: Int = 8_000) -> [Float] {
    let tone = (0..<sampleRate).map { Float(0.3 * sin(2 * Double.pi * 220 * Double($0) / Double(sampleRate))) }
    return [Float](repeating: 0, count: padding) + tone + [Float](repeating: 0, count: padding)
}

@Suite struct TakeAudioTests {
    @Test func silenceIsNeverSent() throws {
        let gate = try #require(gateSpec)
        #expect(TakeAudio.upload([Float](repeating: 0, count: 32_000), gate: gate) == nil)
        #expect(TakeAudio.upload([Float](repeating: 0.001, count: 32_000), gate: gate) == nil)
        #expect(TakeAudio.upload([], gate: gate) == nil)
    }

    @Test func speechIsSentWithItsSilenceCut() throws {
        let gate = try #require(gateSpec)
        let samples = spokenSecond()
        let wav = try #require(TakeAudio.upload(samples, gate: gate))
        let trimmed = SpeechGate.trimSilence(samples, sampleRate: 16_000, spec: gate)
        #expect(wav == Wav.encodePcm16(trimmed, sampleRate: 16_000))
        #expect(trimmed.count < samples.count)
    }

    @Test(arguments: ["", "  ", "Thank you.", "thank you for watching"])
    func aPhraseInventedOnSilenceIsHeardAsNothing(_ transcript: String) throws {
        #expect(TakeAudio.heard(transcript, list: try #require(hallucinationList)) == nil)
    }

    @Test func realWordsAreKept() throws {
        let list = try #require(hallucinationList)
        #expect(TakeAudio.heard("Send the invoice tomorrow.", list: list) == "Send the invoice tomorrow.")
        #expect(TakeAudio.heard("Thanks for the help today. Thank you.", list: list) == "Thanks for the help today. Thank you.")
    }

    @Test func anInventedTailIsCut() throws {
        let list = try #require(hallucinationList)
        let tail = try #require(list.artifactTails.first)
        #expect(TakeAudio.heard("Send the invoice tomorrow. \(tail)", list: list) == "Send the invoice tomorrow.")
    }
}

@Suite struct WavDurationTests {
    @Test func itReadsTheLengthFromTheHeader() {
        #expect(Wav.durationMs(Wav.encodePcm16([Float](repeating: 0, count: 16_000), sampleRate: 16_000)) == 1000)
        #expect(Wav.durationMs(Wav.encodePcm16([Float](repeating: 0, count: 8_000), sampleRate: 16_000)) == 500)
        #expect(Wav.durationMs(Wav.encodePcm16([], sampleRate: 16_000)) == 0)
    }

    @Test func anythingElseIsZero() {
        #expect(Wav.durationMs(Data()) == 0)
        #expect(Wav.durationMs(Data("not a wav file at all".utf8)) == 0)
    }

    /// A header that promises more data than the file holds counts only
    /// what is there.
    @Test func aShortFileCountsWhatItHolds() {
        let full = Wav.encodePcm16([Float](repeating: 0, count: 16_000), sampleRate: 16_000)
        #expect(Wav.durationMs(full.prefix(44 + 16_000)) == 500)
    }
}
