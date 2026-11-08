// SPDX-License-Identifier: GPL-3.0-only
// The session's Live Activity on the Lock Screen and in the Dynamic Island
// (ios/prd.json IOS-016), shown while a session runs.
import ActivityKit
import Foundation

/// The session's Live Activity: one at a time, shown while the session is
/// on, updated when a take starts or ends, and ended with the session.
/// Updates run in order, the newest state winning. Only the activity's id
/// is kept here; ActivityKit's own list holds the activity. One left over
/// from a murmur that closed is taken over, never shown twice, and one gone
/// stale (its end time passed during a long take) is updated in place.
@MainActor final class LiveSession {
    static let shared = LiveSession()

    private(set) var activityID: String?
    private var latest: SessionActivity.ContentState?
    private var running: Task<Void, Never>?
    private let log: ActivityLog?
    /// Holds background time while an update runs, so iOS does not suspend
    /// murmur between a session ending and its Live Activity going.
    private let keepAlive: @MainActor () -> @MainActor () -> Void

    init(log: ActivityLog? = .standard, keepAlive: @escaping @MainActor () -> @MainActor () -> Void = BackgroundTime.hold) {
        self.log = log
        self.keepAlive = keepAlive
    }

    /// Shows the session's state, or ends the Live Activity when it is off.
    func show(_ state: SessionActivity.ContentState?) {
        latest = state
        guard running == nil else { return }
        let release = keepAlive()
        running = Task {
            await drain()
            release()
        }
    }

    /// Waits until every update asked for so far has run.
    func settle() async {
        while let running { await running.value }
    }

    /// Whether this session's Live Activity is up now.
    var isShowing: Bool {
        guard let activityID else { return false }
        return Activity<SessionActivity>.activities.contains { $0.id == activityID && Self.isOpen($0.activityState) }
    }

    private func drain() async {
        while true {
            let want = latest
            await apply(want)
            if latest == want { break }
        }
        running = nil
    }

    private func apply(_ state: SessionActivity.ContentState?) async {
        guard let state else {
            await Self.endAll()
            activityID = nil
            return
        }
        activityID = await Self.present(state, over: activityID)
        if activityID == nil { log?.write(.liveActivityRefused) }
    }

    /// Not ended or dismissed: still on screen, stale or not.
    nonisolated static func isOpen(_ state: ActivityState) -> Bool {
        state != .ended && state != .dismissed
    }

    /// Updates this session's activity, or takes over one left open, ending
    /// any others; starts one only when none is open. Its id, or nil when
    /// iOS would not start one.
    private nonisolated static func present(_ state: SessionActivity.ContentState, over id: String?) async -> String? {
        let content = ActivityContent(state: state, staleDate: state.until)
        let open = Activity<SessionActivity>.activities.filter { isOpen($0.activityState) }
        let keep = open.first { $0.id == id } ?? open.first
        for extra in open where extra.id != keep?.id {
            await extra.end(nil, dismissalPolicy: .immediate)
        }
        if let keep {
            await keep.update(content)
            return keep.id
        }
        return (try? Activity.request(attributes: SessionActivity(), content: content))?.id
    }

    private nonisolated static func endAll() async {
        for open in Activity<SessionActivity>.activities {
            await open.end(nil, dismissalPolicy: .immediate)
        }
    }
}
