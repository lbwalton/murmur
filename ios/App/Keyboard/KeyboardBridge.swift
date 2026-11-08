// SPDX-License-Identifier: GPL-3.0-only
// The app's side of the keyboard (ios/prd.json IOS-008): it hears the
// keyboard's start, stop, and cancel, runs the take on the app's one take
// model under the id the keyboard asked with, and tells the keyboard how
// it goes through the mailbox. Only a take the keyboard started goes to
// the mailbox, so a take made on the Dictate screen never turns up in
// another app. While a keyboard take records, its loudness goes to the
// level file for the keyboard's pill (IOS-010). A take the keyboard asked
// to keep as a note is saved to the notes instead of typed (IOS-023). A
// take that came with a selection is an instruction for it: once heard,
// the rewrite goes to the keyboard with the original beside it, or the
// line saying why the selection stays as it was (IOS-024).
import Foundation
import Observation

@MainActor final class KeyboardBridge {
    /// How long a keyboard's ask stays good. One that waited longer, sent
    /// while murmur was not running, is dropped.
    static let askLife: TimeInterval = 3
    /// How long a keyboard's ask stays good for a take link: opening murmur
    /// from cold can take a while.
    static let linkLife: TimeInterval = 60
    /// The longest a keyboard take may record. One nobody stopped (you
    /// walked away from it) ends here and is dropped, never sent.
    static let takeLimit: TimeInterval = 10 * 60

    private let model: TakeModel
    private let mailbox: Mailbox
    private let announce: @MainActor (Signal) -> Void
    private let limit: TimeInterval
    private let levels: LevelFile
    /// Where what the keyboard did with each take is noted (IOS-014).
    private let log: ActivityLog?
    /// Saves a note's words; the word for the receipt, or nil when it could
    /// not be saved (IOS-023).
    private let keepNote: @MainActor (String, Date) -> NoteKept?
    /// Rewrites a selection by a spoken instruction (IOS-024); nil when the
    /// transform's rules did not load.
    private let rewriter: Rewriter?
    /// Holds background time; the closure it returns lets it go.
    private let keepAlive: @MainActor () -> @MainActor () -> Void
    private var listener: SignalListener?
    /// The take the keyboard asked for, until it ends.
    private var take: UUID?
    /// A cancel heard while the take was still starting.
    private var cancelled = false
    /// The take is to be kept as a note.
    private var note = false
    /// The selection the take is an instruction for (IOS-024).
    private var selection: String?
    /// The rewrite is on its way: the model's later states are not this
    /// take's.
    private var rewriting = false
    private var startedAt = Date.distantPast

    init(
        model: TakeModel, mailbox: Mailbox, limit: TimeInterval = KeyboardBridge.takeLimit, levels: LevelFile = .shared,
        log: ActivityLog? = nil, announce: @escaping @MainActor (Signal) -> Void = { $0.post() },
        keepNote: @escaping @MainActor (String, Date) -> NoteKept? = { _, _ in nil }, rewriter: Rewriter? = nil,
        keepAlive: @escaping @MainActor () -> @MainActor () -> Void = { {} }
    ) {
        self.model = model
        self.mailbox = mailbox
        self.limit = limit
        self.levels = levels
        self.log = log
        self.keepNote = keepNote
        self.rewriter = rewriter
        self.keepAlive = keepAlive
        self.announce = announce
    }

    /// Hears the keyboard from now on and follows the take model.
    func listen() {
        listener = SignalListener([.start, .stop, .cancel]) { [weak self] signal in
            self?.hear(signal)
        }
        follow()
    }

    func hear(_ signal: Signal) {
        switch signal {
        case .start:
            guard let ask = mailbox.answer(within: Self.askLife) else { return }
            begin(ask)
        case .stop:
            guard take != nil, model.isRecording else { return }
            Task { await model.stop() }
        case .cancel:
            guard take != nil else { return }
            if model.isRecording { model.cancel() } else { cancelled = true }
        case .changed, .busy, .end:
            break
        }
    }

    /// The keyboard opened murmur with a take link (IOS-009). True when the
    /// take began, so murmur shows Recording only for a take that is there.
    /// Only the keyboard's own ask, left in the mailbox before it opened
    /// murmur, lets a link start a take: a link from anywhere else starts
    /// nothing. The ask is used up here, so it never starts a second take.
    @discardableResult
    func opened(_ id: UUID) -> Bool {
        let asked = mailbox.answer(within: Self.linkLife)
        // A start murmur answered late and the link for the same take are one
        // take, and a cancel heard on the way does not drop it.
        if take == id {
            cancelled = false
            return true
        }
        guard let asked, asked.take == id else { return false }
        return begin(asked)
    }

