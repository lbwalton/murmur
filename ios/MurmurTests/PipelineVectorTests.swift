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
        // US-111: a decode or load failure must go RED here, not skip green.
        // The v2 spec fields are non-optional precisely so a malformed spec
        // fails loudly; skipping the suite would hide exactly that breakage.
        _ = try XCTUnwrap(Self.spec, "format-spec.json failed to decode into FormatSpec")
        _ = try XCTUnwrap(Self.vectors, "test-vectors.json failed to load")
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

    // US-029/US-111: the prompt-echo strip removes a full-dictionary run and
    // fails open on partial, reordered, or "and"-joined lists, on a
    // sub-minTerms dictionary, and when stripping would leave no content. Same
    // vectors the desktop implementation proves.
    func testPromptEchoVectors() throws {
        let block = try XCTUnwrap(Self.vectors["promptEcho"] as? [String: Any])
        let dictionary = try XCTUnwrap(block["dictionary"] as? [String])
        let cases = try XCTUnwrap(block["cases"] as? [[String: String]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let got = Transcriber.stripPromptEcho(try XCTUnwrap(c["text"]),
                                                  dictionary: dictionary, spec: Self.spec)
            XCTAssertEqual(got, c["expected"], "prompt echo mismatch: \(c["name"] ?? "?")")
        }
        // Fail open: a dictionary under minTerms has no signature to match.
        let single = try XCTUnwrap(block["singleTermDictionary"] as? [String: Any])
        XCTAssertEqual(
            Transcriber.stripPromptEcho(try XCTUnwrap(single["text"] as? String),
                                        dictionary: try XCTUnwrap(single["dictionary"] as? [String]),
                                        spec: Self.spec),
            single["expected"] as? String)
        // Fail open: an empty dictionary.
        let empty = try XCTUnwrap(block["emptyDictionary"] as? [String: Any])
        XCTAssertEqual(
            Transcriber.stripPromptEcho(try XCTUnwrap(empty["text"] as? String),
                                        dictionary: try XCTUnwrap(empty["dictionary"] as? [String]),
                                        spec: Self.spec),
            empty["expected"] as? String)
        // The bare-terms vocabulary prompt the dictionary rides on Whisper.
        let vocab = try XCTUnwrap(block["vocabularyPrompt"] as? [String: Any])
        let terms = try XCTUnwrap(vocab["dictionary"] as? [String])
        XCTAssertEqual(
            fillTemplate(Self.spec.prompt.vocabularyPrompt, ["terms": terms.joined(separator: ", ")]),
            vocab["expected"] as? String)
    }

    // US-030/US-111: every transcript-fence tag is stripped off the reply,
    // not only wrapping ones, so an echoed tag never reaches the target app.
    func testTranscriptFenceVectors() throws {
        let block = try XCTUnwrap(Self.vectors["transcriptFence"] as? [String: Any])
        let cases = try XCTUnwrap(block["cases"] as? [[String: String]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let got = Transcriber.stripTranscriptTags(try XCTUnwrap(c["text"]), spec: Self.spec)
            XCTAssertEqual(got, c["expected"], "transcript fence mismatch")
        }
    }

    // US-111: the v2 fields are non-optional, so a spec missing one must fail
    // to decode loudly rather than silently skipping a rule. Locks in the
    // fail-loud contract so a future field cannot quietly become optional.
    func testMalformedSpecFailsToDecode() throws {
        let url = try XCTUnwrap(Bundle(for: PipelineVectorTests.self)
            .url(forResource: "format-spec", withExtension: "json"))
        let good = try Data(contentsOf: url)
        for missing in ["headingRule", "promptEcho"] {
            var obj = try XCTUnwrap(JSONSerialization.jsonObject(with: good) as? [String: Any])
            obj.removeValue(forKey: missing)
            let broken = try JSONSerialization.data(withJSONObject: obj)
            XCTAssertThrowsError(try JSONDecoder().decode(FormatSpec.self, from: broken),
                                 "a spec without \(missing) must fail to decode")
        }
    }
}
