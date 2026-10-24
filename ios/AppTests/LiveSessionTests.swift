// SPDX-License-Identifier: GPL-3.0-only
import ActivityKit
import Foundation
import Testing
@testable import murmur

/// The session's Live Activity against ActivityKit itself (IOS-016): one at
/// a time, a leftover taken over, a stale one updated in place, and End
/// taking it down even with no session to end.
@MainActor @Suite(.serialized) struct LiveSessionTests {
    let soon = SessionActivity.ContentState(recording: false, until: .now.addingTimeInterval(600))

    var open: [Activity<SessionActivity>] {
        Activity<SessionActivity>.activities.filter { LiveSession.isOpen($0.activityState) }
    }

    func endAll() async {
        for activity in Activity<SessionActivity>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// A presenter of its own, logging to a scratch log.
    func live() -> LiveSession {
        LiveSession(log: scratchLog(), keepAlive: { {} })
    }

    /// Activities left open by a murmur that closed are taken over: the
    /// session shows one, never a second beside them.
    @Test func aLeftoverActivityIsTakenOverNotDoubled() async throws {
        await endAll()
        defer { Task { await endAll() } }
        let left = try Activity.request(attributes: SessionActivity(), content: ActivityContent(state: soon, staleDate: soon.until))
        let other = try Activity.request(attributes: SessionActivity(), content: ActivityContent(state: soon, staleDate: soon.until))
        let live = live()
        live.show(SessionActivity.ContentState(recording: true, until: .now.addingTimeInterval(900)))
        await live.settle()
        #expect(open.count == 1)
        #expect([left.id, other.id].contains(live.activityID ?? ""))
        // ActivityKit's list catches up with an update a moment later.
        for _ in 0..<50 where open.first?.content.state.recording != true {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(open.first?.content.state.recording == true)
    }

    /// One whose end time passed during a long take is updated in place,
    /// not replaced.
    @Test func aStaleActivityIsUpdatedInPlace() async throws {
        await endAll()
        defer { Task { await endAll() } }
        let live = live()
        live.show(SessionActivity.ContentState(recording: true, until: .now.addingTimeInterval(-60)))
        await live.settle()
        let first = try #require(live.activityID)
        for _ in 0..<100 where open.first?.activityState != .stale {
            try await Task.sleep(for: .milliseconds(30))
        }
        #expect(open.first?.activityState == .stale)
        live.show(soon)
        await live.settle()
        #expect(live.activityID == first)
        #expect(open.count == 1)
    }

    /// End from a Live Activity left over after murmur closed takes it down
    /// before the intent returns, with no session to end.
    @Test func endTakesALeftoverDownWithNoSession() async throws {
        await endAll()
        defer { Task { await endAll() } }
        _ = try Activity.request(attributes: SessionActivity(), content: ActivityContent(state: soon, staleDate: soon.until))
        let saved = (SessionControl.source, SessionControl.live)
        defer { (SessionControl.source, SessionControl.live) = saved }
        SessionControl.source = { nil }
        SessionControl.live = live()
        _ = try await EndSessionIntent().perform()
        #expect(open.isEmpty)
    }
}
