// SPDX-License-Identifier: GPL-3.0-only
// JavaScript's meaning, in Swift. Desktop's rules are JavaScript regular
// expressions and string methods; ICU (NSRegularExpression) reads most of
// them the same way, but not all: in JavaScript \b and \w are ASCII only,
// \s is a fixed set, $ without the m flag is the very end of the text,
// the i flag matches fewer letters than ICU's case folding, indexes count
// UTF-16 units, and Math.round sends halves up. These pieces close those
// gaps, so MurmurCore gives desktop's answer beyond the shared vectors
// too (ios/prd.json conventions.parity).
import Foundation

enum JS {
    /// \b: between an ASCII word character and anything else.
    static let boundary = "(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))"
    /// The members of \s, for use inside a character class.
    static let spaceMembers = "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"
    /// \s
    static let space = "[\(spaceMembers)]"
    /// \S
    static let nonSpace = "[^\(spaceMembers)]"
    /// $ without the m flag: the very end. (ICU's $ also matches before a
    /// final line break.)
    static let end = "\\z"
    /// $ with the m flag: before any of JavaScript's line terminators.
    static let lineEnd = "(?=[\\n\\r\\u2028\\u2029]|\\z)"
    /// ^ with the m flag: after any of JavaScript's line terminators.
    static let lineStart = "(?:^|(?<=[\\n\\r\\u2028\\u2029]))"

    /// A literal, safe inside a pattern.
    static func escape(_ text: String) -> String {
        NSRegularExpression.escapedPattern(for: text)
    }

    /// Patterns here are built from escaped literals, so one that fails to
    /// compile is a bug in this file, never bad input. Always case
    /// sensitive: caseless(_:) gives JavaScript's i flag instead.
    static func regex(_ pattern: String) -> NSRegularExpression {
        do {
            return try NSRegularExpression(pattern: pattern)
        } catch {
            preconditionFailure("MurmurCore pattern \(pattern) does not compile: \(error)")
        }
    }

    /// A literal that matches the way JavaScript's i flag does (without
    /// the u flag): two characters match when their uppercase forms are
    /// the same single UTF-16 unit, and nothing outside ASCII ever matches
    /// an ASCII letter. ICU's own case-insensitive mode folds further (ß as
    /// ss, the long s as s, the Kelvin sign as k), so MurmurCore never uses it.
    static func caseless(_ literal: String) -> String {
        var out = ""
        for scalar in literal.unicodeScalars {
            guard scalar.value <= 0xFFFF, let members = caseClasses[canonical(UInt16(scalar.value))] else {
                out += escape(String(scalar))
                continue
            }
            out += "[" + members.map(unicodeEscape).joined() + "]"
        }
        return out
    }

    /// \uXXXX, which ICU reads inside a character class.
    private static func unicodeEscape(_ unit: UInt16) -> String {
        let hex = String(unit, radix: 16, uppercase: true)
        return "\\u" + String(repeating: "0", count: 4 - hex.count) + hex
    }

    /// JavaScript's Canonicalize for the i flag without the u flag.
    static func canonical(_ unit: UInt16) -> UInt16 {
        guard let scalar = Unicode.Scalar(unit) else { return unit }
        let upper = Array(String(scalar).uppercased().utf16)
        guard upper.count == 1 else { return unit }
        if unit >= 128 && upper[0] < 128 { return unit }
        return upper[0]
    }

    /// Every UTF-16 unit that shares its canonical form with another,
    /// grouped by that form. Built once, on first use.
    private static let caseClasses: [UInt16: [UInt16]] = {
        var groups: [UInt16: [UInt16]] = [:]
        for value in 0...0xFFFF {
            groups[canonical(UInt16(value)), default: []].append(UInt16(value))
        }
        return groups.filter { $0.value.count > 1 }
    }()

    /// An ASCII word character, \w.
    static func isWord(_ unit: UInt16) -> Bool {
        (0x30...0x39).contains(unit) || (0x41...0x5A).contains(unit) || (0x61...0x7A).contains(unit) || unit == 0x5F
    }

