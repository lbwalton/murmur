import UIKit

// The Murmur keyboard: dictation-first, a big mic key plus space, delete,
// return, and globe. Typing letters is what the system keyboard is for.
//
// Project law (CLAUDE.md): this extension NEVER records audio and ships no
// networking or audio code; the only imports are UIKit and Foundation. It
// drives dictation two ways, both of which keep every byte of audio in the
// app:
//   Cold  - no warm mic yet: the mic key bounces to the app (murmur://) which
//           records the first take and, on the way, leaves the mic warm.
//   Warm  - the app is resident with a live mic (US-112): the mic key records
//           in place without switching apps, by dropping a command in the App
//           Group and poking the app with a Darwin notification. The app
//           streams its state and the finished text back through the store.
final class KeyboardViewController: UIInputViewController {

    private let store = AppGroupStore()
    private var pollTimer: Timer?

    // In-place take state (warm path). Nil when no in-place take is running.
    private var inPlaceToken: String?
    private var inPlaceProcessing = false
    private var inPlaceStartedAt: Date?
    private var inPlaceConfirmed = false

    // Views kept for state updates without a full rebuild.
    private var micButton: UIButton?
    private var statusLabel: UILabel?
    private var waveform: WaveformView?
    private var showingDictation = false

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
        // A fresh instance after a bounce: pick up the finished take and note
        // that the mic is now warm for in-place dictation.
        consumeAnyResult()
        updateDictationUI()
        startPolling()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopPolling()
        waveform?.stop()
    }

    // -------------------------------------------------------------- layout

    private func rebuildLayout() {
        view.subviews.forEach { $0.removeFromSuperview() }
        micButton = nil
        statusLabel = nil
        waveform = nil
        showingDictation = false

        guard hasFullAccess else {
            buildFullAccessExplainer()
            return
        }
        if handOffKeyboardTypes.contains(textDocumentProxy.keyboardType ?? .default) {
            buildHandOffLayout()
            return
        }
        buildDictationLayout()
        showingDictation = true
    }

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

        let wave = WaveformView()
        wave.isHidden = true
        // The waveform sits on top of the mic button; without this it would
        // eat the taps meant to stop the take.
        wave.isUserInteractionEnabled = false
        // Driven by the real mic level the app shares: flat bars mean Murmur
        // is not actually hearing you.
        wave.levelProvider = { [weak self] in self?.store.readLevel() ?? 0 }
        wave.translatesAutoresizingMaskIntoConstraints = false
        waveform = wave

        let stack = UIView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.addSubview(mic)
        stack.addSubview(wave)
        mic.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            mic.topAnchor.constraint(equalTo: stack.topAnchor),
            mic.leadingAnchor.constraint(equalTo: stack.leadingAnchor),
            mic.trailingAnchor.constraint(equalTo: stack.trailingAnchor),
            mic.bottomAnchor.constraint(equalTo: stack.bottomAnchor),
            mic.heightAnchor.constraint(equalToConstant: 110),
            wave.centerXAnchor.constraint(equalTo: mic.centerXAnchor),
            wave.centerYAnchor.constraint(equalTo: mic.centerYAnchor),
            wave.widthAnchor.constraint(equalTo: mic.widthAnchor, multiplier: 0.7),
            wave.heightAnchor.constraint(equalToConstant: 48),
        ])

        let status = UILabel()
        status.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        status.textColor = NightStudio.textUI.withAlphaComponent(0.55)
        status.textAlignment = .center
        status.text = "TAP TO DICTATE"
        status.accessibilityLabel = "Status"
        statusLabel = status

        let top = UIStackView(arrangedSubviews: [stack, status])
        top.axis = .vertical
        top.spacing = 8
        top.alignment = .fill

        let root = UIStackView(arrangedSubviews: [top, bottomRow()])
        root.axis = .vertical
        root.spacing = 10
        install(root)
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

    // -------------------------------------------------------- the mic key

    @objc private func micTapped() {
        // A take is running in place: this tap stops it.
        if let token = inPlaceToken, !inPlaceProcessing {
            store.writeCommand(HotCommand(action: .stop, token: token, createdAt: Date()))
            DarwinSignal.post(DarwinSignal.command)
            inPlaceProcessing = true
            updateDictationUI()
            return
        }
        if inPlaceProcessing { return }   // busy transcribing

        // A bounce is in flight: this tap cancels it.
        if store.pendingSession() != nil {
            store.clearSession()
            updateDictationUI()
            return
        }

        if store.readHotState().phase != .cold {
            // Warm: record in place, no app switch.
            let token = UUID().uuidString
            inPlaceToken = token
            inPlaceProcessing = false
            inPlaceConfirmed = false
            inPlaceStartedAt = Date()
            store.writeCommand(HotCommand(action: .start, token: token, createdAt: Date()))
            DarwinSignal.post(DarwinSignal.command)
            waveform?.start()
            updateDictationUI()
        } else {
            // Cold: bounce to the app for the first take; it warms the mic.
            let token = UUID().uuidString
            store.beginSession(token: token)
            guard let url = URL(string: "murmur://dictate?session=\(token)") else { return }
            openContainingApp(url)
            updateDictationUI()
        }
    }

    // Opening the containing app from a keyboard. iOS 18 disabled the old
    // openURL: selector for extensions, so we walk the responder chain to the
    // UIApplication and call the modern open(_:options:completionHandler:).
    private func openContainingApp(_ url: URL) {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = current.next
        }
    }

    // ---------------------------------------------------------- the return

    private func startPolling() {
        stopPolling()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func poll() {
        guard showingDictation else { return }
        if inPlaceToken != nil {
            pollInPlace()
        } else {
            // Idle: reflect warm/cold transitions (e.g. the window lapsed) and
            // pick up a bounce result the instant it lands.
            consumeAnyResult()
            updateDictationUI()
        }
    }

    private func pollInPlace() {
        guard let token = inPlaceToken else { return }
        // The finished take arrived: insert it and go back to warm-idle.
        if let result = store.consumeResult(token: token) {
            insert(result)
            inPlaceToken = nil
            inPlaceProcessing = false
            waveform?.stop()
            updateDictationUI()
            return
        }
        let hot = store.readHotState()
        if hot.phase == .listening || hot.phase == .processing { inPlaceConfirmed = true }
        if hot.phase == .processing { inPlaceProcessing = true }

        // Watchdog: if the app never confirmed it heard us, it is not resident
        // (killed since it went cold). Fall back to a bounce next tap.
        if !inPlaceConfirmed, let started = inPlaceStartedAt,
           Date().timeIntervalSince(started) > 2.5 {
            inPlaceToken = nil
            inPlaceProcessing = false
            waveform?.stop()
            statusLabel?.text = "MURMUR ISN'T READY. TAP TO OPEN IT."
            statusLabel?.textColor = NightStudio.redUI
            micButton?.layer.borderColor = NightStudio.redUI.cgColor
            return
        }
        updateDictationUI()
    }

    // Consumes a finished result for whichever take we are waiting on (a
    // bounce's pending token, or an in-place token) and inserts it.
    private func consumeAnyResult() {
        let token = inPlaceToken ?? store.pendingSession()?.token
        guard let token, let result = store.consumeResult(token: token) else { return }
        insert(result)
        inPlaceToken = nil
        inPlaceProcessing = false
    }

    private func insert(_ result: BounceResult) {
        switch result.status {
        case .ok:
            textDocumentProxy.insertText(result.text)
        case .error:
            statusLabel?.text = result.text.uppercased()
            statusLabel?.textColor = NightStudio.redUI
        }
    }

    // --------------------------------------------------------- UI updates

    private func updateDictationUI() {
        guard showingDictation, let status = statusLabel, let mic = micButton else { return }

        if inPlaceToken != nil {
            if inPlaceProcessing {
                waveform?.isHidden = true
                waveform?.stop()
                status.text = "TRANSCRIBING..."
                status.textColor = NightStudio.amberUI
                mic.layer.borderColor = NightStudio.amberUI.cgColor
            } else {
                waveform?.isHidden = false
                waveform?.start()
                // DIAGNOSTIC (remove once the in-place waveform is verified):
                // show the raw cross-process level so a flat waveform can be
                // told apart from a level that never arrives. L-- means the
                // level file does not exist at all.
                if let level = store.readLevelIfPresent() {
                    status.text = String(format: "LISTENING. TAP TO STOP. L%.2f", level)
                } else {
                    status.text = "LISTENING. TAP TO STOP. L--"
                }
                status.textColor = NightStudio.amberUI
                mic.layer.borderColor = NightStudio.amberUI.cgColor
            }
            return
        }

        waveform?.isHidden = true
        waveform?.stop()

        if store.pendingSession() != nil {
            status.text = "WAITING FOR MURMUR. TAP TO CANCEL."
            status.textColor = NightStudio.amberUI
            mic.layer.borderColor = NightStudio.amberUI.cgColor
        } else if store.readHotState().phase != .cold {
            status.text = "TAP TO DICTATE"
            status.textColor = NightStudio.textUI.withAlphaComponent(0.55)
            mic.layer.borderColor = NightStudio.textUI.withAlphaComponent(0.25).cgColor
        } else {
            status.text = "TAP TO SPEAK. OPENS MURMUR ONCE."
            status.textColor = NightStudio.textUI.withAlphaComponent(0.55)
            mic.layer.borderColor = NightStudio.textUI.withAlphaComponent(0.25).cgColor
        }
    }
}

