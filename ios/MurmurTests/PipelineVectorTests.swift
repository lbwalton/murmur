import XCTest
@testable import Murmur

// US-103: every shared vector runs through the real Swift implementations,
// the same cases the desktop sharedVectors smoke check proves, so the two
// platforms cannot drift apart.
final class PipelineVectorTests: XCTestCase {

    private static var spec: FormatSpec!
    private static var vectors: [String: Any]!

    override class func setUp() {
        super.setUp()
        let bundle = Bundle(for: PipelineVectorTests.self)
        spec = try? FormatSpec.load(from: bundle)
        if let url = bundle.url(forResource: "test-vectors", withExtension: "json"),
           let data = try? Data(contentsOf: url) {
            vectors = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        }
    }

    override func setUpWithError() throws {
        try XCTSkipIf(Self.spec == nil || Self.vectors == nil, "shared files failed to load")
    }

    // Byte-identical prompts: the vectors carry full prompt strings that
    // the desktop implementation generated and its smoke check re-proves.
    func testFormatPromptMatchesDesktopByteForByte() throws {
        let cases = try XCTUnwrap(Self.vectors["formatPrompt"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let name = c["name"] as? String ?? "?"
            let built = Formatter.buildFormatPrompt(level: try XCTUnwrap(c["level"] as? String),
                                                    style: try XCTUnwrap(c["style"] as? String),
                                                    numbers: try XCTUnwrap(c["numbers"] as? String),
                                                    spec: Self.spec)
            XCTAssertEqual(built, c["prompt"] as? String, "prompt mismatch: \(name)")
        }
    }

    func testChatGuardVectors() throws {
        let cases = try XCTUnwrap(Self.vectors["chatGuard"] as? [[String: String]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let got = Formatter.guardFormatOutput(input: try XCTUnwrap(c["input"]),
                                                  output: try XCTUnwrap(c["output"]),
                                                  spec: Self.spec)
            XCTAssertEqual(got, c["expected"], "chat guard mismatch: \(c["name"] ?? "?")")
        }
    }

    func testCorrectionApplyVectors() throws {
        let corrections = try XCTUnwrap(Self.vectors["corrections"] as? [String: Any])
        let cases = try XCTUnwrap(corrections["apply"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let pairs = (c["pairs"] as? [[String: String]] ?? []).compactMap { p -> CorrectionPair? in
                guard let from = p["from"], let to = p["to"] else { return nil }
                return CorrectionPair(from: from, to: to)
            }
            let got = Corrections.apply(try XCTUnwrap(c["text"] as? String), pairs: pairs)
            XCTAssertEqual(got, c["expected"] as? String, "correction mismatch: \(c["name"] as? String ?? "?")")
        }
    }

    func testExpansionVectors() throws {
        let block = try XCTUnwrap(Self.vectors["expansions"] as? [String: Any])
        let list = (try XCTUnwrap(block["list"] as? [[String: Any]])).compactMap { e -> Expansion? in
            guard let trigger = e["trigger"] as? String, let value = e["value"] as? String else { return nil }
            return Expansion(trigger: trigger, value: value, enabled: e["enabled"] as? Bool ?? true)
        }
        let cases = try XCTUnwrap(block["cases"] as? [[String: String]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let got = Expansions.apply(try XCTUnwrap(c["text"]), list: list)
            XCTAssertEqual(got, c["expected"], "expansion mismatch: \(c["name"] ?? "?")")
        }
    }

    // Canned Whisper verbose_json fixtures from the shared vectors: silence
    // hallucination segments drop, real speech survives, fail open without
    // segment data.
    func testSilenceSegmentVectors() throws {
        let cases = try XCTUnwrap(Self.vectors["silenceSegments"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let response = try XCTUnwrap(c["response"])
            let data = try JSONSerialization.data(withJSONObject: response)
            let got = Transcriber.extractTranscript(data, spec: Self.spec)
            XCTAssertEqual(got, c["expected"] as? String, "silence mismatch: \(c["name"] as? String ?? "?")")
        }
    }
}
