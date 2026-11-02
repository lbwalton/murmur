# Control Center, Action Button, and the Lock Screen (IOS-016) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start a session without the keyboard opening murmur. A Start murmur control (Control Center, the Lock Screen, the Action Button) and App Shortcuts start the app's one session through an audio recording intent. While a session runs, a Live Activity on the Lock Screen and in the Dynamic Island shows the clean pill, Ready or Recording, the time left, and End. Starting from the keyboard works as before.

**Architecture:**
- `Live/` is a new folder that both the app and a new widget extension compile.
  - `SessionActivity` is the Live Activity's attributes: Recording or not, and when the session ends.
  - `StartSessionIntent` conforms to `AudioRecordingIntent` and `LiveActivityIntent`; `EndSessionIntent` conforms to `LiveActivityIntent`.
- Because of those conformances, iOS runs the intents in murmur's own process, even when murmur is not open (Apple's docs, checked 2026-10-13). The intents call `SessionControl`:
  - in the app, `SessionControl` brings up the bridge and the one session, as the first screen would;
  - in the widget extension, a stub that is never reached keeps the shared file building.
- The app's `Session` gains a `present` closure, which the app wires to `LiveSession`. `LiveSession` requests, updates, and ends the one ActivityKit activity in order, keeping only its id.
- The widget extension (`murmurWidgets`) holds the control and the Live Activity's views. They draw the pill with the same `Pill.paint` as the keyboard, as a still frame.

**Tech Stack:** Swift 6, App Intents (AudioRecordingIntent, LiveActivityIntent, AppShortcutsProvider), WidgetKit (ControlWidget, ActivityConfiguration, Dynamic Island), ActivityKit, Swift Testing, XcodeGen.

**Spec:** `ios/prd.json` IOS-016, `conventions` (design, verify, docs), `CLAUDE.md`, and `DESIGN.md`. Apple's docs, checked 2026-10-13 with EXA:
- An `AudioRecordingIntent` must start a Live Activity when recording begins, or the recording stops.
- An intent conforming to `LiveActivityIntent` (or `AudioPlaybackIntent`, or `ForegroundContinuableIntent`) runs in the app's process.
- A `LiveActivityIntent` run from a control launches the app's process without opening the app.

The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** in a throwaway copy of `feature/ios` at c5351a0:
- It built with the widget extension.
- `npm run ios:test` ran 233 app tests (229 existing, 4 new).
- `npm run ios:smoke` printed seventeen true checks, `sessionIntents` among them. The Start intent really started a session whose Live Activity came up on the simulator, and End took both down.
- The Lock Screen (Ready and Recording) and the compact and minimal Dynamic Island views were rendered and read. That read caught and fixed a timer that wrapped onto two lines, and resting dots too faint to see.
- `npm run test` passed with the widget target added to the privacy manifest check.

