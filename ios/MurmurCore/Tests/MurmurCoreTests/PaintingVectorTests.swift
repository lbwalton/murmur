// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/painting-vectors.json: desktop's painting a day on fixed takes.
struct PaintingVectors: Decodable {
    struct Take: Decodable {
        let at: Int64
        let day: String
        let hour: Int
        let words: Int
        let kind: String?
        let rawText: String?

        /// As desktop weighs it: a transform paints by its spoken words and
        /// never counts toward the belts.
        var event: PaintingEvent {
            let transform = kind == "transform"
            let spoken = (rawText ?? "").split(whereSeparator: \.isWhitespace).count
            return PaintingEvent(at: at, day: day, hour: hour, strokeWords: transform ? spoken : words, counts: !transform, words: words)
        }
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let install: UInt32
        let book: PaintingBook
        let takes: [Take]
        let expect: PaintingBook

        var testDescription: String { name }
    }

    struct Seed: Decodable {
        let install: UInt32
        let day: String
        let seed: UInt32
    }

    struct Subject: Decodable {
        let seed: UInt32
        let neighbours: [PaintingSubject?]
        let size: Int
        let subject: PaintingSubject
    }

    struct Size: Decodable {
        let typical: Double?
        let size: Int
    }

    struct Typical: Decodable {
        let day: String
        let counts: [String: [Int]]
        let typical: Double?
    }

    struct Weeks: Decodable {
        struct Line: Decodable {
            let last: String
            let line: String
        }

        let book: PaintingBook
        let lines: [Line]
    }

    struct Caption: Decodable {
        let subject: PaintingSubject
        let done: Int
        let target: Int
        let caption: String
    }

    struct Line: Decodable {
        let words: [Int]
        let longestMs: Int?
        let line: String
    }

    let cases: [Case]
    let seeds: [Seed]
    let subjects: [Subject]
    let sizes: [Size]
    let typical: [Typical]
    let weeks: Weeks
    let captions: [Caption]
    let lines: [Line]

    static let file: PaintingVectors? = try? SharedData(directory: repoShared).decode(PaintingVectors.self, from: "painting-vectors.json")
    static let ladder: [RankSpec]? = (try? SharedData(directory: repoShared).decode(RanksFile.self, from: "ranks.json"))?.ranks
}

@Suite struct PaintingVectorTests {
    @Test func theVectorsLoad() throws {
        let file = try #require(PaintingVectors.file)
        #expect(file.cases.count >= 15)
    }

    @Test(arguments: PaintingVectors.file?.cases ?? [])
    func eachBookIsDesktops(_ vector: PaintingVectors.Case) throws {
        let ladder = try #require(PaintingVectors.ladder)
        let book = Paintings.sync(vector.book, events: vector.takes.map(\.event), install: vector.install, ladder: ladder)
        #expect(book.keys.sorted() == vector.expect.keys.sorted())
        for (day, record) in vector.expect {
            #expect(book[day] == record, "\(day)")
        }
    }

    @Test func seedsSubjectsAndSizesAreDesktops() throws {
        let file = try #require(PaintingVectors.file)
        for seed in file.seeds {
            #expect(Paintings.seed(install: seed.install, day: seed.day) == seed.seed, "\(seed.install) \(seed.day)")
        }
        for subject in file.subjects {
            #expect(Paintings.pickSubject(subject.seed, neighbours: subject.neighbours, size: subject.size) == subject.subject, "\(subject.seed)")
        }
        for size in file.sizes {
            #expect(Paintings.paintingSize(size.typical) == size.size, "\(String(describing: size.typical))")
        }
        for typical in file.typical {
            #expect(Paintings.typicalTakes(typical.counts, day: typical.day) == typical.typical, "\(typical.day)")
        }
    }

    @Test func theWordsAreDesktops() throws {
        let file = try #require(PaintingVectors.file)
        for week in file.weeks.lines {
            #expect(Paintings.weekLine(file.weeks.book, last: week.last) == week.line)
        }
        for caption in file.captions {
            #expect(Paintings.caption(caption.subject, done: caption.done, target: caption.target) == caption.caption)
        }
        for line in file.lines {
            #expect(Paintings.line(line.words, longestMs: line.longestMs) == line.line)
        }
    }

    /// A day key is ASCII digits only, as desktop's /^\d{4}-\d{2}-\d{2}$/ reads it.
    @Test func aDayKeyIsAsciiDigits() {
        #expect(Paintings.isDayKey("2026-10-13"))
        #expect(!Paintings.isDayKey("\u{0662}\u{0660}\u{0662}\u{0666}-\u{0661}\u{0660}-\u{0661}\u{0663}"))
        #expect(!Paintings.isDayKey("2026-10-1"))
        #expect(!Paintings.isDayKey("2026-10-133"))
        #expect(!Paintings.isDayKey("2026/10/13"))
        #expect(!Paintings.isDayKey(""))
    }

    /// Days across a month, a year, and a leap day, as desktop shifts them.
    @Test func daysShiftAcrossTheCalendar() {
        #expect(Paintings.shiftDay("2026-01-31", 1) == "2026-02-01")
        #expect(Paintings.shiftDay("2026-12-31", 1) == "2027-01-01")
        #expect(Paintings.shiftDay("2028-03-01", -1) == "2028-02-29")
        #expect(Paintings.shiftDay("2026-10-13", -400) == "2025-09-08")
    }

    /// A record read back keeps what is sound and drops what is not.
    @Test func aRecordReadBackIsChecked() throws {
        let good = #"{"subject":"moon","seed":4294967295,"target":6,"tier":0,"level":1,"rank":"Not A Rank","hour":31,"words":[3,4]}"#
        let record = try JSONDecoder().decode(PaintingRecord.self, from: Data(good.utf8))
        #expect(record.rank == nil && record.hour == nil && record.words == [3, 4])
        for bad in [
            #"{"subject":"sun","seed":1,"target":6,"tier":0,"level":1,"words":[]}"#,
            #"{"subject":"moon","seed":1,"target":5,"tier":0,"level":1,"words":[]}"#,
            #"{"subject":"moon","seed":1,"target":6,"tier":5,"level":1,"words":[]}"#,
            #"{"subject":"moon","seed":-1,"target":6,"tier":0,"level":1,"words":[]}"#,
            #"{"subject":"moon","seed":1,"target":6,"tier":0,"level":1,"words":[-2]}"#
        ] {
            #expect(throws: (any Error).self) { try JSONDecoder().decode(PaintingRecord.self, from: Data(bad.utf8)) }
        }
    }
}
