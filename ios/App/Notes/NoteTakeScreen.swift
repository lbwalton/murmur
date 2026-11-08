// SPDX-License-Identifier: GPL-3.0-only
// New note (ios/prd.json IOS-023): one button to talk, as on Dictate, and
// the words kept as a note instead of offered to copy. The take model
// keeps the note, only for a take started here, so a keyboard take that
// lands while this screen is open is never filed. The take still lands in
// your takes on Home, as every take does.
import MurmurCore
import SwiftUI

struct NoteTakeRoute: View {
    /// Opened by the control, the Action Button, or the icon: listen at once.
    var startNow = false
    var make: @MainActor () -> (model: TakeModel?, notes: Notes?) = { (TakeModel.live(), Notes.live()) }
    @State private var model: TakeModel?
    @State private var notes: Notes?
    @State private var failed = false

    var body: some View {
        Group {
            if let model, let notes {
                NoteTakeScreen(model: model, notes: notes, startNow: startNow)
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
            guard model == nil || notes == nil else { return }
            (model, notes) = make()
            failed = model == nil || notes == nil
        }
    }
}

struct NoteTakeScreen: View {
    let model: TakeModel
    let notes: Notes
    var startNow = false
    /// Whether an app is there to take a link; previews stand in for Obsidian.
    var opens: @MainActor (URL) -> Bool = { UIApplication.shared.canOpenURL($0) }
    @State private var opener = NoteOpener.shared
    /// The last open from the icon, the control, or Shortcuts this screen
    /// started listening for.
    @State private var handled: Int?
    /// The day's file the receipt opened in murmur.
    @State private var shown: String?

    var body: some View {
        List {
            Section {
                TakeButton(model: model, purpose: .note)
            } footer: {
                Text(NotesCopy.newNoteHint).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            if let kept = model.kept {
                Section {
                    Text(kept.words)
                        .textSelection(.enabled)
                    if let place = kept.place {
                        NoteReceipt(place: place, notes: notes, shown: $shown, opens: opens)
                    } else {
                        Outcome(title: "Not saved", detail: NotesCopy.notSaved, color: Tokens.red, symbol: "xmark.circle")
                    }
                }
                .listRowBackground(Tokens.panel)
            } else if model.state.hasResult, !model.state.isWords {
                Section {
                    TakeResult(state: model.state)
                }
                .listRowBackground(Tokens.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle(NotesCopy.newNote)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $shown) { file in
            NoteFileScreen(title: Receipt.placeName(file), relative: file, folder: notes.folder)
        }
        .sensoryFeedback(.impact(weight: .light), trigger: model.isRecording)
        .task(id: startNow ? opener.request : nil) {
            // Once for each open, so a second press of the Action Button
            // listens again, and never over a take already running.
            guard startNow, handled != opener.request else { return }
            handled = opener.request
            if !model.isRecording, !model.isBusy { await model.start(as: .note) }
        }
        .onDisappear { model.cancel(ifFor: .note) }
    }
}

/// A note's receipt, which opens the day's file (LaBroi, 2026-10-18): in
/// Obsidian when the notes are in a vault and Obsidian is there, and in
/// murmur otherwise.
struct NoteReceipt: View {
    let place: String
    let notes: Notes
    @Binding var shown: String?
    /// Whether an app is there to take a link; previews stand in for Obsidian.
    var opens: @MainActor (URL) -> Bool = { UIApplication.shared.canOpenURL($0) }
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let file = notes.state.newest?.inbox
        let link = Self.link(file, in: notes.folder, opens: opens)
        // At the accessibility sizes the mark goes under the words, which
        // keep the row's width.
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
        Button {
            guard let file else { return }
            NoteOpening.open(file, link: link, with: { openURL($0, completion: $1) }, show: { shown = $0 })
        } label: {
            layout {
                Outcome(title: Pad.noted(place), detail: notes.state.newest?.place ?? "", color: Tokens.brand, symbol: "note.text")
                    .frame(maxWidth: .infinity, alignment: .leading)
                // Out to another app, or on within murmur.
                Image(systemName: link == nil ? "chevron.right" : "arrow.up.forward.app")
                    .foregroundStyle(Tokens.textDim)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(link == nil ? NotesCopy.opensHere : NotesCopy.opensInObsidian)
    }

    /// Obsidian's link to the day's file, when the notes are in a vault and
    /// Obsidian is there to take it.
    static func link(_ file: String?, in folder: NoteStore, opens: @MainActor (URL) -> Bool) -> URL? {
        guard let file, let link = folder.obsidianLink(file), opens(link) else { return nil }
        return link
    }
}

/// Opens a note's day file: in Obsidian when there is a link and Obsidian
/// takes it, and in murmur when it does not or there is none (LaBroi: "If
/// the user doesn't have Obsidian, then it should open to the app where
/// it's saved locally").
@MainActor enum NoteOpening {
    static func open(_ file: String, link: URL?, with openURL: (URL, @escaping (Bool) -> Void) -> Void, show: @escaping (String) -> Void) {
        guard let link else { return show(file) }
        openURL(link) { accepted in
            if !accepted { show(file) }
        }
    }
}

extension TakeModel.State {
    var isWords: Bool {
        if case .words = self { true } else { false }
    }
}
