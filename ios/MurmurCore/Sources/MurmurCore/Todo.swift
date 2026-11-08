// SPDX-License-Identifier: GPL-3.0-only
// Reading the tasks and ideas files back (ios/prd.json IOS-023):
// desktop's src/shared/todo.ts in Swift. The task reminder counts what is
// still open and names the next few; the one edit murmur ever makes in
// place is ticking a single box, every other byte kept.
import Foundation

public struct ListItem: Equatable, Sendable {
    public let text: String
    public let done: Bool
    /// The heading the item sits under, "" above them all.
    public let group: String
    /// A checkbox line; a plain bullet (the ideas file) cannot be ticked.
    public let checkbox: Bool
}

/// One line of a tasks or ideas list as the iPhone shows it (IOS-023).
public struct ListRow: Equatable, Sendable {
    public let text: String
    public let done: Bool
    public let checkbox: Bool
    /// A line ending in a colon that introduces the items under it.
    public let lead: Bool
    /// Indented under another line.
    public let nested: Bool

    public init(text: String, done: Bool, checkbox: Bool, lead: Bool, nested: Bool) {
        self.text = text
        self.done = done
        self.checkbox = checkbox
        self.lead = lead
        self.nested = nested
    }
}

public enum Todo {
    /// Every checkbox line, in file order, fences and empty boxes skipped.
    public static func items(_ text: String) -> [ListItem] {
        var items: [ListItem] = []
        var group = ""
        var fenced = false
        for line in lines(text) {
            if Sorter.test(fence, line) {
                fenced.toggle()
                continue
            }
            if fenced { continue }
            if let heading = capture(headingLine, line) {
                group = JS.trim(heading)
                continue
            }
            guard let box = checkboxParts(line) else { continue }
            let itemText = JS.trim(JS.replace(box.text, trailingLink, with: ""))
            if itemText.isEmpty { continue }
            items.append(ListItem(text: itemText, done: box.mark != " ", group: group, checkbox: true))
        }
        return items
    }

    /// Every bullet, checkbox or plain, lead lines left out.
    public static func listItems(_ text: String) -> [ListItem] {
        var items: [ListItem] = []
        var group = ""
        var fenced = false
        let all = lines(text)
        for (index, line) in all.enumerated() {
            if Sorter.test(fence, line) {
                fenced.toggle()
                continue
            }
            if fenced { continue }
            if let heading = capture(headingLine, line) {
                group = JS.trim(heading)
                continue
            }
            if let box = checkboxParts(line) {
                let itemText = JS.trim(JS.replace(box.text, trailingLink, with: ""))
                if !itemText.isEmpty { items.append(ListItem(text: itemText, done: box.mark != " ", group: group, checkbox: true)) }
                continue
            }
            if let bullet = capture(bulletLine, line) {
                if isLeadLine(line, all, index) { continue }
                let itemText = JS.trim(JS.replace(bullet, trailingLink, with: ""))
                if !itemText.isEmpty { items.append(ListItem(text: itemText, done: false, group: group, checkbox: false)) }
            }
        }
        return items
    }

    /// The list as the iPhone shows it (IOS-023): listItems' items, with
    /// the lead lines it leaves out kept as rows of their own, and each line
    /// marked nested when it is indented under another.
    public static func listRows(_ text: String) -> [ListRow] {
        var rows: [ListRow] = []
        var fenced = false
        let all = lines(text)
        for (index, line) in all.enumerated() {
            if Sorter.test(fence, line) {
                fenced.toggle()
                continue
            }
            if fenced { continue }
            let nested = trimStart(line).utf16.count < line.utf16.count
            if let box = checkboxParts(line) {
                let itemText = JS.trim(JS.replace(box.text, trailingLink, with: ""))
                if !itemText.isEmpty { rows.append(ListRow(text: itemText, done: box.mark != " ", checkbox: true, lead: false, nested: nested)) }
                continue
            }
            if capture(headingLine, line) != nil { continue }
            if let bullet = capture(bulletLine, line) {
                let itemText = JS.trim(JS.replace(bullet, trailingLink, with: ""))
                if !itemText.isEmpty { rows.append(ListRow(text: itemText, done: false, checkbox: false, lead: isLeadLine(line, all, index), nested: nested)) }
            }
        }
        return rows
    }

    /// Tick the nth checkbox, counted as items(_:) counts: the box's space
    /// becomes an x and nothing else changes. nil when it is not there;
    /// the text unchanged with done true when it was already ticked.
    public static func tick(_ text: String, nth: Int) -> (text: String?, alreadyDone: Bool) {
        var parts = splitKeepingBreaks(text)
        var count = -1
        var fenced = false
        for i in stride(from: 0, to: parts.count, by: 2) {
            let line = parts[i]
            if Sorter.test(fence, line) {
                fenced.toggle()
                continue
            }
            if fenced { continue }
            guard let box = checkboxParts(line) else { continue }
            if JS.trim(JS.replace(box.text, trailingLink, with: "")).isEmpty { continue }
            count += 1
            if count != nth { continue }
            if box.mark != " " { return (nil, true) }
            let source = line as NSString
            let at = source.range(of: "[ ]", options: .literal).location
            parts[i] = source.replacingCharacters(in: NSRange(location: at, length: 3), with: "[x]")
            return (parts.joined(), false)
        }
        return (nil, false)
    }

