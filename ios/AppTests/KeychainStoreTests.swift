// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Security
import Testing
@testable import murmur

@Suite(.serialized) struct KeychainStoreTests {
    let store = KeychainStore(service: "com.lbwalton.murmur.ios.tests")

    @Test func savesReadsAndDeletes() throws {
        let account = "round-trip"
        defer { try? store.delete(account: account) }
        try store.save("first", account: account)
        #expect(try store.read(account: account) == "first")
        try store.delete(account: account)
        #expect(try store.read(account: account) == nil)
    }

    @Test func savingAgainReplacesTheValue() throws {
        let account = "replace"
        defer { try? store.delete(account: account) }
        try store.save("old", account: account)
        try store.save("new", account: account)
        #expect(try store.read(account: account) == "new")
    }

    @Test func readingOrDeletingNothingIsNotAnError() throws {
        #expect(try store.read(account: "never-saved") == nil)
        try store.delete(account: "never-saved")
    }

    @Test func itemsStayOnThisDeviceAndOpenAfterFirstUnlock() throws {
        let account = "accessibility"
        defer { try? store.delete(account: account) }
        try store.save("value", account: account)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: store.service,
            kSecAttrAccount: account,
            kSecReturnAttributes: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        #expect(SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess)
        let attributes = try #require(item as? [String: Any])
        #expect(attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
    }
}
