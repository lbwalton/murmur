// SPDX-License-Identifier: GPL-3.0-only
// New note (ios/prd.json IOS-023) for the Control Center control, the
// Action Button, and Shortcuts: murmur opens on New note, listening, and
// the words are kept in today's inbox instead of typed. It is an
// OpenIntent: a control runs a plain intent from the widget extension in
// the background, whatever its modes say, and an OpenIntent opens murmur
// and runs there (Apple's App Intents docs, checked 2026-10-18). This
// file is built into the widget extension too, as Apple asks of a control
// that opens its app; there, NoteControl does nothing and is never reached.
import AppIntents
import Foundation

/// The screen New note opens. An OpenIntent needs a target; New note is
/// the only one.
enum NoteScreen: String, AppEnum {
    case newNote

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "murmur screen"
    static let caseDisplayRepresentations: [NoteScreen: DisplayRepresentation] = [.newNote: "New note"]
}

struct NewNoteIntent: OpenIntent {
    static let title: LocalizedStringResource = "New murmur note"
    static let description = IntentDescription("Opens murmur listening for a note. The words are kept in today's inbox instead of typed.")

    @Parameter(title: "Screen", default: .newNote)
    var target: NoteScreen

    #if compiler(>=6.4)
    /// iOS 27 may run a control's intent in the widget extension, where
    /// NoteControl does nothing: murmur's runs only in murmur.
    @available(iOS 27.0, *)
    static var allowedExecutionTargets: IntentExecutionTargets { .main }
    #endif

    @MainActor
    func perform() async throws -> some IntentResult {
        NoteControl.open()
        return .result()
    }
}
