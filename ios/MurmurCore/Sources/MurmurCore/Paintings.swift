// SPDX-License-Identifier: GPL-3.0-only
// A painting a day (ios/prd.json IOS-019), as data, as desktop's
// src/shared/painting.ts keeps it: each day gets a subject, a seed, and a
// size near a typical day's takes; every take adds the next stroke; the
// tier (how rich the brushwork is) and the level are fixed when the day's
// first take lands, so a promotion never repaints a day already begun.
// The book holds word counts, never text. shared/painting-vectors.json
// keeps both platforms equal.
import Foundation

public enum PaintingSubject: String, Codable, CaseIterable, Sendable {
    // Desktop's order: a seed picks by place in it.
    case moon, bamboo, plum, mountains, pine, orchid, chrysanthemum, lotus, waterfall, willow, boat, wave, maple, snow

    public var name: String {
        switch self {
        case .moon: "moon over water"
        case .bamboo: "bamboo"
        case .plum: "plum branch"
        case .mountains: "mountains"
        case .pine: "pine on a cliff"
        case .orchid: "orchid"
        case .chrysanthemum: "chrysanthemum"
        case .lotus: "lotus pond"
        case .waterfall: "waterfall"
        case .willow: "willow by the water"
        case .boat: "boat on the river"
        case .wave: "breaking wave"
        case .maple: "maple branch"
        case .snow: "snowfall"
        }
    }

    /// The sizes it paints well at: a few quiet subjects stop before their
    /// water or leaves crowd, and the waterfall needs a few strokes.
    var sizes: ClosedRange<Int> {
        switch self {
        case .moon, .boat: 6...24
        case .orchid, .wave: 6...30
        case .waterfall: 8...36
        default: 6...36
        }
    }
}

public struct PaintingRecord: Codable, Hashable, Sendable {
    public var subject: PaintingSubject
    public var seed: UInt32
    /// Strokes to finish, fixed when the day's first take lands.
    public var target: Int
    /// How rich the brushwork is (0 white belt to 4 black belt and up).
    public var tier: Int
    /// The level, which adds a bird or two.
    public var level: Int
    /// The practice rank's id at the day's first take.
    public var rank: String?
    /// The painting's light: the middle local hour of its first `target`
    /// takes, once it has that many.
    public var hour: Int?
    /// Each take's word count, in the order spoken. Never its text.
    public var words: [Int]

    public init(subject: PaintingSubject, seed: UInt32, target: Int, tier: Int, level: Int, rank: String?, hour: Int?, words: [Int]) {
        self.subject = subject
        self.seed = seed
        self.target = target
        self.tier = tier
        self.level = level
        self.rank = rank
        self.hour = hour
        self.words = words
    }

    private enum Keys: String, CodingKey { case subject, seed, target, tier, level, rank, hour, words }

