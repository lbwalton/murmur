import SwiftUI

// The screen the keyboard bounces into: already recording when it appears,
// live waveform, one big stop control, then the swipe-back hint. Amber
// while live, red only on the stop control and errors.
struct BounceView: View {
    let session: String
    let onDone: () -> Void

    @EnvironmentObject private var store: SettingsStore
    @EnvironmentObject private var history: HistoryStore
    @StateObject private var controller = BounceController()

    private static let spec = try? FormatSpec.load()

    var body: some View {
        ZStack {
            NightStudio.ink.ignoresSafeArea()
            VStack(spacing: 26) {
                Spacer()
                waveform
                    .frame(height: 64)
                    .padding(.horizontal, 40)
                Text(statusLine)
                    .font(NightStudio.mono(12))
                    .kerning(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(statusColor)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 30)
                    .accessibilityLabel("Status: \(statusLine)")
                mainControl
                if case .finished = controller.phase {
                    Button("Done") { onDone() }
                        .buttonStyle(.bordered)
                        .tint(NightStudio.text.opacity(0.6))
                        .accessibilityLabel("Close and return to Murmur home")
                }
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            controller.begin(session: session, settings: store.pipelineSettings,
                             spec: Self.spec, history: history)
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
        case .starting, .recording:
            Button {
                controller.stop(session: session, settings: store.pipelineSettings,
                                spec: Self.spec, history: history)
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
        case .starting: return "starting"
        case .recording: return "listening. tap to stop."
        case .processing: return "processing"
        case .finished(let ok, let message):
            return ok
                ? "done. swipe back to where you were typing."
                : "\(message) swipe back to return."
        }
    }

    private var statusColor: Color {
        switch controller.phase {
        case .recording: return NightStudio.amber
        case .finished(let ok, _): return ok ? NightStudio.text.opacity(0.75) : NightStudio.red
        default: return NightStudio.text.opacity(0.55)
        }
    }
}
