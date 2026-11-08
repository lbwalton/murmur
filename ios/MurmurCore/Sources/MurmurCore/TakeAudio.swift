// SPDX-License-Identifier: GPL-3.0-only
// The two guards that keep silence from typing (ios/prd.json IOS-006), as
// desktop runs them in src/main/dictation.ts: the speech gate before
// upload, and the hallucination filter after transcription.
import Foundation

public enum TakeAudio {
    /// The WAV to upload: the take with its silent head and tail cut, or
    /// nil when the gate hears no speech, so nothing is sent.
    public static func upload(_ samples: [Float], sampleRate: Int = Wav.targetSampleRate, gate: SpeechGateSpec) -> Data? {
        guard SpeechGate.hasSpeechEnergy(samples, sampleRate: sampleRate, spec: gate) else { return nil }
        return Wav.encodePcm16(SpeechGate.trimSilence(samples, sampleRate: sampleRate, spec: gate), sampleRate: sampleRate)
    }

    /// The words worth keeping, or nil when the transcript is empty or
    /// only a phrase models invent on silence. A tail models add to real
    /// speech is cut using only the never-genuinely-spoken tails, so a
    /// real spoken thank-you survives.
    public static func heard(_ transcript: String, list: HallucinationList) -> String? {
        if SpeechGate.isHallucination(transcript, phrases: list.phrases) { return nil }
        return SpeechGate.stripTrailingHallucinations(transcript, phrases: list.artifactTails)
    }
}
