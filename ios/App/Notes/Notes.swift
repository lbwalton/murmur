// SPDX-License-Identifier: GPL-3.0-only
// Notes on iPhone (ios/prd.json IOS-023): a take kept as a note instead
// of typed. The words land in today's inbox file first, as desktop's do,
// before anything else happens; then, with sorting on, a chat through
// your cleanup connection files the tasks and ideas the way desktop's
// sorter does (MurmurCore's NoteSort, held to desktop by
// shared/sort-scenarios.json). Lines the sort was not sure of are held
// for you, and kept across launches. One sort runs at a time.
import Foundation
import MurmurCore
import Observation

/// The newest note, for Home's row.
struct NewestNote: Codable, Equatable, Sendable {
    let id: UUID
    /// Its first line, cut to fit.
    let line: String
    let inbox: String
    /// Where a sort filed its lines.
    var filed: [String]
    let at: Date

    var place: String { Receipt.whereText(inbox: inbox, sorted: filed) }
}

/// A note kept from the keyboard: the word for its receipt (inbox), and
/// the day's file it landed in, for Open note under the pill.
struct NoteKept: Equatable, Sendable {
    let place: String
    let file: String
}

/// What the notes keep between launches.
struct NotesState: Codable, Equatable, Sendable {
    var newest: NewestNote?
    var memory = SortMemory()
    var report: SortReport?
}

/// Where the notes' state is kept: beside the notes, out of backups.
struct NotesStateFile: Sendable {
    let file: URL

    static let standard = NotesStateFile(file: URL.applicationSupportDirectory.appending(path: "notes-state", directoryHint: .isDirectory).appending(path: "state.json"))

    func load() -> NotesState {
        (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(NotesState.self, from: $0) } ?? NotesState()
    }

    func save(_ state: NotesState) throws {
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(state).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var excluded = folder
        try excluded.setResourceValues(values)
    }
}

@Observable @MainActor final class Notes {
    private(set) var state: NotesState
    private(set) var sorting = false
    /// Why the last held-line button did nothing, until the next action.
    private(set) var refused: HeldRefusal?
    /// Counts every change to the files, so screens that read them redraw.
    private(set) var revision = 0

    /// The folder the notes live in: murmur's own, or one you picked.
    private(set) var folder: NoteStore
    /// shared/sorter.json as bundled; rules(at:) lays the file layout over it.
    @ObservationIgnored private let base: SorterRules
    /// Settings, Notes, File layout; nil when nothing there is changed.
    @ObservationIgnored private let layout: @MainActor () -> NoteLayout?
    @ObservationIgnored private let stateFile: NotesStateFile
    @ObservationIgnored private let sortOn: @MainActor () -> Bool
    /// The chat a sort asks, through your cleanup connection; nil without one.
    @ObservationIgnored private let ask: @MainActor () -> SortAsk?
    /// Lays the reminders down again after the tasks file may have changed.
    @ObservationIgnored private let remind: @MainActor () async -> Void
    @ObservationIgnored private let timeZone: @MainActor () -> TimeZone
    /// Holds background time from iOS while a sort runs, so a note sorted
    /// just after you leave murmur still lands in its files.
    @ObservationIgnored private let keepAlive: @MainActor () -> @MainActor () -> Void
    @ObservationIgnored private var last: Task<Void, Never>?

    init(
        folder: NoteStore, rules: SorterRules, stateFile: NotesStateFile, sortOn: @escaping @MainActor () -> Bool,
        ask: @escaping @MainActor () -> SortAsk?, remind: @escaping @MainActor () async -> Void = {},
        timeZone: @escaping @MainActor () -> TimeZone = { .current }, layout: @escaping @MainActor () -> NoteLayout? = { nil },
        keepAlive: @escaping @MainActor () -> @MainActor () -> Void = { {} }
    ) {
        self.folder = folder
        base = rules
        self.layout = layout
        self.stateFile = stateFile
        self.sortOn = sortOn
        self.ask = ask
        self.remind = remind
        self.timeZone = timeZone
        self.keepAlive = keepAlive
        state = stateFile.load()
    }

    var held: [HeldLine] { state.memory.held }

    /// The rules with the files the layout names today.
    var rules: SorterRules { rules(at: .now) }

    /// The rules with the files the layout names at a moment, each falling
    /// back to the bundled one when it cannot be used, as on desktop.
    func rules(at when: Date) -> SorterRules {
        rules(at: NoteMoment(when, timeZone: timeZone()))
    }

    func rules(at moment: NoteMoment) -> SorterRules {
        layout().map { $0.applied(to: base, at: moment) } ?? base
    }

    /// The files of the note Sort again and the held lines are for, as
    /// desktop files them at that note's time.
    private var heldRules: SorterRules {
        state.memory.input.map { rules(at: $0.moment) } ?? rules
    }

    /// The inbox as its days are listed: the layout's when it can be used,
    /// else the bundled one.
    var inbox: NoteInbox {
        let moment = NoteMoment(.now, timeZone: timeZone())
        let usable = layout().map(\.inbox).flatMap { (try? NotePath.resolve($0, at: moment).get()) == nil ? nil : $0 }
        return NoteInbox(template: usable ?? base.layout.inbox, today: NoteFiles.inbox(moment, rules: rules(at: moment)))
    }
    /// Sort again is for the newest note's unsettled lines, and only while
    /// sorting is on: off, a note's words never leave the phone for sorting.
    var canSortAgain: Bool {
        !sorting && !state.memory.pending.isEmpty && state.newest?.id == state.memory.input?.id && sortOn()
    }

