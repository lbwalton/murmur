// SPDX-License-Identifier: GPL-3.0-only
// Home (ios/prd.json IOS-012): the session, with Start session and End
// session; what is left of setup; takes waiting to retry; and the newest
// takes with their words, time, and length. Tap a take to copy it;
// deleting one asks first, in red, and Clear all says the real count. The
// Journey row shows the belt this iPhone's takes have earned (IOS-017),
// the painting row today's painting (IOS-019), and Back today the time
// back today against a typical day, with the way to your numbers (IOS-022).
import MurmurCore
import SwiftUI
import UIKit

struct HomeScreen: View {
    let history: History
    let session: Session?
    let model: TakeModel?
    let setup: Setup
    /// The belt ladder; nil only if the app's own files could not be read.
    var journey: JourneyRules? = JourneyRules.live
    /// The painting book; nil only if the app's own files could not be read.
    var paintings: PaintingStore? = PaintingStore.live()
    /// The rates and catalog the numbers use; nil only if the app's own files could not be read.
    var numbers: NumbersRules? = NumbersRules.live
    /// The notes (IOS-023); nil only if the app's own files could not be read.
    var notes: Notes? = Notes.live()
    let resume: (Setup.Step) -> Void
    @State private var copied: UUID?
    @State private var askingClear = false

    var body: some View {
        List {
            if let session {
                SessionCard(session: session)
            }
            if !setup.isFinished {
                SetupChecklist(setup: setup, resume: resume)
            }
            if let model, !model.waiting.isEmpty {
                Section {
                    NavigationLink {
                        TakeRoute()
                    } label: {
                        Label(HomeCopy.waiting(model.waiting.count), systemImage: "arrow.clockwise")
                            .foregroundStyle(Tokens.brand)
                    }
                }
                .listRowBackground(Tokens.panel)
            }
            // Notes sit near the top: an iPhone has no hotkey, so New note
            // is one tap from Home (LaBroi, 2026-10-14).
            if let notes {
                Section {
                    NavigationLink {
                        NoteTakeRoute()
                    } label: {
                        Label(NotesCopy.newNote, systemImage: "square.and.pencil")
                            .foregroundStyle(Tokens.brand)
                    }
                    NavigationLink {
                        NotesScreen(notes: notes)
                    } label: {
                        NotesRow(notes: notes)
                    }
                }
                .listRowBackground(Tokens.panel)
            }
            if let numbers, !history.entries.isEmpty {
                BackToday(history: history, rules: numbers)
            }
            if journey != nil || paintings != nil {
                Section {
                    if let paintings {
                        PaintingRow(store: paintings, history: history)
                    }
                    if let journey {
                        JourneyRow(history: history, rules: journey)
                    }
                }
                .listRowBackground(Tokens.panel)
            }
            Section {
                if history.entries.isEmpty {
                    EmptyTakes()
                } else {
                    ForEach(history.entries) { entry in
                        TakeRow(entry: entry, copied: copied == entry.id) {
                            copy(entry)
                        } delete: {
                            history.delete(entry.id)
                        }
                    }
                }
            } header: {
                HStack {
                    SectionTitle(HomeCopy.takes)
                    Spacer()
                    if !history.entries.isEmpty {
                        Button(HomeCopy.clearAll) { askingClear = true }
                            .font(.subheadline)
                            .foregroundStyle(Tokens.brand)
                            .textCase(nil)
                            .frame(minHeight: 44)
                            .confirmationDialog(HomeCopy.clearTitle(history.entries.count), isPresented: $askingClear, titleVisibility: .visible) {
                                Button(HomeCopy.clearAction(history.entries.count), role: .destructive) { history.clear() }
                            }
                    }
                }
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
    }

    private func copy(_ entry: HistoryEntry) {
        UIPasteboard.general.string = entry.words
        copied = entry.id
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            if copied == entry.id { copied = nil }
        }
    }

}

/// Whether a session is running, and the one action that changes it.
struct SessionCard: View {
    let session: Session
    @State private var refused = false

