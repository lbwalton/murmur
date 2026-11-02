// SPDX-License-Identifier: GPL-3.0-only
// What first run says (ios/prd.json IOS-011): each step's name, one
// sentence on why murmur needs it, and the exact taps in Settings.
import Foundation

enum SetupCopy {
    static func title(_ step: Setup.Step) -> String {
        switch step {
        case .microphone: "Allow the microphone"
        case .keyboard: "Add the murmur keyboard"
        case .key: "Add your key"
        case .practice: "Try your first take"
        }
    }

    static func why(_ step: Setup.Step) -> String {
        switch step {
        case .microphone: "murmur needs the microphone to hear your takes, and it keeps nothing it hears between them."
        case .keyboard: "The murmur keyboard puts the pill in every app, and Full Access lets it hand your take to murmur; the keyboard sends nothing anywhere and only types the words you dictate."
        case .key: "murmur sends each take to the transcription provider you choose, with your own key."
        case .practice: "Try a take here first, with the real pill, before you use it in other apps."
        }
    }

    /// The exact taps, for the steps done in Settings. Open Settings goes
    /// to murmur's own page, the closest place iOS allows.
    static func taps(_ step: Setup.Step) -> [String] {
        switch step {
        case .keyboard: ["Tap Open Settings.", "Tap Keyboards.", "Turn on murmur, then turn on Allow Full Access and tap Allow.", "Come back, tap the box below, and pick murmur with the globe key."]
        case .practice: ["Tap the box below.", "Hold the globe key and pick murmur.", "Tap the pill, say a sentence, and tap the pill again."]
        case .microphone, .key: []
        }
    }

    static let micDenied = "The microphone is off for murmur. Tap Open Settings, then turn on Microphone."
    static let checkBox = "Tap here, then pick murmur with the globe key"
    static let practiceBox = "Your first take lands here"
    static let practiceDone = "Your words landed. When no session is running, your first tap in another app opens murmur, and this is the way back:"
    static let done = "Done"
    static let skip = "Skip for now"
    static let later = "Finish later"
    static let next = "Next"
    static let finish = "Finish"
    static let openSettings = "Open Settings"
    static let allow = "Allow the microphone"
    static let addKey = "Add your key"
    static let closeKey = "Done"
    static let homeTitle = "Finish setting up"
    static let homeFooter = "murmur works best with every step done. Skipped steps wait here."

    static func progress(_ step: Setup.Step) -> String {
        let index = Setup.Step.allCases.firstIndex(of: step).map { $0 + 1 } ?? 1
        return "Step \(index) of \(Setup.Step.allCases.count)"
    }
}
