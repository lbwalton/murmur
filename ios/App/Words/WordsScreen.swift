// SPDX-License-Identifier: GPL-3.0-only
// Dictionary and expansions (ios/prd.json IOS-013): words murmur should
// spell your way, and short triggers that become longer text. Add, edit,
// search, and delete; deleting asks first, in red, and each empty list says
// what it is for with one example.
import MurmurCore
import SwiftUI

struct WordsScreen: View {
    @Bindable var model: WordsModel
    @State private var query = ""
    @State private var editing: Editing?

    /// What the editor sheet is open on.
    enum Editing: Identifiable {
        case word(index: Int?, DictionaryEntry)
        case expansion(index: Int?, ExpansionEntry)

        var id: String {
            switch self {
            case .word(let index, _): "word-\(index.map(String.init) ?? "new")"
            case .expansion(let index, _): "expansion-\(index.map(String.init) ?? "new")"
            }
        }
    }

    var body: some View {
        let words = model.words(matching: query)
        let expansions = model.expansions(matching: query)
        List {
            Section {
                if model.dictionary.isEmpty {
                    Text(WordsCopy.wordsEmpty).foregroundStyle(Tokens.textDim)
                } else if words.isEmpty {
                    Text(WordsCopy.noMatch).foregroundStyle(Tokens.textDim)
                }
                ForEach(words, id: \.index) { item in
                    EntryRow(title: item.entry.to, detail: WordsCopy.heard(item.entry.from), deleteTitle: WordsCopy.deleteWord) {
                        editing = .word(index: item.index, item.entry)
                    } delete: {
                        model.deleteWord(at: item.index)
                    }
                }
            } header: {
                SectionHeader(title: WordsCopy.words, add: WordsCopy.addWord, label: WordsCopy.addWordLabel) {
                    editing = .word(index: nil, DictionaryEntry(from: "", to: ""))
                }
            }
            .listRowBackground(Tokens.panel)

            Section {
                if model.expansions.isEmpty {
                    Text(WordsCopy.expansionsEmpty).foregroundStyle(Tokens.textDim)
                } else if expansions.isEmpty {
                    Text(WordsCopy.noMatch).foregroundStyle(Tokens.textDim)
                }
                ForEach(expansions, id: \.index) { item in
                    EntryRow(title: item.entry.trigger, detail: item.entry.text, deleteTitle: WordsCopy.deleteExpansion) {
                        editing = .expansion(index: item.index, item.entry)
                    } delete: {
                        model.deleteExpansion(at: item.index)
                    }
                }
            } header: {
                SectionHeader(title: WordsCopy.expansions, add: WordsCopy.addExpansion, label: WordsCopy.addExpansionLabel) {
                    editing = .expansion(index: nil, ExpansionEntry(trigger: "", text: ""))
                }
            }
            .listRowBackground(Tokens.panel)
        }
        .searchable(text: $query, prompt: WordsCopy.search)
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(WordsCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editing) { editing in
            NavigationStack {
                switch editing {
                case .word(let index, let entry):
                    EntryEditor(kind: .word, first: entry.from, second: entry.to) { first, second in
                        model.saveWord(DictionaryEntry(from: first, to: second), at: index)
                    }
                case .expansion(let index, let entry):
                    EntryEditor(kind: .expansion, first: entry.trigger, second: entry.text) { first, second in
                        model.saveExpansion(ExpansionEntry(trigger: first, text: second), at: index)
                    }
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}

/// A section title with its Add button, which VoiceOver names by its list.
private struct SectionHeader: View {
    let title: String
    let add: String
    let label: String
    let action: () -> Void

    var body: some View {
        HStack {
            SectionTitle(title)
            Spacer()
            Button(action: action) {
                Label(add, systemImage: "plus")
                    .labelStyle(.titleAndIcon)
            }
            .font(.subheadline)
            .foregroundStyle(Tokens.brand)
            .textCase(nil)
            .frame(minHeight: 44)
            .accessibilityLabel(label)
        }
    }
}

/// One entry: tap to edit, swipe or VoiceOver's Delete to delete after
/// asking, from the row, so the question points at it.
private struct EntryRow: View {
    let title: String
    let detail: String
    let deleteTitle: String
    let edit: () -> Void
    let delete: () -> Void
    @State private var asking = false

    var body: some View {
        Button(action: edit) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).foregroundStyle(Tokens.text)
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(Tokens.textDim)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(WordsCopy.editHint)
        .swipeActions(edge: .trailing) {
            Button(WordsCopy.delete, role: .destructive) { asking = true }
        }
        .accessibilityAction(named: WordsCopy.delete) { asking = true }
        .confirmationDialog(WordsCopy.deleteQuestion(title), isPresented: $asking, titleVisibility: .visible) {
            Button(deleteTitle, role: .destructive) { delete() }
        }
    }
}

/// Which list an entry belongs to.
enum EntryKind { case word, expansion }

/// Adds or edits one entry: two fields, Save while both hold words.
private struct EntryEditor: View {
    let kind: EntryKind
    @State var first: String
    @State var second: String
    let save: (String, String) -> Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let fields = WordsCopy.fields(kind)
        Form {
            Section {
                TextField(fields[0].label, text: $first, prompt: Text(fields[0].example))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                SectionTitle(fields[0].label)
            }
            .listRowBackground(Tokens.panel)
            Section {
                TextField(fields[1].label, text: $second, prompt: Text(fields[1].example), axis: .vertical)
                    .lineLimit(kind == .word ? 1...2 : 2...8)
                    .autocorrectionDisabled()
            } header: {
                SectionTitle(fields[1].label)
            } footer: {
                Text(kind == .word ? WordsCopy.wordFooter : WordsCopy.expansionFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle(kind == .word ? WordsCopy.wordTitle : WordsCopy.expansionTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(WordsCopy.cancel) { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(WordsCopy.save) {
                    if save(first, second) { dismiss() }
                }
                .disabled(first.trimmingCharacters(in: .whitespaces).isEmpty || second.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }
}

/// Opens the screen on the app's cleanup settings.
struct WordsRoute: View {
    @State private var model = WordsModel(store: CleanupStore())

    var body: some View {
        WordsScreen(model: model)
    }
}

/// What the screen says.
enum WordsCopy {
    static let title = "Dictionary and expansions"
    static let words = "Words"
    static let expansions = "Expansions"
    static let addWord = "Add"
    static let addExpansion = "Add"
    static let addWordLabel = "Add a word"
    static let addExpansionLabel = "Add an expansion"
    static let search = "Search words and expansions"
    static let noMatch = "Nothing here matches your search."
    static let wordsEmpty = "Teach murmur a word it gets wrong. For example, when it hears la broy, write LaBroi."
    static let expansionsEmpty = "Say a short trigger and get longer text. For example, say my address to get 1 Main Street, Springfield."
    static let delete = "Delete"
    static let deleteWord = "Delete word"
    static let deleteExpansion = "Delete expansion"
    static let editHint = "Double tap to edit."
    static let whenHeard = "When murmur hears"
    static let writeAs = "Write it as"
    static let whenSaid = "When you say"
    static let write = "Write"
    static let heardPlaceholder = "la broy"
    static let spellingPlaceholder = "LaBroi"
    static let triggerPlaceholder = "my address"
    static let textPlaceholder = "1 Main Street, Springfield"
    static let wordFooter = "murmur writes it this way, with this casing, wherever you say it, and offers your provider the spelling as a hint."
    static let expansionFooter = "Say the trigger on its own or in a sentence; murmur writes the text in its place, last of all."
    static let wordTitle = "Word"
    static let expansionTitle = "Expansion"
    static let cancel = "Cancel"
    static let save = "Save"

    /// Each field's name and its example, in order.
    static func fields(_ kind: EntryKind) -> [(label: String, example: String)] {
        switch kind {
        case .word: [(whenHeard, heardPlaceholder), (writeAs, spellingPlaceholder)]
        case .expansion: [(whenSaid, triggerPlaceholder), (write, textPlaceholder)]
        }
    }

    static func heard(_ from: String) -> String {
        "When murmur hears \(from)"
    }

    static func deleteQuestion(_ title: String) -> String {
        "Delete \(title)?"
    }
}

#if DEBUG
#Preview("Empty") {
    NavigationStack { WordsScreen(model: WordsModel(store: CleanupStore(defaults: UserDefaults(suiteName: "words-preview-empty")!))) }
        .preferredColorScheme(.dark)
}

#Preview("A few") {
    let defaults = UserDefaults(suiteName: "words-preview-few")!
    let model = WordsModel(store: CleanupStore(defaults: defaults))
    model.saveWord(DictionaryEntry(from: "la broy", to: "LaBroi"))
    model.saveWord(DictionaryEntry(from: "eze media", to: "Eze Media"))
    model.saveExpansion(ExpansionEntry(trigger: "my address", text: "1 Main Street, Springfield"))
    return NavigationStack { WordsScreen(model: model) }.preferredColorScheme(.dark)
}
#endif