This branch's head (c75db8b) adds IOS-015's review fixes. None of the files this plan replaces whole changed there, so the counts below start from its 229 app tests and 909 desktop tests.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The control is a button, Start murmur, not an on and off toggle.** End lives on the Live Activity. A button never shows a wrong state when a session lapses by itself. If wrong: a toggle with a value read from session.json.
2. **Ready shows the still voice shape in quiet grey, and Recording shows it in amber.** The keyboard's resting dots all but vanish in the Dynamic Island's smallest spot. Amber stays a live state only. If wrong: one view.
3. **Every session gets the Live Activity,** however it started (keyboard, murmur's own screen, or the control), since the story says "while a session runs". If Live Activities are turned off, the session still runs.
4. **App Shortcuts** "Start a murmur session" and "End the murmur session" come along for Shortcuts and Siri. The Action Button takes the control directly. If wrong: one file.
5. **The widget extension compiles only what it draws:**
   - `Live/`;
   - `Shared/Pill.swift` and `Shared/AppGroup.swift`;
   - `Generated/Tokens.swift`.
   It has its own privacy manifest declaring no required reason API, and the manifest check now lists files as well as folders.
6. **A new bundle id, `com.lbwalton.murmur.ios.widgets`,** is registered by automatic provisioning the first time a signed build is made: the next `npm run ios:release`, which checks every extension.
7. **The live check waits for TestFlight** (IOS-015).

## Global Constraints

- Swift 6 with strict concurrency; iOS 26 minimum. It must compile with Swift 6.3 (CI's Xcode 26.6):
  - bind by key path, never `Binding(get:set:)` with closures;
  - write long math as small typed steps;
  - never send an ActivityKit `Activity` across actors (keep its id).
- The keyboard is unchanged and keeps no network code.
- Design: night studio tokens. Amber only for Recording, gold for murmur's name and End, and the pill drawn clean (never brushed at this size). 44 point targets, and VoiceOver labels on the pill and End.
- Every `.swift` file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-016:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **A Live Activity left on screen after the session ended.** This includes after murmur closed. Session.listen shows nil at launch, and End brings the session up to end it. Pinned by `SessionActivityTests.theLiveActivityFollowsTheSession` (Task 1) and the smoke's `sessionIntents` (Task 4).
2. **The intent running in the widget's process and doing nothing.** The conformances make iOS run it in the app. Pinned by `SessionControlTests.theIntentsStartAndEndTheSession` (Task 2). The live check proves it on a device.
3. **A start from the control when the microphone was never allowed.** It must say so and start nothing. Pinned by `SessionControlTests` (Task 2).
4. **Out of order Live Activity updates,** such as Recording arriving after Ready. One drain loop applies the newest state. Pinned by Task 1's test, and by the smoke's start and end round trip (Task 4).
5. **The widget target needing a privacy manifest entry it lacks.** Pinned by the manifest check's new Widgets case (Task 3).

---

### Task 1: The session's Live Activity

**Files:**
- Create: `ios/Live/SessionActivity.swift`, `ios/App/Session/LiveSession.swift`.
- Modify: `ios/App/Session/Session.swift`, `ios/project.yml`.
- Test: `ios/AppTests/SessionActivityTests.swift`.

**Interfaces:**
- Produces `SessionActivity` (with `ContentState(recording:until:)`) and `SessionActivityCopy` (`ready`, `recording`, `end`, `title`, `state(_:)`).
- Produces the `Session.init` parameter `present: @MainActor (SessionActivity.ContentState?) -> Void = { _ in }`, last.
- Produces `LiveSession.shared` with `show(_:)`, `isShowing`, and `settle()`.
- Produces the test helpers `ShownStates` and `scriptedSession(_:shown:)`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// Every state a session asked its Live Activity to show.
@MainActor final class ShownStates {
    var states: [SessionActivity.ContentState?] = []

    /// Recording or not, nil when off, with repeats folded.
    var steps: [Bool?] {
        states.map { $0?.recording }.reduce(into: []) { steps, step in
            if steps.last != step { steps.append(step) }
        }
    }
}

/// A listening session on a scripted microphone and a provider that says
/// One., whose Live Activity states land in shown (IOS-016).
@MainActor func scriptedSession(_ microphone: ScriptedMicrophone, shown: ShownStates) throws -> (Session, TakeModel) {
    let groq = "https://api.groq.com/openai/v1"
    let defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
    let ring = MemoryKeyRing()
    try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
    CleanupStore(defaults: defaults).save(CleanupSettings(polish: false))
    let model = TakeModel(
        microphone: microphone,
        store: WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "live-takes-\(UUID().uuidString)", directoryHint: .isDirectory)),
        rules: try BundledRules.takeRules(), catalog: try BundledRules.catalog(),
        connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
        send: FakeProvider.says("One.").send, copy: { _ in }
    )
    let session = Session(
        microphone: microphone, model: model, defaults: defaults,
        stateFile: FileManager.default.temporaryDirectory.appending(path: "live-\(UUID().uuidString).json"),
        announce: { _ in }, present: { state in shown.states.append(state) }
    )
    session.listen()
    return (session, model)
}

/// The session's Live Activity (IOS-016) follows the session.
@MainActor @Suite struct SessionActivityTests {
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let shown = ShownStates()

