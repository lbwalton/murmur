// SPDX-License-Identifier: GPL-3.0-only
// The Notes screen (ios/prd.json IOS-023): New note, the newest note and
// how its sort went, the lines held for you with desktop's three choices,
// your tasks and ideas as the files list them, and every inbox day. Each
// file shares out as text; nothing leaves the phone otherwise.
import MurmurCore
import SwiftUI

struct NotesRoute: View {
    var body: some View {
        if let notes = Notes.live() {
            NotesScreen(notes: notes)
        } else {
            ContentUnavailableView("Notes are unavailable", systemImage: "exclamationmark.triangle", description: Text("murmur could not read its own notes rules."))
        }
    }
}

/// The files the Notes screen lists, read together away from the main
/// thread: a coordinated read of a file in iCloud can wait on a download.
struct NotesFiles: Equatable, Sendable {
    var tasks: String?
    var ideas: String?
    var days: [String]

    @concurrent nonisolated static func load(_ folder: NoteStore, rules: SorterRules) async -> NotesFiles {
        NotesFiles(tasks: folder.read(rules.layout.tasks), ideas: folder.read(rules.layout.ideas), days: folder.inboxDays(rules: rules))
    }

    @concurrent nonisolated static func read(_ folder: NoteStore, _ relative: String) async -> String? {
        folder.read(relative)
    }
}

struct NotesScreen: View {
    let notes: Notes
    @State private var files: NotesFiles?

    var body: some View {
        List {
            if notes.folder.lost {
                Section {
                    Note(text: NotesSettingsCopy.lost(NotesFolderChoice().name ?? ""), color: Tokens.red, symbol: "exclamationmark.triangle")
                    NavigationLink(NotesSettingsCopy.chooseFolder) { NotesSettingsScreen() }
                        .foregroundStyle(Tokens.brand)
                }
                .listRowBackground(Tokens.panel)
            }
            Section {
                NavigationLink {
                    NoteTakeRoute()
                } label: {
                    Label(NotesCopy.newNote, systemImage: "square.and.pencil")
                        .foregroundStyle(Tokens.brand)
                }
            } footer: {
                if notes.state.newest == nil {
                    Text(NotesCopy.howTo).foregroundStyle(Tokens.textDim)
                }
            }
            .listRowBackground(Tokens.panel)

            if let newest = notes.state.newest {
                Section {
                    NewestNoteText(newest: newest)
                    if let report = notes.state.report, newest.id == notes.state.memory.input?.id {
                        Text(NotesCopy.summary(report))
                            .font(.subheadline)
                            .foregroundStyle(Tokens.textDim)
                    }
                    if notes.sorting || notes.canSortAgain {
                        Button(notes.sorting ? NotesCopy.sorting : NotesCopy.sortAgain) {
                            Task { await notes.sortAgain() }
                        }
                        .buttonStyle(RowAction())
                        .disabled(notes.sorting)
                    }
                } header: {
                    SectionTitle(NotesCopy.newest)
                }
                .listRowBackground(Tokens.panel)
            }

            if !notes.held.isEmpty {
                Section {
                    if let refused = notes.refused {
                        Text(NotesCopy.refusal(refused))
                            .font(.subheadline)
                            .foregroundStyle(Tokens.red)
                    }
                    ForEach(notes.held) { line in
                        HeldRow(line: line, notes: notes)
                    }
                } header: {
                    SectionTitle(NotesCopy.held)
                }
                .listRowBackground(Tokens.panel)
            }

            if let files {
                FileSection(title: NotesCopy.tasks, file: notes.rules.layout.tasks, text: files.tasks, empty: NotesCopy.noTasks)
                FileSection(title: NotesCopy.ideas, file: notes.rules.layout.ideas, text: files.ideas, empty: NotesCopy.noIdeas)

                Section {
                    if files.days.isEmpty {
                        Text(NotesCopy.noNotes).foregroundStyle(Tokens.textDim)
                    }
                    ForEach(files.days, id: \.self) { day in
                        NavigationLink(Receipt.placeName(day)) {
                            NoteFileScreen(title: Receipt.placeName(day), relative: day, folder: notes.folder)
                        }
                    }
                } header: {
                    SectionTitle(NotesCopy.inbox)
                }
                .listRowBackground(Tokens.panel)
            }
        }
        // Read again on every change the notes make: a sort, a save, an
        // action, a new folder.
        .task(id: notes.revision) {
            files = await NotesFiles.load(notes.folder, rules: notes.rules)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(NotesCopy.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The newest note's first line, when it landed, and where.
struct NewestNoteText: View {
    let newest: NewestNote

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(newest.line)
            Text("\(newest.at.formatted(date: .omitted, time: .shortened)), \(newest.place)")
                .font(.subheadline)
                .foregroundStyle(Tokens.textDim)
        }
    }
}

/// A held line with Tick it, File it anyway, and Skip, as desktop offers them.
struct HeldRow: View {
    let line: HeldLine
    let notes: Notes

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(NotesCopy.heldLabel(line))
            Text(NotesCopy.heldDetail(line))
                .font(.subheadline)
                .foregroundStyle(Tokens.textDim)
            HStack(spacing: 20) {
                if NotesCopy.canTick(line) {
                    Button(NotesCopy.tickIt) { Task { await notes.tick(line.id) } }
                        .frame(minHeight: 44)
                }
                if line.label != .note {
                    Button(NotesCopy.fileIt) { Task { await notes.file(line.id) } }
                        .frame(minHeight: 44)
                }
                Button(NotesCopy.skip) { Task { await notes.skip(line.id) } }
                    .frame(minHeight: 44)
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Tokens.brand)
            .disabled(notes.sorting)
        }
        .padding(.vertical, 4)
    }
}

