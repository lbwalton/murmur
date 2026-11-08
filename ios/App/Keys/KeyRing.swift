// SPDX-License-Identifier: GPL-3.0-only
// The key ring: one saved key per provider, filed under its base URL as
// on desktop (src/main/settings/keyring.ts), so switching providers
// never asks for a key twice (ios/prd.json IOS-005). Keys live in the
// Keychain through KeychainStore: the app's own access group, readable
// after first unlock, on this device only.
import Foundation
import MurmurCore
import Synchronization

protocol KeyRing: Sendable {
    func key(for baseUrl: String) throws -> APIKey?
    func save(_ key: APIKey, for baseUrl: String) throws
    func remove(for baseUrl: String) throws
}

struct KeychainKeyRing: KeyRing {
    let store: KeychainStore

    init(store: KeychainStore = KeychainStore(service: "murmur.keys")) {
        self.store = store
    }

    func key(for baseUrl: String) throws -> APIKey? {
        try store.read(account: BaseURL.normalized(baseUrl)).flatMap(APIKey.init)
    }

    func save(_ key: APIKey, for baseUrl: String) throws {
        try store.save(key.secret, account: BaseURL.normalized(baseUrl))
    }

    func remove(for baseUrl: String) throws {
        try store.delete(account: BaseURL.normalized(baseUrl))
    }
}

/// For previews and tests: nothing reaches the Keychain.
final class MemoryKeyRing: KeyRing {
    private let keys: Mutex<[String: APIKey]>

    init(_ keys: [String: APIKey] = [:]) {
        self.keys = Mutex(keys)
    }

    func key(for baseUrl: String) throws -> APIKey? {
        keys.withLock { $0[BaseURL.normalized(baseUrl)] }
    }

    func save(_ key: APIKey, for baseUrl: String) throws {
        keys.withLock { $0[BaseURL.normalized(baseUrl)] = key }
    }

    func remove(for baseUrl: String) throws {
        _ = keys.withLock { $0.removeValue(forKey: BaseURL.normalized(baseUrl)) }
    }
}
