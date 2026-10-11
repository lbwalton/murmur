// SPDX-License-Identifier: GPL-3.0-only
// The app's own Keychain items (ios/prd.json conventions.privacy):
// readable after first unlock, so a session behind the Lock Screen can
// still reach the key, on this device only, never synced or restored to
// another device. No access group is set, so items land in the app's own
// group and the keyboard extension can never read them.
import Foundation
import Security

enum KeychainError: Error, Equatable {
    case status(OSStatus)
    case unexpectedData
}

struct KeychainStore: Sendable {
    let service: String

    func save(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let status = SecItemUpdate(baseQuery(account) as CFDictionary, [kSecValueData: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery(account)
            add[kSecValueData] = data
            add[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            try check(SecItemAdd(add as CFDictionary, nil))
        } else {
            try check(status)
        }
    }

    func read(account: String) throws -> String? {
        var query = baseQuery(account)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        try check(status)
        guard let data = item as? Data else { throw KeychainError.unexpectedData }
        return String(decoding: data, as: UTF8.self)
    }

    func delete(account: String) throws {
        let status = SecItemDelete(baseQuery(account) as CFDictionary)
        if status == errSecItemNotFound { return }
        try check(status)
    }

    private func baseQuery(_ account: String) -> [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
    }

    private func check(_ status: OSStatus) throws {
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }
}
