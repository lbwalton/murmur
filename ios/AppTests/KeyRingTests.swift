// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Security
import Testing
@testable import murmur

@Suite(.serialized) struct KeyRingTests {
    let ring = KeychainKeyRing(store: KeychainStore(service: "murmur.keys.tests"))
    let groq = "https://api.groq.com/openai/v1"
    let openai = "https://api.openai.com/v1"

    @Test func keepsOneKeyPerProvider() throws {
        defer { try? ring.remove(for: groq); try? ring.remove(for: openai) }
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        try ring.save(try #require(APIKey("sk-openaiopenai2222")), for: openai)
        #expect(try ring.key(for: groq)?.secret == "gsk_groqgroq1111")
        #expect(try ring.key(for: openai)?.secret == "sk-openaiopenai2222")
        try ring.remove(for: groq)
        #expect(try ring.key(for: groq) == nil)
        #expect(try ring.key(for: openai) != nil)
    }

    @Test func aTrailingSlashFindsTheSameKey() throws {
        defer { try? ring.remove(for: groq) }
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq + "/")
        #expect(try ring.key(for: groq)?.secret == "gsk_groqgroq1111")
    }

    /// The app group is a Keychain access group too, shared with the
    /// keyboard; keys must land in the app's own application identifier
    /// (team id, a dot, the bundle id) so the keyboard can never read one.
    @Test func keysLiveInTheAppsOwnAccessGroup() throws {
        defer { try? ring.remove(for: groq) }
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        let group = try #require(try ring.store.accessGroup(account: BaseURL.normalized(groq)))
        #expect(group != AppGroup.identifier)
        #expect(group.hasSuffix("." + (try #require(Bundle.main.bundleIdentifier))))
        #expect(group.split(separator: ".").first?.count == 10)
    }

    /// The check above can tell the two apart: an item put in the app
    /// group on purpose reads back as the app group.
    @Test func theAccessGroupCheckSeesTheAppGroup() throws {
        let store = KeychainStore(service: "murmur.keys.tests.appgroup")
        let base: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: store.service, kSecAttrAccount: "probe"]
        SecItemDelete(base as CFDictionary)
        defer { SecItemDelete(base as CFDictionary) }
        var add = base
        add[kSecValueData] = Data("probe".utf8)
        add[kSecAttrAccessGroup] = AppGroup.identifier
        #expect(SecItemAdd(add as CFDictionary, nil) == errSecSuccess)
        #expect(try store.accessGroup(account: "probe") == AppGroup.identifier)
    }
}
