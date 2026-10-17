// SPDX-License-Identifier: GPL-3.0-only
// The murmur keyboard, a dictation pad (ios/prd.json IOS-008, IOS-009):
// tap the pill to start a take and again to stop it. With no session
// running, the first tap opens murmur, which starts one already
// listening; you swipe back and keep talking. During a session a tap
// starts a take without leaving your app. The keyboard only asks the app
// for a take under its own id, signals it (start, stop, cancel, end), and
// reads the mailbox; it never touches the microphone or the network.
// Words land at the cursor once, or wait as Insert last when you left the
// field before they arrived. The pill is drawn from the take's stage and
// the loudness the app writes to the app group (IOS-010), with a light tap
// when a take starts and when it stops. Note in the pill's menu makes the
// next take a note, saved in murmur instead of typed (IOS-023). With text
// selected, Transform in the menu starts a take that says how to change
// it; the rewrite goes in its place, and Insert last brings back the
// original (IOS-024).
import UIKit

final class KeyboardViewController: UIInputViewController {
    private let pad = PadView()
    private let memory = UserDefaults.standard
    private var listener: SignalListener?
    /// The take this keyboard is waiting on, kept across keyboards.
    private var waiting: Pad.Waiting? {
        didSet { Pad.Waiting.save(waiting, to: memory) }
    }
    /// The phase of that take, as the mailbox last said.
    private var phase: MailboxEntry.Phase?
    private var visible = false
    private var deleteRepeat: Timer?
    private var noAnswer: Timer?
    /// When this keyboard last saw the selection change, by the clipboard's
    /// count: only a copy made after counts as the selection (IOS-024).
    private var mark = Pad.SelectionMark(selected: nil, count: UIPasteboard.general.changeCount)
    /// A rewrite looks for its selection once more before it waits, since a
    /// keyboard back from murmur may not have the selection yet.
    private var lookedAgain = false
    private var lookAgain: Timer?
    /// Brings the pill back to rest after it shows how a take ended.
    private var rest: Timer?
    private let haptic = UIImpactFeedbackGenerator(style: .light)
    /// The next take is a note, kept across keyboards until it starts.
    private var noteNext: Bool {
        get { memory.bool(forKey: "noteNext") }
        set { memory.set(newValue, forKey: "noteNext") }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        pad.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(pad)
        let height = view.heightAnchor.constraint(equalToConstant: 236)
        height.priority = .defaultHigh
        NSLayoutConstraint.activate([
            height,
            pad.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            pad.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            pad.topAnchor.constraint(equalTo: view.topAnchor),
            pad.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        pad.globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        pad.pill.addTarget(self, action: #selector(tapPill), for: .touchUpInside)
        pad.space.addTarget(self, action: #selector(tapSpace), for: .touchUpInside)
        pad.returnKey.addTarget(self, action: #selector(tapReturn), for: .touchUpInside)
        pad.insertLast.addTarget(self, action: #selector(tapInsertLast), for: .touchUpInside)
        pad.delete.addTarget(self, action: #selector(deleteDown), for: .touchDown)
        pad.delete.addTarget(self, action: #selector(deleteUp), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        pad.pill.addTarget(self, action: #selector(pillDown), for: .touchDown)
        pad.wave.level = { LevelFile.shared.read()?.level ?? 0 }
        pad.status.text = Pad.idleHint
        listener = SignalListener([.changed, .busy]) { [weak self] signal in
            signal == .busy ? self?.heardBusy() : self?.refresh()
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        visible = true
        pad.setFullAccess(hasFullAccess)
        // Tells first run the keyboard is added with Full Access (IOS-011);
        // without Full Access it cannot write, which says the same.
        if hasFullAccess { KeyboardReport(fullAccess: true, at: .now).write() }
        applyLook()
        noteSelection()
        waiting = Pad.Waiting.load(from: memory)
        // A take that opened murmur is taken over by the keyboard you come
        // back to, and lands in its field.
        if var opened = waiting, opened.opened, !opened.adopted {
            opened.adopt(textDocumentProxy.documentIdentifier)
            waiting = opened
        }
        refresh()
        // Back from murmur, its take should be in the mailbox by now.
        if waiting?.opened == true, phase == nil { expectAnswer(within: 3, else: Pad.noAnswer) }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        visible = false
        // A take still starting or listening when the keyboard goes away is
        // dropped; one being transcribed comes back as Insert last. A take
        // that opened murmur goes on while you go there, and is dropped like
        // any other once a keyboard has taken it over.
        if let waiting, waiting.cancelsOnLeave(phase: phase) {
            Signal.cancel.post()
            end(nil)
        }
        noAnswer?.invalidate()
        deleteUp()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        pad.globe.isHidden = !needsInputModeSwitchKey
        setReturnTitle()
    }

    override func textDidChange(_ textInput: (any UITextInput)?) {
        super.textDidChange(textInput)
        setReturnTitle()
        noteSelection()
    }

    override func selectionDidChange(_ textInput: (any UITextInput)?) {
        super.selectionDidChange(textInput)
        noteSelection()
    }

    /// Marks when the selection changed, by the clipboard's count.
    private func noteSelection() {
        mark.see(textDocumentProxy.selectedText, count: UIPasteboard.general.changeCount)
    }

    @objc private func pillDown() {
        haptic.prepare()
        // A look chosen in murmur while the keyboard stayed up reaches the
        // pill before the take it starts.
        applyLook()
    }

    /// The pill's style and accent, from the app group (IOS-020).
    private func applyLook() {
        let look = PillLook.read()
        pad.wave.style = look.style
        pad.wave.palette = look.palette
    }

    @objc private func tapPill() {
        switch (waiting, phase) {
        case (.some, .listening?):
            haptic.impactOccurred()
            Signal.stop.post()
            // The app moves on to working within a moment; when it does not,
            // it is no longer there.
            expectAnswer(within: 4, else: Pad.stoppedAnswering)
        case (.some, _):
            // This keyboard's take is still starting or being transcribed.
            break
        case (nil, _):
            let note = noteNext
            noteNext = false
            begin(note: note, original: nil)
        }
    }

    /// Transform in the pill's menu (IOS-024): a take that says how to
    /// change the selected text. A selection longer than a sentence is
    /// taken whole from the clipboard, or not at all.
    private func transform(_ shown: String) {
        guard waiting == nil else { return }
        noteSelection()
        let selected = textDocumentProxy.selectedText ?? shown
        // Only a copy made since this selection was seen can be it; the
        // count is read without asking to paste.
        let pasteboard = UIPasteboard.general
        let copied = mark.copiedSince(pasteboard.changeCount) && pasteboard.hasStrings ? pasteboard.string : nil
        let original = Pad.isWhole(selected) ? selected : Pad.whole(selected, clipboard: copied)
        guard let original else {
            pad.status.text = Pad.copyFirst
            return
        }
        begin(note: false, original: original, selected: selected)
    }

    /// Starts a take under a new id: a note, a transform of the original,
    /// or words to type.
    private func begin(note: Bool, original: String?, selected: String? = nil) {
        let take = UUID()
        guard let mailbox = Mailbox.shared else { return }
        haptic.impactOccurred()
        rest?.invalidate()
        // The last take's ending gives way to the new take at once.
        pad.setStage(.idle)
        mailbox.ask(take, note: note, selection: original)
        pad.insertLast.isHidden = true
        phase = nil
        lookedAgain = false
        if SessionState.read().isOn() {
            waiting = Pad.Waiting(take: take, opened: false, field: textDocumentProxy.documentIdentifier, at: .now, original: original, selected: selected)
            pad.status.text = "Starting"
            Signal.start.post()
            // A running session answers within a moment; when it does not,
            // murmur was closed, so open it with the same take. A late
            // answer to the start and the link are one take.
            expectAnswer(within: 2) { [weak self] in
                self?.openMurmur(take, note: note, original: original, selected: selected)
            }
        } else {
            openMurmur(take, note: note, original: original, selected: selected)
        }
    }

    /// Opens murmur with the take's link; murmur starts the session and the
    /// take, and you swipe back.
    private func openMurmur(_ take: UUID, note: Bool, original: String?, selected: String?) {
        Mailbox.shared?.ask(take, note: note, selection: original)
        guard let url = TakeLink.url(for: take), let scene = view.window?.windowScene else {
            end(Pad.openRefused)
            return
        }
        waiting = Pad.Waiting(take: take, opened: true, field: nil, at: .now, original: original, selected: selected)
        pad.status.text = Pad.opening
        scene.open(url, options: nil) { [weak self] opened in
            MainActor.assumeIsolated {
                if !opened, self?.waiting?.take == take { self?.end(Pad.openRefused) }
            }
        }
    }

    /// Ends the take with a line when the mailbox has not moved on in time.
    private func expectAnswer(within seconds: TimeInterval, else line: String) {
        expectAnswer(within: seconds) { [weak self] in
            Signal.cancel.post()
            self?.end(line)
        }
    }

    private func expectAnswer(within seconds: TimeInterval, otherwise: @escaping @MainActor () -> Void) {
        let waitingOn = phase
        noAnswer?.invalidate()
        noAnswer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.visible, self.waiting != nil, self.phase == waitingOn else { return }
                otherwise()
            }
        }
    }

    private func heardBusy() {
        guard waiting != nil, phase == nil else { return }
        noAnswer?.invalidate()
        end(Pad.busy)
    }

    @objc private func tapInsertLast() {
        if let words = Mailbox.shared?.claim() { insert(words) }
        pad.insertLast.isHidden = true
    }

    @objc private func tapSpace() { textDocumentProxy.insertText(" ") }
    @objc private func tapReturn() { textDocumentProxy.insertText("\n") }

    /// Delete repeats while held, after a short pause.
    @objc private func deleteDown() {
        textDocumentProxy.deleteBackward()
        deleteRepeat?.invalidate()
        deleteRepeat = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.deleteRepeat = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
                    MainActor.assumeIsolated { self?.textDocumentProxy.deleteBackward() }
                }
            }
        }
    }

    @objc private func deleteUp() {
        deleteRepeat?.invalidate()
        deleteRepeat = nil
    }

    private func setReturnTitle() {
        let title = Pad.returnTitle(textDocumentProxy.returnKeyType ?? .default)
        guard pad.returnKey.configuration?.title != title else { return }
        var look = pad.returnKey.configuration
        look?.title = title
        pad.returnKey.configuration = look
        pad.returnKey.accessibilityLabel = title
    }

    /// A long press on the pill holds Transform while text is selected
    /// (IOS-024), Note (IOS-023), and End session while one runs.
    private func setPillMenu() {
        let armed = noteNext
        var items: [UIMenuElement] = [
            // Asked each time the menu opens, so it follows the selection.
            // A field that keeps its selection from keyboards never offers it.
            UIDeferredMenuElement.uncached { [weak self] completion in
                MainActor.assumeIsolated {
                    guard let self, self.waiting == nil, let selected = self.textDocumentProxy.selectedText,
                          !selected.allSatisfy(\.isWhitespace) else {
                        completion([])
                        return
                    }
                    completion([
                        UIAction(title: Pad.transformMenu, image: UIImage(systemName: "wand.and.stars")) { [weak self] _ in
                            self?.transform(selected)
                        }
                    ])
                }
            },
            UIAction(title: armed ? Pad.typeMenu : Pad.noteMenu, image: UIImage(systemName: armed ? "keyboard" : "note.text")) { [weak self] _ in
                guard let self else { return }
                self.noteNext = !armed
                if self.waiting == nil { self.pad.status.text = self.noteNext ? Pad.noteNext : Pad.idleHint }
                self.setPillMenu()
            }
        ]
        if SessionState.read().isOn() {
            items.append(UIAction(title: "End session", image: UIImage(systemName: "stop.circle")) { _ in Signal.end.post() })
        }
        pad.pill.menu = UIMenu(children: items)
    }

    /// Reads the mailbox and does what the newest entry asks, only while
    /// this keyboard is on screen.
    private func refresh() {
        guard visible, hasFullAccess, let mailbox = Mailbox.shared else { return }
        setPillMenu()
        let entry = mailbox.read()
        if let entry, entry.take == waiting?.take, entry.phase != phase {
            phase = entry.phase
            noAnswer?.invalidate()
            // Transcribing and polish can take a while, but not forever.
            if phase == .working { expectAnswer(within: 90, else: Pad.stoppedAnswering) }
        }
        if let stage = Pad.stage(waiting: waiting != nil, phase: phase, ending: rest?.isValid == true) {
            // A keyboard that comes back with no take rests its pill, and the
            // old stage's line goes with it.
            if stage == .idle, waiting == nil, pad.wave.stage != .idle { pad.status.text = noteNext ? Pad.noteNext : Pad.idleHint }
            pad.setStage(stage)
        }
        let sameField = waiting?.sameField(as: textDocumentProxy.documentIdentifier) ?? false
        switch Pad.react(to: entry, mine: waiting?.take, sameField: sameField, visible: visible) {
        case .insert(let take) where waiting?.original != nil:
            // A rewrite goes in only over the text it rewrites; otherwise it
            // waits as Insert last and the selection stays as it was.
            switch Pad.landing(replaces: waiting?.replaces(textDocumentProxy.selectedText) == true, lookedAgain: lookedAgain) {
            case .replace:
                guard let words = mailbox.claim(take) else { return end(nil) }
                textDocumentProxy.insertText(words)
                mark.typed(count: UIPasteboard.general.changeCount)
                end(Pad.rewritten, showing: .inserted)
                pad.insertLast.isHidden = false
            case .lookAgain:
                lookedAgain = true
                lookAgain?.invalidate()
                lookAgain = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: false) { [weak self] _ in
                    MainActor.assumeIsolated { self?.refresh() }
                }
            case .offer:
                mailbox.offer(take)
                end(Pad.selectionMoved)
                pad.insertLast.isHidden = false
            }
        case .insert(let take):
            if let words = mailbox.claim(take) { insert(words) }
            end(nil, showing: .inserted)
        case .offerInsertLast:
            pad.insertLast.isHidden = false
            if let take = entry?.take { mailbox.offer(take) }
            if entry?.take == waiting?.take { end(nil) }
        case .status(let line):
            pad.status.text = line
            if phase == .nothing { end(line, showing: .noSpeech) }
            if phase == .failed { end(line, showing: .error) }
            if phase == .noted { end(line, showing: .inserted) }
        case .none:
            break
        }
    }

    private func insert(_ words: String) {
        textDocumentProxy.insertText(Pad.spaced(words, after: textDocumentProxy.documentContextBeforeInput))
        mark.typed(count: UIPasteboard.general.changeCount)
    }

    /// Ends the take: the pill shows how it ended for a moment, then rests.
    private func end(_ line: String?, showing stage: PillStage = .idle) {
        // An ask murmur never answered is taken back, selection and all.
        if let waiting, phase == nil { Mailbox.shared?.withdraw(waiting.take) }
        waiting = nil
        phase = nil
        noAnswer?.invalidate()
        lookAgain?.invalidate()
        lookedAgain = false
        pad.setStage(stage)
        pad.status.text = line ?? (noteNext ? Pad.noteNext : Pad.idleHint)
        rest?.invalidate()
        guard stage != .idle else { return }
        rest = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.waiting == nil else { return }
                self.pad.setStage(.idle)
            }
        }
    }
}