// A canned listening waveform for the keyboard. The keyboard cannot read the
// microphone, so this is a lively animation, not a real level meter; it only
// needs to say "I am listening". Driven by a timer, amber, project law kept
// (no audio anything, just moving bars).
final class WaveformView: UIView {
    private var bars: [UIView] = []
    private var timer: Timer?
    var levelProvider: (() -> Float)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        for _ in 0..<13 {
            let bar = UIView()
            bar.backgroundColor = NightStudio.amberUI
            bar.layer.cornerRadius = 2
            addSubview(bar)
            bars.append(bar)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        layoutBars()
    }

    private func layoutBars() {
        let n = bars.count
        let barWidth: CGFloat = 4
        let gap: CGFloat = 6
        let totalWidth = CGFloat(n) * barWidth + CGFloat(n - 1) * gap
        var x = (bounds.width - totalWidth) / 2
        for bar in bars {
            bar.frame = CGRect(x: x, y: bounds.midY - 3, width: barWidth, height: 6)
            x += barWidth + gap
        }
    }

    func start() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        for bar in bars {
            bar.frame.size.height = 6
            bar.frame.origin.y = bounds.midY - 3
        }
    }

    private func tick() {
        let t = Date().timeIntervalSinceReferenceDate
        let level = CGFloat(max(0, min(1, levelProvider?() ?? 0)))
        // Display gain then square-root, the standard perceptual meter curve:
        // live speech maps around 0.05...0.35 raw (L readouts on device,
        // 2026-08-09), which honest linear bars render as barely-there. The
        // boost and curve make speech unmistakably dance while true zero
        // stays flat. Display only; the silence gate reads the raw level.
        let scaled = level > 0 ? min(1, level * 1.8).squareRoot() : 0
        for (i, bar) in bars.enumerated() {
            let phase = Double(i) * 0.7
            // Per-bar liveliness so a steady voice still reads as a waveform,
            // scaled by the real mic level: no level means flat bars.
            let wobble = 0.55 + 0.45 * abs(sin(t * 9 + phase))
            let amp = scaled * CGFloat(wobble)
            let h = CGFloat(6 + amp * 42)
            bar.frame.size.height = h
            bar.frame.origin.y = bounds.midY - h / 2
        }
    }
}
