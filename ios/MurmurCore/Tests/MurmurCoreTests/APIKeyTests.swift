// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct APIKeyTests {
    @Test func aPasteLosesItsSpacesAndLineBreaks() throws {
        let key = try #require(APIKey("  gsk_abcdefgh1234\n"))
        #expect(key.secret == "gsk_abcdefgh1234")
    }

    @Test(arguments: ["", "   ", "\n\t"])
    func anEmptyPasteIsNoKey(_ pasted: String) {
        #expect(APIKey(pasted) == nil)
    }

    @Test func theMaskShowsOnlyTheLastFour() throws {
        #expect(try #require(APIKey("gsk_abcdefgh1234")).masked == "••••1234")
    }

    /// Desktop's maskKey hides a key of 8 or fewer characters whole.
    @Test(arguments: ["12345678", "abc"])
    func aShortKeyIsHiddenWhole(_ secret: String) throws {
        #expect(try #require(APIKey(secret)).masked == "••••")
    }

    /// Every way Swift turns a value into text shows the mask, so a key
    /// that strays into a log line, an error, or a crash message still
    /// stays secret.
    @Test func printingAKeyNeverShowsIt() throws {
        let key = try #require(APIKey("gsk_abcdefgh1234"))
        let optional: APIKey? = key
        var dumped = ""
        dump(key, to: &dumped)
        let texts = ["\(key)", String(describing: key), String(reflecting: key), String(describing: optional), dumped, "\([key])"]
        for text in texts {
            #expect(!text.contains("gsk_abcdefgh"), "\(text)")
            #expect(text.contains("••••1234"), "\(text)")
        }
    }
}
