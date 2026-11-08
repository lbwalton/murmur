// SPDX-License-Identifier: GPL-3.0-only
// Links that open a note (ios/prd.json IOS-023, LaBroi 2026-10-18): a tap
// on a note's receipt, in murmur or under the pill, opens the day's file
// in Obsidian when the notes are in a vault, and in murmur when they are
// not, or Obsidian is not there. murmur's link only shows a file, never
// starts a take, so any app opening it does no harm.
import Foundation

enum NoteLink {
    /// What a link's value keeps as it is: letters, digits, and - . _ ~.
    /// Everything else is encoded, a slash as %2F, as Obsidian asks
    /// (help.obsidian.md, Obsidian URI, checked 2026-10-18).
    private static let plain = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    /// Obsidian's link to a file, by the vault's name and the file's path
    /// from the vault's top.
    static func obsidian(vault: String, file: String) -> URL? {
        guard !vault.isEmpty, !file.isEmpty,
              let name = vault.addingPercentEncoding(withAllowedCharacters: plain),
              let path = file.addingPercentEncoding(withAllowedCharacters: plain)
        else { return nil }
        return URL(string: "obsidian://open?vault=\(name)&file=\(path)")
    }

    /// murmur's link to a note file: <scheme>://note?file=<path in the
    /// notes folder>. The scheme is TakeLink's.
    static func murmur(file: String, scheme: String = TakeLink.scheme) -> URL? {
        guard !scheme.isEmpty, !file.isEmpty else { return nil }
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = "note"
        parts.queryItems = [URLQueryItem(name: "file", value: file)]
        return parts.url
    }

    /// The file murmur's link names, or nil for any other link.
    static func file(in url: URL, scheme: String = TakeLink.scheme) -> String? {
        guard !scheme.isEmpty, let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == scheme.lowercased(), parts.host == "note",
              let file = parts.queryItems?.first(where: { $0.name == "file" })?.value, !file.isEmpty
        else { return nil }
        return file
    }
}
