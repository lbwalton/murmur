import SwiftUI

// The Action Button take: same instant-recording engine as the keyboard
// bounce, but the destination is the clipboard and Shortcuts. Confirmation
// stays on screen briefly so the copy is visible even without the dialog.
struct IntentDictationView: View {
    @EnvironmentObject private var store: SettingsStore
    @EnvironmentObject private var history: HistoryStore
    @ObservedObject private var broker = IntentDictationBroker.shared
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
                if case .recording = controller.phase {
                    stopButton
                } else if case .starting = controller.phase {
                    stopButton
                } else if case .processing = controller.phase {
                    ProgressView().tint(NightStudio.text)
                }
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            controller.begin(settings: store.pipelineSettings, spec: Self.spec, history: history) { ok, text in
                IntentDictationBroker.shared.complete(ok: ok, text: text)
            }
        }
        // Shortcuts must never hang: any dismissal resumes the intent.
        // A no-op when the take already completed (continuation is nil).
        .onDisappear {
            IntentDictationBroker.shared.complete(ok: false, text: "Dictation was dismissed.")
        }
    }

    private var stopButton: some View {
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

    private var statusLine: String {
        switch controller.phase {
        case .starting: return "starting"
        case .recording: return "listening. tap to stop."
        case .processing: return "processing"
        case .finished(let ok, let message):
            return ok ? "copied to your clipboard" : message
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
