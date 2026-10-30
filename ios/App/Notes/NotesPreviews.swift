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
#Preview("New note, noted in a vault") { NoteTakePreview(.notedInVault) }
#Preview("New note, not saved") { NoteTakePreview(.notSaved) }
#Preview("Settings, notes") { NotesSettingsPreview(.standard) }
#Preview("Settings, notes, files changed") { NotesSettingsPreview(.changed) }
#Preview("Settings, notes, a file that cannot be used") { NotesSettingsPreview(.broken) }

/// Settings, Notes with its file layout as shipped, changed the way
/// LaBroi's Mac has it, or with files that cannot be used, from a scratch
/// set of choices.
struct NotesSettingsPreview: View {
    enum Scene: CaseIterable { case standard, changed, broken }

    private let defaults: UserDefaults

    init(_ scene: Scene) {
        let name = "murmur.preview.notes-settings.\(scene)"
        let defaults = UserDefaults(suiteName: name) ?? .standard
        defaults.removePersistentDomain(forName: name)
        var settings = NotesSettings(sort: scene != .standard, reminders: false, times: NotesSettings.standardTimes)
        switch scene {
        case .standard: break
        case .changed:
            settings.inboxFile = "murmur/notes/{date}.md"
            settings.tasksFile = "murmur/tasks/{year}-{month}.md"
        case .broken:
            settings.inboxFile = "../notes/{date}.md"
            settings.ideasFile = "murmur/ideas"
        }
        settings.save(defaults)
        self.defaults = defaults
    }

    var body: some View {
        NavigationStack { NotesSettingsScreen(defaults: defaults) }
            .tint(Tokens.brand)
            .preferredColorScheme(.dark)
    }
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
@MainActor private func previewNotes(lost: Bool = false, vault: Bool = false, chat: PreviewChat? = nil) -> Notes? {
    guard let rules = try? BundledRules.sorter() else { return nil }
    let root = FileManager.default.temporaryDirectory.appending(path: "murmur-notes-preview-\(UUID().uuidString)", directoryHint: .isDirectory)
    let notesRoot = root.appending(path: "notes", directoryHint: .isDirectory)
    // A vault is a folder with Obsidian's settings folder in it.
    if vault { try? FileManager.default.createDirectory(at: notesRoot.appending(path: ".obsidian"), withIntermediateDirectories: true) }
    let folder = NoteStore(root: notesRoot, picked: lost || vault, lost: lost)
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
    enum Scene: CaseIterable { case ready, noted, notedInVault, notSaved }

    let scene: Scene
    @State private var model: TakeModel?
    @State private var notes: Notes?

    init(_ scene: Scene) { self.scene = scene }

    var body: some View {
        NavigationStack {
            // Obsidian stands in as installed, so a vault's receipt points out.
            if let model, let notes { NoteTakeScreen(model: model, notes: notes, opens: { _ in true }) }
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task {
            let notes = previewNotes(vault: scene == .notedInVault)
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
