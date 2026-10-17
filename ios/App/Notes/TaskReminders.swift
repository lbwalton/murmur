// SPDX-License-Identifier: GPL-3.0-only
// Task reminders on iPhone (ios/prd.json IOS-023): desktop's reminders
// (US-052) say how many tasks are still open at the times you pick,
// reading the tasks file when each one is due. An iPhone app cannot wake
// to read a file, so the reminders are laid down ahead with the file as it
// stands, and laid down again whenever murmur changes it: a note sorted, a
// box ticked, a setting changed, a return to murmur. In a folder you picked,
// Obsidian or a Mac may change the file too; reminders catch up the next
// time murmur opens.
import Foundation
import MurmurCore
import UserNotifications

/// The notes' choices, kept on this iPhone: sorting, and the reminders.
struct NotesSettings: Equatable {
    static let sortKey = "notes.sort"
    static let remindersKey = "notes.reminders"
    static let timesKey = "notes.reminderTimes"
    /// Desktop's defaults (src/shared/settings.ts): sorting off, and
    /// reminders, once on, at 8:30, 13:00, and 17:30.
    static let standardSort = false
    static let standardTimes = ["08:30", "13:00", "17:30"]

    var sort: Bool
    var reminders: Bool
    /// HH:mm, in the order you set them.
    var times: [String]

    static func load(_ defaults: UserDefaults = .standard) -> NotesSettings {
        let times = (defaults.stringArray(forKey: timesKey) ?? standardTimes).filter(isTime)
        return NotesSettings(
            sort: defaults.object(forKey: sortKey) as? Bool ?? standardSort,
            reminders: defaults.bool(forKey: remindersKey),
            times: times.isEmpty ? standardTimes : times
        )
    }

    func save(_ defaults: UserDefaults = .standard) {
        defaults.set(sort, forKey: Self.sortKey)
        defaults.set(reminders, forKey: Self.remindersKey)
        defaults.set(times.filter(Self.isTime), forKey: Self.timesKey)
    }

    static func isTime(_ text: String) -> Bool {
        let parts = text.split(separator: ":")
        guard parts.count == 2, parts.allSatisfy({ $0.count == 2 }), let hour = Int(parts[0]), let minute = Int(parts[1]) else { return false }
        return (0...23).contains(hour) && (0...59).contains(minute)
    }
}

/// The reminders' pending notifications: one at each time on each of the
/// next days, all saying the tasks file as it stands now.
struct ReminderPlan: Equatable {
    static let prefix = "murmur.tasks."
    static let title = "murmur tasks"
    /// Send one now's reminder, which laying the week down leaves to arrive.
    static let now = prefix + "now"

    let items: [RecapPlan.Item]

    static func plan(tasks: String?, rules: SorterRules, settings: NotesSettings, now: Date = .now, calendar: Calendar = .current) -> ReminderPlan {
        guard settings.reminders, let tasks else { return ReminderPlan(items: []) }
        let body = Todo.reminderBody(Todo.items(tasks), maxChars: rules.reminderMaxChars)
        guard !body.isEmpty else { return ReminderPlan(items: []) }
        let today = HistoryEntry.dayKey(now, calendar: calendar)
        // Day keys are Gregorian, as the recap's are.
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        var items: [RecapPlan.Item] = []
        for offset in 0..<RecapPlan.days {
            let day = Paintings.shiftDay(today, offset)
            let parts = day.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { continue }
            for time in settings.times {
                let clock = time.split(separator: ":").compactMap { Int($0) }
                guard clock.count == 2 else { continue }
                let moment = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: clock[0], minute: clock[1])
                guard let at = gregorian.date(from: moment), at > now else { continue }
                var fire = calendar.dateComponents([.era, .year, .month, .day, .hour, .minute], from: at)
                fire.calendar = calendar
                fire.timeZone = calendar.timeZone
                items.append(RecapPlan.Item(id: "\(prefix)\(day).\(time)", day: day, fire: fire, body: body))
            }
        }
        return ReminderPlan(items: items)
    }
}

@MainActor enum TaskReminders {
    /// The last laying-down asked for; each waits for the one before.
    private static var last: Task<Void, Never>?

    /// Lays the plan down: its reminders added first, then every other
    /// pending reminder removed. With reminders off, nothing open, or
    /// notifications refused, every pending reminder goes.
    static func apply(_ plan: ReminderPlan, center: any RecapCenter) async {
        var kept = Set<String>()
        if !plan.items.isEmpty, await center.isAllowed() {
            for item in plan.items {
                await center.add(item, title: ReminderPlan.title)
                kept.insert(item.id)
            }
        }
        let stale = await center.pendingIDs().filter { $0.hasPrefix(ReminderPlan.prefix) && $0 != ReminderPlan.now && !kept.contains($0) }
        center.remove(stale)
    }

    /// A reminder two seconds from now, as one would read now, to see how
    /// it reads; what it said, or why nothing was sent.
    static func sendNow(center: UNUserNotificationCenter = .current()) async -> String {
        guard let notes = Notes.live(), let tasks = notes.folder.read(notes.rules.layout.tasks) else { return NotesCopy.noTasksToRemind }
        let body = Todo.reminderBody(Todo.items(tasks), maxChars: notes.rules.reminderMaxChars)
        guard !body.isEmpty else { return NotesCopy.nothingOpen }
        let content = UNMutableNotificationContent()
        content.title = ReminderPlan.title
        content.body = body
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: ReminderPlan.now, content: content, trigger: trigger))
        return body
    }

    /// Plans the reminders again from the tasks file as it is now. Each
    /// waits its turn and reads the file and the settings only then.
    static func refresh(folder: some NoteFolder, rules: SorterRules, defaults: UserDefaults = .standard, center: (any RecapCenter)? = nil) async {
        let before = last
        let step = Task {
            await before?.value
            let plan = ReminderPlan.plan(tasks: folder.read(rules.layout.tasks), rules: rules, settings: .load(defaults))
            await apply(plan, center: center ?? SystemRecapCenter.shared)
        }
        last = step
        await step.value
    }
}
