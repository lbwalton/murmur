// SPDX-License-Identifier: GPL-3.0-only
// The notes folder on iPhone (ios/prd.json IOS-023): desktop's markdown
// files, the same layout and the same words. They live in murmur's own
// container, out of backups as history is, until you pick a folder of
// your own, such as an Obsidian vault, as desktop lets you. A picked
// folder is reached through the access iOS gave when you picked it, and
// every read and write is coordinated with the app or iCloud that also
// keeps it. Writes are atomic, so a note is either all there or not at all,
// and an append adds bytes, as desktop's does: a file murmur cannot read is
// never replaced, and bytes it cannot read as text stay as they were.
import Foundation
import MurmurCore

struct NoteStore: NoteFolder, Equatable {
    let root: URL
    /// A folder you picked, kept by another app or iCloud.
    var picked = false
    /// A picked folder murmur can no longer reach: reads find nothing and
    /// writes fail, so a note is typed or kept elsewhere instead of lost.
    var lost = false
    /// The picked folder is murmur's own folder, the one the Mac made in a
    /// vault (LaBroi, 2026-10-18), so the layout's murmur folder is this one.
    var inside = false

    static let standard = NoteStore(root: URL.applicationSupportDirectory.appending(path: "notes", directoryHint: .isDirectory))
    /// The folder the bundled layout keeps every file in: murmur/inbox,
    /// murmur/todo.md, murmur/ideas.md.
    static let layoutFolder = "murmur"
    /// The folder iCloud Drive keeps Obsidian's vaults in, on any device.
    static let obsidianCloud = ["iCloud~md~obsidian", "Documents"]
    /// The rest of iCloud Drive, where Obsidian on iPhone opens no vault.
    static let cloudDrive = "com~apple~CloudDocs"

    /// A folder you picked, as murmur uses it: one named murmur that is not
    /// itself a vault is murmur's folder, so the notes go straight into it.
    static func picked(_ url: URL) -> NoteStore {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let named = url.lastPathComponent.lowercased() == layoutFolder
        return NoteStore(root: url, picked: true, inside: named && !isVault(url))
    }

    /// The Obsidian vault the notes are in, as its name and the picked
    /// folder's path inside it: the vault the path runs through in iCloud
    /// Drive's Obsidian folder, or the picked folder itself when it holds
    /// the settings folder Obsidian keeps in every vault. Read from the
    /// path alone where it can be, so no lookup on disk can disagree.
    private var vault: (name: String, below: [String])? {
        guard picked else { return nil }
        let parts = root.pathComponents
        let cloud = Self.obsidianCloud
        if let at = parts.indices.first(where: { Array(parts[$0...].prefix(cloud.count)) == cloud }), at + cloud.count < parts.count {
            let top = at + cloud.count
            return (parts[top], Array(parts[(top + 1)...]))
        }
        // Obsidian on iPhone opens vaults only in its own folders.
        guard !parts.contains(Self.cloudDrive) else { return nil }
        let found = reachable { Self.isVault(root) } ?? false
        return found ? (root.lastPathComponent, []) : nil
    }

    /// Obsidian's link to a file here, when the notes are in a vault.
    func obsidianLink(_ relative: String) -> URL? {
        guard let vault, let inside = parts(relative) else { return nil }
        return NoteLink.obsidian(vault: vault.name, file: (vault.below + inside).joined(separator: "/"))
    }

    private static func isVault(_ url: URL) -> Bool {
        var isFolder: ObjCBool = false
        let settings = url.appending(path: ".obsidian", directoryHint: .isDirectory)
        return FileManager.default.fileExists(atPath: settings.path(percentEncoded: false), isDirectory: &isFolder) && isFolder.boolValue
    }

    func read(_ relative: String) -> String? {
        guard let url = url(relative) else { return nil }
        // Text that is not UTF-8 reads as nothing, so nothing rewrites it.
        return reachable { coordinated(reading: url) }.flatMap { $0 }.flatMap { String(data: $0, encoding: .utf8) }
    }

    func append(_ relative: String, _ text: String) throws {
        try write(relative, merging: true) { $0 + Data(text.utf8) }
    }

