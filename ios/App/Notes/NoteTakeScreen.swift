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
    @State private var opener = NoteOpener.shared
    /// The last open from the icon, the control, or Shortcuts this screen
    /// started listening for.
    @State private var handled: Int?

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
                        Outcome(title: Pad.noted(place), detail: notes.state.newest?.place ?? "", color: Tokens.brand, symbol: "note.text")
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

extension TakeModel.State {
    var isWords: Bool {
        if case .words = self { true } else { false }
    }
}