    /// A member of \s, which is also what trim and split(/\s+/) use.
    static func isSpace(_ unit: UInt16) -> Bool {
        switch unit {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
        default: false
        }
    }

    /// String.prototype.trim.
    static func trim(_ text: String) -> String {
        let units = Array(text.utf16)
        var start = 0
        var end = units.count
        while start < end, isSpace(units[start]) { start += 1 }
        while end > start, isSpace(units[end - 1]) { end -= 1 }
        return String(decoding: units[start..<end], as: UTF16.self)
    }

    /// How many words text.split(/\s+/) finds, empty pieces left out.
    static func wordCount(_ text: String) -> Int {
        var count = 0
        var inWord = false
        for unit in text.utf16 {
            if isSpace(unit) {
                inWord = false
            } else if !inWord {
                inWord = true
                count += 1
            }
        }
        return count
    }

    /// Math.round: the nearest whole number, halves toward positive infinity.
    static func round(_ x: Double) -> Double {
        let floor = x.rounded(.down)
        return x - floor >= 0.5 ? floor + 1 : floor
    }

    /// The first match, or every match when all is true, replaced by what
    /// transform returns: String.prototype.replace with a function.
    static func replace(
        _ text: String,
        _ regex: NSRegularExpression,
        all: Bool = true,
        _ transform: (NSTextCheckingResult, NSString) -> String
    ) -> String {
        let source = text as NSString
        let whole = NSRange(location: 0, length: source.length)
        let matches = all ? regex.matches(in: text, range: whole) : regex.firstMatch(in: text, range: whole).map { [$0] } ?? []
        guard !matches.isEmpty else { return text }
        var out = ""
        var cursor = 0
        for match in matches {
            out += source.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            out += transform(match, source)
            cursor = match.range.location + match.range.length
        }
        return out + source.substring(from: cursor)
    }

    /// String.prototype.replace with a string. As in JavaScript, $$ is a
    /// dollar sign, $& the match, $` the text before it, and $' the text
    /// after it; everything else, $1 included (these patterns capture
    /// nothing), stays as written.
    static func replace(_ text: String, _ regex: NSRegularExpression, all: Bool = true, with replacement: String) -> String {
        replace(text, regex, all: all) { match, source in
            substitute(replacement, for: match.range, in: source)
        }
    }

    private static func substitute(_ replacement: String, for match: NSRange, in source: NSString) -> String {
        // Code units, since a prepended mark fuses with the $ into one Character.
        guard replacement.utf16.contains(0x24) else { return replacement }
        let scalars = Array(replacement.unicodeScalars)
        var out = String.UnicodeScalarView()
        var i = 0
        while i < scalars.count {
            if scalars[i] == "$", i + 1 < scalars.count {
                let insert: String? =
                    switch scalars[i + 1] {
                    case "$": "$"
                    case "&": source.substring(with: match)
                    case "`": source.substring(to: match.location)
                    case "'": source.substring(from: match.location + match.length)
                    default: nil
                    }
                if let insert {
                    out.append(contentsOf: insert.unicodeScalars)
                    i += 2
                    continue
                }
            }
            out.append(scalars[i])
            i += 1
        }
        return String(out)
    }

    /// The position of the last mark before end, or -1: lastIndexOf.
    static func lastIndex(of mark: String, in source: NSString) -> Int {
        let found = source.range(of: mark, options: [.backwards, .literal])
        return found.location == NSNotFound ? -1 : found.location
    }

    /// JavaScript's < on strings: UTF-16 code unit order.
    static func less(_ a: String, _ b: String) -> Bool {
        a.utf16.lexicographicallyPrecedes(b.utf16)
    }

    /// JavaScript's === on strings: the same UTF-16 code units. Swift's ==
    /// also calls canonically equivalent strings equal (é and e plus an accent).
    static func same(_ a: String, _ b: String) -> Bool {
        a.utf16.elementsEqual(b.utf16)
    }
}
