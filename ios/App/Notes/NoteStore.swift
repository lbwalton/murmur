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

    static let standard = NoteStore(root: URL.applicationSupportDirectory.appending(path: "notes", directoryHint: .isDirectory))

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

    /// The inbox days there are, newest first, as paths inside the folder.
    func inboxDays(rules: SorterRules) -> [String] {
        let folder = (rules.layout.inbox as NSString).deletingLastPathComponent
        guard let dir = url(folder) else { return [] }
        let names = reachable { try? FileManager.default.contentsOfDirectory(atPath: dir.path(percentEncoded: false)) }.flatMap { $0 } ?? []
        return names.filter { $0.hasSuffix(".md") }.sorted(by: >).map { "\(folder)/\($0)" }
    }

    /// A path inside the folder, never outside it.
    func url(_ relative: String) -> URL? {
        let parts = relative.split(separator: "/", omittingEmptySubsequences: true)
        guard !parts.isEmpty, !parts.contains(where: { $0 == "." || $0 == ".." }) else { return nil }
        return parts.reduce(root) { $0.appending(path: String($1)) }
    }

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
        return NoteStore(root: url, picked: true)
    }
}
