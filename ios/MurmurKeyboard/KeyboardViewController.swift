import UIKit

// The US-102 shell: the extension target exists, builds, and renders night
// studio ink with the wordmark and a working globe key. The dictation-first
// layout arrives with US-106. Project law from CLAUDE.md: this extension
// never records audio and ships no networking or audio code, ever.
final class KeyboardViewController: UIInputViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = NightStudio.inkUI

        let wordmark = UILabel()
        wordmark.text = "murmur"
        wordmark.textColor = NightStudio.textUI
        wordmark.font = .systemFont(ofSize: 22, weight: .semibold)

        let hint = UILabel()
        hint.text = "KEYBOARD SHELL. US-106 BRINGS THE MIC KEY."
        hint.textColor = NightStudio.textUI.withAlphaComponent(0.55)
        hint.font = .monospacedSystemFont(ofSize: 11, weight: .medium)

        let globe = UIButton(type: .system)
        globe.setImage(UIImage(systemName: "globe"), for: .normal)
        globe.tintColor = NightStudio.textUI
        globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        let stack = UIStackView(arrangedSubviews: [wordmark, hint, globe])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            view.heightAnchor.constraint(greaterThanOrEqualToConstant: 216),
        ])
    }
}
