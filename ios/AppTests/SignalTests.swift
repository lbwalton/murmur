// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@MainActor @Suite struct SignalTests {
    /// A posted signal reaches a listener, across processes in real use and
    /// within this one here.
    @Test func aPostedSignalIsHeard() async throws {
        let heard = Heard()
        let listener = SignalListener([.changed, .stop]) { signal in heard.signals.append(signal) }
        Signal.changed.post()
        for _ in 0..<50 where heard.signals.isEmpty {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(heard.signals == [.changed])
        _ = listener
    }

    @Test func signalsAreNamedUnderTheAppGroup() {
        #expect(Signal.allCases.allSatisfy { $0.name.hasPrefix(AppGroup.identifier + ".") })
        #expect(Set(Signal.allCases.map(\.name)).count == 6)
    }

    @MainActor final class Heard {
        var signals: [Signal] = []
    }
}
