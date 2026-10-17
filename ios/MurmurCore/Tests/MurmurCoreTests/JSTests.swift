// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct JSTests {
    @Test func replacementStringsFollowJavaScript() {
        let bucks = JS.regex("bucks")
        let cases: [(String, String)] = [
            ("$$", "five $ now"), ("$&", "five bucks now"), ("$`", "five five  now"), ("$'", "five  now now"),
            ("$1", "five $1 now"), ("$<x>", "five $<x> now"), ("a$", "five a$ now"), ("$", "five $ now"),
            // A prepended mark fuses with the $ into one Swift Character;
            // JavaScript still sees the $.
            ("\u{0600}$&", "five \u{0600}bucks now"), ("\u{0D4E}$'", "five \u{0D4E} now now")
        ]
        for (template, expected) in cases {
            expectSameUnits(JS.replace("five bucks now", bucks, with: template), expected, template)
        }
    }

    /// What node prints for /strasse/i on "Straße", /stop/i on "ſtop",
    /// /kart/i on the Kelvin sign's "Kart", /café/i on "CAFÉ", /σ/i on
    /// "ς", /µ/i on "μ", and /ǆ/i on "ǅ": false three times, then true.
    @Test(arguments: [
        ("strasse", "Straße", false), ("stop", "ſtop", false), ("kart", "\u{212A}art", false),
        ("café", "CAFÉ", true), ("σ", "ς", true), ("µ", "μ", true), ("ǆ", "ǅ", true)
    ])
    func caselessFollowsJavaScript(_ literal: String, _ text: String, _ matches: Bool) {
        let found = JS.regex(JS.caseless(literal)).firstMatch(in: text, range: NSRange(location: 0, length: text.utf16.count))
        #expect((found != nil) == matches)
    }

    @Test func mathRoundSendsHalvesUp() {
        #expect(JS.round(2.5) == 3)
        #expect(JS.round(-2.5) == -2)
        #expect(JS.round(-16383.5) == -16383)
        #expect(JS.round(0.49999999999999994) == 0)
        #expect(JS.round(-0.4) == 0)
    }

    /// Swift's == calls ; and the Greek question mark equal; the parity
    /// checks must not, so they compare code units.
    @Test func parityChecksCompareCodeUnits() {
        #expect("A\u{037E}" == "A;")
        withKnownIssue { expectSameUnits("A\u{037E}", "A;") }
        expectSameUnits("A;", "A;")
    }

    @Test func trimUsesJavaScriptWhitespace() {
        expectSameUnits(JS.trim("\u{FEFF}\u{3000} hi \u{2028}\n"), "hi")
        expectSameUnits(JS.trim("\u{85}hi"), "\u{85}hi")
    }

    /// What node prints for /\bé/, /\bcaf\b/, /\bé\b/, and /é\b/ on "café":
    /// true, true, false, false. An accented letter is not a word character.
    @Test(arguments: [
        ("\(JS.boundary)é", true), ("\(JS.boundary)caf\(JS.boundary)", true),
        ("\(JS.boundary)é\(JS.boundary)", false), ("é\(JS.boundary)", false)
    ])
    func wordEdgesAreASCII(_ pattern: String, _ matches: Bool) {
        let found = JS.regex(pattern).firstMatch(in: "café", range: NSRange(location: 0, length: "café".utf16.count))
        #expect((found != nil) == matches)
    }
}