    var body: some View {
        Section {
            Text(SessionCopy.status(until: session.until))
            Button(session.isOn ? SessionCopy.end : SessionCopy.start) {
                if session.isOn {
                    session.end()
                } else {
                    Task { refused = await !session.begin() }
                }
            }
            .buttonStyle(RowAction())
            .frame(minHeight: 44)
        } header: {
            SectionTitle(HomeCopy.session)
        } footer: {
            if refused, !session.isOn {
                Text(SessionCopy.micOff).foregroundStyle(Tokens.red)
            }
        }
        .listRowBackground(Tokens.panel)
    }
}

/// One take: its words, when, and how long. Tapping copies the words; a
/// swipe or VoiceOver's Delete asks first, from the row, so the question
/// points at the take it is about.
struct TakeRow: View {
    let entry: HistoryEntry
    let copied: Bool
    let copy: () -> Void
    let delete: () -> Void
    @State private var asking = false

    var body: some View {
        Button(action: copy) {
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.words)
                    .lineLimit(3)
                    .foregroundStyle(Tokens.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack {
                    Text(HomeCopy.time(entry.at))
                    Spacer()
                    if copied {
                        Label(HomeCopy.copied, systemImage: "checkmark")
                            .foregroundStyle(Tokens.ok)
                    } else {
                        Text(HomeCopy.length(entry.durationMs))
                    }
                }
                .font(.footnote.monospacedDigit())
                .foregroundStyle(Tokens.textDim)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(HomeCopy.copyHint)
        .swipeActions(edge: .trailing) {
            Button(HomeCopy.delete, role: .destructive) { asking = true }
        }
        .accessibilityAction(named: HomeCopy.delete) { asking = true }
        .confirmationDialog(HomeCopy.deleteOne, isPresented: $asking, titleVisibility: .visible) {
            Button(HomeCopy.deleteOneAction, role: .destructive) { delete() }
        } message: {
            Text(HomeCopy.preview(entry.words))
        }
    }
}

/// Home before the first take: one dry grey mark and the way to begin.
struct EmptyTakes: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            DryMark()
                .frame(width: 120, height: 30)
                .accessibilityHidden(true)
            Text(HomeCopy.empty)
                .foregroundStyle(Tokens.textDim)
        }
        .padding(.vertical, 12)
    }
}

/// A dry grey brush mark drawn by code: bristles along one gentle stroke
/// that run out of paint toward the end, the same every time.
struct DryMark: View {
    var body: some View {
        Canvas { context, size in
            var random = Seeded(89)
            let bristles = 7
            let steps = 40
            for bristle in 0..<bristles {
                let spread = (CGFloat(bristle) - CGFloat(bristles - 1) / 2) * size.height / CGFloat(bristles + 3)
                let alpha = 0.35 + 0.4 * random.next()
                // Bristles touch down a little apart, so the stroke starts ragged.
                let start = 0.08 * random.next()
                var path = Path()
                var drawing = false
                for step in 0...steps {
                    let t = start + (1 - start) * CGFloat(step) / CGFloat(steps)
                    let x = t * size.width
                    // The stroke rises a little and narrows as it goes.
                    let rise: CGFloat = sin(t * .pi * 0.8) * size.height * 0.22
                    let y = size.height * 0.6 + spread * (1 - 0.45 * t) - rise
                    // The brush runs dry: gaps grow toward the end.
                    let dry = random.next() < t * t * 0.85
                    if dry {
                        drawing = false
                    } else if drawing {
                        path.addLine(to: CGPoint(x: x, y: y))
                    } else {
                        path.move(to: CGPoint(x: x, y: y))
                        drawing = true
                    }
                }
                context.stroke(path, with: .color(Tokens.textDim.opacity(alpha)), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
            }
        }
    }
}

/// What Home says.
enum HomeCopy {
    static let session = "Session"
    static let takes = "Takes"
    static let clearAll = "Clear all"
    static let delete = "Delete"
    static let deleteOne = "Delete this take?"
    static let deleteOneAction = "Delete take"
    static let copied = "Copied"
    static let copyHint = "Double tap to copy the words."
    static let empty = "Your takes land here. Tap the pill in any app, or tap the microphone above."

