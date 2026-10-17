// SPDX-License-Identifier: GPL-3.0-only
// The take screen (ios/prd.json IOS-006): one button to talk, the words
// or Heard nothing or what went wrong, and the takes waiting to retry.
// A quiet stand-in until the pill (IOS-010) and Home (IOS-012) arrive.
import MurmurCore
import SwiftUI
import UIKit

struct TakeScreen: View {
    @State var model: TakeModel

    var body: some View {
        List {
            Section {
                TakeButton(model: model)
            }
            .listRowBackground(Tokens.panel)

            if model.state.hasResult {
                Section {
                    TakeResult(state: model.state)
                }
                .listRowBackground(Tokens.panel)
            }

            if !model.waiting.isEmpty || model.message != nil {
                WaitingSection(model: model)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Dictate")
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.impact(weight: .light), trigger: model.isRecording)
        .onDisappear { model.cancel() }
    }
}

/// Start a take, and stop it: red to record, amber while live.
struct TakeButton: View {
    let model: TakeModel
    /// New note's button starts note takes (IOS-023).
    var purpose: TakeModel.Purpose = .words
    @ScaledMetric(relativeTo: .largeTitle) private var size: CGFloat = 72

    var body: some View {
        Button {
            Task { await model.toggle(as: purpose) }
        } label: {
            VStack(spacing: 12) {
                Image(systemName: model.isRecording ? "stop.circle" : "record.circle")
                    .font(.system(size: size))
                    .foregroundStyle(model.isRecording ? Tokens.amber : Tokens.red)
                    .accessibilityHidden(true)
                status
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.vertical, 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(model.isBusy)
        .opacity(model.isBusy ? 0.5 : 1)
        .accessibilityLabel(model.isRecording ? "Stop the take" : "Start a take")
    }

    @ViewBuilder private var status: some View {
        switch model.state {
        case .recording(let since):
            TimelineView(.periodic(from: since, by: 1)) { context in
                HStack(spacing: 8) {
                    Circle().fill(Tokens.amber).frame(width: 8, height: 8)
                    Text("Recording \(Self.elapsed(since, context.date))").monospacedDigit()
                }
                .font(.headline)
            }
        case .transcribing:
            HStack(spacing: 8) {
                ProgressView()
                Text("Transcribing…")
            }
            .font(.headline)
        default:
            Text("Start a take").font(.headline)
        }
    }

    static func elapsed(_ since: Date, _ now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(since)))
        return "\(seconds / 60):" + String(format: "%02d", seconds % 60)
    }
}

/// What the last take gave: its words, Heard nothing, or what went wrong.
struct TakeResult: View {
    let state: TakeModel.State

    var body: some View {
        switch state {
        case .words(let words):
            Text(words)
                .textSelection(.enabled)
                .announced(words)
            Button("Copy words") { UIPasteboard.general.string = words }
                .buttonStyle(RowAction())
        case .heardNothing(let sent):
            Outcome(title: "Heard nothing", detail: TakeCopy.heardNothing(sent: sent), color: Tokens.textDim, symbol: "waveform.slash")
        case .failed(let failure, let saved):
            Outcome(title: "Not transcribed", detail: "\(TakeCopy.reason(failure)) \(saved ? TakeCopy.remedy(failure) : TakeCopy.lostAudio)", color: Tokens.red, symbol: "xmark.circle")
        case .micOff:
            Outcome(title: "murmur cannot hear you", detail: TakeCopy.micOff, color: Tokens.red, symbol: "mic.slash")
            if let settings = URL(string: UIApplication.openSettingsURLString) {
                Link("Open Settings", destination: settings)
                    .buttonStyle(RowAction())
            }
        case .micFailed:
            Outcome(title: "The microphone did not start", detail: TakeCopy.micFailed, color: Tokens.red, symbol: "mic.slash")
        case .idle, .recording, .transcribing:
            EmptyView()
        }
    }
}

/// A title in its color and the sentence under it, heard by VoiceOver as
/// soon as it lands.
struct Outcome: View {
    let title: String
    let detail: String
    let color: Color
    let symbol: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: symbol)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(color)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Tokens.text)
            }
        }
        .accessibilityElement(children: .combine)
        .announced("\(title). \(detail)")
    }
}

