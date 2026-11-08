// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@MainActor @Suite struct SetupTests {
    let defaults: UserDefaults
    let report = Cell<KeyboardReport?>(nil)
    let key = Cell(false)

    init() throws {
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
    }

    func setup(_ access: ScriptedAccess = ScriptedAccess(answer: true)) -> Setup {
        Setup(microphone: access, report: { [report] in report.value }, hasKey: { [key] in key.value }, defaults: defaults)
    }

    /// Three steps in order, then the practice take: your key comes before
    /// the keyboard and the first take (LaBroi, 2026-10-16), and the keyboard
    /// and Full Access are one trip to Settings (LaBroi, 2026-10-17).
    @Test func theStepsGoInOrder() {
        #expect(Setup.Step.allCases.map(\.rawValue) == ["microphone", "key", "keyboard", "practice"])
        let fresh = setup()
        #expect(fresh.next == .microphone)
        #expect(fresh.remaining == Setup.Step.allCases)
        #expect(!fresh.isFinished)
        #expect(!fresh.seen)
    }

    @Test func allowingTheMicrophoneMovesOn() async {
        let setup = setup(ScriptedAccess(answer: true))
        await setup.allowMicrophone()
        #expect(setup.status(.microphone) == .done)
        #expect(setup.next == .key)
    }

    /// A refused microphone says so, and stays first in line.
    @Test func aRefusedMicrophoneWaitsForSettings() async {
        let setup = setup(ScriptedAccess(answer: false))
        await setup.allowMicrophone()
        #expect(setup.status(.microphone) == .denied)
        #expect(setup.next == .microphone)
        #expect(setup.remaining.first == .microphone)
    }

    /// The keyboard's own report, written only with Full Access, proves the
    /// keyboard is added and Full Access is on.
    @Test func theKeyboardsReportDoesTheKeyboardStep() {
        let setup = setup()
        #expect(setup.status(.keyboard) == .todo)
        report.value = KeyboardReport(fullAccess: true, at: .now)
        setup.refresh()
        #expect(setup.status(.keyboard) == .done)
    }

    /// Without Full Access the keyboard cannot hand a take to murmur, so the
    /// step waits for the report; an I added it tapped on an older build no
    /// longer counts.
    @Test func theKeyboardStepWaitsForFullAccess() {
        defaults.set(true, forKey: "firstRunKeyboardAdded")
        let setup = setup()
        #expect(setup.status(.keyboard) == .todo)
        #expect(setup.remaining.contains(.keyboard))
    }

    @Test func aSavedKeyChecksItself() {
        let setup = setup()
        #expect(setup.status(.key) == .todo)
        key.value = true
        setup.refresh()
        #expect(setup.status(.key) == .done)
    }

    /// A skipped step stays skipped, waits on Home, and first run moves to
    /// the next step still to do.
    @Test func aSkippedStepWaitsOnHome() {
        let first = setup()
        first.skip(.microphone)
        #expect(first.status(.microphone) == .skipped)
        #expect(first.next == .key)
        let again = setup()
        #expect(again.status(.microphone) == .skipped)
        #expect(again.remaining.contains(.microphone))
    }

    @Test func everyStepDoneFinishesSetup() async {
        let setup = setup()
        await setup.allowMicrophone()
        report.value = KeyboardReport(fullAccess: true, at: .now)
        key.value = true
        setup.practiced()
        #expect(setup.isFinished)
        #expect(setup.remaining.isEmpty)
        #expect(setup.next == nil)
    }

    /// Moving on goes to the next step not done yet, so a step done another
    /// way (the keyboard's report) is passed over, and the end is the end.
    @Test func movingOnPassesStepsAlreadyDone() async {
        let setup = setup()
        await setup.allowMicrophone()
        key.value = true
        setup.refresh()
        #expect(setup.step(after: .microphone) == .keyboard)
        key.value = false
        report.value = KeyboardReport(fullAccess: true, at: .now)
        setup.refresh()
        #expect(setup.step(after: .microphone) == .key)
        #expect(setup.step(after: .key) == .practice)
        setup.skip(.key)
        #expect(setup.step(after: .microphone) == .key)
        #expect(setup.step(after: .keyboard) == .practice)
        setup.practiced()
        #expect(setup.step(after: .key) == nil)
        #expect(setup.step(after: .practice) == nil)
    }

    /// A take from the keyboard's link shows Recording over Home, over
    /// first run, or nowhere when it is first run's own practice take.
    @Test func recordingShowsWhereTheTakeIs() {
        #expect(TakeOpener.cover(setupUp: false, practicing: false) == .home)
        #expect(TakeOpener.cover(setupUp: true, practicing: false) == .overSetup)
        #expect(TakeOpener.cover(setupUp: true, practicing: true) == .none)
    }

    @Test func firstRunShowsOnce() {
        let first = setup()
        first.seen = true
        #expect(setup().seen)
    }
}

@Suite struct SetupCopyTests {
    /// Each step says in one sentence why murmur needs it.
    @Test func eachStepSaysWhyInOneSentence() {
        for step in Setup.Step.allCases {
            let why = SetupCopy.why(step)
            #expect(why.hasSuffix("."))
            #expect(why.dropLast().contains(". ") == false)
            #expect(!SetupCopy.title(step).isEmpty)
        }
    }

    /// The keyboard step asks for Full Access and says plainly what the
    /// keyboard does and never does.
    @Test func theKeyboardStepSaysItSendsNothing() {
        let why = SetupCopy.why(.keyboard)
        #expect(why.contains("Full Access lets it hand your take to murmur"))
        #expect(why.contains("the keyboard sends nothing anywhere"))
        #expect(why.contains("only types the words you dictate"))
    }

    /// Steps done in Settings show the exact taps.
    @Test func settingsStepsShowTheTaps() {
        #expect(SetupCopy.taps(.keyboard).first == "Tap Open Settings.")
        #expect(SetupCopy.taps(.keyboard).contains { $0.contains("Turn on murmur") && $0.contains("Allow Full Access") })
        #expect(SetupCopy.progress(.key) == "Step 2 of 4")
        #expect(SetupCopy.progress(.keyboard) == "Step 3 of 4")
    }

    @Test func everyLineFollowsTheWritingRules() {
        let lines = Setup.Step.allCases.flatMap { [SetupCopy.title($0), SetupCopy.why($0)] + SetupCopy.taps($0) } + [
            SetupCopy.micDenied, SetupCopy.checkBox, SetupCopy.practiceBox, SetupCopy.practiceDone, SetupCopy.homeTitle, SetupCopy.homeFooter
        ]
        for line in lines {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}
