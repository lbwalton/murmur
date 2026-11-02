// SPDX-License-Identifier: GPL-3.0-only
// The signals between the keyboard and the app (ios/prd.json IOS-008):
// Darwin notifications, which cross processes and carry nothing. The
// keyboard says start, stop, cancel, and end (End session, IOS-009); the
// app says changed, and the mailbox holds what changed, or busy, when
// another take is running.
import Foundation

enum Signal: String, CaseIterable, Sendable {
    case start, stop, cancel, changed, busy, end

    /// Named under the app group, so a self-built copy never hears ours.
    var name: String { "\(AppGroup.identifier).\(rawValue)" }

    func post() {
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(name as CFString), nil, nil, true)
    }
}

/// Hears signals until it goes away; the handler runs on the main actor.
final class SignalListener: Sendable {
    private let signals: [Signal]
    private let handler: @MainActor @Sendable (Signal) -> Void

    init(_ signals: [Signal], handler: @escaping @MainActor @Sendable (Signal) -> Void) {
        self.signals = signals
        self.handler = handler
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()
        for signal in signals {
            CFNotificationCenterAddObserver(center, observer, { _, observer, name, _, _ in
                guard let observer, let name = name?.rawValue as String? else { return }
                Unmanaged<SignalListener>.fromOpaque(observer).takeUnretainedValue().hear(name)
            }, signal.name as CFString, nil, .deliverImmediately)
        }
    }

    deinit {
        CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
    }

    private func hear(_ name: String) {
        guard let signal = signals.first(where: { $0.name == name }) else { return }
        let handler = handler
        Task { @MainActor in handler(signal) }
    }
}
