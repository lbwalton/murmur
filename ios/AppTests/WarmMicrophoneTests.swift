// SPDX-License-Identifier: GPL-3.0-only
import AVFoundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct WarmMicrophoneTests {
    /// Half a second at 48 kHz of a steady 0.5, a sound no take may hold.
    let between = [Float](repeating: 0.5, count: 24_000)
    /// A second at 48 kHz of a 220 Hz tone at 0.3.
    let spoken = (0..<48_000).map { Float(0.3 * sin(2 * Double.pi * 220 * Double($0) / 48_000)) }

    /// Sound heard while warm between takes is dropped as it arrives: the
    /// take holds only what was said during it.
    @Test func soundBetweenTakesNeverReachesATake() throws {
        let microphone = try #require(FedMicrophone())
        microphone.holdWarm = true
        try microphone.warmUp()
        microphone.hear(between)
        try microphone.start()
        microphone.hear(spoken)
        let take = microphone.stop()
        microphone.hear(between)
        #expect(abs(take.count - Wav.targetSampleRate) < 400)
        #expect(take.allSatisfy { abs($0) < 0.35 })
        #expect(microphone.isWarm)
        try microphone.start()
        #expect(microphone.stop().allSatisfy { abs($0) < 0.01 })
    }

    @Test func aTakeWithoutASessionLetsTheMicrophoneGo() throws {
        let microphone = try #require(FedMicrophone())
        try microphone.start()
        microphone.hear(spoken)
        _ = microphone.stop()
        #expect(!microphone.isWarm)
    }

    /// The waveform moves only during a take.
    @Test func theLevelFollowsTheTakeOnly() throws {
        let microphone = try #require(FedMicrophone())
        microphone.holdWarm = true
        try microphone.warmUp()
        microphone.hear(between)
        #expect(microphone.level == 0)
        try microphone.start()
        microphone.hear(spoken)
        #expect(microphone.level > 0.5)
        _ = microphone.stop()
        #expect(microphone.level == 0)
    }

    /// AirPods connecting mid take change the input format; the take goes
    /// on in the new one and keeps everything.
    @Test func aTakeGoesOnAcrossARouteChange() throws {
        let first = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let second = try #require(AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1))
        let capture = try #require(Capture(from: first))
        for (format, frames) in [(first, 24_000), (second, 12_000)] {
            let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)))
            buffer.frameLength = AVAudioFrameCount(frames)
            for i in 0..<frames { buffer.floatChannelData![0][i] = 0.2 }
            capture.reformat(from: format)
            capture.append(buffer)
        }
        let samples = capture.finish()
        #expect(abs(samples.count - Wav.targetSampleRate) < 400)
    }
}
