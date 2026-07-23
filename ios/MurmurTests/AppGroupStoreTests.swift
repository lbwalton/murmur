import XCTest
@testable import Murmur

// US-106/US-107: the bounce contract. Results insert exactly once, stale
// sessions expire, and mismatched tokens never leak text into the wrong
// session.
final class AppGroupStoreTests: XCTestCase {

    private let suite = "murmur.tests.appgroup"
    private var defaults: UserDefaults!
    private var store: AppGroupStore!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suite)
        defaults.removePersistentDomain(forName: suite)
        store = AppGroupStore(defaults: defaults)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        super.tearDown()
    }

    func testResultConsumedExactlyOnce() {
        store.beginSession(token: "t1")
        store.writeResult(BounceResult(token: "t1", status: .ok, text: "hello world", createdAt: Date()))
        let first = store.consumeResult(token: "t1")
        XCTAssertEqual(first?.text, "hello world")
        XCTAssertNil(store.consumeResult(token: "t1"), "second read must never double-insert")
        XCTAssertNil(store.pendingSession(), "consumption clears the pending session")
    }

    func testMismatchedTokenReturnsNothing() {
        store.beginSession(token: "t2")
        store.writeResult(BounceResult(token: "other", status: .ok, text: "stray", createdAt: Date()))
        XCTAssertNil(store.consumeResult(token: "t2"))
    }

    func testStaleResultExpires() {
        store.beginSession(token: "t3")
        let old = Date().addingTimeInterval(-AppGroupStore.staleAfter - 1)
        store.writeResult(BounceResult(token: "t3", status: .ok, text: "ancient take", createdAt: old))
        XCTAssertNil(store.consumeResult(token: "t3"), "a two-minute-old take is abandoned, never inserted")
    }

    func testStalePendingSessionExpires() {
        let old = Date().addingTimeInterval(-AppGroupStore.staleAfter - 1)
        store.beginSession(token: "t4", now: old)
        XCTAssertNil(store.pendingSession(), "an abandoned bounce clears itself")
    }

    func testErrorResultCarriesReadableMessage() {
        store.beginSession(token: "t5")
        store.writeResult(BounceResult(token: "t5", status: .error, text: "No speech detected", createdAt: Date()))
        let result = store.consumeResult(token: "t5")
        XCTAssertEqual(result?.status, .error)
        XCTAssertEqual(result?.text, "No speech detected")
    }

    func testBeginSessionClearsPriorResult() {
        store.beginSession(token: "a")
        store.writeResult(BounceResult(token: "a", status: .ok, text: "first", createdAt: Date()))
        store.beginSession(token: "b")
        XCTAssertNil(store.consumeResult(token: "b"), "a new session never sees the old session's text")
    }
}
