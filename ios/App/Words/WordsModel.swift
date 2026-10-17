// SPDX-License-Identifier: GPL-3.0-only
// The dictionary and expansions (ios/prd.json IOS-013), kept in the
// cleanup settings that every take already runs through (IOS-007): a word
// with the spelling and casing you want, and a short trigger that becomes
// longer text. Adding, editing, searching, and deleting happen here.
import Foundation
import MurmurCore
import Observation

@Observable @MainActor final class WordsModel {
    private(set) var dictionary: [DictionaryEntry]
    private(set) var expansions: [ExpansionEntry]
    @ObservationIgnored private let store: CleanupStore

    init(store: CleanupStore) {
        self.store = store
        let settings = store.load()
        dictionary = settings.dictionary
        expansions = settings.expansions
    }

    /// Saves a word: both sides trimmed and not empty. Editing replaces the
    /// entry at that place; a new word that murmur already listens for
    /// replaces that one; and any other entry for the same heard words
    /// goes, so a word is never in the list twice. False when a side is
    /// empty.
    @discardableResult
    func saveWord(_ entry: DictionaryEntry, at index: Int? = nil) -> Bool {
        guard let entry = Self.clean(entry) else { return false }
        dictionary = Self.placing(entry, at: index, in: dictionary) { $0.from }
        persist()
        return true
    }

    func deleteWord(at index: Int) {
        guard dictionary.indices.contains(index) else { return }
        dictionary.remove(at: index)
        persist()
    }

    /// Saves an expansion the same way, matching on its trigger.
    @discardableResult
    func saveExpansion(_ entry: ExpansionEntry, at index: Int? = nil) -> Bool {
        let trigger = entry.trigger.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = entry.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trigger.isEmpty, !text.isEmpty else { return false }
        expansions = Self.placing(ExpansionEntry(trigger: trigger, text: text), at: index, in: expansions) { $0.trigger }
        persist()
        return true
    }

    func deleteExpansion(at index: Int) {
        guard expansions.indices.contains(index) else { return }
        expansions.remove(at: index)
        persist()
    }

    /// The words whose either side holds the search, with their places.
    func words(matching query: String) -> [(index: Int, entry: DictionaryEntry)] {
        let query = query.trimmingCharacters(in: .whitespaces)
        return dictionary.enumerated()
            .filter { query.isEmpty || $0.element.from.localizedCaseInsensitiveContains(query) || $0.element.to.localizedCaseInsensitiveContains(query) }
            .map { ($0.offset, $0.element) }
    }

    func expansions(matching query: String) -> [(index: Int, entry: ExpansionEntry)] {
        let query = query.trimmingCharacters(in: .whitespaces)
        return expansions.enumerated()
            .filter { query.isEmpty || $0.element.trigger.localizedCaseInsensitiveContains(query) || $0.element.text.localizedCaseInsensitiveContains(query) }
            .map { ($0.offset, $0.element) }
    }

    /// The list with the entry at its place (editing), or over the entry
    /// with the same key, or at the end; any other entry with that key is
    /// dropped, so a key is listed once and the saved entry is the one that
    /// applies.
    private static func placing<Entry>(_ entry: Entry, at index: Int?, in list: [Entry], key: (Entry) -> String) -> [Entry] {
        func same(_ other: Entry) -> Bool { key(other).caseInsensitiveCompare(key(entry)) == .orderedSame }
        var next = list
        let target = index.flatMap { next.indices.contains($0) ? $0 : nil } ?? next.firstIndex(where: same)
        if let target { next[target] = entry } else { next.append(entry) }
        let kept = target ?? next.count - 1
        return next.enumerated().filter { $0.offset == kept || !same($0.element) }.map { $0.element }
    }

    private static func clean(_ entry: DictionaryEntry) -> DictionaryEntry? {
        let from = entry.from.trimmingCharacters(in: .whitespacesAndNewlines)
        let to = entry.to.trimmingCharacters(in: .whitespacesAndNewlines)
        return from.isEmpty || to.isEmpty ? nil : DictionaryEntry(from: from, to: to)
    }

    private func persist() {
        var settings = store.load()
        settings.dictionary = dictionary
        settings.expansions = expansions
        store.save(settings)
    }
}
