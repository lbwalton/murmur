// SPDX-License-Identifier: GPL-3.0-only
// JSON as JavaScript reads it (ios/prd.json IOS-023). Desktop's sorter
// reads a model's reply with JSON.parse and walks it with Object.entries
// and Number(key), and the reply decides what files; Foundation's
// JSONSerialization keeps no key order and its own idea of a repeated
// key. This keeps JavaScript's: an object's keys come back with the
// array-index keys first, ascending, then the rest in the order first
// written, and a repeated key keeps its first place and its last value.
import Foundation

/// A value as JSON.parse gives it.
public indirect enum JSValue: Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSValue])
    case object(JSObject)

    /// JSON.parse, or nil where it would throw.
    public static func parse(_ text: String) -> JSValue? {
        var reader = Reader(units: Array(text.utf16))
        reader.skipSpace()
        guard let value = reader.value() else { return nil }
        reader.skipSpace()
        return reader.atEnd ? value : nil
    }

    public var object: JSObject? {
        if case let .object(object) = self { return object }
        return nil
    }

    public var array: [JSValue]? {
        if case let .array(array) = self { return array }
        return nil
    }

    public var number: Double? {
        if case let .number(number) = self { return number }
        return nil
    }

    public var string: String? {
        if case let .string(string) = self { return string }
        return nil
    }
}

/// An object, its keys in Object.entries order. Keys are compared by
/// UTF-16 code units, as JavaScript compares them.
public struct JSObject: Equatable, Sendable {
    private var order: [[UInt16]] = []
    private var values: [[UInt16]: JSValue] = [:]

    public init() {}

    public subscript(key: String) -> JSValue? {
        values[Array(key.utf16)]
    }

    mutating func set(_ key: [UInt16], _ value: JSValue) {
        if values[key] == nil { order.append(key) }
        values[key] = value
    }

    /// Object.entries: array-index keys ascending, then the rest as written.
    public var entries: [(key: String, value: JSValue)] {
        let indexes = order.compactMap { key in JSObject.arrayIndex(key).map { (key, $0) } }.sorted { $0.1 < $1.1 }.map(\.0)
        let rest = order.filter { JSObject.arrayIndex($0) == nil }
        return (indexes + rest).compactMap { key in values[key].map { (String(decoding: key, as: UTF16.self), $0) } }
    }

    public var count: Int { order.count }

    /// A key that is an array index: a canonical whole number below 2^32 - 1.
    static func arrayIndex(_ key: [UInt16]) -> UInt32? {
        guard !key.isEmpty, key.count <= 10, key.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }) else { return nil }
        if key.count > 1 && key.first == 0x30 { return nil }
        guard let n = UInt64(String(decoding: key, as: UTF16.self)), n < 4_294_967_295 else { return nil }
        return UInt32(n)
    }
}

private struct Reader {
    /// Deeper than any sort reply nests (three levels at most); a reply
    /// nested past it reads as no JSON instead of running out of stack.
    static let maxDepth = 64

    let units: [UInt16]
    var at = 0
    var depth = 0

    var atEnd: Bool { at >= units.count }

    mutating func skipSpace() {
        while at < units.count, [0x20, 0x09, 0x0A, 0x0D].contains(units[at]) { at += 1 }
    }

    mutating func value() -> JSValue? {
        guard at < units.count else { return nil }
        if units[at] == 0x7B || units[at] == 0x5B {
            guard depth < Self.maxDepth else { return nil }
            depth += 1
            defer { depth -= 1 }
            return units[at] == 0x7B ? object() : array()
        }
        switch units[at] {
        case 0x7B: return object()
        case 0x5B: return array()
        case 0x22: return string().map(JSValue.string)
        case 0x74: return literal("true", .bool(true))
        case 0x66: return literal("false", .bool(false))
        case 0x6E: return literal("null", .null)
        default: return number()
        }
    }

    mutating func literal(_ word: String, _ value: JSValue) -> JSValue? {
        let wanted = Array(word.utf16)
        guard at + wanted.count <= units.count, Array(units[at..<(at + wanted.count)]) == wanted else { return nil }
        at += wanted.count
        return value
    }