    /// A record read back from disk, as desktop's asRecord reads one: one
    /// that is not a record fails, a rank or hour that is not one is left out.
    public init(from decoder: any Decoder) throws {
        let box = try decoder.container(keyedBy: Keys.self)
        subject = try box.decode(PaintingSubject.self, forKey: .subject)
        seed = try box.decode(UInt32.self, forKey: .seed)
        target = try box.decode(Int.self, forKey: .target)
        tier = try box.decode(Int.self, forKey: .tier)
        level = try box.decode(Int.self, forKey: .level)
        words = try box.decode([Int].self, forKey: .words)
        let bad = DecodingError.dataCorruptedError(forKey: .words, in: box, debugDescription: "not a painting record")
        guard Paintings.minStrokes...Paintings.maxStrokes ~= target, 0...4 ~= tier, 1...100_000 ~= level,
              words.count <= 10_000, words.allSatisfy({ 0...1_000_000 ~= $0 })
        else { throw bad }
        let rank = (try? box.decodeIfPresent(String.self, forKey: .rank)) ?? nil
        self.rank = rank.flatMap { $0.range(of: #"^[a-z0-9-]{1,32}$"#, options: .regularExpression) != nil ? $0 : nil }
        let hour = (try? box.decodeIfPresent(Int.self, forKey: .hour)) ?? nil
        self.hour = hour.flatMap { 0...23 ~= $0 ? $0 : nil }
    }

    public func encode(to encoder: any Encoder) throws {
        var box = encoder.container(keyedBy: Keys.self)
        try box.encode(subject, forKey: .subject)
        try box.encode(seed, forKey: .seed)
        try box.encode(target, forKey: .target)
        try box.encode(tier, forKey: .tier)
        try box.encode(level, forKey: .level)
        try box.encodeIfPresent(rank, forKey: .rank)
        try box.encodeIfPresent(hour, forKey: .hour)
        try box.encode(words, forKey: .words)
    }
}

/// Paintings by day key.
public typealias PaintingBook = [String: PaintingRecord]

/// One take as the painting sees it: its time, its local day and hour, the
/// words it paints with, and whether (and with what words) it counts
/// toward the belts.
public struct PaintingEvent: Sendable, Equatable {
    /// Epoch milliseconds.
    public let at: Int64
    public let day: String
    public let hour: Int
    /// The stroke's weight in words.
    public let strokeWords: Int
    /// Whether it counts toward the belts (desktop's transforms do not).
    public let counts: Bool
    /// Its words toward the belts.
    public let words: Int

    public init(at: Int64, day: String, hour: Int, strokeWords: Int, counts: Bool = true, words: Int? = nil) {
        self.at = at
        self.day = day
        self.hour = hour
        self.strokeWords = strokeWords
        self.counts = counts
        self.words = words ?? strokeWords
    }
}

public enum Paintings {
    /// The smallest painting (also the size before there is a typical day).
    public static let minStrokes = 6
    /// The largest: past this a day's painting is finished.
    public static let maxStrokes = 36
    /// How far back the book keeps paintings, in calendar days.
    public static let keepDays = 400
    /// The strokes a finished painting keeps adding, one per take.
    public static let maxExtra = 60
    /// Home's typical day: the days it looks back over, and the active days
    /// it needs among them (desktop's analytics).
    static let typicalWindowDays = 28
    static let typicalMinDays = 3

    /// Whether a string is a day key: yyyy-MM-dd in ASCII digits, as
    /// desktop's /^\d{4}-\d{2}-\d{2}$/ reads it. Checked by hand; a regular
    /// expression here was most of a sync's time over a year of takes.
    public static func isDayKey(_ day: String) -> Bool {
        let units = Array(day.utf8)
        guard units.count == 10 else { return false }
        for (index, unit) in units.enumerated() {
            let ok = index == 4 || index == 7 ? unit == UInt8(ascii: "-") : (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(unit)
            if !ok { return false }
        }
        return true
    }

    /// The brushwork tier a belt paints at.
    public static func tier(for belt: String) -> Int {
        switch belt {
        case "none", "white": 0
        case "blue": 1
        case "purple": 2
        case "brown": 3
        default: 4
        }
    }

    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }()

    /// The day key `offset` days from `day` (negative is earlier).
    public static func shiftDay(_ day: String, _ offset: Int) -> String {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2] + offset)) else { return day }
        let out = utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", out.year ?? 0, out.month ?? 0, out.day ?? 0)
    }

    /// Takes in time order, equal times kept in the order given.
    private static func inOrder(_ events: [PaintingEvent]) -> [PaintingEvent] {
        events.enumerated().sorted { $0.element.at != $1.element.at ? $0.element.at < $1.element.at : $0.offset < $1.offset }.map(\.element)
    }

    /// Each day's takes, as stroke words in the order spoken.
    public static func takesByDay(_ events: [PaintingEvent]) -> [String: [Int]] {
        var byDay: [String: [Int]] = [:]
        for event in inOrder(events) where isDayKey(event.day) {
            byDay[event.day, default: []].append(max(0, event.strokeWords))
        }
        return byDay
    }

    /// Each day's takes as local hours, in the order spoken.
    public static func hoursByDay(_ events: [PaintingEvent]) -> [String: [Int]] {
        var byDay: [String: [Int]] = [:]
        for event in inOrder(events) where isDayKey(event.day) {
            byDay[event.day, default: []].append(event.hour)
        }
        return byDay
    }

    /// The middle hour of the first `target` takes (the lower of the two
    /// middles on an even count), or nil with fewer takes than that.
    public static func paintingHour(_ hours: [Int], target: Int) -> Int? {
        guard target >= 1, hours.count >= target else { return nil }
        return hours.prefix(target).sorted()[(target - 1) >> 1]
    }

    /// The median number of takes on the active days in the window before
    /// `day`, or nil with fewer active days than a typical day needs.
    public static func typicalTakes(_ byDay: [String: [Int]], day: String) -> Double? {
        var counts: [Int] = []
        for back in 1...typicalWindowDays {
            let n = byDay[shiftDay(day, -back)]?.count ?? 0
            if n > 0 { counts.append(n) }
        }
        guard counts.count >= typicalMinDays else { return nil }
        counts.sort()
        let mid = counts.count >> 1
        return counts.count % 2 == 1 ? Double(counts[mid]) : Double(counts[mid - 1] + counts[mid]) / 2
    }

    /// A day's size: a typical day's takes, within the smallest and largest.
    public static func paintingSize(_ typical: Double?) -> Int {
        guard let typical else { return minStrokes }
        // JavaScript's Math.round: halves round up.
        let rounded = Int((typical + 0.5).rounded(.down))
        return max(minStrokes, min(maxStrokes, rounded))
    }

    /// A day's seed, mixed with this install's own, as desktop mixes it.
    public static func seed(install: UInt32, day: String) -> UInt32 {
        var h = install ^ 0x9e37_79b9
        for unit in day.utf16 {
            h = (h ^ UInt32(unit)) &* 0x0100_0193
        }
        h ^= h >> 15
        h = h &* 0x2c1b_3c6d
        return h ^ (h >> 12)
    }

    /// The day's subject: picked by its seed among those that suit its
    /// size, never the subject of the painted day on either side of it.
    public static func pickSubject(_ seed: UInt32, neighbours: [PaintingSubject?], size: Int = minStrokes) -> PaintingSubject {
        let fits = PaintingSubject.allCases.filter { $0.sizes ~= size }
        let fresh = fits.filter { subject in !neighbours.contains(subject) }
        let pool = !fresh.isEmpty ? fresh : !fits.isEmpty ? fits : PaintingSubject.allCases
        return pool[Int(seed >> 3) % pool.count]
    }

    /// The rank words and days alone have earned (the founder's included).
    public static func practiceRank(_ ladder: [RankSpec], words: Int, days: Int) -> RankSpec? {
        var best: RankSpec?
        for rank in ladder {
            guard rank.founderOnly != true, let need = rank.words, let needDays = rank.activeDays else { continue }
            if words >= need, days >= needDays { best = rank }
        }
        return best
    }

    /// The belt a painting's seal is colored in: the belt of the rank its
    /// first take was made at; nil before the first belt (the ember seal).
    public static func sealBelt(_ rank: String?, ladder: [RankSpec]) -> String? {
        guard let rank, rank != "none", let belt = ladder.first(where: { $0.id == rank })?.belt, belt != "none" else { return nil }
        return belt
    }

    /// Brings the book up to date with the takes, as desktop's
    /// syncPaintings does: every day gets a record, made in date order, with
    /// the size, tier, and level as of its first take, and a subject unlike
    /// the painted days on either side. A day's words are refreshed from
    /// the takes unless they hold fewer than the record. Days more than
    /// keepDays before the newest are dropped.
    public static func sync(_ book: PaintingBook, events: [PaintingEvent], install: UInt32, ladder: [RankSpec]) -> PaintingBook {
        func own(_ day: String) -> PaintingRecord? { isDayKey(day) ? book[day] : nil }
        let byDay = takesByDay(events)
        let hours = hoursByDay(events)
        func withHour(_ record: PaintingRecord, _ day: String) -> PaintingRecord {
            var record = record
            record.hour = paintingHour(hours[day] ?? [], target: record.target)
            return record
        }
        var rankWords: [String: Int] = [:]
        var firstWords: [String: Int] = [:]
        for event in inOrder(events) where isDayKey(event.day) && event.counts {
            let words = max(0, event.words)
            if firstWords[event.day] == nil { firstWords[event.day] = words }
            rankWords[event.day, default: 0] += words
        }
        let days = Set(book.keys.filter { own($0) != nil }).union(byDay.keys).sorted()
        var words = 0
        var activeDays = 0
        var next: PaintingBook = [:]
        var before: PaintingSubject?
        for (index, day) in days.enumerated() {
            let logged = byDay[day]
            let first = firstWords[day] ?? 0
            let rankThen = practiceRank(ladder, words: words + first, days: activeDays + (rankWords[day] != nil ? 1 : 0))
            if var kept = own(day) {
                // A record from before ranks were kept gets one while the
                // takes still have its day.
                if kept.rank == nil, logged != nil { kept.rank = rankThen?.id ?? "none" }
                if let logged, logged.count >= kept.words.count {
                    kept.words = logged
                    next[day] = withHour(kept, day)
                } else {
                    next[day] = kept
                }
            } else if let logged {
                let seed = seed(install: install, day: day)
                let target = paintingSize(typicalTakes(byDay, day: day))
                // A day filled in between kept days is unlike both.
                let after = days[(index + 1)...].lazy.compactMap(own).first?.subject
                let record = PaintingRecord(
                    subject: pickSubject(seed, neighbours: [before, after], size: target),
                    seed: seed,
                    target: target,
                    tier: tier(for: rankThen?.belt ?? "none"),
                    level: Ranks.level(for: words + first),
                    rank: rankThen?.id ?? "none",
                    hour: nil,
                    words: logged
                )
                next[day] = withHour(record, day)
            }
            before = next[day]?.subject ?? before
            if let dayWords = rankWords[day] {
                words += dayWords
                activeDays += 1
            }
        }
        guard let newest = days.last else { return [:] }
        let cutoff = shiftDay(newest, -keepDays)
        return next.filter { $0.key > cutoff }
    }

    /// The seven days ending on `last`, oldest first: a week's scroll.
    public static func weekOf(_ last: String) -> [String] {
        (0..<7).map { shiftDay(last, $0 - 6) }
    }

    /// A week's numbers for its scroll: the paintings it finished, from how
    /// many takes and words.
    public static func weekLine(_ book: PaintingBook, last: String) -> String {
        let records = weekOf(last).compactMap { book[$0] }
        let takes = records.reduce(0) { $0 + $1.words.count }
        let words = records.reduce(0) { $0 + $1.words.reduce(0, +) }
        let finished = records.filter { $0.words.count >= $0.target }.count
        let said = "\(takes.formatted()) \(takes == 1 ? "take" : "takes") and \(words.formatted()) \(words == 1 ? "word" : "words")"
        return finished > 0 ? "\(finished) \(finished == 1 ? "painting" : "paintings") finished from \(said)" : said
    }

    /// How far a painting has got: its strokes so far (past its size, the
    /// strokes a finished painting keeps adding) and whether it is finished.
    public static func progress(_ record: PaintingRecord) -> (done: Int, finished: Bool) {
        (min(record.words.count, record.target + maxExtra), record.words.count >= record.target)
    }

    /// The painting's caption, as desktop words it.
    public static func caption(_ subject: PaintingSubject, done: Int, target: Int) -> String {
        let more = done - target
        if more > 0 { return "\(subject.name), finished, and \(more) \(more == 1 ? "stroke" : "strokes") more" }
        if done >= target { return "\(subject.name), finished" }
        let so = "\(done) of \(target) strokes"
        return done < 3 ? "a painting, \(so)" : "\(subject.name), \(so)"
    }

    /// The line under a finished painting, from the day's own numbers.
    public static func line(_ words: [Int], longestMs: Int?) -> String {
        let total = words.reduce(0, +)
        let said = "\(words.count.formatted()) \(words.count == 1 ? "take" : "takes"), \(total.formatted()) words."
        guard let longestMs, longestMs > 0 else { return said }
        return "\(said) The longest ran \(duration(longestMs))."
    }

    /// Minutes and seconds, as desktop's formatDuration writes them.
    public static func duration(_ ms: Int) -> String {
        let seconds = max(0, ms / 1000)
        return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }
}
