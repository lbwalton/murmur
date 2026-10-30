// SPDX-License-Identifier: GPL-3.0-only
import MurmurCore
import SwiftUI

/// The app's root: Home (IOS-012), with Dictate and Settings at the top.
/// It starts the keyboard's bridge and the session, opens first run on the
/// first launch (IOS-011), and shows the Recording screen when the keyboard
/// opens murmur.
struct ContentView: View {
    @State private var opener = TakeOpener.shared
    @State private var noteOpener = NoteOpener.shared
    @State private var setup = Setup.live()
    @State private var history = History.live()
    @State private var firstRun: Setup.Step?
    /// The note murmur's note link asked for (IOS-023).
    @State private var openedNote: OpenedNote?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            HomeScreen(history: history, session: Session.live(), model: TakeModel.live(), setup: setup) { firstRun = $0 }
                .navigationTitle("murmur")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            TakeRoute()
                        } label: {
                            Image(systemName: "mic")
                                .accessibilityLabel("Dictate")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            SettingsScreen()
                        } label: {
                            Image(systemName: "gearshape")
                                .accessibilityLabel("Settings")
                        }
                    }
                }
                .fullScreenCover(item: $firstRun) { step in
                    FirstRunScreen(setup: setup, step: step)
                }
                .navigationDestination(isPresented: $noteOpener.showing) {
                    NoteTakeRoute(startNow: true)
                }
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task {
            _ = KeyboardBridge.live()
            _ = Session.live()
            // murmur Pro follows the App Store from launch, so a purchase made
            // elsewhere or a refund lands (IOS-025).
            Task { await ProStore.live().start() }
            if !setup.seen {
                // Everything done already: nothing to walk through.
                if let next = setup.next { firstRun = next } else { setup.seen = true }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            setup.refresh()
            // A day or more away: the coming days' recaps are laid down again.
            let entries = history.entries
            Task { await RecapNotifications.refresh(entries) }
            // The notes folder as it resolves now, and the coming days' task
            // reminders too (IOS-023).
            if let notes = Notes.live() {
                Task {
                    await notes.recheck(NotesFolderChoice().store())
                    await TaskReminders.refresh(folder: notes.folder, rules: notes.rules)
                }
            }
        }
        .onOpenURL { url in
            if let file = NoteLink.file(in: url) {
                openNote(file)
                return
            }
            Task { await opener.open(url) }
        }
        .sheet(item: $openedNote) { note in
            NavigationStack {
                NoteFileScreen(title: Receipt.placeName(note.file), relative: note.file, folder: note.folder)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Done") { openedNote = nil }
                        }
                    }
            }
            .preferredColorScheme(.dark)
        }
        .fullScreenCover(isPresented: $opener.showing) { RecordingRoute() }
    }
}

extension ContentView {
    /// Open note under the pill (IOS-023): murmur hands the note on to
    /// Obsidian when the notes are in a vault and Obsidian is there, and
    /// shows it itself otherwise. Only an inbox day murmur wrote opens.
    private func openNote(_ file: String) {
        guard let notes = Notes.live(), let day = notes.inboxFile(file) else { return }
        let link = NoteReceipt.link(day, in: notes.folder, opens: { UIApplication.shared.canOpenURL($0) })
        NoteOpening.open(day, link: link, with: { openURL($0, completion: $1) }, show: { openedNote = OpenedNote(file: $0, folder: notes.folder) })
    }
}

/// A note file opened from murmur's note link.
struct OpenedNote: Identifiable {
    let file: String
    let folder: NoteStore
    var id: String { file }
}

#Preview {
    ContentView()
}
