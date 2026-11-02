// SPDX-License-Identifier: GPL-3.0-only
// Starting and ending a session from Shortcuts and Siri (ios/prd.json
// IOS-016), beside the Start murmur control, which Control Center, the Lock
// Screen, and the Action Button all take.
import AppIntents

struct MurmurShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartSessionIntent(),
            phrases: ["Start a \(.applicationName) session"],
            shortTitle: "Start murmur",
            systemImageName: "waveform"
        )
        AppShortcut(
            intent: EndSessionIntent(),
            phrases: ["End the \(.applicationName) session"],
            shortTitle: "End murmur",
            systemImageName: "stop.circle"
        )
        AppShortcut(
            intent: NewNoteIntent(),
            phrases: ["New \(.applicationName) note"],
            shortTitle: "New note",
            systemImageName: "square.and.pencil"
        )
    }
}