    /// The start of a take's words, for the question that asks to delete it.
    static func preview(_ words: String) -> String {
        words.count <= 80 ? words : String(words.prefix(80)).trimmingCharacters(in: .whitespaces) + "..."
    }

    static func waiting(_ count: Int) -> String {
        count == 1 ? "1 take waiting to retry" : "\(count) takes waiting to retry"
    }

    static func clearTitle(_ count: Int) -> String {
        count == 1 ? "Delete your 1 take?" : "Delete all \(count) takes?"
    }

    static func clearAction(_ count: Int) -> String {
        count == 1 ? "Delete 1 take" : "Delete \(count) takes"
    }

    /// The time alone today; the date and time before today.
    static func time(_ at: Date, now: Date = .now, calendar: Calendar = .current) -> String {
        calendar.isDate(at, inSameDayAs: now)
            ? at.formatted(date: .omitted, time: .shortened)
            : at.formatted(date: .abbreviated, time: .shortened)
    }

    /// How long a take recorded, in whole seconds, at least one.
    static func length(_ ms: Int) -> String {
        let seconds = max(1, (ms + 500) / 1000)
        let minutes = seconds / 60
        let rest = seconds % 60
        func unit(_ n: Int, _ name: String) -> String { n == 1 ? "1 \(name)" : "\(n) \(name)s" }
        if minutes == 0 { return unit(rest, "second") }
        return rest == 0 ? unit(minutes, "minute") : "\(unit(minutes, "minute")) \(unit(rest, "second"))"
    }
}

#if DEBUG
/// Home in each state the previews show: empty, a few takes, many, and a
/// take waiting to retry.
struct HomePreview: View {
    enum Scene { case empty, few, many, failed }
    let scene: Scene
    @State private var history: History
    @State private var setup: Setup
    @State private var model: TakeModel?

    init(_ scene: Scene) {
        self.scene = scene
        let store = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "home-preview-\(UUID().uuidString).jsonl"))
        let count = scene == .empty ? 0 : scene == .many ? 40 : 3
        let words = ["Send the invoice tomorrow and copy the whole team.", "Pick up oat milk on the way home.", "The demo moved to Thursday at ten."]
        for i in 0..<count {
            try? store.append(HistoryEntry(at: .now.addingTimeInterval(Double(i - count) * 3_700), durationMs: 2_000 + i * 900, words: words[i % words.count]))
        }
        _history = State(initialValue: History(store: store))
        let access = ScriptedAccess(answer: true)
        access.status = .granted
        let defaults = UserDefaults(suiteName: "home-preview")!
        _setup = State(initialValue: Setup(microphone: access, report: { KeyboardReport(fullAccess: true, at: .now) }, hasKey: { true }, defaults: defaults))
        _model = State(initialValue: scene == .failed ? Self.failedModel() : nil)
    }

    /// A take model with one take waiting to retry.
    private static func failedModel() -> TakeModel? {
        guard let rules = try? BundledRules.takeRules(), let catalog = try? BundledRules.catalog(), let defaults = UserDefaults(suiteName: "home-preview-failed"),
              let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate)
        else { return nil }
        let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "home-preview-waiting-\(UUID().uuidString)", directoryHint: .isDirectory))
        _ = try? store.save(wav, startedAt: .now, failure: TakeFailure(kind: "network", detail: "offline"))
        return TakeModel(
            microphone: ScriptedMicrophone(), store: store, rules: rules, catalog: catalog,
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: MemoryKeyRing(),
            send: { _ in throw URLError(.notConnectedToInternet) }, copy: { _ in }
        )
    }

    var body: some View {
        NavigationStack {
            HomeScreen(history: history, session: nil, model: model, setup: setup) { _ in }
                .navigationTitle("murmur")
        }
        .preferredColorScheme(.dark)
    }
}

#Preview("Empty") { HomePreview(.empty) }
#Preview("A few takes") { HomePreview(.few) }
#Preview("Many takes") { HomePreview(.many) }
#Preview("A failed take") { HomePreview(.failed) }
#endif
