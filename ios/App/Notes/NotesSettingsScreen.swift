// SPDX-License-Identifier: GPL-3.0-only
// Settings, Notes (ios/prd.json IOS-023): where notes go, whether a note
// is sorted into tasks and ideas, and the task reminders, off until you
// turn them on. Turning reminders on is the moment murmur asks to send
// notifications. File layout is desktop's: the inbox, tasks, and ideas
// files, so a vault your Mac shares gets the same files from both.
import MurmurCore
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import UserNotifications

struct NotesSettingsScreen: View {
    /// Where the choices are kept; previews pass their own.
    let defaults: UserDefaults
    @State private var settings: NotesSettings
    @State private var times: [Date] = []
    @State private var denied = false
    @State private var asking = false
    @State private var reverting = false
    @State private var tested: String?
    @State private var folderName = NotesFolderChoice().name
    @State private var folderLost = false
    @State private var picking = false
    @State private var folderProblem: String?
    @State private var drafts = LayoutDrafts()
    @FocusState private var editing: LayoutFile?

    /// shared/sorter.json's own files, what an unchanged field shows.
    private static let standard = (try? BundledRules.sorter()).map(NoteLayout.standard)

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        _settings = State(initialValue: NotesSettings.load(defaults))
    }

    var body: some View {
        Form {
            Section {
                Label(folderName ?? NotesSettingsCopy.ownFolder, systemImage: "folder")
                    .accessibilityLabel(NotesSettingsCopy.folderNow(folderName))
                Button(NotesSettingsCopy.chooseFolder) { picking = true }
                    .buttonStyle(RowAction())
                    .frame(minHeight: 44)
                if folderName != nil {
                    Button(NotesSettingsCopy.useOwn) {
                        NotesFolderChoice().forget()
                        Task { await moved() }
                    }
                    .buttonStyle(RowAction())
                    .frame(minHeight: 44)
                }
                if let problem = folderProblem ?? (folderLost ? NotesSettingsCopy.lost(folderName ?? "") : nil) {
                    Text(problem).foregroundStyle(Tokens.red)
                }
            } header: {
                SectionTitle(NotesSettingsCopy.folder)
            } footer: {
                Text(NotesSettingsCopy.folderFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                Toggle(NotesSettingsCopy.sort, isOn: $settings.sort)
                    .tint(Tokens.brand)
            } header: {
                SectionTitle(NotesSettingsCopy.sorting)
            } footer: {
                Text(NotesSettingsCopy.sortFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                Toggle(NotesSettingsCopy.reminders, isOn: $settings.reminders)
                    .tint(Tokens.brand)
                    .disabled(asking)
                if settings.reminders {
                    ForEach(times.indices, id: \.self) { index in
                        DatePicker(NotesSettingsCopy.time(index), selection: $times[index], displayedComponents: .hourAndMinute)
                    }
                    Button(NotesSettingsCopy.sendNow) {
                        Task { tested = await TaskReminders.sendNow() }
                    }
                    .buttonStyle(RowAction())
                    .frame(minHeight: 44)
                    if let tested {
                        Text(tested).foregroundStyle(Tokens.textDim)
                    }
                }
                if denied {
                    Text(NotesSettingsCopy.denied)
                        .foregroundStyle(Tokens.red)
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        Link(NotesSettingsCopy.openSettings, destination: url)
                            .buttonStyle(RowAction())
                            .frame(minHeight: 44)
                    }
                }
            } header: {
                SectionTitle(NotesSettingsCopy.reminders)
            } footer: {
                Text(NotesSettingsCopy.remindersFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            if let standard = Self.standard {
                Section {
                    ForEach(shownFiles, id: \.self) { file in
                        fileRow(file)
                    }
                    if settings.changesLayout {
                        Button(NotesSettingsCopy.useDefaults) { useDefaults(standard) }
                            .buttonStyle(RowAction())
                            .frame(minHeight: 44)
                    }
                } header: {
                    SectionTitle(NotesSettingsCopy.layout)
                } footer: {
                    Text(NotesSettingsCopy.layoutFooter).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(NotesCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            settings = NotesSettings.load(defaults)
            loadDrafts()
            times = settings.times.map(Self.date)
            folderLost = Notes.live()?.folder.lost ?? false
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { result in
            folderProblem = nil
            guard case let .success(url) = result else { return }
            do {
                try NotesFolderChoice().pick(url)
                Task { await moved() }
            } catch {
                folderProblem = NotesSettingsCopy.notKept
            }
        }
        .task {
            let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            denied = settings.reminders && status == .denied
        }
        .onChange(of: settings.sort) { settings.save(defaults) }
        .onChange(of: editing) { left, _ in
            if let left { commit(left) }
        }
        .onChange(of: drafts) {
            // A wrapping field takes Return as a line break: end the edit
            // instead, and the path never holds one.
            for file in LayoutFile.allCases where drafts[keyPath: file.draft].contains(where: \.isNewline) {
                drafts[keyPath: file.draft].removeAll(where: \.isNewline)
                if editing == file { editing = nil } else { commit(file) }
            }
        }
        .onDisappear {
            if let editing { commit(editing) }
        }
        .onChange(of: times) {
            settings.times = times.map(Self.clock)
            settings.save(defaults)
            replan()
        }
        .onChange(of: settings.reminders) { _, on in
            guard !reverting else {
                reverting = false
                return
            }
            Task { await turned(on) }
        }
    }

    private func turned(_ on: Bool) async {
        if on {
            asking = true
            let allowed = await RecapNotifications.ask()
            asking = false
            denied = !allowed
            if !allowed {
                reverting = true
                settings.reminders = false
            }
        } else {
            denied = false
            tested = nil
        }
        settings.save(defaults)
        replan()
    }

    /// The notes move to the folder just chosen.
    private func moved() async {
        let choice = NotesFolderChoice()
        let store = choice.store()
        folderName = choice.name
        folderLost = store.lost
        await Notes.live()?.use(store)
    }

    /// The files shown: the inbox always; tasks and ideas while sorting is
    /// on, as on desktop.
    private var shownFiles: [LayoutFile] {
        settings.sort ? LayoutFile.allCases : [.inbox]
    }

    private func fileRow(_ file: LayoutFile) -> some View {
        let template = drafts[keyPath: file.draft]
        let moment = NoteMoment(.now)
        let usable = (try? NotePath.resolve(template, at: moment).get()) != nil
        return VStack(alignment: .leading, spacing: 6) {
            // The field says its name to VoiceOver; this is for the eye.
            Text(file.title)
                .accessibilityHidden(true)
            // Wraps, so a long path shows whole at the largest text sizes;
            // Return still ends the edit (onChange(of: drafts) below).
            TextField(file.title, text: $drafts[dynamicMember: file.draft], axis: .vertical)
                .lineLimit(1...8)
                .font(.body.monospaced())
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.done)
                .focused($editing, equals: file)
                .onSubmit { commit(file) }
                .frame(minHeight: 44)
            Text(NotesSettingsCopy.today(template, at: moment))
                .font(.footnote)
                .foregroundStyle(usable ? Tokens.textDim : Tokens.red)
        }
        .padding(.vertical, 4)
    }

    private func loadDrafts() {
        guard let standard = Self.standard else { return }
        for file in LayoutFile.allCases { drafts[keyPath: file.draft] = file.saved(settings) ?? file.standard(standard) }
    }

    /// Saves what was typed in one file, as desktop's field does on leaving.
    private func commit(_ file: LayoutFile) {
        guard let standard = Self.standard else { return }
        let next = NotesSettings.typed(drafts[keyPath: file.draft], standard: file.standard(standard), saved: file.saved(settings))
        file.save(next, in: &settings)
        drafts[keyPath: file.draft] = next ?? file.standard(standard)
        settings.save(defaults)
        replan()
    }

    private func useDefaults(_ standard: NoteLayout) {
        editing = nil
        for file in LayoutFile.allCases { file.save(nil, in: &settings) }
        settings.save(defaults)
        loadDrafts()
        replan()
    }

    private func replan() {
        guard let notes = Notes.live() else { return }
        Task { await TaskReminders.refresh(folder: notes.folder, rules: notes.rules) }
    }

    static func date(_ clock: String) -> Date {
        let parts = clock.split(separator: ":").compactMap { Int($0) }
        return Calendar.current.date(bySettingHour: parts.first ?? 9, minute: parts.last ?? 0, second: 0, of: .now) ?? .now
    }

    static func clock(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }
}

enum NotesSettingsCopy {
    static let folder = "Notes folder"
    static let sorting = "Sorting"
    static let ownFolder = "In murmur"
    static let chooseFolder = "Choose folder"
    static let useOwn = "Keep notes in murmur"
    static let folderFooter = "Pick a folder of your own, such as your Obsidian vault, and murmur writes its notes there as markdown files, named under File layout below. To share them with your Mac, pick the vault your Mac uses and give File layout the same files as the Mac's. Notes already written stay where they are."
    static let notKept = "murmur could not keep that folder. Try again."

    /// What VoiceOver reads for the folder row.
    static func folderNow(_ name: String?) -> String {
        "Notes folder: \(name ?? ownFolder)"
    }

    static func lost(_ name: String) -> String {
        "murmur can no longer reach \(name). Choose it again, or keep notes in murmur."
    }

    static let sort = "Sort into tasks and ideas"
    static let sortFooter = "After a note lands, a chat through your cleanup connection labels each sentence a task, an idea, or a note, and murmur copies tasks to the tasks file and ideas to the ideas file, with links back. Nothing is reworded. Off keeps the inbox only."
    static let reminders = "Task reminders"
    static let remindersFooter = "At these times, murmur says how many tasks are still open in the tasks file and names the next few. With nothing open, nothing arrives."
    static let sendNow = "Send one now"
    static let denied = "Notifications are off for murmur, so reminders cannot arrive."
    static let openSettings = "Turn on notifications in Settings"

    static let layout = "File layout"
    static let inboxFile = "Inbox file"
    static let tasksFile = "Tasks file"
    static let ideasFile = "Ideas file"
    static let useDefaults = "Use the defaults"
    static let layoutFooter = "Where each file goes, inside your notes folder. To share a vault with your Mac, use the same files as murmur on the Mac, in its Settings, Notes, File layout. Tokens: {date} {time} {datetime} {year} {month} {day}. Folders in the path are made for you."

    /// The line under a file: where today's is, or why the default is used,
    /// in desktop's words (src/renderer/settings/NotesPanel.tsx).
    static func today(_ template: String, at moment: NoteMoment) -> String {
        switch NotePath.resolve(template, at: moment) {
        case let .success(path): "Today: \(path)"
        case let .failure(problem): "Falls back to the default because \(reason(problem))."
        }
    }

    static func reason(_ problem: NotePathProblem) -> String {
        switch problem {
        case .empty: "the template is empty"
        case .absolute: "the path must be relative to your notes folder"
        case .escapes: "the path must stay inside your notes folder"
        case .extension: "the file must end in .md or .txt"
        case .characters: "a segment holds a character file names cannot"
        case .reserved: "that name is a Windows device name"
        }
    }

    static func time(_ index: Int) -> String {
        ["First", "Second", "Third"].indices.contains(index) ? ["First", "Second", "Third"][index] : "Time \(index + 1)"
    }
}

/// What the File layout fields hold while you type.
struct LayoutDrafts: Equatable {
    var inbox = ""
    var tasks = ""
    var ideas = ""
}

/// One of File layout's files.
enum LayoutFile: CaseIterable, Hashable {
    case inbox, tasks, ideas

    var draft: WritableKeyPath<LayoutDrafts, String> {
        switch self {
        case .inbox: \.inbox
        case .tasks: \.tasks
        case .ideas: \.ideas
        }
    }

    var title: String {
        switch self {
        case .inbox: NotesSettingsCopy.inboxFile
        case .tasks: NotesSettingsCopy.tasksFile
        case .ideas: NotesSettingsCopy.ideasFile
        }
    }

    func standard(_ layout: NoteLayout) -> String {
        switch self {
        case .inbox: layout.inbox
        case .tasks: layout.tasks
        case .ideas: layout.ideas
        }
    }

    func saved(_ settings: NotesSettings) -> String? {
        switch self {
        case .inbox: settings.inboxFile
        case .tasks: settings.tasksFile
        case .ideas: settings.ideasFile
        }
    }

    func save(_ template: String?, in settings: inout NotesSettings) {
        switch self {
        case .inbox: settings.inboxFile = template
        case .tasks: settings.tasksFile = template
        case .ideas: settings.ideasFile = template
        }
    }
}
