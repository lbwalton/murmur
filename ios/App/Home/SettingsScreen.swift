// SPDX-License-Identifier: GPL-3.0-only
// Settings (ios/prd.json IOS-012): Provider and keys, Cleanup, Dictionary
// and expansions (IOS-013), the session's length, the keyboard, the pill's
// look (IOS-020), Diagnostics (IOS-014), and About.
import SwiftUI

struct SettingsScreen: View {
    var pro: ProStore = .live()

    var body: some View {
        List {
            Group {
                NavigationLink("Provider and key") { ProviderRoute() }
                NavigationLink("Cleanup") { CleanupRoute() }
                NavigationLink("Dictionary and expansions") { WordsRoute() }
                NavigationLink("Session") { SessionRoute() }
                NavigationLink("Keyboard") { KeyboardScreen() }
                NavigationLink("Look") { LookRoute() }
                NavigationLink(NumbersCopy.screen) { TimeBackScreen(history: History.live()) }
                NavigationLink(NotesCopy.title) { NotesSettingsScreen() }
                // murmur Pro (IOS-025) sits after what you use, never first,
                // with the supporter mark once bought.
                NavigationLink {
                    ProRoute()
                } label: {
                    LabeledContent {
                        if let mark = ProCopy.mark(pro.status) { Text(mark).foregroundStyle(Tokens.brand) }
                    } label: {
                        Text(ProCopy.title)
                    }
                }
                NavigationLink("Diagnostics") { DiagnosticsRoute() }
                NavigationLink("About") { AboutScreen() }
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The version, the license, the source, and how murmur is made.
struct AboutScreen: View {
    var body: some View {
        List {
            Section {
                LabeledContent("Version", value: AboutCopy.version())
            }
            .listRowBackground(Tokens.panel)
            Section {
                Text(AboutCopy.license)
                Link(AboutCopy.readSource, destination: AboutCopy.source)
                    .buttonStyle(RowAction())
                Link(AboutCopy.readLicense, destination: AboutCopy.gpl)
                    .buttonStyle(RowAction())
            } header: {
                SectionTitle("Free software")
            }
            .listRowBackground(Tokens.panel)
            Section {
                Text(AboutCopy.noOutsideCode)
            } header: {
                SectionTitle("Who writes murmur")
            }
            .listRowBackground(Tokens.panel)
            Section {
                Text(AboutCopy.bundled)
                if let license = AboutCopy.fontLicense() {
                    Text(AboutCopy.font)
                    NavigationLink(AboutCopy.readFontLicense) {
                        ScrollView {
                            Text(license)
                                .font(.system(.footnote, design: .monospaced))
                                .padding(16)
                        }
                        .background(Tokens.ink)
                        .foregroundStyle(Tokens.text)
                        .navigationTitle(AboutCopy.fontLicenseTitle)
                        .navigationBarTitleDisplayMode(.inline)
                    }
                    .foregroundStyle(Tokens.brand)
                }
            } header: {
                SectionTitle("Licenses")
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
}

enum AboutCopy {
    static let license = "murmur is free software under the GNU General Public License, version 3. Read it, learn from it, and build it yourself."
    static let readSource = "Read the source"
    static let readLicense = "Read the license"
    static let noOutsideCode = "murmur does not accept outside code: pull requests are closed without being merged. That keeps Eze Media LLC the sole copyright holder, which is what lets murmur ship on the App Store as well as under the GPL."
    static let bundled = "murmur bundles no outside code. The app, the keyboard, and the code they share are murmur's own, all under the GPL, version 3."
    static let font = "The painting cards set their titles in Bricolage Grotesque, a font under the SIL Open Font License, version 1.1, which comes with it."
    static let readFontLicense = "Read the font's license"
    static let fontLicenseTitle = "SIL Open Font License"

    /// The display face's license, shipped beside the painter page with the
    /// font (IOS-019); nil in a build without the font.
    static func fontLicense() -> String? {
        Bundle.main.url(forResource: "OFL", withExtension: "txt", subdirectory: "web").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    }
    static let source = URL(string: "https://github.com/lbwalton/murmur")!
    static let gpl = URL(string: "https://www.gnu.org/licenses/gpl-3.0.html")!

    /// The version and build, from the app's Info.plist.
    static func version(_ info: [String: Any]? = Bundle.main.infoDictionary) -> String {
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }
}
