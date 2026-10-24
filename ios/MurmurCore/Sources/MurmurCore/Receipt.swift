// SPDX-License-Identifier: GPL-3.0-only
// The note receipt (ios/prd.json IOS-023): desktop's src/shared/receipt.ts
// in Swift. What the keyboard says when a note is saved and what Home's
// newest note row shows: the note's first line, and where it landed.
import Foundation

public enum Receipt {
    /// The note's first line, markdown lead stripped, cut near max at a word.
    public static func line(_ text: String, max: Int) -> String {
        let first = Todo.lines(text)
            .map { JS.trim(JS.replace(JS.replace($0, markup, all: false, with: ""), Sorter.spaces, with: " ")) }
            .first { !$0.isEmpty } ?? ""
        let units = Array(first.utf16)
        if units.count <= max { return first }
        let cut = String(decoding: units[0..<max], as: UTF16.self)
        let space = units[max] == 0x20 ? max : JS.lastIndex(of: " ", in: cut as NSString)
        let kept = Double(space) > Double(max) * 0.6 ? String(decoding: units[0..<space], as: UTF16.self) : cut
        return JS.replace(kept, Sorter.leadLineTail, with: "") + "…"
    }

    /// A file named for a place a person recognizes: todo.md, or
    /// inbox/2026-10-02.md for a file named only by its date.
    public static func placeName(_ relative: String) -> String {
        let parts = segments(relative)
        let name = parts.last ?? relative
        return dateLike(name) && parts.count >= 2 ? "\(parts[parts.count - 2])/\(name)" : name
    }

    /// The word after noted to: the folder for a dated daily file (inbox),
    /// else the file's name without .md, cut to fit the pill.
    public static func pillPlace(_ relative: String, max: Int) -> String {
        let parts = segments(relative)
        let name = parts.last ?? ""
        let word = dateLike(name) && parts.count >= 2 ? parts[parts.count - 2] : JS.replace(name, textExtension, with: "")
        let units = Array(word.utf16)
        return units.count > max ? String(decoding: units[0..<(max - 1)], as: UTF16.self) + "…" : word
    }

    /// Where a note is: the inbox, then what a sort filed it into.
    public static func whereText(inbox: String, sorted: [String]) -> String {
        let place = placeName(inbox)
        guard !sorted.isEmpty else { return place }
        let filed = sorted.map(placeName)
        let list = filed.count == 1 ? filed[0] : filed.dropLast().joined(separator: ", ") + " and " + (filed.last ?? "")
        return "\(place), filed to \(list)"
    }

    static func segments(_ relative: String) -> [String] {
        let source = relative as NSString
        return source.components(separatedBy: CharacterSet(charactersIn: "\\/")).filter { !$0.isEmpty }
    }

    static func dateLike(_ name: String) -> Bool {
        Sorter.test(dateName, JS.replace(name, anyExtension, all: false, with: ""))
    }

    static let markup = JS.regex("^\(JS.space)*(?:[-*+]\(JS.space)+(?:\\[[ xX]\\]\(JS.space)+)?|[0-9]+[.)]\(JS.space)+|#{1,6}\(JS.space)+|>\(JS.space)*)")
    static let dateName = JS.regex("^[0-9][0-9._-]*\(JS.end)")
    static let anyExtension = JS.regex("\\.[^.]+\(JS.end)")
    static let textExtension = JS.regex("\\.(?:[mM][dD]|[tT][xX][tT])\(JS.end)")
}