    func waitUntil(_ done: @MainActor () -> Bool) async throws {
        for _ in 0..<150 where !done() {
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    /// It says Ready while the session waits, Recording while a take
    /// records, Ready again with a new end time after it, and goes when the
    /// session ends.
    @Test func theLiveActivityFollowsTheSession() async throws {
        let (session, model) = try scriptedSession(microphone, shown: shown)
        #expect(shown.states == [nil])
        #expect(await session.begin())
        let first = try #require(shown.states.last??.until)
        await model.start()
        try await waitUntil { shown.states.last??.recording == true }
        await model.stop()
        try await waitUntil { (shown.states.last??.until ?? first) > first }
        session.end()
        #expect(shown.steps == [nil, false, true, false, nil])
        #expect(shown.states.last == .some(nil))
    }

    @Test func itsWordsFollowTheWritingRules() {
        for line in [SessionActivityCopy.ready, SessionActivityCopy.recording, SessionActivityCopy.end, SessionActivityCopy.title] {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
        #expect(SessionActivityCopy.state(true) == "Recording" && SessionActivityCopy.state(false) == "Ready")
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:generate && npm run ios:test`
Expected: the app test build fails with `cannot find type 'SessionActivity' in scope`.

- [ ] **Step 3: Write the activity, the presenter, and the session's hook**

In `ios/project.yml`, in the `murmur` target's `sources`, after `- path: Shared`, add `- path: Live`.

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The session's Live Activity (ios/prd.json IOS-016): what the Lock Screen
// and the Dynamic Island show while a session runs. iOS redraws it only now
// and then, so it holds still states: Ready or Recording, and when the
// session ends. It never follows the voice.
import ActivityKit
import Foundation

struct SessionActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable, Sendable {
        /// A take is recording now.
        var recording: Bool
        /// When the session ends unless another take comes first.
        var until: Date
    }
}

/// What the Live Activity says, kept here so the app's tests can read it.
enum SessionActivityCopy {
    static let ready = "Ready"
    static let recording = "Recording"
    static let end = "End"
    static let title = "murmur"

    static func state(_ recording: Bool) -> String {
        recording ? self.recording : ready
    }
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The session's Live Activity on the Lock Screen and in the Dynamic Island
// (ios/prd.json IOS-016), shown while a session runs.
import ActivityKit
import Foundation

/// The session's Live Activity: one at a time, shown while the session is
/// on, updated when a take starts or ends, and ended with the session.
/// Updates run in order, the newest state winning. Only the activity's id
/// is kept here; ActivityKit's own list holds the activity.
@MainActor final class LiveSession {
    static let shared = LiveSession()

    private var activityID: String?
    private var latest: SessionActivity.ContentState?
    private var running: Task<Void, Never>?

    /// Shows the session's state, or ends the Live Activity when it is off.
    func show(_ state: SessionActivity.ContentState?) {
        latest = state
        guard running == nil else { return }
        running = Task { await drain() }
    }

    private func drain() async {
        while true {
            let want = latest
            await apply(want)
            if latest == want { break }
        }
        running = nil
    }

    private func apply(_ state: SessionActivity.ContentState?) async {
        guard let state else {
            await Self.endAll()
            activityID = nil
            return
        }
        activityID = await Self.present(state, over: activityID)
    }

    /// Updates the activity with this id while it is up, or starts one.
    /// Its id, or nil when iOS would not start one (Live Activities off).
    private nonisolated static func present(_ state: SessionActivity.ContentState, over id: String?) async -> String? {
        let content = ActivityContent(state: state, staleDate: state.until)
        if let id, let open = Activity<SessionActivity>.activities.first(where: { $0.id == id && $0.activityState == .active }) {
            await open.update(content)
            return id
        }
        return (try? Activity.request(attributes: SessionActivity(), content: content))?.id
    }

    private nonisolated static func endAll() async {
        for open in Activity<SessionActivity>.activities {
            await open.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// Whether this session's Live Activity is up now; the smoke reads this.
    var isShowing: Bool {
        guard let activityID else { return false }
        return Activity<SessionActivity>.activities.contains { $0.id == activityID && $0.activityState == .active }
    }

    /// Waits until updates have run; the smoke uses this.
    func settle() async {
        while let running { await running.value }
    }
}
```

`ios/App/Session/Session.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The listening session (ios/prd.json IOS-009): while it runs, the
// microphone stays warm in the background (iOS shows its orange dot), so
// a tap on the pill in any app starts a take at once. It ends by itself
// after the length you picked, counted from your last take, when you end
// it here or from the keyboard, or when a call, Siri, or another app takes
// the microphone. Nothing it hears between takes is kept, written, or
// sent: the warm microphone drops it as it arrives. While it runs, its
// Live Activity says so on the Lock Screen and in the Dynamic Island
// (IOS-016).
import AVFoundation
import Foundation
import Observation

@Observable @MainActor final class Session {
    enum Length: Int, CaseIterable, Sendable {
        case five = 5, fifteen = 15, hour = 60

        var seconds: TimeInterval { TimeInterval(rawValue) * 60 }
    }

    static let lengthKey = "sessionLength"
    /// How often a length that ran out during a take or a retry looks again.
    static let recheck: TimeInterval = 1

    /// When the session ends unless another take comes first; nil when off.
    private(set) var until: Date?
    private(set) var length: Length

    var isOn: Bool { until != nil }

    @ObservationIgnored private let microphone: any WarmMicrophone
    @ObservationIgnored private let model: TakeModel
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let stateFile: URL?
    /// A length in seconds; only the smoke and the tests shorten it.
    @ObservationIgnored private let seconds: @MainActor (Length) -> TimeInterval
    @ObservationIgnored private let announce: @MainActor (Signal) -> Void
    /// Shows the session's Live Activity, or ends it with nil (IOS-016).
    @ObservationIgnored private let present: @MainActor (SessionActivity.ContentState?) -> Void
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var listener: SignalListener?
    @ObservationIgnored private var interruptions: (any NSObjectProtocol)?

    init(
        microphone: any WarmMicrophone, model: TakeModel, defaults: UserDefaults = .standard, stateFile: URL? = SessionState.file,
        seconds: @escaping @MainActor (Length) -> TimeInterval = { $0.seconds }, announce: @escaping @MainActor (Signal) -> Void = { $0.post() },
        present: @escaping @MainActor (SessionActivity.ContentState?) -> Void = { _ in }
    ) {
        self.microphone = microphone
        self.model = model
        self.defaults = defaults
        self.stateFile = stateFile
        self.seconds = seconds
        self.announce = announce
        self.present = present
        length = Length(rawValue: defaults.integer(forKey: Self.lengthKey)) ?? .fifteen
    }

    /// Hears End session from the keyboard and interruptions from iOS,
    /// follows the takes, and says the session is off: a session never
    /// outlives the app that ran it.
    func listen() {
        listener = SignalListener([.end]) { [weak self] _ in self?.end() }
        microphone.onLost = { [weak self] in self?.interrupted() }
        interruptions = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            guard type == AVAudioSession.InterruptionType.began.rawValue else { return }
            MainActor.assumeIsolated { self?.interrupted() }
        }
        follow()
        publish()
    }

    /// Starts the session, or counts its length again from now. False when
    /// murmur may not use the microphone, or there is none.
    func begin() async -> Bool {
        guard await microphone.allow() else { return false }
        microphone.holdWarm = true
        do {
            try microphone.warmUp()
        } catch {
            microphone.holdWarm = false
            return false
        }
        extend()
        return true
    }

    /// Ends the session at once. A take still recording stops and is
    /// processed, as if you had tapped stop.
    func end() {
        timer?.cancel()
        timer = nil
        microphone.holdWarm = false
        if model.isRecording {
            Task { await model.stop() }
        } else {
            microphone.coolDown()
        }
        guard until != nil else { return }
        until = nil
        publish()
    }

    func choose(_ length: Length) {
        self.length = length
        defaults.set(length.rawValue, forKey: Self.lengthKey)
        if isOn { extend() }
    }

    /// A call, Siri, or another app took the microphone, or the microphone
    /// went away: the session ends, and a take in progress is processed
    /// with what it heard.
    func interrupted() {
        if isOn {
            end()
        } else if model.isRecording {
            Task { await model.stop() }
        }
    }

    /// Counts the length from now.
    private func extend() {
        let wait = seconds(length)
        until = .now.addingTimeInterval(wait)
        publish()
        timer?.cancel()
        timer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard !Task.isCancelled else { return }
            self?.lapse()
        }
    }

    /// The length ran out. A take still running keeps the session until it
    /// ends, and the length counts again from then. Work that ends without
    /// a new take (a retry that fails again) changes nothing to follow, so
    /// while anything runs the session looks again shortly.
    private func lapse() {
        guard isOn else { return }
        guard !model.isRecording, !model.isBusy else {
            timer = Task { [weak self] in
                try? await Task.sleep(for: .seconds(Self.recheck))
                guard !Task.isCancelled else { return }
                self?.lapse()
            }
            return
        }
        end()
    }

    /// Each take that ends counts the length again from its end, and the
    /// Live Activity follows Ready and Recording.
    private func follow() {
        withObservationTracking {
            _ = model.state
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if self.isOn, !self.model.isRecording, !self.model.isBusy {
                    self.extend()
                } else {
                    self.show()
                }
                self.follow()
            }
        }
    }

    private func publish() {
        SessionState(until: until).write(to: stateFile)
        announce(.changed)
        show()
    }

    /// What the Live Activity shows: nothing while off.
    private func show() {
        present(until.map { SessionActivity.ContentState(recording: model.isRecording, until: $0) })
    }
}

extension Session {
    private static var shared: Session?

    /// The one session for the app's life, on the app's take model and the
    /// device microphone.
    static func live() -> Session? {
        if let shared { return shared }
        guard let model = TakeModel.live() else { return nil }
        let session = Session(microphone: DeviceMicrophone.shared, model: model, present: { LiveSession.shared.show($0) })
        session.listen()
        shared = session
        return session
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `SessionActivityTests` passes (2 tests), and the app total is 231.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Live/SessionActivity.swift ios/App/Session/LiveSession.swift ios/App/Session/Session.swift ios/project.yml ios/AppTests/SessionActivityTests.swift
git commit -m "IOS-016: a session shows a Live Activity: Ready or Recording and its end time, gone when the session ends"
```

### Task 2: The intents

**Files:**
- Create: `ios/Live/SessionIntents.swift`, `ios/App/Session/SessionControl.swift`, `ios/App/Session/MurmurShortcuts.swift`.
- Test: `ios/AppTests/SessionControlTests.swift`.

**Interfaces:**
- Consumes `scriptedSession` and `ShownStates` (Task 1).
- Produces:
  - `StartSessionIntent` (AudioRecordingIntent and LiveActivityIntent) and `EndSessionIntent` (LiveActivityIntent);
  - `SessionStart` (`started`, `noMicrophone`, `unavailable`) and `SessionIntentCopy`;
  - `SessionControl.source`, `start()`, and `end()`;
  - `MurmurShortcuts`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

/// Starting and ending a session without opening murmur (IOS-016): the
/// intents Control Center, the Action Button, Shortcuts, and the Live
/// Activity's End run.
@MainActor @Suite(.serialized) struct SessionControlTests {
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let shown = ShownStates()

    /// The intents start and end the session they are given, and say when
    /// the microphone is not allowed yet.
    @Test func theIntentsStartAndEndTheSession() async throws {
        let (session, _) = try scriptedSession(microphone, shown: shown)
        let before = SessionControl.source
        defer { SessionControl.source = before }
        SessionControl.source = { session }
        _ = try await StartSessionIntent().perform()
        #expect(session.isOn)
        #expect(microphone.isWarm)
        _ = try await EndSessionIntent().perform()
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
        microphone.allowed = false
        #expect(await SessionControl.start() == .noMicrophone)
        #expect(!session.isOn)
        SessionControl.source = { nil }
        #expect(await SessionControl.start() == .unavailable)
    }

    @Test func whatTheIntentsSayFollowsTheWritingRules() {
        for line in [SessionIntentCopy.started, SessionIntentCopy.noMicrophone, SessionIntentCopy.unavailable] {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:generate && npm run ios:test`
Expected: the app test build fails with `cannot find 'SessionControl' in scope`.

- [ ] **Step 3: Write the intents and the app's side**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Starting and ending a session without opening murmur (ios/prd.json
// IOS-016): the Control Center control, the Action Button, Shortcuts, and
// the Live Activity's End run these. As audio recording and Live Activity
// intents, iOS runs them in murmur's own process even when murmur is not
// open, so the session is the app's one session. This file is built into
// the widget extension too, which only shows the control; there,
// SessionControl does nothing and is never reached.
import AppIntents
import Foundation

struct StartSessionIntent: AudioRecordingIntent, LiveActivityIntent {
    static let title: LocalizedStringResource = "Start a murmur session"
    static let description = IntentDescription("Keeps the microphone ready so a tap on the murmur keyboard's pill starts a take at once.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        switch await SessionControl.start() {
        case .started:
            return .result(dialog: IntentDialog(stringLiteral: SessionIntentCopy.started))
        case .noMicrophone:
            return .result(dialog: IntentDialog(stringLiteral: SessionIntentCopy.noMicrophone))
        case .unavailable:
            return .result(dialog: IntentDialog(stringLiteral: SessionIntentCopy.unavailable))
        }
    }
}

struct EndSessionIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "End the murmur session"
    static let description = IntentDescription("Lets the microphone go.")

    func perform() async throws -> some IntentResult {
        await SessionControl.end()
        return .result()
    }
}

/// How a start went.
enum SessionStart: Sendable, Equatable {
    case started
    /// murmur may not use the microphone yet; it can only be allowed in murmur.
    case noMicrophone
    /// murmur's own files could not be read.
    case unavailable
}

/// What the intents say.
enum SessionIntentCopy {
    static let started = "murmur is listening for your next take."
    static let noMicrophone = "Open murmur once to allow the microphone, then try again."
    static let unavailable = "murmur could not start. Open murmur and try again."
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The app's side of the session intents (ios/prd.json IOS-016). iOS runs
// them in murmur's process, maybe with no screen open, so starting brings
// up what the first screen would: the keyboard's bridge and the one
// session.
import Foundation

@MainActor enum SessionControl {
    /// The session the intents start and end: the app's one session, with
    /// the keyboard's bridge listening, as the first screen would bring up.
    /// The smoke and the tests give their own.
    static var source: @MainActor () -> Session? = {
        _ = KeyboardBridge.live()
        return Session.live()
    }

    /// Starts the session, or counts its length again from now.
    static func start() async -> SessionStart {
        guard let session = source() else { return .unavailable }
        return await session.begin() ? .started : .noMicrophone
    }

    /// Ends the session. From a Live Activity left over after murmur
    /// closed, bringing the session up ends that activity too.
    static func end() async {
        source()?.end()
    }
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Starting and ending a session from Shortcuts and Siri (ios/prd.json
// IOS-016), beside the Start murmur control, which Control Center, the Lock
// Screen, and the Action Button all take.
import AppIntents

struct MurmurShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartSessionIntent(),
            phrases: ["Start a \(.applicationName) session"],
            shortTitle: "Start murmur",
            systemImageName: "waveform"
        )
        AppShortcut(
            intent: EndSessionIntent(),
            phrases: ["End the \(.applicationName) session"],
            shortTitle: "End murmur",
            systemImageName: "stop.circle"
        )
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `SessionControlTests` passes (2 tests), and the app total is 233.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Live/SessionIntents.swift ios/App/Session/SessionControl.swift ios/App/Session/MurmurShortcuts.swift ios/AppTests/SessionControlTests.swift
git commit -m "IOS-016: Start murmur and End run in murmur's process and start or end its one session"
```

### Task 3: The widget extension: the control and the Live Activity's look

**Files:**
- Create: `ios/Widgets/MurmurWidgets.swift`, `ios/Widgets/SessionViews.swift`, `ios/Widgets/SessionControlStub.swift`, `ios/Widgets/PrivacyInfo.xcprivacy`.
- Modify: `ios/project.yml`, `scripts/lib/privacy-manifest.test.js`.

**Interfaces:**
- Consumes `SessionActivity`, `SessionActivityCopy`, `StartSessionIntent`, `EndSessionIntent`, and `SessionStart` (Tasks 1 and 2), and `Pill`, `PillFrame`, and `Tokens`.
- Produces the `murmurWidgets` app extension, embedded in the app.

- [ ] **Step 1: Write the failing test**

In `scripts/lib/privacy-manifest.test.js`, replace the `used` helper and the per-target loop with:

```js
/** The categories used anywhere in these folders and files. */
function used(...paths) {
  const files = paths.flatMap((path) => (path.endsWith('.swift') ? [join(ios, path)] : swiftFiles(join(ios, path))))
  return [...new Set(files.flatMap((file) => categoriesUsed(readFileSync(file, 'utf8'))))].sort()
}

// ...

  // Each target's sources, as ios/project.yml lists them.
  for (const [target, sources] of [
    ['App', ['App', 'Shared', 'Live', 'MurmurCore/Sources']],
    ['Keyboard', ['Keyboard', 'Shared', 'MurmurCore/Sources']],
    ['Widgets', ['Widgets', 'Live', 'Shared/Pill.swift', 'Shared/AppGroup.swift']]
  ]) {
    it(`declares every category the ${target} target uses, for its own defaults only`, () => {
      const manifest = declared(readFileSync(join(ios, target, 'PrivacyInfo.xcprivacy'), 'utf8'))
      expect(Object.keys(manifest).sort()).toEqual(used(...sources))
      // A target that uses defaults reads and writes only its own (CA92.1);
      // the app group holds files, never shared defaults.
      expect(manifest.NSPrivacyAccessedAPICategoryUserDefaults ?? ['CA92.1']).toEqual(['CA92.1'])
    })
  }
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run scripts/lib/privacy-manifest.test.js`
Expected: the Widgets case fails with `ENOENT` for `ios/Widgets/PrivacyInfo.xcprivacy`.

- [ ] **Step 3: Write the extension and add it to the project**

`ios/Widgets/PrivacyInfo.xcprivacy`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array/>
</dict>
</plist>
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// murmur's widget extension (ios/prd.json IOS-016): the Start murmur
// control for Control Center, the Lock Screen, and the Action Button, and
// the session's Live Activity on the Lock Screen and in the Dynamic Island.
// The Live Activity shows still states, Ready or Recording, the time left,
// and End; iOS redraws it only now and then, so it never follows the voice.
import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct MurmurWidgets: WidgetBundle {
    var body: some Widget {
        SessionControlWidget()
        SessionLiveActivity()
    }
}

/// One tap starts a session without opening murmur.
struct SessionControlWidget: ControlWidget {
    static let kind = "session"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StartSessionIntent()) {
                Label(SessionWidgetCopy.control, systemImage: "waveform")
            }
        }
        .displayName(LocalizedStringResource(stringLiteral: SessionWidgetCopy.control))
        .description(LocalizedStringResource(stringLiteral: SessionWidgetCopy.controlDescription))
    }
}

struct SessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SessionActivity.self) { context in
            LockScreenSession(state: context.state)
                .activityBackgroundTint(Tokens.ink)
                .activitySystemActionForegroundColor(Tokens.text)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    PillMark(recording: context.state.recording)
                        .frame(width: 72, height: 28)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimeLeft(until: context.state.until)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(SessionActivityCopy.state(context.state.recording))
                        .font(.headline)
                        .foregroundStyle(context.state.recording ? Tokens.amber : Tokens.text)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    EndButton()
                }
            } compactLeading: {
                PillMark(recording: context.state.recording)
                    .frame(width: 30, height: 14)
            } compactTrailing: {
                TimeLeft(until: context.state.until, compact: true)
                    .frame(width: 42)
            } minimal: {
                PillMark(recording: context.state.recording)
                    .frame(width: 22, height: 12)
            }
            .keylineTint(Tokens.brand)
        }
    }
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// What the session's Live Activity draws (ios/prd.json IOS-016): the clean
// pill, Ready or Recording, the time left, and End, all still.
import AppIntents
import SwiftUI

/// The Lock Screen: the pill, Ready or Recording, the time left, and End.
struct LockScreenSession: View {
    let state: SessionActivity.ContentState

