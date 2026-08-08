import XCTest
import AVFoundation
@testable import Murmur

// The recording format must stay suitable for the transcriptions endpoint:
// AAC in m4a, mono, 16 kHz. Live capture itself needs a real microphone and
// is part of Labroi's US-105 verification loop.
final class RecorderTests: XCTestCase {

    func testRecordingFormatSuitsWhisper() {
        let s = Recorder.settings
        XCTAssertEqual(s[AVFormatIDKey] as? UInt32, kAudioFormatMPEG4AAC)
        XCTAssertEqual(s[AVNumberOfChannelsKey] as? Int, 1, "mono only; stereo doubles upload for nothing")
        XCTAssertEqual(s[AVSampleRateKey] as? Int, 16000)
    }
}
