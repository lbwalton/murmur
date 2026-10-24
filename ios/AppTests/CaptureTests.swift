// SPDX-License-Identifier: GPL-3.0-only
import AVFoundation
import Testing
@testable import murmur

@Suite struct CaptureTests {
    /// A second of a 440 Hz tone at amplitude 0.3, in buffers the size a
    /// microphone tap delivers.
    func feed(_ capture: Capture, rate: Double, channels: AVAudioChannelCount) throws {
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: rate, channels: channels))
        let frames = AVAudioFrameCount(rate / 10)
        for chunk in 0..<10 {
            let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
            buffer.frameLength = frames
            for channel in 0..<Int(channels) {
                let data = try #require(buffer.floatChannelData)[channel]
                for i in 0..<Int(frames) {
                    let t = Double(chunk * Int(frames) + i) / rate
                    data[i] = Float(0.3 * sin(2 * Double.pi * 440 * t))
                }
            }
            capture.append(buffer)
        }
    }

    func rms(_ samples: ArraySlice<Float>) -> Double {
        (samples.reduce(0.0) { $0 + Double($1 * $1) } / Double(samples.count)).squareRoot()
    }

    /// Music that is playing keeps playing, and stays in your AirPods or
    /// other Bluetooth headphones while the iPhone's own mic records.
    @Test func musicStaysWhereItIsPlaying() {
        #expect(DeviceMicrophone.sessionOptions == [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP])
    }

    /// The microphone calls the tap on its own audio thread, so the tap
    /// must never belong to the main actor.
    @Test func theTapRunsOffTheMainThread() throws {
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let capture = try #require(Capture(from: format))
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4_800))
        buffer.frameLength = 4_800
        let tap = capture.tap
        let onMain = DispatchQueue(label: "audio").sync {
            tap(buffer, AVAudioTime(sampleTime: 0, atRate: 48_000))
            return Thread.isMainThread
        }
        #expect(!onMain)
        #expect(abs(capture.finish().count - 1_600) < 20)
    }

    @Test(arguments: [(48_000.0, AVAudioChannelCount(1)), (48_000, 2), (44_100, 1), (24_000, 1)])
    func anyMicrophoneFormatBecomes16kHzMono(_ rate: Double, _ channels: AVAudioChannelCount) throws {
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: rate, channels: channels))
        let capture = try #require(Capture(from: format))
        try feed(capture, rate: rate, channels: channels)
        let samples = capture.finish()
        #expect(abs(samples.count - 16_000) < 20)
        // The tone keeps its level (0.3 peak, 0.212 RMS) through the change.
        #expect(abs(rms(samples[2_000..<14_000]) - 0.212) < 0.02)
    }
}
