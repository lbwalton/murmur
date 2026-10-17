// SPDX-License-Identifier: GPL-3.0-only
// The Cleanup screen's state (ios/prd.json IOS-007): the level, polish,
// smart lists, and numbers, saved as they change. The screen binds by
// key path ($model.level), never through a closure (Swift 6.3, 27146b7).
import Foundation
import MurmurCore

@Observable @MainActor final class CleanupModel {
    private(set) var settings: CleanupSettings
    /// The model polish uses, as the Provider screen set it.
    let polishModel: String
    @ObservationIgnored private let store: CleanupStore

    init(store: CleanupStore, polishModel: String) {
        self.store = store
        self.polishModel = polishModel
        settings = store.load()
    }

    var level: FormatOptions.Level {
        get { settings.level }
        set { update { $0.level = newValue } }
    }

    var polish: Bool {
        get { settings.polish }
        set { update { $0.polish = newValue } }
    }

    var smartLists: Bool {
        get { settings.smartLists }
        set { update { $0.smartLists = newValue } }
    }

    var numbers: FormatOptions.Numbers {
        get { settings.numbers }
        set { update { $0.numbers = newValue } }
    }

    private func update(_ change: (inout CleanupSettings) -> Void) {
        var next = settings
        change(&next)
        guard next != settings else { return }
        settings = next
        store.save(next)
    }
}
