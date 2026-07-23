import UIKit
import SwiftUI

// Night studio design system, defined once for every iOS target (project
// law, do not drift): ink surfaces, warm text, signal amber reserved for
// live and active states only, red for record and errors, mono for
// equipment-style micro-labels. Hex values match the desktop app exactly.
enum NightStudio {
    // UIKit faces for the keyboard extension.
    static let inkUI = UIColor(red: 0x0F / 255, green: 0x0E / 255, blue: 0x11 / 255, alpha: 1)
    static let panelUI = UIColor(red: 0x17 / 255, green: 0x16 / 255, blue: 0x1B / 255, alpha: 1)
    static let textUI = UIColor(red: 0xEC / 255, green: 0xE9 / 255, blue: 0xE4 / 255, alpha: 1)
    static let amberUI = UIColor(red: 0xF0 / 255, green: 0xA4 / 255, blue: 0x4B / 255, alpha: 1)
    static let redUI = UIColor(red: 0xE5 / 255, green: 0x48 / 255, blue: 0x4D / 255, alpha: 1)

    // SwiftUI faces for the app.
    static let ink = Color(inkUI)
    static let panel = Color(panelUI)
    static let text = Color(textUI)
    static let amber = Color(amberUI)
    static let red = Color(redUI)

    // Cascadia Mono does not ship on iOS; the system monospaced design
    // carries the equipment-label look instead.
    static func mono(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}
