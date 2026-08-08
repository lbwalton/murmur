import AppIntents
import SwiftUI

// US-108: Dictate with Murmur from the Action Button or any Shortcut.
// The intent opens the app (iOS requires the app foregrounded to record),
// recording starts instantly, and the finished transcript lands on the
// clipboard and returns to Shortcuts for chaining. From the lock screen
// iOS asks for unlock before opening the app; recording cannot start
// locked, documented honestly in the intent description.
struct DictateIntent: AppIntent {
    static let title: LocalizedStringResource = "Dictate with Murmur"
    static let description = IntentDescription(
        "Opens Murmur recording instantly. Speak, tap stop, and the transcript is copied to your clipboard and returned for chaining. From the lock screen, iOS unlocks first; recording starts after unlock."
    )
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let text = try await IntentDictationBroker.shared.dictate()
        UIPasteboard.general.string = text
        return .result(value: text, dialog: "Copied to your clipboard.")
    }
}

struct MurmurShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: DictateIntent(),
            phrases: [
                "Dictate with \(.applicationName)",
                "Start a \(.applicationName) dictation",
            ],
            shortTitle: "Dictate",
            systemImageName: "waveform"
        )
    }
}

// Bridges the intent's async perform to the SwiftUI take screen: perform
// awaits the continuation, the app observes `active` and presents the
// take view, and the take's completion resumes Shortcuts.
@MainActor
final class IntentDictationBroker: ObservableObject {

    static let shared = IntentDictationBroker()

    struct DictationFailed: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    @Published var active = false
    private var continuation: CheckedContinuation<String, Error>?

    func dictate() async throws -> String {
        // A second invocation while one runs cancels the first cleanly.
        if let old = continuation {
            continuation = nil
            old.resume(throwing: DictationFailed(message: "A newer dictation replaced this one."))
        }
        active = true
        return try await withCheckedThrowingContinuation { continuation = $0 }
    }

    func complete(ok: Bool, text: String) {
        active = false
        guard let continuation else { return }
        self.continuation = nil
        if ok {
            continuation.resume(returning: text)
        } else {
            continuation.resume(throwing: DictationFailed(message: text))
        }
    }
}
