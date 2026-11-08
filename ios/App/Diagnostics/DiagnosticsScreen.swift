// SPDX-License-Identifier: GPL-3.0-only
// Settings, Diagnostics (ios/prd.json IOS-014): what the report holds and
// what it never holds, and Save report. The report opens as a preview
// first; Share there opens the share sheet. Nothing is sent by itself.
import MurmurCore
import SwiftUI

struct DiagnosticsScreen: View {
    /// Builds the report's text when asked.
    let build: @MainActor () -> String
    @State private var report: Report?

    /// A built report and the file it was saved to.
    struct Report: Identifiable {
        let id = UUID()
        let text: String
        let file: URL?
    }

    var body: some View {
        List {
            Section {
                Text(DiagnosticsCopy.what)
                Text(DiagnosticsCopy.never)
            }
            .listRowBackground(Tokens.panel)
            Section {
                Button(DiagnosticsCopy.save) { save() }
                    .buttonStyle(RowAction())
            } footer: {
                Text(DiagnosticsCopy.footer).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(DiagnosticsCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $report) { report in
            NavigationStack { ReportPreview(report: report) }
                .preferredColorScheme(.dark)
        }
    }

    private func save() {
        let text = build()
        report = Report(text: text, file: DiagnosticsFile.write(text, now: .now))
    }
}

/// The report as it will be sent, with Share to send it.
struct ReportPreview: View {
    let report: DiagnosticsScreen.Report
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            Text(report.text)
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(Tokens.text)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
        }
        .background(Tokens.ink)
        .navigationTitle(DiagnosticsCopy.preview)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(DiagnosticsCopy.done) { dismiss() }
            }
            ToolbarItem(placement: .primaryAction) {
                if let file = report.file {
                    ShareLink(item: file) { Label(DiagnosticsCopy.share, systemImage: "square.and.arrow.up") }
                } else {
                    ShareLink(item: report.text) { Label(DiagnosticsCopy.share, systemImage: "square.and.arrow.up") }
                }
            }
        }
        .tint(Tokens.brand)
    }
}

/// Where a report is saved for sharing: the app's temporary folder, one
/// report at a time.
enum DiagnosticsFile {
    static let folder = FileManager.default.temporaryDirectory.appending(path: "diagnostics", directoryHint: .isDirectory)

    /// The saved file, or nil when it could not be written (the preview
    /// then shares the text itself).
    static func write(_ text: String, now: Date, in folder: URL = folder) -> URL? {
        let file = folder.appending(path: DiagnosticsReport.fileName(now))
        do {
            try? FileManager.default.removeItem(at: folder)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data(text.utf8).write(to: file, options: .atomic)
            return file
        } catch {
            return nil
        }
    }
}

/// Opens the screen on this phone's report.
struct DiagnosticsRoute: View {
    var body: some View {
        DiagnosticsScreen {
            guard let catalog = try? BundledRules.catalog() else { return DiagnosticsCopy.noCatalog }
            return DiagnosticsReport.text(DiagnosticsReport.facts(catalog: catalog))
        }
    }
}

/// What the screen says.
enum DiagnosticsCopy {
    static let title = "Diagnostics"
    static let what = "When something goes wrong, a report helps find out why. It holds the app and iPhone versions, whether the keyboard has Full Access, your settings as names and counts, and a short log of what happened to each take."
    static let never = "It never holds your words, your dictionary or expansions, or your key."
    static let save = "Save report"
    static let footer = "You read the report first. Share sends it only where you choose; murmur never sends it by itself."
    static let preview = "Report"
    static let share = "Share"
    static let done = "Done"
    static let noCatalog = "murmur diagnostics report\nThe app's own files could not be read, so this report is empty. Reinstalling murmur from TestFlight or the App Store fixes this.\n"
}

#if DEBUG
#Preview {
    NavigationStack {
        DiagnosticsScreen { "murmur diagnostics report\nversion: 0.1.0 (1)\n" }
    }
    .preferredColorScheme(.dark)
}
#endif
