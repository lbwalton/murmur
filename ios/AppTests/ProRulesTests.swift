// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

/// ios/murmur.storekit, the StoreKit configuration the tests and the smoke run on.
let storeKitFileURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appending(path: "murmur.storekit")

@Suite struct ProRulesTests {
    let product = "com.example.pro"
    let early = Date(timeIntervalSince1970: 1_790_000_000)
    let late = Date(timeIntervalSince1970: 1_790_100_000)

    @Test func noPurchaseIsFree() {
        #expect(ProRules.status([], product: product) == .free)
    }

    @Test func theEarliestPurchaseInForceIsSince() {
        let purchases = [
            ProPurchase(product: product, purchased: late, revoked: nil, code: nil),
            ProPurchase(product: product, purchased: early, revoked: late, code: nil)
        ]
        #expect(ProRules.status(purchases, product: product) == .pro(since: late, founder: false))
    }

    @Test func aRefundEndsPro() {
        let purchases = [ProPurchase(product: product, purchased: early, revoked: late, code: nil)]
        #expect(ProRules.status(purchases, product: product) == .free)
    }

    @Test func aFoundersCodeMakesAFoundingMember() {
        for code in ["founders", "Founders"] {
            let purchases = [ProPurchase(product: product, purchased: early, revoked: nil, code: code)]
            #expect(ProRules.status(purchases, product: product) == .pro(since: early, founder: true))
        }
        let other = [ProPurchase(product: product, purchased: early, revoked: nil, code: "spring")]
        #expect(ProRules.status(other, product: product) == .pro(since: early, founder: false))
    }

    @Test func anotherProductIsNotPro() {
        let purchases = [ProPurchase(product: "com.example.other", purchased: early, revoked: nil, code: nil)]
        #expect(ProRules.status(purchases, product: product) == .free)
    }


    /// The test configuration sells the product the app names, with the
    /// founders' code and the desktop buyers' code, both free as in App Store
    /// Connect.
    @Test func theStoreKitFileSellsTheAppsProduct() throws {
        let file = try StoreKitFile.read(storeKitFileURL)
        let item = try #require(file.products.first { $0.productID == ProRules.productId })
        #expect(ProRules.productId == "com.lbwalton.murmur.ios.pro")
        #expect(item.type == "NonConsumable")
        #expect(item.offerCodes?.map(\.referenceName) == [ProRules.foundersCode, "desktop"])
    }
}