    var body: some View {
        HStack(spacing: 14) {
            PillMark(recording: state.recording)
                .frame(width: 84, height: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(SessionActivityCopy.title)
                    .font(.caption)
                    .foregroundStyle(Tokens.brand)
                Text(SessionActivityCopy.state(state.recording))
                    .font(.headline)
                    .foregroundStyle(state.recording ? Tokens.amber : Tokens.text)
            }
            Spacer(minLength: 8)
            TimeLeft(until: state.until)
            EndButton()
        }
        .padding(16)
    }
}

/// The clean drawn pill, never brushed at this size, as a still voice
/// shape: in amber while Recording (a live state), quiet grey while Ready,
/// so it reads even in the Dynamic Island's smallest spot.
struct PillMark: View {
    let recording: Bool

    var body: some View {
        Canvas { context, size in
            context.withCGContext { cg in
                let frame = PillFrame(style: .bars, stage: .recording, levels: Pill.stillLevels, time: 0, still: true)
                Pill.paint(frame, in: CGRect(origin: .zero, size: size), context: cg)
            }
        }
        .saturation(recording ? 1 : 0)
        .opacity(recording ? 1 : 0.6)
        .accessibilityLabel(SessionActivityCopy.state(recording))
    }
}

/// The time left in the session, counted down by iOS itself, on one line.
struct TimeLeft: View {
    let until: Date
    /// The Dynamic Island's compact spot, where room is tight.
    var compact = false

