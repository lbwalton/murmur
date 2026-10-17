// SPDX-License-Identifier: GPL-3.0-only
// The widget extension shows the control and the Live Activity but never
// runs the session intents: iOS runs those in murmur's own process
// (Live/SessionIntents.swift). These keep the shared file building here.
enum SessionControl {
    static func start() async -> SessionStart { .unavailable }
    static func end() async {}
}

/// New note opens murmur, so iOS runs its intent there (Live/NoteIntent.swift).
@MainActor enum NoteControl {
    static func open() {}
}