/// The tasks or ideas file as a list, with Share. A lead line ("I need to
/// buy:") stays above the items under it.
struct FileSection: View {
    let title: String
    let file: String
    let text: String?
    let empty: String

    var body: some View {
        let items = text.map(Todo.listRows) ?? []
        Section {
            if items.isEmpty {
                Text(empty).foregroundStyle(Tokens.textDim)
            }
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                if item.lead {
                    Text(item.text)
                        .font(.subheadline.weight(.semibold))
                        .padding(.leading, item.nested ? 28 : 0)
                } else {
                    row(item)
                        .padding(.leading, item.nested ? 28 : 0)
                }
            }
        } header: {
            HStack {
                SectionTitle(title)
                Spacer()
                if let text, !items.isEmpty {
                    ShareLink(item: text, subject: Text(Receipt.placeName(file))) {
                        Image(systemName: "square.and.arrow.up")
                            .accessibilityLabel("Share \(title.lowercased())")
                    }
                    .foregroundStyle(Tokens.brand)
                    .frame(minWidth: 44, minHeight: 44)
                }
            }
        }
        .listRowBackground(Tokens.panel)
    }

    private func row(_ item: ListRow) -> some View {
        Label {
            Text(item.text)
                .strikethrough(item.done)
                .foregroundStyle(item.done ? Tokens.textDim : Tokens.text)
        } icon: {
            Image(systemName: item.checkbox ? (item.done ? "checkmark.square" : "square") : "circle.fill")
                .imageScale(item.checkbox ? .medium : .small)
                .foregroundStyle(Tokens.textDim)
        }
        .accessibilityLabel(item.checkbox ? "\(item.text), \(item.done ? "done" : "open")" : item.text)
    }
}

/// One file's text, as murmur wrote it, with Share.
struct NoteFileScreen: View {
    let title: String
    let relative: String
    let folder: NoteStore
    @State private var text: String?

    var body: some View {
        ScrollView {
            Text(text ?? "")
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
        }
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let text {
                    ShareLink(item: text, subject: Text(title))
                }
            }
        }
        .task { text = await NotesFiles.read(folder, relative) ?? "" }
    }
}

/// Home's notes row (IOS-023): the newest note and where it landed, or how
/// to take one.
struct NotesRow: View {
    let notes: Notes

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(NotesCopy.title)
            if let newest = notes.state.newest {
                Text(newest.line)
                    .lineLimit(2)
                    .font(.subheadline)
                Text(newest.place)
                    .font(.subheadline)
                    .foregroundStyle(Tokens.textDim)
            } else {
                Text(NotesCopy.howTo)
                    .font(.subheadline)
                    .foregroundStyle(Tokens.textDim)
            }
        }
        .padding(.vertical, 2)
    }
}
