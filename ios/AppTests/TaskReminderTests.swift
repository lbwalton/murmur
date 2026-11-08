// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// Task reminders on iPhone (IOS-023): desktop's reminder body at the times
/// you pick, laid down a week ahead.
@MainActor @Suite struct TaskReminderTests {
    let rules: SorterRules
    let calendar: Calendar
    let tasks = "## 2026-09-18\n- [ ] Call the dentist.\n- [x] Book the flight.\n- [ ] Email Bob.\n"

    init() throws {
        rules = try BundledRules.sorter()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        self.calendar = calendar
    }

    func settings(_ on: Bool, _ times: [String] = ["09:00", "13:00", "17:00"]) -> NotesSettings {
        NotesSettings(sort: true, reminders: on, times: times)
    }

    @Test func remindersSayTheOpenTasksAtEachTimeForAWeek() throws {
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 9, day: 18, hour: 10)))
        let plan = ReminderPlan.plan(tasks: tasks, rules: rules, settings: settings(true), now: now, calendar: calendar)
        // Today's 09:00 has passed: 2 today, then 3 a day for 6 days.
        #expect(plan.items.count == 2 + 3 * 6)
        #expect(plan.items.first?.id == "murmur.tasks.2026-09-18.13:00")
        #expect(plan.items.allSatisfy { $0.body == "2 open tasks: Call the dentist.; Email Bob." })
    }

    @Test func remindersOffOrNothingOpenLayNothingDown() throws {
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 9, day: 18, hour: 10)))
        #expect(ReminderPlan.plan(tasks: tasks, rules: rules, settings: settings(false), now: now, calendar: calendar).items.isEmpty)
        #expect(ReminderPlan.plan(tasks: "- [x] Done.\n", rules: rules, settings: settings(true), now: now, calendar: calendar).items.isEmpty)
        #expect(ReminderPlan.plan(tasks: nil, rules: rules, settings: settings(true), now: now, calendar: calendar).items.isEmpty)
    }

    /// Desktop's defaults (src/shared/settings.ts): sorting off, reminders
    /// off, and once on, at 8:30, 13:00, and 17:30.
    @Test func theDefaultsAreDesktopsAndBadTimesFallBack() throws {
        let defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        #expect(NotesSettings.load(defaults) == NotesSettings(sort: false, reminders: false, times: ["08:30", "13:00", "17:30"]))
        NotesSettings(sort: true, reminders: true, times: ["08:30", "25:00", "12:05"]).save(defaults)
        #expect(NotesSettings.load(defaults) == NotesSettings(sort: true, reminders: true, times: ["08:30", "12:05"]))
    }

    /// Settings, Notes, File layout: nothing changed is no layout; a
    /// changed file is kept, and setting it back to the default forgets it.
    @Test func theFileLayoutIsKept() throws {
        let defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        #expect(NotesSettings.load(defaults).layout(rules) == nil)
        var settings = NotesSettings.load(defaults)
        settings.inboxFile = "murmur/notes/{date}.md"
        settings.save(defaults)
        let loaded = NotesSettings.load(defaults)
        #expect(loaded.inboxFile == "murmur/notes/{date}.md" && loaded.tasksFile == nil && loaded.ideasFile == nil)
        #expect(loaded.layout(rules) == NoteLayout(inbox: "murmur/notes/{date}.md", tasks: rules.layout.tasks, ideas: rules.layout.ideas))
        settings.inboxFile = nil
        settings.save(defaults)
        #expect(defaults.object(forKey: NotesSettings.inboxFileKey) == nil)
        #expect(NotesSettings.load(defaults).layout(rules) == nil)
    }

    /// What a typed path saves, as desktop's field commits it: trimmed, the
    /// saved one kept when it is left empty, and nil for the default.
    @Test func aTypedPathSavesAsOnDesktop() {
        let standard = "murmur/inbox/{date}.md"
        #expect(NotesSettings.typed("  murmur/notes/{date}.md ", standard: standard, saved: nil) == "murmur/notes/{date}.md")
        #expect(NotesSettings.typed("   ", standard: standard, saved: "murmur/notes/{date}.md") == "murmur/notes/{date}.md")
        #expect(NotesSettings.typed("murmur/inbox/{date}.md", standard: standard, saved: "murmur/notes/{date}.md") == nil)
    }

    /// The line under each file says where today's file is, or why the
    /// default is used, in desktop's words.
    @Test func eachFileSaysWhereTodaysIs() {
        let moment = NoteMoment(date: "2026-10-18", time: "09:00")
        #expect(NotesSettingsCopy.today("murmur/notes/{date}.md", at: moment) == "Today: murmur/notes/2026-10-18.md")
        #expect(NotesSettingsCopy.today("../escape.md", at: moment) == "Falls back to the default because the path must stay inside your notes folder.")
        #expect(NotesSettingsCopy.today("murmur/notes", at: moment) == "Falls back to the default because the file must end in .md or .txt.")
    }

    @Test func layingDownReplacesTheWeekAndKeepsSendOneNow() async throws {
        let center = FakeCenter()
        center.pending = [ReminderPlan.prefix + "2026-09-01.09:00", ReminderPlan.now, RecapPlan.prefix + "2026-09-18"]
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 9, day: 18, hour: 10)))
        await TaskReminders.apply(ReminderPlan.plan(tasks: tasks, rules: rules, settings: settings(true), now: now, calendar: calendar), center: center)
        #expect(center.added.count == 20)
        #expect(center.removed == [ReminderPlan.prefix + "2026-09-01.09:00"])
        #expect(RecapPlan.presentation(for: ReminderPlan.prefix + "2026-09-18.13:00") == [.banner, .list, .sound])
    }

    @MainActor final class FakeCenter: RecapCenter {
        var pending: [String] = []
        var added: [String] = []
        var removed: [String] = []
        func pendingIDs() async -> [String] { pending + added }
        func remove(_ ids: [String]) { removed += ids }
        func isAllowed() async -> Bool { true }
        func add(_ item: RecapPlan.Item, title: String) async { added.append(item.id) }
    }
}