    @discardableResult
    private func begin(_ ask: TakeAsk) -> Bool {
        guard take == nil, !model.isRecording, !model.isBusy else {
            announce(.busy)
            return false
        }
        // The last take's entry is about to go: note what the keyboard did
        // with its words first.
        log?.noteKeyboard(mailbox.read())
        take = ask.take
        note = ask.note
        selection = ask.selection
        rewriting = false
        startedAt = .now
        cancelled = false
        // A selection that cannot be sent ends the take before anything is
        // heard, so nothing is said for nothing, and a take link opens no
        // Recording screen for it.
        if let selection {
            guard let rewriter else {
                write(.failed, line: TransformCopy.kept, ends: true)
                return false
            }
            if let refusal = rewriter.refusal(selection) {
                write(.failed, line: refusal, ends: true)
                return false
            }
        }
        // Written here, not read from the model, whose state may still
        // be the last take's words.
        write(.listening)
        Task { await settle(ask.take) }
        return true
    }

    /// Settles how the start went. A start that did not record ends failed
    /// here: the model's state may not change at all (denied twice), and
    /// following it alone would leave the take open forever.
    private func settle(_ id: UUID) async {
        await model.start(as: selection == nil ? .words : .instruction)
        guard take == id else { return }
        if cancelled {
            model.cancel()
            write(.nothing, ends: true)
        } else if !model.isRecording {
            write(.failed, ends: true)
        } else {
            Task { await limit(id) }
            Task { await stream(id) }
        }
    }

    /// Writes the take's loudness for the keyboard's pill about 30 times a
    /// second while it records, then silence.
    private func stream(_ id: UUID) async {
        var count: UInt32 = 0
        while take == id, model.isRecording {
            count &+= 1
            levels.write(model.level, count: count)
            try? await Task.sleep(for: .milliseconds(33))
        }
        levels.write(0, count: count &+ 1)
    }

    /// Ends a take still recording at the limit, dropping what it heard.
    private func limit(_ id: UUID) async {
        try? await Task.sleep(for: .seconds(limit))
        guard take == id, model.isRecording else { return }
        model.cancel()
    }

    /// Publishes each change of the take model's state, for as long as the
    /// bridge lives.
    private func follow() {
        withObservationTracking {
            _ = model.state
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.publish()
                self?.follow()
            }
        }
    }

    private func publish() {
        guard take != nil, !rewriting else { return }
        switch model.state {
        case .recording: write(.listening)
        case .transcribing: write(.working)
        case .words(let text) where selection != nil:
            rewriting = true
            Task { await rewrite(text) }
        case .words(let text):
            // A note that could not be saved is typed instead: the words are
            // never lost.
            if note, let kept = keepNote(text, startedAt) {
                write(.noted, kept: kept, ends: true)
            } else {
                write(.ready, words: text, ends: true)
            }
        case .heardNothing: write(.nothing, ends: true)
        case .failed, .micOff, .micFailed: write(.failed, ends: true)
        // Idle again after the take began: it was cancelled.
        case .idle: write(.nothing, ends: true)
        }
    }

    /// Rewrites the selection by the instruction just heard; the keyboard
    /// gets the rewrite with the original beside it, or why the selection
    /// stays as it was.
    private func rewrite(_ instruction: String) async {
        guard let id = take, let selection, let rewriter else { return }
        let release = keepAlive()
        defer { release() }
        let outcome = await rewriter.rewrite(instruction, selection)
        guard take == id else { return }
        rewriting = false
        switch outcome {
        case .rewritten(let text): write(.ready, words: text, original: selection, ends: true)
        case .kept(let line): write(.failed, line: line, ends: true)
        }
    }

    private func write(
        _ phase: MailboxEntry.Phase, words: String? = nil, kept: NoteKept? = nil, original: String? = nil, line: String? = nil, ends: Bool = false
    ) {
        guard let take else { return }
        mailbox.write(MailboxEntry(
            take: take, phase: phase, words: words, at: startedAt,
            noted: kept?.place, notedFile: kept?.file, original: original, line: line
        ))
        announce(.changed)
        if ends {
            self.take = nil
            selection = nil
        }
    }
}

extension KeyboardBridge {
    private static var shared: KeyboardBridge?

    /// The one bridge for the app's life, on the app's take model, started
    /// by whichever comes first: the app's first screen or a take link.
    static func live() -> KeyboardBridge? {
        if let shared { return shared }
        guard let model = TakeModel.live(), let mailbox = Mailbox.shared else { return nil }
        let bridge = KeyboardBridge(
            model: model, mailbox: mailbox, log: .standard,
            keepNote: { words, at in Notes.live()?.keep(words, at: at) },
            rewriter: Rewriter.live(), keepAlive: BackgroundTime.hold
        )
        bridge.listen()
        shared = bridge
        return bridge
    }
}