    func replace(_ relative: String, _ text: String) throws {
        try write(relative, merging: false) { _ in Data(text.utf8) }
    }

    /// The inbox days there are, newest first, as paths inside the folder:
    /// the files beside today's whose names the inbox's template makes.
    func inboxDays(_ inbox: NoteInbox) -> [String] {
        guard let today = url(inbox.today) else { return [] }
        let dir = today.deletingLastPathComponent()
        let folder = inbox.folder
        let names = reachable { try? FileManager.default.contentsOfDirectory(atPath: dir.path(percentEncoded: false)) }.flatMap { $0 } ?? []
        let day = inbox.days()
        return names.filter(day).sorted(by: >).map { folder.isEmpty ? $0 : "\(folder)/\($0)" }
    }

    /// A path inside the folder, never outside it. In murmur's own folder
    /// the layout's murmur folder is the folder itself.
    func url(_ relative: String) -> URL? {
        guard let parts = parts(relative) else { return nil }
        let url = parts.reduce(root) { $0.appending(path: $1) }
        // Whatever the parts say, the file is inside the folder. Read as
        // text: standardizedFileURL drops a leading /private only when the
        // shorter path exists, so a new file in a vault would look outside.
        let base = root.standardized.path(percentEncoded: false)
        let inside = base.hasSuffix("/") ? base : base + "/"
        return url.standardized.path(percentEncoded: false).utf16.starts(with: inside.utf16) ? url : nil
    }

    /// A path's parts below the folder, nil for one that would leave it.
    /// Split on code units, as the path guard reads them: a slash before a
    /// combining mark is one Character in Swift, and still a slash here.
    private func parts(_ relative: String) -> [String]? {
        var parts = relative.utf16.split(separator: Self.slash).map { String(decoding: $0, as: UTF16.self) }
        let dots = parts.contains { $0.utf16.elementsEqual(".".utf16) || $0.utf16.elementsEqual("..".utf16) }
        guard !parts.isEmpty, !dots else { return nil }
        if inside, parts.count > 1, parts[0].lowercased() == Self.layoutFolder { parts.removeFirst() }
        return parts
    }

    private static let slash: UInt16 = 0x2F

    private func write(_ relative: String, merging: Bool, _ next: (Data) -> Data) throws {
        guard !lost, let url = url(relative) else { throw CocoaError(.fileWriteNoPermission) }
        let scoped = picked && root.startAccessingSecurityScopedResource()
        defer { if scoped { root.stopAccessingSecurityScopedResource() } }
        // A picked folder that was deleted or moved is never made again.
        var isFolder: ObjCBool = false
        if picked, !FileManager.default.fileExists(atPath: root.path(percentEncoded: false), isDirectory: &isFolder) || !isFolder.boolValue {
            throw CocoaError(.fileNoSuchFile)
        }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var failure: Error?
        var coordination: NSError?
        NSFileCoordinator().coordinate(writingItemAt: url, options: merging ? .forMerging : .forReplacing, error: &coordination) { url in
            do {
                let current = merging ? try Self.existing(url) : Data()
                try next(current).write(to: url, options: picked ? [.atomic] : [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            } catch {
                failure = error
            }
        }
        if let error = coordination ?? failure { throw error }
        if !picked { try excludeFromBackup() }
    }

    /// A file's bytes, empty when there is no file yet; any other failure
    /// to read throws, so the file is never replaced by the new text alone.
    private static func existing(_ url: URL) throws -> Data {
        do {
            return try Data(contentsOf: url)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return Data()
        }
    }

    private func coordinated(reading url: URL) -> Data? {
        var data: Data?
        var coordination: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordination) { data = try? Data(contentsOf: $0) }
        return data
    }

    /// Runs body inside the picked folder's access; nil when it is lost.
    private func reachable<T>(_ body: () -> T) -> T? {
        guard !lost else { return nil }
        let scoped = picked && root.startAccessingSecurityScopedResource()
        defer { if scoped { root.stopAccessingSecurityScopedResource() } }
        return body()
    }

    private func excludeFromBackup() throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var folder = root
        try folder.setResourceValues(values)
    }
}

