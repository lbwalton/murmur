// SPDX-License-Identifier: GPL-3.0-only
// What the session's Live Activity draws (ios/prd.json IOS-016): the clean
// pill, Ready or Recording, the time left, and End, all still. One whose
// end time passed with murmur no longer running says Ended, with no clock.
import AppIntents
import SwiftUI

/// The Lock Screen: the pill, Ready or Recording, the time left, and End.
struct LockScreenSession: View {
    let state: SessionActivity.ContentState
    var stale = false

    var body: some View {
        HStack(spacing: 14) {
            PillMark(recording: state.recording, stale: stale, labeled: false)
                .frame(width: 84, height: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(SessionActivityCopy.title)
                    .font(.caption)
                    .foregroundStyle(Tokens.brand)
                StateLine(recording: state.recording, stale: stale)
                    .font(.headline)
            }
            Spacer(minLength: 8)
            if !stale {
                TimeLeft(until: state.until)
            }
            EndButton()
        }
        .padding(16)
    }
}

/// Ready, Recording, or Ended, on one line.
struct StateLine: View {
    let recording: Bool
    let stale: Bool

    var body: some View {
        Text(SessionActivityCopy.state(recording, stale: stale))
            .foregroundStyle(stale ? Tokens.textDim : recording ? Tokens.amber : Tokens.text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }
}

/// The clean drawn pill, never brushed at this size, as a still voice
/// shape: in amber while Recording (a live state), quiet grey while Ready,
/// fainter once Ended, so it reads even in the Dynamic Island's smallest
/// spot. Where the state is written beside it, VoiceOver skips it.
struct PillMark: View {
    let recording: Bool
    var stale = false
    var labeled = true

    var body: some View {
        Canvas { context, size in
            context.withCGContext { cg in
                let frame = PillFrame(style: .bars, stage: .recording, levels: Pill.stillLevels, time: 0, still: true)
                Pill.paint(frame, in: CGRect(origin: .zero, size: size), context: cg)
            }
        }
        .saturation(recording && !stale ? 1 : 0)
        .opacity(stale ? 0.3 : recording ? 1 : 0.6)
        .accessibilityLabel(SessionActivityCopy.state(recording, stale: stale))
        .accessibilityHidden(!labeled)
    }
}

/// The time left in the session, counted down by iOS itself, on one line.
struct TimeLeft: View {
    let until: Date
    /// The Dynamic Island's compact spot, where room is tight.
    var compact = false

    var body: some View {
        Text(timerInterval: Date.now...max(until, .now), countsDown: true)
            .font(.system(compact ? .caption : .body, design: .monospaced))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(Tokens.textDim)
            .multilineTextAlignment(.trailing)
            .accessibilityLabel(SessionActivityCopy.timeLeft)
            .accessibilityValue(Text(timerInterval: Date.now...max(until, .now), countsDown: true))
    }
}

struct EndButton: View {
    var body: some View {
        Button(intent: EndSessionIntent()) {
            Text(SessionActivityCopy.end)
                .font(.subheadline.weight(.semibold))
                .frame(minWidth: 44, minHeight: 44)
        }
        .tint(Tokens.brand)
        .accessibilityLabel(SessionWidgetCopy.endLabel)
    }
}

enum SessionWidgetCopy {
    static let control = "Start murmur"
    static let controlDescription = "Starts a session, so a tap on the murmur keyboard's pill starts a take at once."
    static let endLabel = "End the murmur session"
    static let noteControl = "New note"
    static let noteControlDescription = "Opens murmur listening for a note, kept in today's inbox instead of typed."
}
