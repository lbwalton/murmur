// SPDX-License-Identifier: GPL-3.0-only
// murmur for iPhone. The app holds the microphone, the key, the cleanup,
// and the history; the keyboard extension stays thin (ios/prd.json).
import SwiftUI
import UserNotifications

@main
struct MurmurApp: App {
    /// Shows recaps that arrive while murmur is open (IOS-022).
    private let recaps = RecapPresenter()
    /// New note from a press and hold on murmur's icon (IOS-023).
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    init() {
        if let request = SmokeRequest(arguments: ProcessInfo.processInfo.arguments) {
            SmokeRunner.runAndExit(request)
        }
        if ProcessInfo.processInfo.arguments.contains("--pill-shots") {
            PillShots.runAndExit()
        }
        UNUserNotificationCenter.current().delegate = recaps
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
