import XCTest
@testable import Murmur

// US-112: the App Group channel the keyboard and app talk over. The audio and
// background behavior are device-only, but the protocol (warm-window expiry,
// consume-once commands, stale rejection) is pure and pinned here.
final class HotMicChannelTests: XCTestCase {

    private let suite = "hotmic.tests"
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

    func testMissingStateReadsCold() {
        XCTAssertEqual(store.readHotState().phase, .cold)
    }

    func testWarmStateRoundTrips() {
        store.writeHotState(HotState(phase: .warm, warmUntil: Date().addingTimeInterval(90)))
        XCTAssertEqual(store.readHotState().phase, .warm)
    }

    // The keyboard must never try to record in place against a lapsed window.
    func testExpiredWarmReadsCold() {
        store.writeHotState(HotState(phase: .warm, warmUntil: Date().addingTimeInterval(-1)))
        XCTAssertEqual(store.readHotState().phase, .cold)
    }

    // A take in flight with a live window survives, whatever its phase.
    func testListeningWithLiveWindowSurvives() {
        store.writeHotState(HotState(phase: .listening, warmUntil: Date().addingTimeInterval(30)))
        XCTAssertEqual(store.readHotState().phase, .listening)
    }

    func testCommandIsConsumedOnce() {
        store.writeCommand(HotCommand(action: .start, token: "t1", createdAt: Date()))
        XCTAssertEqual(store.consumeCommand()?.action, .start)
        XCTAssertEqual(store.consumeCommand()?.token, nil, "a command must fire exactly once")
    }

    // A command left over from a crash must not fire late.
    func testStaleCommandIgnored() {
        store.writeCommand(HotCommand(action: .start, token: "old", createdAt: Date().addingTimeInterval(-200)))
        XCTAssertNil(store.consumeCommand())
    }

    // US-115: the take token rides the state so the keyboard can tell a live
    // confirmation of ITS take from a stale claim left by a dead app.
    func testTakeTokenRoundTrips() {
        store.writeHotState(HotState(phase: .listening,
                                     warmUntil: Date().addingTimeInterval(30),
                                     takeToken: "t42"))
        XCTAssertEqual(store.readHotState().takeToken, "t42")
    }

    // The app before takeToken existed wrote this shape; it must still decode.
    func testStateWrittenWithoutTokenReadsNil() {
        let legacy = Data(#"{"phase":"warm"}"#.utf8)
        defaults.set(legacy, forKey: AppGroupStore.hotStateKey)
        let state = store.readHotState()
        XCTAssertEqual(state.phase, .warm)
        XCTAssertNil(state.takeToken)
    }

    // The keyboard's watchdog corrects a warm claim nobody is backing (the app
    // was killed or suspended); the forced cold must win over the stale entry
    // so the next mic tap bounces instead of dead-ending in place.
    func testForcedColdOverridesStaleWarmClaim() {
        store.writeHotState(HotState(phase: .listening,
                                     warmUntil: Date().addingTimeInterval(60),
                                     takeToken: "dead"))
        store.writeHotState(.cold)
        XCTAssertEqual(store.readHotState().phase, .cold)
        XCTAssertNil(store.readHotState().takeToken)
    }
}
