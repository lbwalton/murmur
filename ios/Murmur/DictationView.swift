import SwiftUI

// The in-app dictation surface: the live waveform pill (the signature),
// the big hold-to-talk button, the result card, and history. Amber lights
// only while recording; processing and done states stay warm and quiet.
struct DictationView: View {
    @EnvironmentObject private var store: SettingsStore
    @EnvironmentObject private var history: HistoryStore
    @StateObject private var controller = DictationController()
    @State private var pressed = false
    @State private var copiedId: UUID?
    @State private var editing: DictationRecord?
    @State private var editText = ""

    private static let spec = try? FormatSpec.load()

    var body: some View {
        VStack(spacing: 0) {
            waveform
                .frame(height: 56)
                .padding(.horizontal, 40)
                .padding(.top, 28)

            Text(statusLine)
                .font(NightStudio.mono(12))
                .kerning(1.2)
                .textCase(.uppercase)
                .foregroundStyle(statusColor)
                .padding(.top, 18)
                .accessibilityLabel("Status: \(statusLine)")

            talkButton
                .padding(.top, 26)

            resultCard
                .padding(.horizontal, 20)
                .padding(.top, 22)

            historyList
                .padding(.top, 26)

            Spacer(minLength: 0)
        }
        // Editing a take teaches the correction loop (US-109): the diff
        // between what was heard and the fix becomes a learned pair.
        .sheet(item: $editing) { record in
            NavigationStack {
                TextEditor(text: $editText)
                    .scrollContentBackground(.hidden)
                    .background(NightStudio.ink)
                    .foregroundStyle(NightStudio.text)
                    .padding(12)
                    .navigationTitle("Fix this take")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { editing = nil }
                                .accessibilityLabel("Cancel editing")
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Save") {
                                let fixed = editText.trimmingCharacters(in: .whitespacesAndNewlines)
                                if !fixed.isEmpty, fixed != record.text {
                                    store.learnCorrection(oldText: record.text, newText: fixed)
                                    history.update(id: record.id, text: fixed)
                                }
                                editing = nil
                            }
                            .accessibilityLabel("Save the fix and learn from it")
                        }
                    }
            }
            .preferredColorScheme(.dark)
        }
    }

    // --------------------------------------------------------- waveform

    private var waveform: some View {
        HStack(alignment: .center, spacing: 3) {
            ForEach(Array(controller.levels.enumerated()), id: \.offset) { _, level in
                Capsule()
                    .fill(controller.isRecording ? NightStudio.amber : NightStudio.text.opacity(0.28))
                    .frame(width: 3, height: max(3, CGFloat(level) * 56))
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.linear(duration: 0.05), value: controller.levels)
        .accessibilityHidden(true)
    }

    // ------------------------------------------------------ talk button

    private var talkButton: some View {
        ZStack {
            Circle()
                .stroke(controller.isRecording ? NightStudio.amber : NightStudio.text.opacity(0.25),
                        lineWidth: 2.5)
                .frame(width: 104, height: 104)
            Circle()
                .fill(NightStudio.panel)
                .frame(width: 92, height: 92)
            Image(systemName: controller.isRecording ? "waveform" : "mic.fill")
                .font(.system(size: 30, weight: .medium))
                .foregroundStyle(controller.isRecording ? NightStudio.amber : NightStudio.text)
        }
        .scaleEffect(pressed || controller.isRecording ? 1.05 : 1.0)
        .animation(.spring(duration: 0.25), value: controller.isRecording)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !pressed else { return }
                    pressed = true
                    controller.pressBegan(settings: store.pipelineSettings, spec: Self.spec, history: history)
                }
                .onEnded { _ in
                    pressed = false
                    controller.pressEnded(settings: store.pipelineSettings, spec: Self.spec, history: history)
                }
        )
        .accessibilityLabel("Talk button")
        .accessibilityHint("Hold to dictate and release to finish, or tap to start a long take and tap again to stop.")
    }

    // ------------------------------------------------------ result card

    @ViewBuilder
    private var resultCard: some View {
        switch controller.phase {
        case .done(let text):
            card {
                Text(text)
                    .foregroundStyle(NightStudio.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 18) {
                    Button {
                        UIPasteboard.general.string = text
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                    }
                    .accessibilityLabel("Copy the dictation")
                    ShareLink(item: text) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share the dictation")
                    Spacer()
                    dismissButton
                }
                .font(.callout.weight(.medium))
                .foregroundStyle(NightStudio.text.opacity(0.85))
            }
        case .error(let message):
            card {
                HStack(alignment: .firstTextBaseline) {
                    Text(message)
                        .foregroundStyle(NightStudio.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    dismissButton
                }
            }
        default:
            EmptyView()
        }
    }

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14, content: content)
            .padding(16)
            .background(NightStudio.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var dismissButton: some View {
        Button {
            controller.dismissResult()
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(NightStudio.text.opacity(0.5))
        }
        .accessibilityLabel("Dismiss")
    }

    // ---------------------------------------------------------- history

    @ViewBuilder
    private var historyList: some View {
        if store.historyEnabled && !history.items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("HISTORY")
                    .font(NightStudio.mono(11))
                    .kerning(1.2)
                    .foregroundStyle(NightStudio.text.opacity(0.45))
                    .padding(.horizontal, 22)
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(history.items) { item in
                            historyRow(item)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
    }

    private func historyRow(_ item: DictationRecord) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.text)
                    .lineLimit(2)
                    .font(.subheadline)
                    .foregroundStyle(NightStudio.text.opacity(0.9))
                Text("\(item.words)W \(item.date.formatted(.relative(presentation: .named)))")
                    .font(NightStudio.mono(10))
                    .textCase(.uppercase)
                    .foregroundStyle(NightStudio.text.opacity(0.4))
            }
            Spacer()
            Button {
                editing = item
                editText = item.text
            } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 14))
                    .foregroundStyle(NightStudio.text.opacity(0.6))
            }
            .accessibilityLabel("Edit this dictation and teach Murmur the fix")
            Button {
                UIPasteboard.general.string = item.text
                copiedId = item.id
            } label: {
                Image(systemName: copiedId == item.id ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 14))
                    .foregroundStyle(NightStudio.text.opacity(0.6))
            }
            .accessibilityLabel("Copy this dictation")
            Button {
                history.delete(id: item.id)
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14))
                    .foregroundStyle(NightStudio.text.opacity(0.45))
            }
            .accessibilityLabel("Delete this dictation")
        }
        .padding(12)
        .background(NightStudio.panel.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // ------------------------------------------------------------ state

    private var statusLine: String {
        switch controller.phase {
        case .idle: return "hold to talk, tap for a long take"
        case .recording: return "listening"
        case .processing: return "processing"
        case .done: return "done"
        case .error: return "error"
        }
    }

    private var statusColor: Color {
        switch controller.phase {
        case .recording: return NightStudio.amber
        case .error: return NightStudio.red
        default: return NightStudio.text.opacity(0.55)
        }
    }
}
