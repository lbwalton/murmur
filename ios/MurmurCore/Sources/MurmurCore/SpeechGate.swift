// SPDX-License-Identifier: GPL-3.0-only
// The two silence guards, desktop's src/shared/speech-gate.ts in Swift.
// Before upload: an energy gate that measures voiced time, with its
// numbers from shared/speech-gate.json. After transcription: a filter for
// empty output and the stock phrases Whisper-family models invent on
// silence, from shared/hallucinations.json. Either one firing means
// nothing is ever inserted.
import Foundation

public struct SpeechGateSpec: Decodable, Sendable, Equatable {
    public let windowMs: Double
    public let rmsThreshold: Double
    public let minVoicedMs: Double
    public let paddingMs: Double
    public let deadStreamPeak: Double
}

public struct HallucinationList: Decodable, Sendable, Equatable {
    /// Whole transcripts that are artifacts.
    public let phrases: [String]
    /// The subset safe to strip off the end of real speech.
    public let artifactTails: [String]
}

public enum SpeechGate {
    private static func windowSize(_ spec: SpeechGateSpec, _ sampleRate: Int) -> Int {
        max(1, Int(JS.round(spec.windowMs / 1000 * Double(sampleRate))))
    }

    private static func windowIsVoiced(_ samples: [Float], from start: Int, size: Int, spec: SpeechGateSpec) -> Bool {
        var sum = 0.0
        for i in start..<(start + size) {
            let sample = Double(samples[i])
            sum += sample * sample
        }
        return (sum / Double(size)).squareRoot() >= spec.rmsThreshold
    }

    /// Total milliseconds of windows whose RMS clears the threshold.
    public static func voicedMs(_ samples: [Float], sampleRate: Int, spec: SpeechGateSpec) -> Double {
        let size = windowSize(spec, sampleRate)
        var voiced = 0.0
        var start = 0
        while start + size <= samples.count {
            if windowIsVoiced(samples, from: start, size: size, spec: spec) { voiced += spec.windowMs }
            start += size
        }
        return voiced
    }

    /// True when the audio holds enough voiced time to be worth uploading.
    public static func hasSpeechEnergy(_ samples: [Float], sampleRate: Int, spec: SpeechGateSpec) -> Bool {
        voicedMs(samples, sampleRate: sampleRate, spec: spec) >= spec.minVoicedMs
    }

    /// The loudest absolute sample in the take: the capture health number.
    public static func peakLevel(_ samples: [Float]) -> Double {
        Double(samples.reduce(Float(0)) { max($0, abs($1)) })
    }

    /// A take this quiet is a dead capture stream, not a quiet person.
    public static func isDeadStream(peak: Double, spec: SpeechGateSpec) -> Bool {
        peak < spec.deadStreamPeak
    }

    /// Cut leading and trailing silence, keeping padding on both sides.
    /// Silence fed to speech models breeds invented phrases; voiced audio
    /// is never cut, so a spoken thank-you survives.
    public static func trimSilence(_ samples: [Float], sampleRate: Int, spec: SpeechGateSpec) -> [Float] {
        let size = windowSize(spec, sampleRate)
        var firstVoiced = -1
        var lastVoiced = -1
        var start = 0
        while start + size <= samples.count {
            if windowIsVoiced(samples, from: start, size: size, spec: spec) {
                if firstVoiced == -1 { firstVoiced = start }
                lastVoiced = start + size
            }
            start += size
        }
        if firstVoiced == -1 { return [] }
        let padding = Int(JS.round(spec.paddingMs / 1000 * Double(sampleRate)))
        return Array(samples[max(0, firstVoiced - padding)..<min(samples.count, lastVoiced + padding)])
    }

    private static let stripped: Set<UInt16> = Set(".,!?;:'\"\u{201C}\u{201D}\u{2018}\u{2019}-()[]".utf16)

    /// Lowercase, strip punctuation, and collapse whitespace, for exact
    /// matching. lowercased() matches JavaScript's toLowerCase except for
    /// a Greek capital sigma ending a word (σ here, ς there), which can
    /// never make a transcript equal one of the phrases while every phrase
    /// is ASCII (SpeechVectorTests.everyHallucinationPhraseIsASCII).
    public static func normalizeTranscript(_ text: String) -> String {
        var units: [UInt16] = []
        var pendingSpace = false
        for unit in text.lowercased().utf16 where !stripped.contains(unit) {
            if JS.isSpace(unit) {
                pendingSpace = true
                continue
            }
            if pendingSpace && !units.isEmpty { units.append(0x20) }
            pendingSpace = false
            units.append(unit)
        }
        return String(decoding: units, as: UTF16.self)
    }

    /// True when the transcript is empty or exactly one of the phrases
    /// after normalizing: a real dictation that merely contains one passes.
    public static func isHallucination(_ text: String, phrases: [String]) -> Bool {
        let normalized = normalizeTranscript(text)
        if normalized.isEmpty { return true }
        return phrases.contains { JS.same(normalizeTranscript($0), normalized) }
    }

    /// Strip trailing sentences matching the phrases from a transcript of
    /// several sentences. Callers pass artifactTails, never the full list,
    /// so a real spoken sign-off always survives.
    public static func stripTrailingHallucinations(_ text: String, phrases: [String]) -> String {
        let trimmed = JS.trim(text)
        let source = trimmed as NSString
        var sentences: [String] = []
        var cursor = 0
        let breaks = JS.regex("(?<=[.!?])\(JS.space)+").matches(in: trimmed, range: NSRange(location: 0, length: source.length))
        for found in breaks {
            sentences.append(source.substring(with: NSRange(location: cursor, length: found.range.location - cursor)))
            cursor = found.range.location + found.range.length
        }
        sentences.append(source.substring(from: cursor))
        while sentences.count > 1, let last = sentences.last, isHallucination(last, phrases: phrases) {
            sentences.removeLast()
        }
        return sentences.joined(separator: " ")
    }
}
