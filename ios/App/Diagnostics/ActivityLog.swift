// SPDX-License-Identifier: GPL-3.0-only
// The activity log (ios/prd.json IOS-014): one short line for what
// happened to each take, kept in the app's own container for the
// diagnostics report. Lines are built only from the events below, which
// carry kinds, numbers, and short take ids, so nothing you said and no key
// can reach a line. Small and capped: past its budget the file rolls over
// once, and writing it never stops a take.
import Foundation
import MurmurCore

/// What the keyboard did with a take's words.
enum KeyboardOutcome: String, Sendable {
    /// Typed into the field.
    case inserted
    /// The field was gone, so they waited as Insert last.
    case insertLast = "insert-last"
}

/// Something worth a line. Every case carries only numbers, flags, and
/// fixed names.
enum ActivityEvent: Equatable, Sendable {
    /// A take with speech in it went to the provider.
    case captured(durationMs: Int, peak: Double, voicedMs: Int)
    /// Nothing to type: the gate heard no speech (not sent), or the
    /// provider and cleanup left nothing (sent).
    case heardNothing(durationMs: Int, peak: Double, voicedMs: Int, sent: Bool)
    /// The take came back as this many words.
    case words(count: Int, retried: Bool)
    /// Transcription failed; the audio waits for a retry when saved.
    case failed(TakeFailure, saved: Bool, retried: Bool)
    case micOff
    case micFailed
    /// Dropped before it was sent: you left the screen, the keyboard went
    /// away, or it ran to its limit.
    case cancelled(durationMs: Int)
    /// iOS would not show the session's Live Activity (IOS-016).
    case liveActivityRefused
    /// What the keyboard did with a keyboard take's words.
    case keyboard(UUID, KeyboardOutcome)
    /// A transform (IOS-024): rewritten, or kept with desktop's reason.
    /// Never the words.
    case transform(kept: String?)

    /// The failure kinds a line may name; any other is other.
    static let kinds: Set<String> = ["auth", "badrequest", "server", "network", "timeout", "nospeech"]

    var line: String {
        switch self {
        case .captured(let durationMs, let peak, let voicedMs):
            "take captured ms=\(durationMs) peak=\(Self.level(peak)) voicedMs=\(voicedMs)"
        case .heardNothing(let durationMs, let peak, let voicedMs, let sent):
            "take heard-nothing sent=\(sent) ms=\(durationMs) peak=\(Self.level(peak)) voicedMs=\(voicedMs)"
        case .words(let count, let retried):
            "take words count=\(count)\(retried ? " retried" : "")"
        case .failed(let failure, let saved, let retried):
            "take failed kind=\(Self.kinds.contains(failure.kind) ? failure.kind : "other")\(Self.code(failure.detail)) saved=\(saved)\(retried ? " retried" : "")"
        case .micOff:
            "take mic-off"
        case .micFailed:
            "take mic-failed"
        case .cancelled(let durationMs):
            "take cancelled ms=\(durationMs)"
        case .liveActivityRefused:
            "session live-activity-refused"
        case .keyboard(let take, let outcome):
            "keyboard take=\(Self.short(take)) \(outcome.rawValue)"
        case .transform(let kept):
            kept.map { "transform kept reason=\($0.replacingOccurrences(of: " ", with: "-"))" } ?? "transform rewritten"
        }
    }

    /// A level to three places.
    static func level(_ value: Double) -> String {
        String(format: "%.3f", min(max(value, 0), 1))
    }

    /// A take's first eight characters: enough to follow it, nothing more.
    static func short(_ take: UUID) -> String {
        String(take.uuidString.lowercased().prefix(8))
    }

    /// The status or error number in a failure's detail, and nothing else
    /// from it: " status=401", " urlError=-1009", or empty.
    static func code(_ detail: String) -> String {
        let parts = detail.split(separator: " ")
        guard let last = parts.last, let number = Int(last) else { return "" }
        if detail.hasPrefix("http ") { return " status=\(number)" }
        if detail.hasPrefix("url error ") { return " urlError=\(number)" }
        return ""
    }
}

struct ActivityLog: Sendable {
    /// About 1,200 lines; one older file is kept beside it, so the log
    /// never holds more than twice this.
    static let budget = 64 * 1024
    let file: URL

    static let standard = ActivityLog(file: URL.applicationSupportDirectory.appending(path: "logs", directoryHint: .isDirectory).appending(path: "activity.log"))

    /// The file the log rolled over to.
    var older: URL {
        file.deletingLastPathComponent().appending(path: file.deletingPathExtension().lastPathComponent + ".1.log")
    }

    /// Adds a line. Never throws: a log that cannot be written is skipped.
    func write(_ event: ActivityEvent, at date: Date = .now) {
        let line = Data("\(date.formatted(.iso8601)) \(event.line)\n".utf8)
        do {
            try prepare()
            let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0
            if size + line.count > Self.budget {
                try? FileManager.default.removeItem(at: older)
                try FileManager.default.moveItem(at: file, to: older)
                try prepare()
            }
            let handle = try FileHandle(forWritingTo: file)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: line)
        } catch {
            // The log is for diagnostics; a take never waits on it.
        }
    }

    /// The newest lines, oldest first.
    func recent(_ count: Int = 200) -> [String] {
        let text = [older, file].compactMap { try? String(contentsOf: $0, encoding: .utf8) }.joined()
        return Array(text.split(separator: "\n").suffix(count).map(String.init))
    }

    /// Logs what the keyboard did with the take in the mailbox, once each:
    /// typed, or offered as Insert last (and typed later, if it was).
    func noteKeyboard(_ entry: MailboxEntry?, at date: Date = .now) {
        guard let entry, entry.phase == .ready, let typed = entry.typed else { return }
        let event = ActivityEvent.keyboard(entry.take, typed == .inserted ? .inserted : .insertLast)
        guard !recent(Self.budget).contains(where: { $0.hasSuffix(" " + event.line) }) else { return }
        write(event, at: date)
    }

    /// Clears both files.
    func clear() {
        try? FileManager.default.removeItem(at: file)
        try? FileManager.default.removeItem(at: older)
    }

    /// The folder (out of backups) and the file (writable after first
    /// unlock, as a take may land with the phone locked).
    private func prepare() throws {
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = folder
        try url.setResourceValues(values)
        if !FileManager.default.fileExists(atPath: file.path) {
            try Data().write(to: file, options: .completeFileProtectionUntilFirstUserAuthentication)
        }
    }
}
