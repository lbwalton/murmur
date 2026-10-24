// SPDX-License-Identifier: GPL-3.0-only
// A stand-in microphone permission for the smoke and the tests: it answers
// first run's ask the way it was told to (ios/prd.json IOS-011).
import Foundation

@MainActor final class ScriptedAccess: MicrophoneAccess {
    var status: Setup.Permission = .undetermined
    let answer: Bool

    init(answer: Bool) {
        self.answer = answer
    }

    func request() async -> Bool {
        status = answer ? .granted : .denied
        return answer
    }
}

/// A value first run's checks read, changed by the smoke and the tests.
@MainActor final class Cell<Value> {
    var value: Value

    init(_ value: Value) {
        self.value = value
    }
}
