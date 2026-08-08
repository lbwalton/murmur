import XCTest

// US-102: prove the shared spec and vector files ride inside the bundles
// and carry every rule family the desktop composes from. The Swift pipeline
// that consumes them arrives with US-103.
final class FormatSpecTests: XCTestCase {

    private func loadJSON(_ name: String) throws -> [String: Any] {
        let bundle = Bundle(for: FormatSpecTests.self)
        let url = try XCTUnwrap(bundle.url(forResource: name, withExtension: "json"),
                                "\(name).json missing from the test bundle")
        let data = try Data(contentsOf: url)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testSpecCarriesEveryRuleFamily() throws {
        let spec = try loadJSON("format-spec")
        let levels = try XCTUnwrap(spec["levels"] as? [String: Any])
        for level in ["none", "structure", "soft", "medium", "high"] {
            XCTAssertNotNil(levels[level] as? [String], "level \(level) missing")
        }
        let styles = try XCTUnwrap(spec["styles"] as? [String: Any])
        XCTAssertNotNil(styles["conversation"])
        XCTAssertNotNil(styles["vibe-coding"])
        let numbers = try XCTUnwrap(spec["numbers"] as? [String: Any])
        for mode in ["auto", "digits", "words"] {
            XCTAssertNotNil(numbers[mode] as? [String], "number mode \(mode) missing")
        }
        XCTAssertFalse(try XCTUnwrap(spec["structure"] as? [String]).isEmpty)
        let prompt = try XCTUnwrap(spec["prompt"] as? [String: Any])
        XCTAssertNotNil(prompt["header"] as? String)
        XCTAssertNotNil(prompt["footer"] as? [String])
    }

    func testSpecDefaultsMatchDesktop() throws {
        let spec = try loadJSON("format-spec")
        let defaults = try XCTUnwrap(spec["defaults"] as? [String: String])
        XCTAssertEqual(defaults["level"], "medium")
        XCTAssertEqual(defaults["style"], "conversation")
        XCTAssertEqual(defaults["numbers"], "auto")
    }

    func testChatGuardAndSilenceThresholds() throws {
        let spec = try loadJSON("format-spec")
        let guardBlock = try XCTUnwrap(spec["chatGuard"] as? [String: Any])
        XCTAssertFalse(try XCTUnwrap(guardBlock["tells"] as? [String]).isEmpty)
        XCTAssertEqual(guardBlock["overlapFloor"] as? Double, 0.34)
        let silence = try XCTUnwrap(spec["silence"] as? [String: Any])
        XCTAssertEqual(silence["noSpeechProbThreshold"] as? Double, 0.85)
    }

    func testVectorsCarryEverySection() throws {
        let vectors = try loadJSON("test-vectors")
        let corrections = try XCTUnwrap(vectors["corrections"] as? [String: Any])
        XCTAssertFalse(try XCTUnwrap(corrections["diff"] as? [[String: Any]]).isEmpty)
        XCTAssertFalse(try XCTUnwrap(corrections["apply"] as? [[String: Any]]).isEmpty)
        let expansions = try XCTUnwrap(vectors["expansions"] as? [String: Any])
        XCTAssertFalse(try XCTUnwrap(expansions["cases"] as? [[String: Any]]).isEmpty)
        XCTAssertFalse(try XCTUnwrap(vectors["chatGuard"] as? [[String: Any]]).isEmpty)
        XCTAssertFalse(try XCTUnwrap(vectors["silenceSegments"] as? [[String: Any]]).isEmpty)
    }
}