    mutating func object() -> JSValue? {
        at += 1
        var object = JSObject()
        skipSpace()
        if at < units.count, units[at] == 0x7D {
            at += 1
            return .object(object)
        }
        while true {
            skipSpace()
            guard at < units.count, units[at] == 0x22, let key = string() else { return nil }
            skipSpace()
            guard at < units.count, units[at] == 0x3A else { return nil }
            at += 1
            skipSpace()
            guard let value = value() else { return nil }
            object.set(Array(key.utf16), value)
            skipSpace()
            guard at < units.count else { return nil }
            if units[at] == 0x2C {
                at += 1
                continue
            }
            guard units[at] == 0x7D else { return nil }
            at += 1
            return .object(object)
        }
    }

    mutating func array() -> JSValue? {
        at += 1
        var items: [JSValue] = []
        skipSpace()
        if at < units.count, units[at] == 0x5D {
            at += 1
            return .array(items)
        }
        while true {
            skipSpace()
            guard let item = value() else { return nil }
            items.append(item)
            skipSpace()
            guard at < units.count else { return nil }
            if units[at] == 0x2C {
                at += 1
                continue
            }
            guard units[at] == 0x5D else { return nil }
            at += 1
            return .array(items)
        }
    }

    mutating func string() -> String? {
        at += 1
        var out: [UInt16] = []
        while at < units.count {
            let unit = units[at]
            at += 1
            switch unit {
            case 0x22:
                return String(decoding: out, as: UTF16.self)
            case 0x5C:
                guard at < units.count else { return nil }
                let escape = units[at]
                at += 1
                switch escape {
                case 0x22, 0x5C, 0x2F: out.append(escape)
                case 0x62: out.append(0x08)
                case 0x66: out.append(0x0C)
                case 0x6E: out.append(0x0A)
                case 0x72: out.append(0x0D)
                case 0x74: out.append(0x09)
                case 0x75:
                    guard at + 4 <= units.count, let code = UInt16(String(decoding: units[at..<(at + 4)], as: UTF16.self), radix: 16) else { return nil }
                    out.append(code)
                    at += 4
                default: return nil
                }
            default:
                if unit < 0x20 { return nil }
                out.append(unit)
            }
        }
        return nil
    }

    mutating func number() -> JSValue? {
        let start = at
        func digits() -> Int {
            let from = at
            while at < units.count, units[at] >= 0x30, units[at] <= 0x39 { at += 1 }
            return at - from
        }
        if at < units.count, units[at] == 0x2D { at += 1 }
        guard at < units.count else { return nil }
        if units[at] == 0x30 {
            at += 1
        } else if digits() == 0 {
            return nil
        }
        if at < units.count, units[at] == 0x2E {
            at += 1
            guard digits() > 0 else { return nil }
        }
        if at < units.count, units[at] == 0x65 || units[at] == 0x45 {
            at += 1
            if at < units.count, units[at] == 0x2B || units[at] == 0x2D { at += 1 }
            guard digits() > 0 else { return nil }
        }
        return Double(String(decoding: units[start..<at], as: UTF16.self)).map(JSValue.number)
    }
}

extension JS {
    /// Number(text): JavaScript's string to number, NaN where it gives NaN.
    static func number(_ text: String) -> Double {
        let trimmed = trim(text)
        if trimmed.isEmpty { return 0 }
        switch trimmed {
        case "Infinity", "+Infinity": return .infinity
        case "-Infinity": return -.infinity
        default: break
        }
        let units = Array(trimmed.utf16)
        if units.count > 2, units[0] == 0x30 {
            let radix: Int? = switch units[1] {
            case 0x78, 0x58: 16
            case 0x6F, 0x4F: 8
            case 0x62, 0x42: 2
            default: nil
            }
            if let radix {
                var value = 0.0
                for unit in units.dropFirst(2) {
                    guard let digit = Int(String(UnicodeScalar(UInt8(truncatingIfNeeded: unit))), radix: radix), unit < 0x80 else { return .nan }
                    value = value * Double(radix) + Double(digit)
                }
                return value
            }
        }
        let decimal = regex("^[+-]?(?:[0-9]+\\.?[0-9]*|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?\(end)")
        guard decimal.firstMatch(in: trimmed, range: NSRange(location: 0, length: units.count)) != nil else { return .nan }
        return Double(trimmed) ?? .nan
    }

    /// Number.isInteger.
    static func isInteger(_ x: Double) -> Bool {
        x.isFinite && x.rounded(.towardZero) == x
    }
}
