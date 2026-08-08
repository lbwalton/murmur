import XCTest
@testable import Murmur

// US-109: the learning loop shares the desktop's diff semantics through
// the shared vectors, and the promote-on-second-fix rule matches
// src/main/corrections.js exactly.
final class CorrectionLearningTests: XCTestCase {

    func testDiffVectorsMatchDesktop() throws {
        let bundle = Bundle(for: CorrectionLearningTests.self)
        let url = try XCTUnwrap(bundle.url(forResource: "test-vectors", withExtension: "json"))
        let vectors = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let corrections = try XCTUnwrap(vectors["corrections"] as? [String: Any])
        let cases = try XCTUnwrap(corrections["diff"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let got = Corrections.diffPairs(oldText: try XCTUnwrap(c["old"] as? String),
                                            newText: try XCTUnwrap(c["new"] as? String))
            let expected = (c["pairs"] as? [[String: String]] ?? [])
            XCTAssertEqual(got.count, expected.count, "pair count mismatch: \(c["name"] as? String ?? "?")")
            for (g, e) in zip(got, expected) {
                XCTAssertEqual(g.from, e["from"])
                XCTAssertEqual(g.to, e["to"])
            }
        }
    }

    func testPromoteOnSecondFix() {
        // First fix: pair learned, count 1, nothing promoted.
        let first = Corrections.learn(oldText: "open cloud code now", newText: "open Claude Code now",
                                      corrections: [], dictionary: [])
        XCTAssertEqual(first.corrections.count, 1)
        XCTAssertEqual(first.corrections[0].count, 1)
        XCTAssertTrue(first.promoted.isEmpty)
        // Second fix of the same mishearing: count 2, term promoted.
        let second = Corrections.learn(oldText: "i love cloud code a lot", newText: "i love Claude Code a lot",
                                       corrections: first.corrections, dictionary: first.dictionary)
        XCTAssertEqual(second.corrections[0].count, 2)
        XCTAssertEqual(second.promoted, ["Claude Code"])
        XCTAssertTrue(second.dictionary.contains("Claude Code"))
        // Third fix: no duplicate promotion.
        let third = Corrections.learn(oldText: "cloud code again", newText: "Claude Code again",
                                      corrections: second.corrections, dictionary: second.dictionary)
        XCTAssertTrue(third.promoted.isEmpty)
        XCTAssertEqual(third.dictionary.filter { $0 == "Claude Code" }.count, 1)
    }

    func testLearnedPairAppliesToLaterTranscripts() {
        let learned = Corrections.learn(oldText: "use cloud code", newText: "use Claude Code",
                                        corrections: [], dictionary: [])
        XCTAssertEqual(Corrections.apply("i asked cloud code to help", pairs: learned.corrections),
                       "i asked Claude Code to help")
    }

    func testCapAtOneHundredPairs() {
        var corrections: [CorrectionPair] = []
        for i in 0..<105 {
            corrections.append(CorrectionPair(from: "wrong\(i)", to: "right\(i)", count: 1, ts: Date()))
        }
        let learned = Corrections.learn(oldText: "foo bar", newText: "foo baz",
                                        corrections: corrections, dictionary: [])
        XCTAssertEqual(learned.corrections.count, Corrections.maxPairs)
    }
}