    /// One line for a reminder: the count, then as much of the next items
    /// as fits. Empty when nothing is open.
    public static func reminderBody(_ items: [ListItem], maxChars: Int) -> String {
        let open = items.filter { !$0.done }
        if open.isEmpty { return "" }
        let count = "\(open.count) open \(open.count == 1 ? "task" : "tasks")"
        let countLength = count.utf16.count
        var parts: [String] = []
        var used = countLength + 2
        for item in open {
            let length = item.text.utf16.count
            let cost = parts.isEmpty ? length : length + 2
            if used + cost > maxChars { break }
            parts.append(item.text)
            used += cost
        }
        if !parts.isEmpty { return "\(count): \(parts.joined(separator: "; "))" }
        let room = maxChars - countLength - 3
        guard room > 8 else { return count }
        let units = Array(open[0].text.utf16.prefix(room))
        return "\(count): \(trimEnd(String(decoding: units, as: UTF16.self)))…"
    }

    // MARK: Helpers

    /// text.split(/\r?\n/)
    static func lines(_ text: String) -> [String] {
        let parts = splitKeepingBreaks(text)
        return stride(from: 0, to: parts.count, by: 2).map { parts[$0] }
    }

    /// text.split(/(\r?\n)/): lines and the breaks between them, alternating.
    static func splitKeepingBreaks(_ text: String) -> [String] {
        let units = Array(text.utf16)
        var out: [String] = []
        var start = 0
        var i = 0
        while i < units.count {
            if units[i] == 0x0A {
                let breakStart = i > start && units[i - 1] == 0x0D ? i - 1 : i
                out.append(String(decoding: units[start..<breakStart], as: UTF16.self))
                out.append(String(decoding: units[breakStart...i], as: UTF16.self))
                start = i + 1
            }
            i += 1
        }
        out.append(String(decoding: units[start..<units.count], as: UTF16.self))
        return out
    }

    /// String.prototype.trimEnd.
    static func trimEnd(_ text: String) -> String {
        var units = Array(text.utf16)
        while let last = units.last, JS.isSpace(last) { units.removeLast() }
        return String(decoding: units, as: UTF16.self)
    }

    static func checkboxParts(_ line: String) -> (mark: String, text: String)? {
        let source = line as NSString
        guard let match = checkbox.firstMatch(in: line, range: NSRange(location: 0, length: source.length)) else { return nil }
        let mark = source.substring(with: match.range(at: 1)).lowercased()
        return (mark == "x" ? "x" : " ", source.substring(with: match.range(at: 2)))
    }

    static func capture(_ regex: NSRegularExpression, _ line: String) -> String? {
        let source = line as NSString
        guard let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: source.length)) else { return nil }
        return source.substring(with: match.range(at: 1))
    }

    /// A plain bullet ending in a colon whose next non-empty line is a deeper bullet.
    static func isLeadLine(_ line: String, _ lines: [String], _ index: Int) -> Bool {
        guard trimEnd(line).utf16.last == 0x3A else { return false }
        guard let next = lines[(index + 1)...].first(where: { !JS.trim($0).isEmpty }) else { return false }
        func indent(_ l: String) -> Int {
            l.utf16.count - trimStart(l).utf16.count
        }
        return Sorter.test(deeperBullet, next) && indent(next) > indent(line)
    }

    static func trimStart(_ text: String) -> String {
        let units = Array(text.utf16)
        var start = 0
        while start < units.count, JS.isSpace(units[start]) { start += 1 }
        return String(decoding: units[start...], as: UTF16.self)
    }

    /// JavaScript's . : anything but a line terminator.
    static let anything = "[^\\n\\r\\u2028\\u2029]"
    static let checkbox = JS.regex("^\(JS.space)*[-*+]\(JS.space)+\\[( |x|X)\\]\(JS.space)+(\(anything)*)\(JS.end)")
    static let bulletLine = JS.regex("^\(JS.space)*[-*+]\(JS.space)+(?!\\[[ xX]\\](?:\(JS.space)|\(JS.end)))(\(anything)*)\(JS.end)")
    static let headingLine = JS.regex("^\(JS.space)*#{1,6}\(JS.space)+(\(anything)*)\(JS.end)")
    static let fence = JS.regex("^\(JS.space)*(```|~~~)")
    static let trailingLink = JS.regex("\(JS.space)*\\(\\[[^\\]]*\\]\\([^)]*\\)\\)\(JS.space)*\(JS.end)")
    static let deeperBullet = JS.regex("^\(JS.space)*[-*+]\(JS.space)")
}
