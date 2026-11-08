// SPDX-License-Identifier: GPL-3.0-only
// murmur's widget extension (ios/prd.json IOS-016): the Start murmur
// control for Control Center, the Lock Screen, and the Action Button, and
// the session's Live Activity on the Lock Screen and in the Dynamic Island.
// The Live Activity shows still states, Ready or Recording, the time left,
// and End; iOS redraws it only now and then, so it never follows the voice.
import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct MurmurWidgets: WidgetBundle {
    var body: some Widget {
        SessionControlWidget()
        NoteControlWidget()
        SessionLiveActivity()
    }
}

/// One tap starts a session without opening murmur.
struct SessionControlWidget: ControlWidget {
    static let kind = "session"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StartSessionIntent()) {
                Label(SessionWidgetCopy.control, systemImage: "waveform")
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: SessionWidgetCopy.control))
        .description(LocalizedStringResource(stringLiteral: SessionWidgetCopy.controlDescription))
    }
}

/// One tap opens murmur on New note, listening (IOS-023).
struct NoteControlWidget: ControlWidget {
    static let kind = "note"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: NewNoteIntent()) {
                Label(SessionWidgetCopy.noteControl, systemImage: "square.and.pencil")
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: SessionWidgetCopy.noteControl))
        .description(LocalizedStringResource(stringLiteral: SessionWidgetCopy.noteControlDescription))
    }
}

struct SessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SessionActivity.self) { context in
            LockScreenSession(state: context.state, stale: context.isStale)
                .activityBackgroundTint(Tokens.ink)
                .activitySystemActionForegroundColor(Tokens.text)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    PillMark(recording: context.state.recording, stale: context.isStale, labeled: false)
                        .frame(width: 72, height: 28)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if !context.isStale {
                        TimeLeft(until: context.state.until)
                            .padding(.trailing, 4)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    StateLine(recording: context.state.recording, stale: context.isStale)
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    EndButton()
                }
            } compactLeading: {
                PillMark(recording: context.state.recording, stale: context.isStale)
                    .frame(width: 30, height: 14)
            } compactTrailing: {
                if context.isStale {
                    StateLine(recording: false, stale: true)
                        .font(.caption)
                        .frame(width: 42)
                } else {
                    TimeLeft(until: context.state.until, compact: true)
                        .frame(width: 42)
                }
            } minimal: {
                PillMark(recording: context.state.recording, stale: context.isStale)
                    .frame(width: 22, height: 12)
            }
            .keylineTint(Tokens.brand)
        }
    }
}

#if DEBUG
extension SessionActivity.ContentState {
    static let previewReady = Self(recording: false, until: .now.addingTimeInterval(14 * 60))
    static let previewRecording = Self(recording: true, until: .now.addingTimeInterval(14 * 60))
}

#Preview("Lock Screen", as: .content, using: SessionActivity()) {
    SessionLiveActivity()
} contentStates: {
    SessionActivity.ContentState.previewReady
    SessionActivity.ContentState.previewRecording
}

#Preview("Expanded", as: .dynamicIsland(.expanded), using: SessionActivity()) {
    SessionLiveActivity()
} contentStates: {
    SessionActivity.ContentState.previewReady
    SessionActivity.ContentState.previewRecording
}

#Preview("Compact", as: .dynamicIsland(.compact), using: SessionActivity()) {
    SessionLiveActivity()
} contentStates: {
    SessionActivity.ContentState.previewReady
    SessionActivity.ContentState.previewRecording
}

#Preview("Minimal", as: .dynamicIsland(.minimal), using: SessionActivity()) {
    SessionLiveActivity()
} contentStates: {
    SessionActivity.ContentState.previewReady
    SessionActivity.ContentState.previewRecording
}
#endif
