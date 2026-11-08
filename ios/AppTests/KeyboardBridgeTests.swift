// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct KeyboardBridgeTests {
    let groq = "https://api.groq.com/openai/v1"
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let mailbox = Mailbox(file: FileManager.default.temporaryDirectory.appending(path: "bridge-\(UUID().uuidString).json"))
    let announced = Announced()

    @MainActor final class Announced {
        var signals: [Signal] = []
    }

    init() throws {
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        CleanupStore(defaults: defaults).save(CleanupSettings(polish: false))
    }

    func model(_ provider: FakeProvider) throws -> TakeModel {
        TakeModel(
            microphone: microphone,
            store: WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "bridge-takes-\(UUID().uuidString)", directoryHint: .isDirectory)),
            rules: try BundledRules.takeRules(), catalog: try BundledRules.catalog(),
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: provider.send, copy: { _ in }
        )
    }

    func bridge(_ model: TakeModel) -> KeyboardBridge {
        let bridge = KeyboardBridge(model: model, mailbox: mailbox) { [announced] signal in announced.signals.append(signal) }
        bridge.listen()
        return bridge
    }

    /// What the keyboard does: ask with its own id, then signal start.
    @discardableResult
    func start(_ bridge: KeyboardBridge, at: Date = .now) -> UUID {
        let take = UUID()
        mailbox.ask(take, at: at)
        bridge.hear(.start)
        return take
    }

    /// Waits for the mailbox to reach a phase, as the keyboard would.
    func waitFor(_ phase: MailboxEntry.Phase) async throws -> MailboxEntry? {
        for _ in 0..<100 {
            if let entry = mailbox.read(), entry.phase == phase { return entry }
            try await Task.sleep(for: .milliseconds(20))
        }
        return mailbox.read()
    }

    func waitUntilRecording(_ model: TakeModel) async throws {
        for _ in 0..<100 where !model.isRecording {
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    @Test func aKeyboardTakeComesBackThroughTheMailbox() async throws {
        let model = try model(.says("Send the invoice tomorrow."))
        let bridge = bridge(model)
        let take = start(bridge)
        #expect(try await waitFor(.listening)?.take == take)
        try await waitUntilRecording(model)
        #expect(model.isRecording)
        bridge.hear(.stop)
        let ready = try #require(try await waitFor(.ready))
        #expect(ready.take == take)
        #expect(ready.words == "Send the invoice tomorrow.")
        #expect(mailbox.claim(take) == "Send the invoice tomorrow.")
        #expect(announced.signals.filter { $0 == .changed }.count >= 2)
    }

    /// What the keyboard did with a take is logged when the next keyboard
    /// take begins (IOS-014).
    @Test func theLastKeyboardTakeIsNotedWhenTheNextBegins() async throws {
        let log = scratchLog()
        let model = try model(.says("Send the invoice tomorrow."))
        let bridge = KeyboardBridge(model: model, mailbox: mailbox, log: log) { _ in }
        bridge.listen()
        let first = start(bridge)
        try await waitUntilRecording(model)
        bridge.hear(.stop)
        _ = try await waitFor(.ready)
        #expect(mailbox.claim(first) == "Send the invoice tomorrow.")
        #expect(log.recent().isEmpty)
        start(bridge)
        _ = try await waitFor(.listening)
        #expect(log.recent().map { $0.split(separator: " ", maxSplits: 1).last.map(String.init) } == ["keyboard take=\(ActivityEvent.short(first)) inserted"])
    }

    /// A take started on the Dictate screen never goes to the mailbox, while
    /// a keyboard take after it does.
    @Test func aDictateScreenTakeStaysInTheApp() async throws {
        let model = try model(.says("Private words."))
        let bridge = bridge(model)
        await model.start()
        await model.stop()
        try await Task.sleep(for: .milliseconds(100))
        #expect(mailbox.read() == nil)
        let take = start(bridge)
        #expect(try await waitFor(.listening)?.take == take)
        withExtendedLifetime(bridge) {}
    }

    /// The model may still hold the last take's words when the keyboard
    /// starts a new one; those words are never handed over again.
    @Test func aNewTakeNeverCarriesTheLastTakesWords() async throws {
        let model = try model(.says("Old words."))
        await model.start()
        await model.stop()
        let bridge = bridge(model)
        start(bridge)
        let first = try #require(mailbox.read())
        #expect(first.phase == .listening && first.words == nil)
    }

    @Test func aCancelledTakeEndsAsNothing() async throws {
        let model = try model(.says("never sent"))
        let bridge = bridge(model)
        start(bridge)
        try await waitUntilRecording(model)
        bridge.hear(.cancel)
        #expect(try await waitFor(.nothing) != nil)
        #expect(!model.isRecording)
    }

    /// A cancel that arrives while the take is still starting (the keyboard
    /// went away first) drops the take once it starts.
    @Test func aCancelWhileStartingDropsTheTake() async throws {
        let model = try model(.says("never sent"))
        let bridge = bridge(model)
        start(bridge)
        bridge.hear(.cancel)
        #expect(try await waitFor(.nothing) != nil)
        try await Task.sleep(for: .milliseconds(50))
        #expect(!model.isRecording)
    }

    @Test func silenceEndsAsNothing() async throws {
        microphone.samples = ScriptedMicrophone.silence
        let model = try model(.says("Thank you."))
        let bridge = bridge(model)
        start(bridge)
        try await waitUntilRecording(model)
        bridge.hear(.stop)
        #expect(try await waitFor(.nothing) != nil)
    }

    @Test func noMicrophoneEndsAsFailed() async throws {
        microphone.allowed = false
        let bridge = bridge(try model(.says("hi")))
        start(bridge)
        #expect(try await waitFor(.failed) != nil)
    }

    /// A start that cannot record ends failed every time, even when the
    /// model's state does not change (denied twice), and the bridge is free
    /// for the next take.
    @Test func aDeniedStartEndsFailedEveryTime() async throws {
        microphone.allowed = false
        let model = try model(.says("hi"))
        let bridge = bridge(model)
        for _ in 0..<2 {
            let take = start(bridge)
            for _ in 0..<100 where mailbox.read()?.phase != .failed {
                try await Task.sleep(for: .milliseconds(20))
            }
            #expect(mailbox.read()?.phase == .failed)
            #expect(mailbox.read()?.take == take)
        }
        microphone.allowed = true
        start(bridge)
        try await waitUntilRecording(model)
        #expect(model.isRecording)
    }

    /// After a denied keyboard start, a Dictate screen take still never
    /// reaches the mailbox.
    @Test func aDictateTakeAfterADeniedStartStaysInTheApp() async throws {
        microphone.allowed = false
        let model = try model(.says("Private words."))
        let bridge = bridge(model)
        let denied = start(bridge)
        #expect(try await waitFor(.failed)?.take == denied)
        microphone.allowed = true
        await model.start()
        await model.stop()
        try await Task.sleep(for: .milliseconds(100))
        #expect(mailbox.read()?.take == denied)
        #expect(mailbox.read()?.words == nil)
        withExtendedLifetime(bridge) {}
    }

    /// A start that waited (murmur was not running when it was sent) is
    /// dropped instead of recording a take no keyboard is waiting on.
    @Test func aStaleStartIsIgnored() async throws {
        let model = try model(.says("hi"))
        let bridge = bridge(model)
        start(bridge, at: .now.addingTimeInterval(-10))
        try await Task.sleep(for: .milliseconds(100))
        #expect(mailbox.read() == nil)
        #expect(!model.isRecording)
    }

    /// While another take runs, the keyboard hears busy, and the mailbox is
    /// left alone.
    @Test func aStartWhileBusyAnswersBusy() async throws {
        let model = try model(.says("hi"))
        let bridge = bridge(model)
        await model.start()
        start(bridge)
        #expect(announced.signals == [.busy])
        #expect(mailbox.read() == nil)
        model.cancel()
    }

    /// The keyboard opened murmur with a link (IOS-009): the take starts
    /// however long murmur took to open.
    @Test func anOpenedTakeStartsFromItsLink() async throws {
        let model = try model(.says("From the link."))
        let bridge = bridge(model)
        let take = UUID()
        mailbox.ask(take, at: .now.addingTimeInterval(-30))
        #expect(bridge.opened(take))
        #expect(try await waitFor(.listening)?.take == take)
        try await waitUntilRecording(model)
        bridge.hear(.stop)
        let ready = try #require(try await waitFor(.ready))
        #expect(ready.take == take)
        #expect(ready.words == "From the link.")
    }

    /// The ask the keyboard left before opening murmur is used up by the
    /// link, so a start after it never begins a second take, and the same
    /// link twice is one take.
    @Test func theLinksAskIsUsedUp() async throws {
        let model = try model(.says("x"))
        let bridge = bridge(model)
        let take = UUID()
        mailbox.ask(take)
        #expect(bridge.opened(take))
        #expect(bridge.opened(take))
        #expect(announced.signals.contains(.busy) == false)
        try await waitUntilRecording(model)
        model.cancel()
        #expect(try await waitFor(.nothing)?.take == take)
        bridge.hear(.start)
        try await Task.sleep(for: .milliseconds(100))
        #expect(!model.isRecording)
        #expect(mailbox.read()?.phase == .nothing)
    }

    /// A link that arrives while another take runs starts nothing and says
    /// so, so murmur never shows Recording for a take that is not there.
    @Test func aLinkWhileBusyStartsNothing() async throws {
        let model = try model(.says("hi"))
        let bridge = bridge(model)
        await model.start()
        let take = UUID()
        mailbox.ask(take)
        #expect(bridge.opened(take) == false)
        #expect(announced.signals == [.busy])
        model.cancel()
    }

    /// Only the keyboard's own ask lets a link start a take: a link from
    /// anywhere else, or for another take, starts nothing.
    @Test func aLinkWithoutTheKeyboardsAskStartsNothing() async throws {
        let model = try model(.says("hi"))
        let bridge = bridge(model)
        #expect(bridge.opened(UUID()) == false)
        mailbox.ask(UUID())
        #expect(bridge.opened(UUID()) == false)
        try await Task.sleep(for: .milliseconds(50))
        #expect(!model.isRecording)
        #expect(mailbox.read() == nil)
    }

    /// murmur answered the keyboard's start late, then the link for the same
    /// take arrived: one take, and a cancel heard on the way never drops it.
    @Test func aLateStartAndItsLinkAreOneTake() async throws {
        let model = try model(.says("One take."))
        let bridge = bridge(model)
        let take = start(bridge)
        bridge.hear(.cancel)
        mailbox.ask(take)
        #expect(bridge.opened(take))
        try await waitUntilRecording(model)
        #expect(model.isRecording)
        #expect(mailbox.read()?.take == take)
        #expect(mailbox.answer(within: 60) == nil)
    }

    /// A keyboard take nobody stops ends at its limit, and nothing it heard
    /// is sent.
    @Test func aKeyboardTakeEndsAtItsLimitUnsent() async throws {
        let provider = FakeProvider.says("never sent")
        let model = try model(provider)
        let bridge = KeyboardBridge(model: model, mailbox: mailbox, limit: 0.2) { [announced] signal in
            announced.signals.append(signal)
        }
        bridge.listen()
        let take = start(bridge)
        try await waitUntilRecording(model)
        #expect(try await waitFor(.nothing)?.take == take)
        #expect(!model.isRecording)
        #expect(provider.requests.isEmpty)
        #expect(KeyboardBridge.takeLimit == 600)
    }

    /// While a keyboard take records, its loudness reaches the level file
    /// for the keyboard's pill, then silence once it stops.
    @Test func aKeyboardTakeStreamsItsLevels() async throws {
        let levels = LevelFile(url: FileManager.default.temporaryDirectory.appending(path: "level-\(UUID().uuidString)"))
        microphone.level = 0.6
        let model = try model(.says("Loud."))
        let bridge = KeyboardBridge(model: model, mailbox: mailbox, levels: levels) { [announced] signal in
            announced.signals.append(signal)
        }
        bridge.listen()
        start(bridge)
        try await waitUntilRecording(model)
        for _ in 0..<100 where (levels.read()?.count ?? 0) < 3 {
            try await Task.sleep(for: .milliseconds(20))
        }
        let live = try #require(levels.read())
        #expect(live.count >= 3)
        #expect(live.level == 0.6)
        bridge.hear(.stop)
        _ = try await waitFor(.ready)
        for _ in 0..<50 where levels.read()?.level != 0 {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(levels.read()?.level == 0)
    }

    /// A stop with no keyboard take running does nothing.
    @Test func aStrayStopIsIgnored() async throws {
        let model = try model(.says("hi"))
        let bridge = bridge(model)
        bridge.hear(.stop)
        try await Task.sleep(for: .milliseconds(50))
        #expect(mailbox.read() == nil)
        #expect(model.state == .idle)
    }
}
