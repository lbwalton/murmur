// SPDX-License-Identifier: GPL-3.0-only
// Settings, Notes (ios/prd.json IOS-023): whether a note is sorted into
// tasks and ideas, and the task reminders, off until you turn them on.
// Turning reminders on is the moment murmur asks to send notifications.
import MurmurCore
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import UserNotifications

struct NotesSettingsScreen: View {
    @State private var settings = NotesSettings.load()
    @State private var times: [Date] = []
    @State private var denied = false
    @State private var asking = false
    @State private var reverting = false
    @State private var tested: String?
    @State private var folderName = NotesFolderChoice().name
    @State private var folderLost = false
    @State private var picking = false
    @State private var folderProblem: String?

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
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(NotesCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            settings = NotesSettings.load()
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
        .onChange(of: settings.sort) { settings.save() }
        .onChange(of: times) {
            settings.times = times.map(Self.clock)
            settings.save()
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
        settings.save()
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
    static let folderFooter = "Pick a folder of your own, such as your Obsidian vault, and murmur writes the same markdown files there that it writes on a Mac: murmur/inbox, murmur/todo.md, and murmur/ideas.md. Notes already written stay where they are."
    static let notKept = "murmur could not keep that folder. Try again."

    /// What VoiceOver reads for the folder row.
    static func folderNow(_ name: String?) -> String {
        "Notes folder: \(name ?? ownFolder)"
    }

    static func lost(_ name: String) -> String {
        "murmur can no longer reach \(name). Choose it again, or keep notes in murmur."
    }

    static let sort = "Sort into tasks and ideas"
    static let sortFooter = "After a note lands, a chat through your cleanup connection labels each sentence a task, an idea, or a note, and murmur copies tasks to todo.md and ideas to ideas.md with links back. Nothing is reworded. Off keeps the inbox only."
    static let reminders = "Task reminders"
    static let remindersFooter = "At these times, murmur says how many tasks are still open in todo.md and names the next few. With nothing open, nothing arrives."
    static let sendNow = "Send one now"
    static let denied = "Notifications are off for murmur, so reminders cannot arrive."
    static let openSettings = "Turn on notifications in Settings"

    static func time(_ index: Int) -> String {
        ["First", "Second", "Third"].indices.contains(index) ? ["First", "Second", "Third"][index] : "Time \(index + 1)"
    }
}