    var body: some View {
        Text(timerInterval: Date.now...max(until, .now), countsDown: true)
            .font(.system(compact ? .caption : .body, design: .monospaced))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(Tokens.textDim)
            .multilineTextAlignment(.trailing)
    }
}

struct EndButton: View {
    var body: some View {
        Button(intent: EndSessionIntent()) {
            Text(SessionActivityCopy.end)
                .font(.subheadline.weight(.semibold))
                .frame(minWidth: 44, minHeight: 44)
        }
        .tint(Tokens.brand)
        .accessibilityLabel(SessionWidgetCopy.endLabel)
    }
}

enum SessionWidgetCopy {
    static let control = "Start murmur"
    static let controlDescription = "Starts a session, so a tap on the murmur keyboard's pill starts a take at once."
    static let endLabel = "End the murmur session"
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The widget extension shows the control and the Live Activity but never
// runs the session intents: iOS runs those in murmur's own process
// (Live/SessionIntents.swift). These keep the shared file building here.
enum SessionControl {
    static func start() async -> SessionStart { .unavailable }
    static func end() async {}
}
```

In `ios/project.yml`, make three changes:
- In the `murmur` target's `dependencies`, after `- target: murmurKeyboard`, add `- target: murmurWidgets`.
- In its `info` `properties`, before `UIBackgroundModes: [audio]`, add:

```yaml
        # The session's Live Activity (IOS-016).
        NSSupportsLiveActivities: true
```

- Before `  murmurTests:`, add the target:

```yaml
  # The Start murmur control and the session's Live Activity (IOS-016).
  murmurWidgets:
    type: app-extension
    platform: iOS
    sources:
      - path: Widgets
      - path: Live
      - path: Shared/Pill.swift
      - path: Shared/AppGroup.swift
      - path: Generated/Tokens.swift
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: $(MURMUR_BUNDLE_ID).widgets
        PRODUCT_NAME: murmurWidgets
    info:
      path: Generated/Widgets-Info.plist
      properties:
        CFBundleDisplayName: murmur
        CFBundleShortVersionString: $(MARKETING_VERSION)
        CFBundleVersion: $(CURRENT_PROJECT_VERSION)
        MurmurAppGroup: $(MURMUR_APP_GROUP)
        NSExtension:
          NSExtensionPointIdentifier: com.apple.widgetkit-extension
    entitlements:
      path: Generated/murmurWidgets.entitlements
      properties:
        com.apple.security.application-groups:
          - $(MURMUR_APP_GROUP)
```

- [ ] **Step 4: Run it to see it pass, and build**

Run: `npx vitest run scripts/lib/privacy-manifest.test.js`. Expected: 5 pass.
Run: `npm run ios:generate && npm run ios:test`. Expected: the app and the widget extension build, and the app total stays 233.
Run: `npm run test`. Expected: 910 pass.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Widgets ios/project.yml scripts/lib/privacy-manifest.test.js
git commit -m "IOS-016: the widget extension: the Start murmur control, and the Live Activity on the Lock Screen and in the Dynamic Island"
```

### Task 4: The smoke runs the intents

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`.

The smoke check is the test here: it runs the real intents, and the real Live Activity, on the simulator.

- [ ] **Step 1: Add the check**

In `SmokeRunner.runAndExit`'s list, after `("diagnostics", checkDiagnostics),`, add `("sessionIntents", checkSessionIntents),`. Before `/// Runs main-actor work to the end from the smoke's synchronous start`, add:

```swift
    /// Starting without opening murmur (IOS-016): the Start murmur intent,
    /// as Control Center and the Action Button run it, starts a session with
    /// the microphone warm and its Live Activity up; the End intent, as the
    /// Live Activity's End runs it, ends both.
    static func checkSessionIntents() throws {
        if let failure = onMain({ await sessionIntentsFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func sessionIntentsFailure() async -> String? {
        guard let microphone = FedMicrophone(rate: Double(Wav.targetSampleRate)), let key = APIKey(StubProtocol.key),
              let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"),
              let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules()
        else { return "the stand-ins did not build" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-intents-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: scratch) }
        try? FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        let connections = ConnectionStore(defaults: defaults)
        let ring = MemoryKeyRing()
        try? ring.save(key, for: connections.load(catalog: catalog).transcription.baseUrl)
        let model = TakeModel(
            microphone: microphone, store: WaitingStore(directory: scratch.appending(path: "takes", directoryHint: .isDirectory)),
            rules: rules, catalog: catalog, connections: connections, cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: { request in (Data(#"{"text":"smoke intent words"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) },
            copy: { _ in }
        )
        let session = Session(
            microphone: microphone, model: model, defaults: defaults, stateFile: scratch.appending(path: "session.json"),
            announce: { _ in }, present: { LiveSession.shared.show($0) }
        )
        session.listen()
        let before = SessionControl.source
        defer { SessionControl.source = before }
        SessionControl.source = { session }
        guard (try? await StartSessionIntent().perform()) != nil, session.isOn, microphone.isWarm else { return "Start murmur did not start a warm session" }
        await LiveSession.shared.settle()
        guard LiveSession.shared.isShowing else { return "Start murmur showed no Live Activity" }
        guard (try? await EndSessionIntent().perform()) != nil, !session.isOn, !microphone.isWarm else { return "End did not end the session" }
        await LiveSession.shared.settle()
        guard !LiveSession.shared.isShowing else { return "the Live Activity outlived the session" }
        return nil
    }
```

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT` lists seventeen checks, all true, `sessionIntents` among them.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-016: the smoke starts a session with Start murmur, sees its Live Activity, and ends both with End"
```

### Task 5: The docs, the live check, and the notes

**Files:** Modify `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json`.

- [ ] **Step 1: The docs**

At the end of `ios/docs/iphone.md`, add:

```markdown
## How do I start murmur from Control Center or the Action Button?

murmur has a control called Start murmur. One tap starts a session without opening murmur: the microphone is ready, so a tap on the murmur keyboard's pill in any app starts a take at once.

- **Control Center:** open Control Center, touch and hold an empty spot (or tap the plus at the top left) to edit it, tap Add a Control at the bottom, and pick Start murmur.
- **Lock Screen:** touch and hold the Lock Screen, tap Customize, then Lock Screen. Tap the minus by one of the two controls at the bottom, tap the plus, and pick Start murmur.
- **Action Button:** open Settings, then Action Button, swipe to Controls, tap the button under it, and pick Start murmur.
- **Shortcuts and Siri:** murmur adds Start a murmur session and End the murmur session to the Shortcuts app; you can also say "Start a murmur session".

These steps follow Apple's iPhone User Guide, checked 2026-10-13.

The first time, open murmur once and allow the microphone: a control cannot ask for it. If the microphone is not allowed yet, Start murmur says so and starts nothing.

## What does murmur show on the Lock Screen?

While a session runs, murmur shows a Live Activity on the Lock Screen and in the Dynamic Island: the pill, Ready or Recording, the time left in the session, and End. iOS redraws it only now and then, so the pill there stands still and never moves with your voice; the keyboard's pill is the one that listens. End there ends the session at once. If you turned off Live Activities for murmur in Settings, the session still starts and runs as usual.
```

- [ ] **Step 2: The live check**

In `HANDOFF.md`, under `## Now`, after the IOS-015 live check, add:

```markdown
- [ ] IOS-016 live check, once a TestFlight build with it is on your iPhone (added 2026-10-13). (1) Open murmur once and make sure the microphone is allowed (first run does this). (2) Open Control Center, touch and hold an empty spot, tap Add a Control, and pick Start murmur. (3) Lock the phone. From the Lock Screen, open Control Center and tap Start murmur. murmur should not open; a murmur Live Activity should appear on the Lock Screen saying Ready with the time left, and the orange dot should show. (4) Unlock into Messages, tap the message field, switch to the murmur keyboard, tap the pill, say a sentence, and tap again. Your words should land without murmur opening. While you speak, the Live Activity should say Recording (it can lag a moment). (5) Tap End on the Live Activity. It should go away, and the orange dot should turn off. (6) If your iPhone has an Action Button: open Settings, then Action Button, swipe to Controls, tap the button under it, and pick Start murmur. Press and hold the Action Button: a session should start the same way. (7) Tell Claude what each step did.
```

- [ ] **Step 3: The notes**

In `ios/prd.json`, set IOS-016's `notes` to say what was built and verified, every ruling above, that the live check waits for LaBroi (`passes` stays false), and the gate counts. Write only the notes field.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json
git commit -m "IOS-016: the iPhone docs answer how to start murmur from Control Center or the Action Button"
```