extension View {
    /// VoiceOver hears the words as soon as they appear.
    func announced(_ words: String) -> some View {
        onAppear { AccessibilityNotification.Announcement(words).post() }
    }
}

/// Takes waiting to retry: Retry, Retry all, and Discard, which asks
/// delete audio? in red before it deletes.
struct WaitingSection: View {
    let model: TakeModel

    var body: some View {
        Section {
            if let message = model.message {
                Text(message)
                    .font(.subheadline)
                    .announced(message)
            }
            if model.waiting.count > 1 {
                Button(model.retrying.count > 1 ? "Retrying…" : "Retry all") {
                    Task { await model.retry(model.waiting.map(\.id)) }
                }
                .buttonStyle(RowAction())
                .disabled(model.isBusy || model.isRecording)
            }
            ForEach(model.waiting) { take in
                WaitingRow(take: take, model: model)
            }
        } header: {
            SectionTitle("Waiting to retry")
        } footer: {
            if !model.waiting.isEmpty {
                Text(TakeCopy.waitingIntro).foregroundStyle(Tokens.textDim)
            }
        }
        .listRowBackground(Tokens.panel)
    }
}

struct WaitingRow: View {
    let take: WaitingTake
    let model: TakeModel
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(TakeCopy.when(take)).font(.subheadline.weight(.semibold))
                Text(TakeCopy.reason(take.failure)).font(.subheadline).foregroundStyle(Tokens.textDim)
            }
            .accessibilityElement(children: .combine)
            // At accessibility sizes the two actions stack, so neither clips.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    retry
                    discard
                }
            } else {
                HStack {
                    retry
                    Spacer()
                    discard
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var retry: some View {
        Button(model.retrying.contains(take.id) ? "Retrying…" : "Retry") {
            Task { await model.retry([take.id]) }
        }
        .buttonStyle(InlineAction(color: Tokens.brand))
        .disabled(model.isBusy || model.isRecording)
    }

    private var discard: some View {
        let armed = model.armed == take.id
        return Button(armed ? "Delete audio?" : "Discard") { model.discard(take.id) }
            .buttonStyle(InlineAction(color: armed ? Tokens.red : Tokens.textDim))
            .disabled(model.isBusy)
            .accessibilityHint(armed ? "Tap again to delete this recording." : "")
    }
}

/// A short action that shares its row with another, so each keeps its
/// own tap target of at least 44 points.
struct InlineAction: ButtonStyle {
    let color: Color
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isEnabled ? color : Tokens.textDim)
            .opacity(configuration.isPressed ? 0.6 : 1)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

extension TakeModel {
    private static var shared: TakeModel?

    /// The real screen's model: the device microphone, today's provider
    /// and key, and a session that keeps no cookies or cache. There is one
    /// for the app's life, so a take still transcribing when you leave
    /// Dictate is there when you come back, and two visits never retry
    /// the same take at once.
    static func live() -> TakeModel? {
        if let shared { return shared }
        guard let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules() else { return nil }
        let session = URLSession(configuration: .ephemeral)
        let model = TakeModel(
            microphone: DeviceMicrophone.shared, store: .standard, rules: rules, catalog: catalog,
            connections: ConnectionStore(), cleanup: CleanupStore(), ring: KeychainKeyRing(), send: { try await session.data(for: $0) },
            copy: { UIPasteboard.general.string = $0 }, keepAlive: BackgroundTime.hold,
            record: { History.live().add($0) },
            note: { ActivityLog.standard.write($0) },
            keepNote: { Notes.live()?.save($0, at: $1) }
        )
        shared = model
        return model
    }
}

/// Background time from iOS, so a take's words land even when nothing else
/// keeps murmur running: the session that held the microphone has just
/// ended, or you left murmur mid take.
@MainActor final class BackgroundTime {
    private var id = UIBackgroundTaskIdentifier.invalid

    private init() {
        id = UIApplication.shared.beginBackgroundTask(withName: "murmur take") { [weak self] in
            MainActor.assumeIsolated { self?.end() }
        }
    }

    /// Holds background time until the returned closure runs.
    static func hold() -> @MainActor () -> Void {
        let time = BackgroundTime()
        return { time.end() }
    }

    private func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}

/// Opens the take screen, built once the shared rules are read.
struct TakeRoute: View {
    var make: @MainActor () -> TakeModel? = { TakeModel.live() }
    @State private var model: TakeModel?
    @State private var failed = false

    var body: some View {
        Group {
            if let model {
                TakeScreen(model: model)
            } else if failed {
                Note(text: "murmur could not read its rules. Reinstall murmur to fix it.", color: Tokens.red, symbol: "exclamationmark.triangle")
                    .padding()
            } else {
                // The ground until the model is built: a Group with nothing in
                // it never runs its task, and the screen would stay blank.
                Tokens.ink.ignoresSafeArea()
            }
        }
        .task {
            guard model == nil else { return }
            model = make()
            failed = model == nil
        }
    }
}

#if DEBUG
#Preview("Ready") { TakePreview(.ready) }
#Preview("Recording") { TakePreview(.recording) }
#Preview("Words") { TakePreview(.words) }
#Preview("Heard nothing") { TakePreview(.silence) }
#Preview("Provider heard silence") { TakePreview(.inventedPhrase) }
#Preview("Failed and waiting") { TakePreview(.failed) }
#Preview("Delete audio?") { TakePreview(.armed) }
#Preview("No microphone") { TakePreview(.micOff) }

/// The take screen in one of its states, driven by a scripted microphone
/// and a stand-in provider, so nothing records or leaves the Mac.
struct TakePreview: View {
    enum Scene { case ready, recording, words, silence, inventedPhrase, failed, armed, micOff }

    let scene: Scene
    @State private var model: TakeModel?

    init(_ scene: Scene) { self.scene = scene }

    var body: some View {
        NavigationStack {
            if let model { TakeScreen(model: model) }
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task { model = await Self.model(for: scene) }
    }

    static func model(for scene: Scene) async -> TakeModel? {
        guard let rules = try? BundledRules.takeRules(), let catalog = try? BundledRules.catalog(),
              let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate),
              let defaults = UserDefaults(suiteName: "murmur.previews.\(UUID().uuidString)")
        else { return nil }
        let microphone = ScriptedMicrophone(samples: scene == .silence ? ScriptedMicrophone.silence : ScriptedMicrophone.tone)
        microphone.allowed = scene != .micOff
        let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "murmur-previews-\(UUID().uuidString)", directoryHint: .isDirectory))
        if scene == .failed || scene == .armed {
            _ = try? store.save(wav, startedAt: .now.addingTimeInterval(-600), failure: TakeFailure(kind: "timeout", detail: "no response in 30 s"), now: .now.addingTimeInterval(-590))
            _ = try? store.save(wav, startedAt: .now.addingTimeInterval(-300), failure: .noKey, now: .now.addingTimeInterval(-290))
        }
        let ring = MemoryKeyRing()
        if let key = APIKey("gsk_previewpreview1234") { try? ring.save(key, for: "https://api.groq.com/openai/v1") }
        let status = scene == .failed ? 503 : 200
        let words = scene == .inventedPhrase ? "Thank you." : "Send the invoice to Dana tomorrow morning, and copy the team on the thread."
        let model = TakeModel(
            microphone: microphone, store: store, rules: rules, catalog: catalog, connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: { request in
                let body = Data(#"{"text":"\#(words)"}"#.utf8)
                return (body, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            },
            copy: { _ in }
        )
        switch scene {
        case .words, .silence, .inventedPhrase, .failed:
            await model.start()
            await model.stop()
        case .recording, .micOff:
            await model.start()
        case .armed:
            if let id = model.waiting.first?.id { model.discard(id) }
        case .ready:
            break
        }
        return model
    }
}
#endif
