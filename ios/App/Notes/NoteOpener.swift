// SPDX-License-Identifier: GPL-3.0-only
// New note from outside murmur's screens (ios/prd.json IOS-023): the New
// note control in Control Center or on the Action Button, Shortcuts, and
// a press and hold on murmur's icon open murmur on New note, listening.
// An iPhone has no hotkey; these are the nearest thing. A link cannot do
// this: any app can open a link, and none may start murmur listening.
import SwiftUI
import UIKit

@Observable @MainActor final class NoteOpener {
    static let shared = NoteOpener()
    /// New note is on screen because one of these asked for it.
    var showing = false
    /// Counts the opens, so New note listens again on each, even when it
    /// is already on screen.
    private(set) var request = 0

    func open() {
        request += 1
        showing = true
    }
}

/// What the New note intent runs in murmur.
@MainActor enum NoteControl {
    static func open() {
        NoteOpener.shared.open()
    }
}

/// The press and hold on murmur's icon.
enum QuickAction {
    /// The Info.plist type of New note, after the bundle id.
    static let note = "note"

    @MainActor static func perform(_ item: UIApplicationShortcutItem) -> Bool {
        guard item.type.split(separator: ".").last == Substring(note) else { return false }
        NoteControl.open()
        return true
    }
}

/// Hands a quick action to QuickAction, at launch and while murmur runs.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if let item = options.shortcutItem { _ = QuickAction.perform(item) }
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        configuration.delegateClass = QuickActionSceneDelegate.self
        return configuration
    }
}

final class QuickActionSceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem) async -> Bool {
        QuickAction.perform(shortcutItem)
    }
}
