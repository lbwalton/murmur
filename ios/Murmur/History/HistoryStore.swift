import Foundation

// Local dictation history, on device only (hard constraint: transcripts
// never leave the phone). Last 200 takes in a JSON file under Application
// Support; the pipeline caller gates writes on the history setting.
struct DictationRecord: Codable, Identifiable, Equatable {
    let id: UUID
    let text: String
    let words: Int
    let date: Date
    let model: String
}

@MainActor
final class HistoryStore: ObservableObject {

    static let cap = 200

    @Published private(set) var items: [DictationRecord] = []

    private let fileURL: URL

    nonisolated static func defaultFileURL() -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("murmur", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("history.json")
    }

    init(fileURL: URL = HistoryStore.defaultFileURL()) {
        self.fileURL = fileURL
        load()
    }

    @discardableResult
    func add(text: String, model: String) -> DictationRecord {
        let words = text.split(whereSeparator: \.isWhitespace).count
        let record = DictationRecord(id: UUID(), text: text, words: words, date: Date(), model: model)
        items.insert(record, at: 0)
        if items.count > Self.cap { items.removeLast(items.count - Self.cap) }
        save()
        return record
    }

    func delete(id: UUID) {
        items.removeAll { $0.id == id }
        save()
    }

    // A History edit keeps the record but replaces its text; the caller
    // feeds the diff to the correction learner (US-109).
    func update(id: UUID, text: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        let old = items[index]
        items[index] = DictationRecord(id: old.id,
                                       text: text,
                                       words: text.split(whereSeparator: \.isWhitespace).count,
                                       date: old.date,
                                       model: old.model)
        save()
    }

    func clear() {
        items = []
        save()
    }

    // ------------------------------------------------------------ disk

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([DictationRecord].self, from: data) else { return }
        items = Array(decoded.prefix(Self.cap))
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
