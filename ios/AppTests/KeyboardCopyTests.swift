// SPDX-License-Identifier: GPL-3.0-only
import Testing
@testable import murmur

@Suite struct KeyboardCopyTests {
    /// The steps are a real sequence, and murmur stays lowercase where a
    /// sentence starts.
    @Test func theStepsReadPlainly() {
        #expect(KeyboardCopy.steps.count == 4)
        for line in KeyboardCopy.steps + [KeyboardCopy.fullAccess, KeyboardCopy.tryPrompt, KeyboardCopy.tryFooter, KeyboardCopy.lookFooter] {
            #expect(!line.contains("Murmur"))
        }
        #expect(KeyboardCopy.fullAccess.contains("never connects to the internet"))
    }
}
