import XCTest
@testable import Murmur

// US-105: history persistence, the 200 cap, delete, and the hold-or-toggle
// press decision.
@MainActor
final class HistoryStoreTests: XCTestCase {

    private var fileURL: URL!

    override func setUp() {
        super.setUp()
        fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("history-tests-\(UUID().uuidString).json")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: fileURL)
        super.tearDown()
    }

    func testAddPersistsAcrossInstances() {
        let store = HistoryStore(fileURL: fileURL)
        store.add(text: "hello from the test", model: "whisper-large-v3-turbo")
        let reborn = HistoryStore(fileURL: fileURL)
        XCTAssertEqual(reborn.items.count, 1)
        XCTAssertEqual(reborn.items.first?.text, "hello from the test")
        XCTAssertEqual(reborn.items.first?.words, 4)
    }

    func testCapAtTwoHundred() {
        let store = HistoryStore(fileURL: fileURL)
        for i in 0..<210 {
            store.add(text: "take \(i)", model: "m")
        }
        XCTAssertEqual(store.items.count, HistoryStore.cap)
        XCTAssertEqual(store.items.first?.text, "take 209", "newest first")
        XCTAssertEqual(store.items.last?.text, "take 10", "oldest beyond the cap dropped")
    }

    func testDeleteRemovesAndPersists() {
        let store = HistoryStore(fileURL: fileURL)
        let record = store.add(text: "delete me", model: "m")
        store.add(text: "keep me", model: "m")
        store.delete(id: record.id)
        XCTAssertEqual(HistoryStore(fileURL: fileURL).items.map(\.text), ["keep me"])
    }

    func testHoldVersusToggleDecision() {
        // Releasing a long press stops the take; releasing a quick tap
        // leaves it running for the next tap to stop.
        XCTAssertTrue(DictationController.releaseStops(afterPressOf: 0.5))
        XCTAssertTrue(DictationController.releaseStops(afterPressOf: 0.35))
        XCTAssertFalse(DictationController.releaseStops(afterPressOf: 0.2))
    }
}
