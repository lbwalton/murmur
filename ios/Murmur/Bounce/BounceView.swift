import SwiftUI

// The screen the keyboard bounces into: already recording when it appears,
// live waveform, one big stop control. When the take finishes, the transcript
// is already waiting in the App Group for the keyboard, so the finished state
// is a single job: get the user back to where they were typing. iOS 26.4+
// removed automatic return (Apple platform change, not ours), so the finished
// state is a hard-to-miss swipe guide: a glowing amber sweep travelling right
// through three chevrons, the direction of the gesture made literal.
struct BounceView: View {
    let session: String
    let onDone: () -> Void

    @ObservedObject private var controller = HotMicManager.shared

    var body: some View {
        ZStack {
            NightStudio.ink.ignoresSafeArea()
            content
                .padding(.horizontal, 30)
        }
        .preferredColorScheme(.dark)
        .onAppear {
            // The first (cold) dictation runs here in the app and leaves the
            // mic warm, so the swipe back lands on a hot mic and every later
            // take happens in place. HotMicManager writes the result to the
            // App Group itself, for the keyboard to insert.
            controller.beginForegroundTake(token: session) { _, _ in }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch controller.phase {
        case .idle, .starting, .recording, .processing:
            activeState
        case .finished(let ok, let message):
            if ok {
                VStack(spacing: 0) {
                    Spacer()
                    SwipeBackGuide(headline: "TEXT READY")
                }
            } else {
                errorState(message)
            }
        }
    }

    // -------------------------------------------------------- recording

    private var activeState: some View {
        VStack(spacing: 26) {
            Spacer()
            waveform
                .frame(height: 64)
                .padding(.horizontal, 10)
            Text(statusLine)
                .font(NightStudio.mono(12))
                .kerning(1.2)
                .textCase(.uppercase)
                .foregroundStyle(statusColor)
                .multilineTextAlignment(.center)
                .accessibilityLabel("Status: \(statusLine)")
            mainControl
            Spacer()
        }
    }

    // A failed take still leaves the user in Murmur, so it needs the same
    // swipe guidance, in red, with the readable reason above it.
    private func errorState(_ message: String) -> some View {
        VStack(spacing: 0) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 28))
                .foregroundStyle(NightStudio.red)
                .padding(.bottom, 14)
            Text(message)
                .font(NightStudio.mono(13))
                .foregroundStyle(NightStudio.red)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 30)
            SwipeBackGuide(headline: nil, tint: NightStudio.red)
        }
    }

    private var waveform: some View {
        HStack(alignment: .center, spacing: 3) {
            ForEach(Array(controller.levels.enumerated()), id: \.offset) { _, level in
                Capsule()
                    .fill(controller.phase == .recording ? NightStudio.amber : NightStudio.text.opacity(0.28))
                    .frame(width: 3, height: max(3, CGFloat(level) * 64))
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.linear(duration: 0.05), value: controller.levels)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var mainControl: some View {
        switch controller.phase {
        case .idle, .starting, .recording:
            Button {
                controller.stop()
            } label: {
                ZStack {
                    Circle()
                        .stroke(NightStudio.red, lineWidth: 2.5)
                        .frame(width: 96, height: 96)
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(NightStudio.red)
                        .frame(width: 30, height: 30)
                }
            }
            .accessibilityLabel("Stop recording")
        case .processing:
            ProgressView()
                .tint(NightStudio.text)
        case .finished:
            EmptyView()
        }
    }

    private var statusLine: String {
        switch controller.phase {
        case .idle, .starting: return "starting"
        case .recording: return "listening. tap to stop."
        case .processing: return "processing"
        case .finished: return ""
        }
    }

    private var statusColor: Color {
        switch controller.phase {
        case .recording: return NightStudio.amber
        default: return NightStudio.text.opacity(0.55)
        }
    }
}

// The signature: a glowing amber comet, bright at its head and fading to
// nothing at its tail, sweeping left to right through three chevrons so the
// swipe-right gesture is shown, not just described. The comet doubles as a
// mask, so the bright chevrons light only under its head, a wave of light
// travelling right; a blurred amber twin rides behind it for the glow.
// Reduce Motion swaps the whole thing for a lit, static set of chevrons.
private struct SwipeBackGuide: View {
    let headline: String?
    var tint: Color = NightStudio.amber

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sweeping = false

    var body: some View {
        VStack(spacing: 20) {
            if let headline {
                HStack(spacing: 7) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(tint)
                    Text(headline)
                }
                .font(NightStudio.mono(11))
                .kerning(1.6)
                .foregroundStyle(NightStudio.text.opacity(0.65))
            }

            lane
                .frame(height: 54)

            Text("Swipe right along the bottom to go back")
                .font(NightStudio.mono(12))
                .kerning(0.8)
                .textCase(.uppercase)
                .foregroundStyle(NightStudio.text.opacity(0.82))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            // Anchors "the bottom" the sentence points at.
            Capsule()
                .fill(NightStudio.text.opacity(0.28))
                .frame(width: 132, height: 5)
                .padding(.top, 2)
        }
        .padding(.bottom, 10)
        .onAppear { sweeping = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your text is ready. Swipe right along the bottom edge to return to your app.")
    }

    private var lane: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack {
                chevrons(tint.opacity(0.22))
                if reduceMotion {
                    chevrons(tint)
                        .shadow(color: tint.opacity(0.7), radius: 8)
                } else {
                    // The glow twin, behind: an amber streak, soft and low.
                    sweep(width: w, color: tint)
                        .blur(radius: 17)
                        .opacity(0.55)
                    // The bright chevrons, revealed only under the comet head.
                    chevrons(tint)
                        .shadow(color: tint.opacity(0.85), radius: 7)
                        .mask(sweep(width: w, color: .white))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func chevrons(_ color: Color) -> some View {
        HStack(spacing: 14) {
            ForEach(0..<3, id: \.self) { _ in
                Image(systemName: "chevron.right")
                    .font(.system(size: 38, weight: .bold))
                    .foregroundStyle(color)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // A bar whose gradient is nothing at the left (the tail) and full color at
    // the right (the head), swept from off the left edge to off the right.
    private func sweep(width w: CGFloat, color: Color) -> some View {
        let barWidth: CGFloat = 165
        return RoundedRectangle(cornerRadius: 30, style: .continuous)
            .fill(LinearGradient(
                stops: [
                    .init(color: color.opacity(0), location: 0.0),
                    .init(color: color.opacity(0.28), location: 0.62),
                    .init(color: color, location: 1.0),
                ],
                startPoint: .leading, endPoint: .trailing))
            .frame(width: barWidth)
            .frame(maxWidth: .infinity, alignment: .leading)
            .offset(x: sweeping ? w : -barWidth)
            .animation(.easeInOut(duration: 1.7).repeatForever(autoreverses: false), value: sweeping)
    }
}
