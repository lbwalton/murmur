// SPDX-License-Identifier: GPL-3.0-only
// The notes' screens in each of their states (ios/prd.json IOS-023), built
// from a scratch folder, a scripted sort, and a stand-in provider, so
// nothing records, reads your notes, or leaves the Mac.
#if DEBUG
import MurmurCore
import SwiftUI

#Preview("Notes, empty") { NotesPreview(.empty) }
#Preview("Notes, sorted with a held line") { NotesPreview(.sorted) }
#Preview("Notes, folder lost") { NotesPreview(.lost) }
#Preview("New note, ready") { NoteTakePreview(.ready) }
#Preview("New note, noted") { NoteTakePreview(.noted) }
#Preview("New note, not saved") { NoteTakePreview(.notSaved) }
#Preview("Settings, notes") {
    NavigationStack { NotesSettingsScreen() }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
}

/// A chat that answers from a script.
private final class PreviewChat: @unchecked Sendable {
    private let lock = NSLock()
    private var replies: [SortReply]

    init(_ replies: [SortReply]) {
        self.replies = replies
    }

    var ask: SortAsk {
        { _, _ in self.lock.withLock { self.replies.isEmpty ? .failed("http 599") : self.replies.removeFirst() } }
    }
}

/// Scratch notes for a preview: a folder of their own and a state file.
@MainActor private func previewNotes(lost: Bool = false, chat: PreviewChat? = nil) -> Notes? {
    guard let rules = try? BundledRules.sorter() else { return nil }
    let root = FileManager.default.temporaryDirectory.appending(path: "murmur-notes-preview-\(UUID().uuidString)", directoryHint: .isDirectory)
    let folder = NoteStore(root: root.appending(path: "notes", directoryHint: .isDirectory), picked: lost, lost: lost)
    return Notes(
        folder: folder, rules: rules, stateFile: NotesStateFile(file: root.appending(path: "state.json")),
        sortOn: { true }, ask: { chat?.ask }
    )
}

struct NotesPreview: View {
    enum Scene { case empty, sorted, lost }

    let scene: Scene
    @State private var notes: Notes?

    init(_ scene: Scene) { self.scene = scene }

    var body: some View {
        NavigationStack {
            if let notes { NotesScreen(notes: notes) }
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task { notes = await Self.notes(for: scene) }
    }

    static func notes(for scene: Scene) async -> Notes? {
        switch scene {
        case .empty: return previewNotes()
        case .lost: return previewNotes(lost: true)
        case .sorted:
            let chat = PreviewChat([.content(#"{"1":"note","2":"task","3":"idea","relations":{"1":[2,2]}}"#)])
            guard let notes = previewNotes(chat: chat) else { return nil }
            try? notes.folder.replace(notes.rules.layout.tasks, "## 2026-10-13\n- [ ] Call the dentist.\n- [ ] Email Sam about the invoice.\n- I need to buy:\n  - [ ] milk\n  - [x] eggs\n")
            notes.save("I emailed Sam about the invoice. Buy stamps for the wedding cards. Maybe a podcast about sleep.")
            await notes.settle()
            return notes
        }
    }
}

struct NoteTakePreview: View {
    enum Scene { case ready, noted, notSaved }

    let scene: Scene
    @State private var model: TakeModel?
    @State private var notes: Notes?

    init(_ scene: Scene) { self.scene = scene }

    var body: some View {
        NavigationStack {
            if let model, let notes { NoteTakeScreen(model: model, notes: notes) }
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task {
            let notes = previewNotes()
            self.notes = notes
            model = await Self.model(for: scene, notes: notes)
        }
    }

    static func model(for scene: Scene, notes: Notes?) async -> TakeModel? {
        guard let rules = try? BundledRules.takeRules(), let catalog = try? BundledRules.catalog(),
              let defaults = UserDefaults(suiteName: "murmur.previews.\(UUID().uuidString)")
        else { return nil }
        let ring = MemoryKeyRing()
        if let key = APIKey("gsk_previewpreview1234") { try? ring.save(key, for: "https://api.groq.com/openai/v1") }
        let model = TakeModel(
            microphone: ScriptedMicrophone(samples: ScriptedMicrophone.tone),
            store: WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "murmur-previews-\(UUID().uuidString)", directoryHint: .isDirectory)),
            rules: rules, catalog: catalog, connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: { request in
                (Data(#"{"text":"Call the dentist tomorrow. Maybe a podcast about sleep."}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            },
            copy: { _ in },
            keepNote: { words, at in scene == .notSaved ? nil : notes?.save(words, at: at) }
        )
        if scene != .ready {
            await model.start(as: .note)
            await model.stop()
        }
        return model
    }
}
#endif