/// Which folder the notes live in, kept on this iPhone: murmur's own, or
/// one you picked, remembered as a bookmark iOS can open again later.
struct NotesFolderChoice {
    static let bookmarkKey = "notes.folderBookmark"
    static let nameKey = "notes.folderName"

    let defaults: UserDefaults

    init(_ defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The picked folder's name, or nil for murmur's own.
    var name: String? { defaults.string(forKey: Self.nameKey) }

    /// Remembers a folder from the picker.
    func pick(_ url: URL) throws {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
        defaults.set(bookmark, forKey: Self.bookmarkKey)
        defaults.set(url.lastPathComponent, forKey: Self.nameKey)
    }

    /// Back to murmur's own folder.
    func forget() {
        defaults.removeObject(forKey: Self.bookmarkKey)
        defaults.removeObject(forKey: Self.nameKey)
    }

    /// The folder the notes live in now.
    func store(own: NoteStore = .standard) -> NoteStore {
        guard let bookmark = defaults.data(forKey: Self.bookmarkKey) else { return own }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: bookmark, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else {
            return NoteStore(root: own.root, picked: true, lost: true)
        }
        if stale {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            if let fresh = try? url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil) {
                defaults.set(fresh, forKey: Self.bookmarkKey)
            }
        }
        return NoteStore.picked(url)
    }
}

/// The inbox as murmur lists its days: the template in use and the file it
/// names today. A day is a file beside today's whose name the template's
/// file part makes, so the list, and a note link, show nothing else.
struct NoteInbox: Equatable, Sendable {
    let template: String
    let today: String

    init(template: String, today: String) {
        self.template = template
        self.today = today
    }

    /// shared/sorter.json's inbox at a moment.
    init(rules: SorterRules, at moment: NoteMoment) {
        self.init(template: rules.layout.inbox, today: NoteFiles.inbox(moment, rules: rules))
    }

    /// Today's file's folder, as a path inside the notes folder.
    var folder: String {
        let units = Array(today.utf16)
        return units.lastIndex(of: 0x2F).map { String(decoding: units[..<$0], as: UTF16.self) } ?? ""
    }

    /// Tells a day by its file name: one the template's file part makes,
    /// each token as the digits it renders to, the rest as typed, in any
    /// case. Built once for a listing.
    func days() -> (String) -> Bool {
        guard let pattern else { return { _ in false } }
        return { name in pattern.firstMatch(in: name, range: NSRange(location: 0, length: (name as NSString).length)) != nil }
    }

    private var pattern: NSRegularExpression? {
        // The template trimmed as a whole, as the path guard trims it, so a
        // space at the start of the file part stays.
        let units = Array(template.trimmingCharacters(in: .whitespacesAndNewlines).utf16)
        let start = units.lastIndex(where: { $0 == 0x2F || $0 == 0x5C }).map { $0 + 1 } ?? 0
        let file = String(decoding: units[start...], as: UTF16.self) as NSString
        var regex = "^"
        var at = 0
        for match in Self.token.matches(in: file as String, range: NSRange(location: 0, length: file.length)) {
            regex += NSRegularExpression.escapedPattern(for: file.substring(with: NSRange(location: at, length: match.range.location - at)))
            let key = file.substring(with: match.range(at: 1))
            regex += Self.digits[key] ?? NSRegularExpression.escapedPattern(for: file.substring(with: match.range))
            at = match.range.location + match.range.length
        }
        regex += NSRegularExpression.escapedPattern(for: file.substring(from: at)) + "\\z"
        return try? NSRegularExpression(pattern: regex, options: .caseInsensitive)
    }

    private static let token = try! NSRegularExpression(pattern: "\\{([a-z]+)\\}")
    /// What each token renders to in a path (NotePath.resolve).
    private static let digits = [
        "date": "[0-9]{4}-[0-9]{2}-[0-9]{2}", "time": "[0-9]{2}-[0-9]{2}", "datetime": "[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}-[0-9]{2}",
        "year": "[0-9]{4}", "month": "[0-9]{2}", "day": "[0-9]{2}"
    ]
}
