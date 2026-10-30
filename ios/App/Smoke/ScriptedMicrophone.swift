// SPDX-License-Identifier: GPL-3.0-only
// A stand-in microphone for the smoke and the tests: it hands back the
// samples it was given, so a take runs end to end with no hardware.
import AVFoundation
import Foundation
import MurmurCore

@MainActor final class ScriptedMicrophone: WarmMicrophone {
    var allowed = true
    var startError: (any Error)?
    var samples: [Float]
    var level: Float = 0
    var holdWarm = false
    var onLost: (@MainActor () -> Void)?
    private(set) var isWarm = false
    private(set) var asked = 0
    private(set) var started = 0

    init(samples: [Float] = []) {
        self.samples = samples
    }

    func allow() async -> Bool {
        asked += 1
        return allowed
    }

    func warmUp() throws {
        if let startError { throw startError }
        isWarm = true
    }

    func coolDown() { isWarm = false }

    /// The microphone goes away on its own, as when the route loses its input.
    func lose() {
        isWarm = false
        holdWarm = false
        onLost?()
    }

    func start() throws {
        try warmUp()
        started += 1
    }

    func stop() -> [Float] {
        if !holdWarm { coolDown() }
        return samples
    }

    /// A second of a 220 Hz tone at speaking level between half seconds
    /// of silence, at 16 kHz.
    nonisolated static let tone: [Float] = {
        let rate = Double(Wav.targetSampleRate)
        let quiet = [Float](repeating: 0, count: Wav.targetSampleRate / 2)
        let voiced = (0..<Wav.targetSampleRate).map { Float(0.3 * sin(2 * Double.pi * 220 * Double($0) / rate)) }
        return quiet + voiced + quiet
    }()

    /// Two seconds of nothing.
    nonisolated static let silence = [Float](repeating: 0, count: Wav.targetSampleRate * 2)
}

/// The device microphone's path with buffers handed in instead of heard:
/// the same gate and capture, so the smoke can show that sound arriving
/// between takes never reaches a take.
@MainActor final class FedMicrophone: WarmMicrophone {
    let format: AVAudioFormat
    private let gate = TapGate()
    private(set) var isWarm = false
    var holdWarm = false
    var onLost: (@MainActor () -> Void)?
    /// What the last take heard, at 16 kHz.
    private(set) var lastTake: [Float] = []

    init?(rate: Double = 48_000) {
        guard let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 1, interleaved: false) else { return nil }
        self.format = format
    }

    func allow() async -> Bool { true }

    func warmUp() throws {
        gate.reformat(from: format)
        isWarm = true
    }

    func coolDown() {
        _ = gate.end()
        isWarm = false
    }

    func start() throws {
        try warmUp()
        guard let capture = Capture(from: format) else { throw MicrophoneError.noInput }
        gate.begin(capture)
    }

    func stop() -> [Float] {
        lastTake = gate.end()?.finish() ?? []
        if !holdWarm { coolDown() }
        return lastTake
    }

    var level: Float { gate.level }

    /// Hands the gate what a warm microphone would hear; a cold one hears
    /// nothing.
    func hear(_ samples: [Float]) {
        guard isWarm, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)), let channel = buffer.floatChannelData else { return }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { channel[0].update(from: $0.baseAddress!, count: samples.count) }
        gate.pass(buffer)
    }
}