    /// Saves a note to today's inbox. Returns the word for the keyboard's
    /// receipt (inbox), or nil when the note could not be written, so the
    /// caller keeps the words some other way.
    @discardableResult
    func save(_ text: String, at when: Date = .now) -> String? {
        let moment = NoteMoment(when, timeZone: timeZone())
        // The files as the layout names them at the note's moment, for the
        // inbox and for the sort, as desktop resolves them at the note's time.
        let rules = self.rules(at: when)
        let inbox = NoteFiles.inbox(moment, rules: rules)
        let entry = NoteFiles.separator(folder.read(inbox)) + NoteFiles.entry(text, at: moment, template: rules.layout.entry)
        do {
            try folder.append(inbox, entry)
        } catch {
            return nil
        }
        let input = NoteSortInput(text: text, moment: moment, inbox: inbox)
        state.newest = NewestNote(id: input.id, line: Receipt.line(text, max: rules.receiptLineMax), inbox: inbox, filed: [], at: when)
        keep()
        if sortOn() { queue { notes in await notes.run { memory, ask in await NoteSort.sort(input, memory: memory, folder: notes.folder, rules: rules, ask: ask) } } }
        return Receipt.pillPlace(inbox, max: rules.pillPlaceMax)
    }

    /// Saves a note from the keyboard, and says where it landed.
    func keep(_ text: String, at when: Date = .now) -> NoteKept? {
        guard let place = save(text, at: when), let file = state.newest?.inbox else { return nil }
        return NoteKept(place: place, file: file)
    }

    /// The file a note link names, only when it is an inbox day here, or
    /// the newest note's, wherever the layout put it.
    func inboxFile(_ file: String) -> String? {
        file == state.newest?.inbox || folder.inboxDays(inbox).contains(file) ? file : nil
    }

    /// Sends the newest note's unsettled lines again.
    func sortAgain() async {
        guard canSortAgain else { return }
        queue { notes in await notes.run { memory, ask in await NoteSort.sortAgain(memory: memory, folder: notes.folder, rules: notes.heldRules, ask: ask) } }
        await last?.value
    }

    /// Files a held line as it was labeled.
    func file(_ id: Int) async { await act { NoteSort.file(id, memory: $0, folder: folder, rules: heldRules) } }
    /// Lets a held line go without filing it.
    func skip(_ id: Int) async { await act { NoteSort.skip(id, memory: $0) } }
    /// Ticks the task a held line said was done.
    func tick(_ id: Int) async { await act { NoteSort.tick(id, memory: $0, folder: folder, rules: heldRules) } }

    /// Moves to another folder once the sort running now is done. Notes
    /// already written stay where they are.
    func use(_ next: NoteStore) async {
        await last?.value
        folder = next
        revision += 1
        await remind()
    }

    /// Takes the folder as it resolves now, when it differs: a vault that
    /// came back, or one that went away while murmur was in the background.
    func recheck(_ resolved: NoteStore) async {
        guard resolved != folder else { return }
        await use(resolved)
    }

    /// Waits for the sort running now, if any.
    func settle() async { await last?.value }

    private func act(_ body: (SortMemory) -> Result<SortMemory, HeldRefusal>) async {
        await last?.value
        switch body(state.memory) {
        case let .success(memory):
            state.memory = memory
            refused = nil
            keep()
            await remind()
        case let .failure(refusal):
            refused = refusal
        }
    }

    private func queue(_ step: @escaping @MainActor (Notes) async -> Void) {
        let before = last
        last = Task { [weak self] in
            await before?.value
            guard let self else { return }
            await step(self)
        }
    }

    /// One sort: the report and the memory it leaves, and the newest note's
    /// places when the sort was the newest note's.
    private func run(_ sort: (SortMemory, SortAsk?) async -> (report: SortReport, memory: SortMemory)?) async {
        sorting = true
        let release = keepAlive()
        defer {
            sorting = false
            release()
        }
        refused = nil
        guard let result = await sort(state.memory, ask()) else { return }
        state.memory = result.memory
        state.report = result.report
        if let newest = state.newest, newest.id == result.memory.input?.id {
            // In the order they were filed, each once.
            state.newest?.filed = result.report.places.reduce(into: newest.filed) { filed, place in
                if !filed.contains(place) { filed.append(place) }
            }
        }
        keep()
        await remind()
    }

    private func keep() {
        revision += 1
        try? stateFile.save(state)
    }
}

extension Notes {
    private static var shared: Notes?

    /// The app's notes, in the folder you chose, sorted through your
    /// cleanup connection with today's key, on a session that keeps no
    /// cookies or cache.
    static func live() -> Notes? {
        if let shared { return shared }
        guard let rules = try? BundledRules.sorter(), let catalog = try? BundledRules.catalog() else { return nil }
        let session = URLSession(configuration: .ephemeral)
        let ring = KeychainKeyRing()
        let notes = Notes(
            folder: NotesFolderChoice().store(), rules: rules, stateFile: .standard, sortOn: { NotesSettings.load().sort },
            ask: {
                let settings = ConnectionStore().load(catalog: catalog)
                guard let connection = settings.polishConnection(key: { (try? ring.key(for: $0)) ?? nil }) else { return nil }
                return NoteSort.chat(connection, rules: rules, send: { try await session.data(for: $0) })
            },
            remind: { await TaskReminders.refresh(folder: shared?.folder ?? .standard, rules: shared?.rules ?? rules) },
            layout: { NotesSettings.load().layout(rules) },
            keepAlive: BackgroundTime.hold
        )
        shared = notes
        return notes
    }
}
