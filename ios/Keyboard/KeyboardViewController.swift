// SPDX-License-Identifier: GPL-3.0-only
// The murmur keyboard. For now a quiet placeholder with the one key Apple
// requires, the switch to the next keyboard; the dictation pad arrives in
// IOS-008.
import SwiftUI
import UIKit

final class KeyboardViewController: UIInputViewController {
    private let nextKeyboard = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(Tokens.panel)

        let label = UILabel()
        label.text = "murmur"
        label.textColor = UIColor(Tokens.textDim)
        label.font = .preferredFont(forTextStyle: .headline)
        label.adjustsFontForContentSizeCategory = true

        nextKeyboard.setImage(UIImage(systemName: "globe"), for: .normal)
        nextKeyboard.tintColor = UIColor(Tokens.text)
        nextKeyboard.accessibilityLabel = "Next keyboard"
        nextKeyboard.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        for subview in [label, nextKeyboard] {
            subview.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(subview)
        }
        let height = view.heightAnchor.constraint(equalToConstant: 216)
        height.priority = .defaultHigh
        NSLayoutConstraint.activate([
            height,
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            nextKeyboard.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            nextKeyboard.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -8),
            nextKeyboard.widthAnchor.constraint(equalToConstant: 44),
            nextKeyboard.heightAnchor.constraint(equalToConstant: 44)
        ])
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        nextKeyboard.isHidden = !needsInputModeSwitchKey
    }
}
