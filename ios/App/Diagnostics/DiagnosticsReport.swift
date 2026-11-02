// SPDX-License-Identifier: GPL-3.0-only
// The diagnostics report (ios/prd.json IOS-014): one plain text file you
// read before you send it, like desktop's (src/main/diagnostics.ts). It
// holds the app and the phone, whether the keyboard has reported with Full
// Access, the session length, settings as names and counts, and the recent
// activity log. Never words, never dictionary or expansion text, never a
// key. Nothing is sent by itself: the report goes only where you share it.
import Foundation
import MurmurCore
import UIKit

/// Everything the report says, gathered first so the text is a plain
/// function of it.
struct DiagnosticsFacts: Sendable {
    var generated: Date
    var appVersion: String
    var build: String
    var system: String
    var device: String
    /// The keyboard's own report: it writes one only with Full Access.
    var keyboard: KeyboardReport?
    var sessionMinutes: Int
    var sessionOn: Bool
    /// A preset's name, or custom: a custom address is never written.
    var provider: String
    /// A model murmur lists, or only the length of one typed by hand.
    var sttModel: String
    var cleanupProvider: String
    var cleanupModel: String
    var keySaved: Bool
    var level: String
    var numbers: String
    var smartLists: Bool
    var corrections: Bool
    var polish: Bool
    var dictionaryEntries: Int
    var expansionEntries: Int
    var waitingTakes: Int
    var historyTakes: Int
    var pillStyle: String
    var log: [String]
}

enum DiagnosticsReport {
    /// The report's last lines of the activity log.
    static let logLines = 200

    static func text(_ facts: DiagnosticsFacts) -> String {
        let keyboard = facts.keyboard.map { "reported with Full Access, last \($0.at.formatted(.iso8601))" }
            ?? "no report yet (it reports only with Full Access on)"
        let lines = [
            "murmur diagnostics report",
            "generated: \(facts.generated.formatted(.iso8601))",
            "version: \(facts.appVersion) (\(facts.build))",
            "system: \(facts.system)",
            "device: \(facts.device)",
            "",
            "keyboard: \(keyboard)",
            "session: \(facts.sessionMinutes) minutes, \(facts.sessionOn ? "running" : "off")",
            "",
            "transcription: \(facts.provider), model \(facts.sttModel)",
            "cleanup: \(facts.cleanupProvider), model \(facts.cleanupModel)",
            "keySaved: \(facts.keySaved ? "yes" : "no")",
            "formatting: level=\(facts.level) numbers=\(facts.numbers) smartLists=\(facts.smartLists) corrections=\(facts.corrections) polish=\(facts.polish)",
            "dictionaryEntries: \(facts.dictionaryEntries)",
            "expansionEntries: \(facts.expansionEntries)",
            "waitingTakes: \(facts.waitingTakes)",
            "historyTakes: \(facts.historyTakes)",
            "pill: \(facts.pillStyle)",
            "",
            "recent activity (\(logLines) lines at most, oldest first):"
        ] + (facts.log.isEmpty ? ["(nothing yet)"] : facts.log)
        return lines.joined(separator: "\n") + "\n"
    }

    static func fileName(_ date: Date) -> String {
        "murmur-diagnostics-\(date.formatted(.iso8601.year().month().day())).txt"
    }

    /// A model id as murmur lists it, or only its length: an id murmur does
    /// not list was typed by hand, and could hold a pasted key or address.
    static func listed(_ id: String, in catalog: ProviderCatalog) -> String {
        let known = catalog.providers.contains { provider in
            provider.sttModels.contains { $0.id == id } || provider.llmModels.contains { $0.id == id }
        }
        return known ? id : "not listed by murmur (\(id.count) characters)"
    }

    /// A preset's name for an address, or custom.
    static func name(_ baseUrl: String, in catalog: ProviderCatalog) -> String {
        catalog.preset(forBaseUrl: baseUrl)?.name ?? "custom"
    }

    /// The facts as they are on this phone now. The keyboard's last take is
    /// noted in the log first, so the report includes it.
    @MainActor static func facts(
        catalog: ProviderCatalog, connections: ConnectionStore = ConnectionStore(), cleanup: CleanupStore = CleanupStore(),
        ring: any KeyRing = KeychainKeyRing(), log: ActivityLog = .standard, waiting: WaitingStore = .standard,
        history: HistoryStore = .standard, defaults: UserDefaults = .standard, keyboard: KeyboardReport? = KeyboardReport.read(),
        session: SessionState = SessionState.read(), mailbox: Mailbox? = Mailbox.shared, pill: PillLook = PillLook.read(), now: Date = .now
    ) -> DiagnosticsFacts {
        log.noteKeyboard(mailbox?.read(), at: now)
        let connection = connections.load(catalog: catalog)
        let settings = cleanup.load()
        let info = Bundle.main.infoDictionary ?? [:]
        let minutes = defaults.integer(forKey: Session.lengthKey)
        return DiagnosticsFacts(
            generated: now,
            appVersion: info["CFBundleShortVersionString"] as? String ?? "unknown",
            build: info["CFBundleVersion"] as? String ?? "unknown",
            system: "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
            device: model(),
            keyboard: keyboard?.fullAccess == true ? keyboard : nil,
            sessionMinutes: Session.Length(rawValue: minutes)?.rawValue ?? Session.Length.fifteen.rawValue,
            sessionOn: session.isOn(at: now),
            provider: name(connection.transcription.baseUrl, in: catalog),
            sttModel: listed(connection.transcription.sttModel, in: catalog),
            cleanupProvider: name(connection.cleanupBaseUrl, in: catalog),
            cleanupModel: listed(connection.cleanupModel, in: catalog),
            keySaved: ((try? ring.key(for: connection.transcription.baseUrl)) ?? nil) != nil,
            level: settings.level.rawValue,
            numbers: settings.numbers.rawValue,
            smartLists: settings.smartLists,
            corrections: settings.corrections,
            polish: settings.polish,
            dictionaryEntries: settings.dictionary.count,
            expansionEntries: settings.expansions.count,
            waitingTakes: waiting.list().count,
            historyTakes: history.list().count,
            pillStyle: pill.style.rawValue,
            log: log.recent(logLines)
        )
    }

    /// The phone's model identifier, such as iPhone17,1 (in the simulator,
    /// the model it simulates).
    static func model() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { bytes in
            String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
        }
    }
}
