// SPDX-License-Identifier: GPL-3.0-only
// First run in each of its states (ios/prd.json IOS-011), built from a
// scripted microphone and scratch settings, so nothing asks for a
// permission or reads the real setup.
#if DEBUG
import SwiftUI

#Preview("Allow the microphone") { FirstRunPreview(.microphone) }
#Preview("Microphone refused") { FirstRunPreview(.microphoneRefused) }
#Preview("Add your key") { FirstRunPreview(.key) }
#Preview("Add the murmur keyboard") { FirstRunPreview(.keyboard) }
#Preview("Keyboard done") { FirstRunPreview(.keyboardDone) }
#Preview("Try your first take") { FirstRunPreview(.practice) }
#Preview("First take landed") { FirstRunPreview(.practiceDone) }
#Preview("Largest text") { FirstRunPreview(.keyboard).dynamicTypeSize(.accessibility5) }
#Preview("Home, finish setting up") { SetupChecklistPreview() }

/// First run open at one moment.
struct FirstRunPreview: View {
    enum Moment: CaseIterable {
        case microphone, microphoneRefused, key, keyboard, keyboardDone, practice, practiceDone
    }

    @State private var setup: Setup
    private let step: Setup.Step

    init(_ moment: Moment) {
        let access = ScriptedAccess(answer: true)
        access.status = switch moment {
        case .microphone: .undetermined
        case .microphoneRefused: .denied
        default: .granted
        }
        let hasKey = ![.microphone, .microphoneRefused, .key].contains(moment)
        let reported = [.keyboardDone, .practice, .practiceDone].contains(moment)
        let defaults = Self.scratch("first-run-preview-\(moment)")
        defaults.set(moment == .practiceDone, forKey: Setup.practicedKey)
        _setup = State(initialValue: Setup(
            microphone: access,
            report: { reported ? KeyboardReport(fullAccess: true, at: .now) : nil },
            hasKey: { hasKey },
            defaults: defaults))
        step = switch moment {
        case .microphone, .microphoneRefused: .microphone
        case .key: .key
        case .keyboard, .keyboardDone: .keyboard
        case .practice, .practiceDone: .practice
        }
    }

    /// Settings of the preview's own, emptied each time.
    static func scratch(_ name: String) -> UserDefaults {
        let defaults = UserDefaults(suiteName: name) ?? .standard
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    var body: some View {
        FirstRunScreen(setup: setup, step: step)
            .preferredColorScheme(.dark)
    }
}

/// Home's Finish setting up with what is left: a refused microphone, a
/// skipped key, the keyboard, and the first take.
struct SetupChecklistPreview: View {
    @State private var setup: Setup

    init() {
        let access = ScriptedAccess(answer: false)
        access.status = .denied
        let defaults = FirstRunPreview.scratch("first-run-preview-checklist")
        defaults.set([Setup.Step.key.rawValue], forKey: Setup.skippedKey)
        _setup = State(initialValue: Setup(microphone: access, report: { nil }, hasKey: { false }, defaults: defaults))
    }

    var body: some View {
        List { SetupChecklist(setup: setup) { _ in } }
            .scrollContentBackground(.hidden)
            .background(Tokens.ink)
            .preferredColorScheme(.dark)
    }
}
#endif
