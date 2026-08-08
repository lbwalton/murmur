import UIKit

// The Murmur keyboard: dictation-first, a big mic key plus space, delete,
// return, and globe. Typing letters is what the system keyboard is for.
// Project law (CLAUDE.md): this extension NEVER records audio and ships no
// networking or audio code; the only imports here are UIKit and Foundation.
// The mic key bounces to the app via murmur://dictate?session=<token>, and
// the finished text returns through the App Group store, consumed exactly
// once even though iOS tears this controller down during the bounce.
final class KeyboardViewController: UIInputViewController {

    private let store = AppGroupStore()
    private var pollTimer: Timer?

    // Views rebuilt per appearance; kept as properties for state updates.
    private var micButton: UIButton?
    private var statusLabel: UILabel?

    // ------------------------------------------------------------ lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = NightStudio.inkUI
        NSLayoutConstraint.activate([
            view.heightAnchor.constraint(greaterThanOrEqualToConstant: 232),
        ])
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        rebuildLayout()
        // A fresh instance after the bounce: pick up the finished take.
        checkForResult()
        startPollingIfPending()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        pollTimer?.invalidate()
        pollTimer = nil
    }

    // -------------------------------------------------------------- layout

    private func rebuildLayout() {
        view.subviews.forEach { $0.removeFromSuperview() }
        micButton = nil
        statusLabel = nil

        guard hasFullAccess else {
            buildFullAccessExplainer()
            return
        }
        if handOffKeyboardTypes.contains(textDocumentProxy.keyboardType ?? .default) {
            buildHandOffLayout()
            return
        }
        buildDictationLayout()
    }

    // Number, decimal, and email fields get the system keyboard, not a
    // broken dictation layout: a clear line and a big globe key.
    private let handOffKeyboardTypes: Set<UIKeyboardType> = [
        .numberPad, .decimalPad, .phonePad, .numbersAndPunctuation, .emailAddress,
    ]

    private func buildDictationLayout() {
        let mic = makeKey(background: NightStudio.panelUI)
        mic.accessibilityLabel = "Dictate with Murmur"
        var micConfig = UIButton.Configuration.plain()
        micConfig.image = UIImage(named: "KeyboardGlyph") ?? UIImage(systemName: "waveform")
        micConfig.baseForegroundColor = NightStudio.textUI
        mic.configuration = micConfig
        mic.layer.borderWidth = 1.5
        mic.layer.borderColor = NightStudio.textUI.withAlphaComponent(0.25).cgColor
        mic.addTarget(self, action: #selector(micTapped), for: .touchUpInside)
        micButton = mic

        let status = UILabel()
        status.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        status.textColor = NightStudio.textUI.withAlphaComponent(0.55)
        status.textAlignment = .center
        status.text = "TAP TO DICTATE"
        status.accessibilityLabel = "Status"
        statusLabel = status

        let top = UIStackView(arrangedSubviews: [mic, status])
        top.axis = .vertical
        top.spacing = 8
        top.alignment = .fill

        let bottom = bottomRow()
        let root = UIStackView(arrangedSubviews: [top, bottom])
        root.axis = .vertical
        root.spacing = 10
        install(root)
        NSLayoutConstraint.activate([
            mic.heightAnchor.constraint(equalToConstant: 110),
            bottom.heightAnchor.constraint(equalToConstant: 46),
        ])
        refreshPendingState()
    }

    private func buildFullAccessExplainer() {
        let title = UILabel()
        title.text = "Full Access is off"
        title.font = .systemFont(ofSize: 17, weight: .semibold)
        title.textColor = NightStudio.textUI
        title.textAlignment = .center

        let body = UILabel()
        body.text = "Murmur needs it to hand your finished dictation back to this keyboard. Turn it on in Settings, Murmur, Keyboards, Allow Full Access. The keyboard has no network code; nothing you type goes anywhere."
        body.font = .systemFont(ofSize: 13)
        body.textColor = NightStudio.textUI.withAlphaComponent(0.7)
        body.numberOfLines = 0
        body.textAlignment = .center

        let root = UIStackView(arrangedSubviews: [title, body, bottomRow()])
        root.axis = .vertical
        root.spacing = 12
        install(root)
    }

    private func buildHandOffLayout() {
        let line = UILabel()
        line.text = "MURMUR IS FOR SPEAKING. SWITCH KEYBOARDS FOR THIS FIELD."
        line.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        line.textColor = NightStudio.textUI.withAlphaComponent(0.7)
        line.numberOfLines = 0
        line.textAlignment = .center

        let globe = makeKey(title: nil, systemImage: "globe")
        globe.accessibilityLabel = "Switch to the system keyboard"
        globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        let root = UIStackView(arrangedSubviews: [line, globe])
        root.axis = .vertical
        root.spacing = 14
        install(root)
        globe.heightAnchor.constraint(equalToConstant: 60).isActive = true
    }

    private func bottomRow() -> UIStackView {
        let globe = makeKey(title: nil, systemImage: "globe")
        globe.accessibilityLabel = "Next keyboard"
        globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        let space = makeKey(title: "space")
        space.accessibilityLabel = "Space"
        space.addTarget(self, action: #selector(spaceTapped), for: .touchUpInside)

        let delete = makeKey(title: nil, systemImage: "delete.left")
        delete.accessibilityLabel = "Delete"
        delete.addTarget(self, action: #selector(deleteTapped), for: .touchUpInside)

        let ret = makeKey(title: nil, systemImage: "return")
        ret.accessibilityLabel = "Return"
        ret.addTarget(self, action: #selector(returnTapped), for: .touchUpInside)

        let row = UIStackView(arrangedSubviews: [globe, space, delete, ret])
        row.axis = .horizontal
        row.spacing = 8
        row.distribution = .fill
        globe.widthAnchor.constraint(equalToConstant: 52).isActive = true
        delete.widthAnchor.constraint(equalToConstant: 52).isActive = true
        ret.widthAnchor.constraint(equalToConstant: 52).isActive = true
        return row
    }

    private func makeKey(title: String? = nil, systemImage: String? = nil,
                         background: UIColor = NightStudio.panelUI) -> UIButton {
        let button = UIButton(type: .system)
        var config = UIButton.Configuration.plain()
        if let title {
            config.attributedTitle = AttributedString(title, attributes: AttributeContainer([
                .font: UIFont.systemFont(ofSize: 15, weight: .medium),
                .foregroundColor: NightStudio.textUI,
            ]))
        }
        if let systemImage {
            config.image = UIImage(systemName: systemImage)
            config.baseForegroundColor = NightStudio.textUI
        }
        button.configuration = config
        button.backgroundColor = background
        button.layer.cornerRadius = 10
        button.layer.cornerCurve = .continuous
        return button
    }

    private func install(_ root: UIStackView) {
        root.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(root)
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 10),
            root.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -10),
            root.topAnchor.constraint(equalTo: view.topAnchor, constant: 10),
            root.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
        ])
    }

    // ---------------------------------------------------------------- keys

    @objc private func spaceTapped() { textDocumentProxy.insertText(" ") }
    @objc private func deleteTapped() { textDocumentProxy.deleteBackward() }
    @objc private func returnTapped() { textDocumentProxy.insertText("\n") }

    // ---------------------------------------------------------- the bounce

    @objc private func micTapped() {
        if store.pendingSession() != nil {
            // Second tap while waiting cancels the session.
            store.clearSession()
            refreshPendingState()
            return
        }
        let token = UUID().uuidString
        store.beginSession(token: token)
        guard let url = URL(string: "murmur://dictate?session=\(token)") else { return }
        openContainingApp(url)
        refreshPendingState()
    }

    // Keyboard extensions have no UIApplication.shared. extensionContext
    // open works in some hosts; the responder-chain openURL selector covers
    // the rest, the same pair every bounce-style keyboard relies on.
    private func openContainingApp(_ url: URL) {
        extensionContext?.open(url) { [weak self] handled in
            if !handled {
                DispatchQueue.main.async { self?.openViaResponderChain(url) }
            }
        }
    }

    private func openViaResponderChain(_ url: URL) {
        var responder: UIResponder? = self
        let selector = NSSelectorFromString("openURL:")
        while let current = responder {
            if current.responds(to: selector), !(current is UIViewController) {
                current.perform(selector, with: url)
                return
            }
            responder = current.next
        }
    }

    // ---------------------------------------------------------- the return

    private func startPollingIfPending() {
        guard store.pendingSession() != nil, pollTimer == nil else { return }
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.checkForResult()
        }
    }

    private func checkForResult() {
        guard let pending = store.pendingSession() else {
            refreshPendingState()
            return
        }
        guard let result = store.consumeResult(token: pending.token) else { return }
        pollTimer?.invalidate()
        pollTimer = nil
        switch result.status {
        case .ok:
            textDocumentProxy.insertText(result.text)
            statusLabel?.text = "INSERTED"
            statusLabel?.textColor = NightStudio.textUI.withAlphaComponent(0.55)
        case .error:
            statusLabel?.text = result.text.uppercased()
            statusLabel?.textColor = NightStudio.redUI
        }
        micButton?.layer.borderColor = NightStudio.textUI.withAlphaComponent(0.25).cgColor
    }

    private func refreshPendingState() {
        let waiting = store.pendingSession() != nil
        if waiting {
            statusLabel?.text = "WAITING FOR MURMUR. TAP TO CANCEL."
            statusLabel?.textColor = NightStudio.amberUI
            micButton?.layer.borderColor = NightStudio.amberUI.cgColor
            startPollingIfPending()
        } else {
            statusLabel?.text = "TAP TO DICTATE"
            statusLabel?.textColor = NightStudio.textUI.withAlphaComponent(0.55)
            micButton?.layer.borderColor = NightStudio.textUI.withAlphaComponent(0.25).cgColor
        }
    }
}
