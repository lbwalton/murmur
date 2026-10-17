// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import StoreKit
import StoreKitTest
import Synchronization
import Testing
@testable import murmur

@MainActor @Suite struct ProStoreTests {
    let file: StoreKitFile
    let product = ProRules.productId

    init() throws {
        file = try StoreKitFile.read(storeKitFileURL)
    }

    @Test func theMarkSaysWhoYouAre() {
        #expect(ProCopy.mark(.free) == nil)
        #expect(ProCopy.mark(.pro(since: .now, founder: false)) == "Supporter")
        #expect(ProCopy.mark(.pro(since: .now, founder: true)) == "Founding member")
    }

    @Test func proStartsFreeAtTheFilesPrice() async {
        let store = ProStore(shop: ScriptedShop(file), product: product)
        await store.start()
        #expect(store.status == .free)
        #expect(store.price == "$39.99")
    }

    @Test func aPurchaseMakesProAndARefundEndsIt() async throws {
        let shop = ScriptedShop(file)
        let store = ProStore(shop: shop, product: product)
        await store.start()
        await store.buy()
        #expect(store.status.isPro)
        #expect(!store.status.isFounder)
        shop.refund(product)
        try await waitUntil { store.status == .free }
        #expect(store.status == .free)
    }

    @Test func aNewPhoneRestoresPro() async {
        let shop = ScriptedShop(file)
        shop.buy(product, code: nil)
        let phone = ProStore(shop: ScriptedShop(file, bought: shop.bought), product: product)
        await phone.restore()
        #expect(phone.status.isPro)
        #expect(phone.message == nil)
    }

    @Test func aCodeRedeemedElsewhereMakesAFoundingMember() async throws {
        let shop = ScriptedShop(file)
        let store = ProStore(shop: shop, product: product)
        await store.start()
        #expect(shop.buy(product, code: ProRules.foundersCode))
        try await waitUntil { store.status.isFounder }
        #expect(store.status.isFounder)
        #expect(!shop.buy(product, code: "not-a-code"))
    }

    @Test(arguments: [(ProBuy.cancelled, nil), (.pending, ProCopy.pending), (.failed, ProCopy.buyFailed), (.unverified, ProCopy.unverified)] as [(ProBuy, String?)])
    func aPurchaseThatDoesNotFinishSaysWhy(_ outcome: ProBuy, _ message: String?) async {
        let store = ProStore(shop: FixedShop(outcome: outcome), product: product)
        await store.buy()
        #expect(store.status == .free)
        #expect(store.message == message)
        #expect(store.busy == nil)
    }

    @Test func restoringWithNothingBoughtSaysSo() async {
        let store = ProStore(shop: ScriptedShop(file), product: product)
        await store.restore()
        #expect(store.message == ProCopy.nothingToRestore)
        let offline = ProStore(shop: FixedShop(outcome: .failed, restored: .failed), product: product)
        await offline.restore()
        #expect(offline.message == ProCopy.restoreFailed)
    }

    /// Cancelling the App Store's sign in is not an error.
    @Test func cancellingRestoreSaysNothing() async {
        let store = ProStore(shop: FixedShop(outcome: .failed, restored: .cancelled), product: product)
        await store.restore()
        #expect(store.message == nil)
    }

    /// Until the App Store answers, the screen waits instead of saying Pro
    /// is not for sale, and a new visit starts without the last message.
    @Test func proSaysWhenItHasHeardAndForgetsOldMessages() async {
        let store = ProStore(shop: FixedShop(outcome: .failed), product: product)
        #expect(!store.answered)
        await store.buy()
        #expect(store.message == ProCopy.buyFailed)
        await store.start()
        #expect(store.answered)
        #expect(store.message == nil)
    }

    /// Leaving the screen before the App Store answers changes nothing: a
    /// cancelled load never blanks the price or turns a buyer free.
    @Test func aCancelledLoadChangesNothing() async throws {
        let shop = GatedShop()
        let store = ProStore(shop: shop, product: product)
        shop.answer(GatedShop.Answer(price: "$39.99", bought: true))
        await store.start()
        #expect(store.status.isPro)
        shop.hold()
        let leaving = Task { await store.start() }
        try await waitUntil { shop.waiting == 1 }
        leaving.cancel()
        shop.release(0, GatedShop.Answer(price: nil, bought: false))
        shop.open(GatedShop.Answer(price: nil, bought: false))
        await leaving.value
        #expect(store.status.isPro)
        #expect(store.price == "$39.99")
    }

    /// An older answer that lands after a newer one never overwrites it.
    @Test func anOlderRefreshNeverOverwritesANewerOne() async throws {
        let shop = GatedShop()
        let store = ProStore(shop: shop, product: product)
        shop.hold()
        let older = Task { await store.refresh() }
        try await waitUntil { shop.waiting == 1 }
        let newer = Task { await store.refresh() }
        try await waitUntil { shop.waiting == 2 }
        shop.release(1, GatedShop.Answer(price: nil, bought: true))
        await newer.value
        #expect(store.status.isPro)
        shop.release(0, GatedShop.Answer(price: nil, bought: false))
        await older.value
        #expect(store.status.isPro)
    }

    @Test func theMarkLineSaysWhereItShows() {
        #expect(ProCopy.markPerk == "The supporter mark, here and in Settings.")
    }

    /// No App Store answer: no price to show, and the free app goes on.
    @Test func withNoPriceProIsNotForSale() async {
        let store = ProStore(shop: FixedShop(outcome: .failed), product: product)
        await store.start()
        #expect(store.price == nil)
        #expect(store.status == .free)
    }

    func waitUntil(_ done: @MainActor () -> Bool) async throws {
        for _ in 0..<100 where !done() {
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    struct FixedShop: ProShop {
        let outcome: ProBuy
        var restored = ProRestore.synced
        func price(_ product: String) async -> String? { nil }
        func purchases(_ product: String) async -> [ProPurchase] { [] }
        func buy(_ product: String) async -> ProBuy { outcome }
        func restore() async -> ProRestore { restored }
        func updates() -> AsyncStream<Void> { AsyncStream { _ in } }
    }

    /// A shop whose answers wait until the test releases them, one by one.
    final class GatedShop: ProShop {
        struct Answer: Sendable {
            let price: String?
            let bought: Bool
        }

        private let state = Mutex<(answer: Answer, held: Bool, waiting: [CheckedContinuation<Answer, Never>])>((Answer(price: nil, bought: false), false, []))

        var waiting: Int { state.withLock { $0.waiting.count } }

        /// What every call gets from now on.
        func answer(_ answer: Answer) {
            state.withLock { $0.answer = answer }
        }

        /// From now on, every call gets this at once.
        func open(_ answer: Answer) {
            state.withLock {
                $0.answer = answer
                $0.held = false
            }
        }

        /// From now on, every call waits to be released.
        func hold() {
            state.withLock { $0.held = true }
        }

        /// Answers the call that waited in this place.
        func release(_ index: Int, _ answer: Answer) {
            let call = state.withLock { $0.waiting[index] }
            call.resume(returning: answer)
        }

        private func next() async -> Answer {
            await withCheckedContinuation { call in
                let now: Answer? = state.withLock { state in
                    if state.held {
                        state.waiting.append(call)
                        return nil
                    }
                    return state.answer
                }
                if let now { call.resume(returning: now) }
            }
        }

        func price(_ product: String) async -> String? { await next().price }

        func purchases(_ product: String) async -> [ProPurchase] {
            await next().bought ? [ProPurchase(product: product, purchased: Date(timeIntervalSince1970: 1_790_000_000), revoked: nil, code: nil)] : []
        }

        func buy(_ product: String) async -> ProBuy { .failed }
        func restore() async -> ProRestore { .synced }
        func updates() -> AsyncStream<Void> { AsyncStream { _ in } }
    }
}

/// Where StoreKit's test environment works: Apple broke it on iOS 26.3
/// simulators and it stays broken through 26.x (FB22237318, Apple's forums,
/// checked 2026-10-15), mended in iOS 27. CI's runner has iOS 26.5, so this
/// story runs on iOS 27 here; the stand-in tests and the smoke run everywhere.
enum StoreKitTesting {
    static var works: Bool {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return version.majorVersion != 26 || version.minorVersion < 3
    }
}

/// The real StoreKit, in Xcode's test environment, on ios/murmur.storekit.
/// One session plays the whole story in order, since every test shares the
/// one StoreKit test environment, and each step waits for StoreKit to
/// settle: a purchase, a refund, a founders code, and a restore.
@MainActor @Suite(.serialized, .enabled(if: StoreKitTesting.works, "StoreKit testing is broken on iOS 26.3 to 26.x simulators (Apple FB22237318)"))
struct ProStoreKitTests {
    let product = ProRules.productId

    /// Refreshes until the store says so, or five seconds pass.
    func settle(_ store: ProStore, until done: @MainActor () -> Bool) async throws {
        for _ in 0..<50 where !done() {
            try await Task.sleep(for: .milliseconds(100))
            await store.refresh()
        }
    }

    @Test func aPurchaseARefundAFoundersCodeAndARestore() async throws {
        let session = try SKTestSession(contentsOf: storeKitFileURL)
        session.resetToDefaultState()
        session.clearTransactions()
        session.disableDialogs = true
        let store = ProStore(shop: StoreKitShop(), product: product)
        await store.start()
        try await settle(store) { store.status == .free }
        #expect(store.status == .free)
        #expect(store.price == "$39.99")

        // Get murmur Pro's own path, StoreKit's purchase and all.
        await store.buy()
        #expect(store.status.isPro)
        #expect(!store.status.isFounder)
        #expect(store.message == nil)

        // The refund reaches the store through the App Store's updates alone.
        let bought = try #require(session.allTransactions().last)
        try session.refundTransaction(identifier: bought.identifier)
        for _ in 0..<50 where store.status.isPro {
            try await Task.sleep(for: .milliseconds(100))
        }
        #expect(store.status == .free)

        let coded = try await session.buyProduct(identifier: product, options: [.codeOffer(referenceName: ProRules.foundersCode)])
        #expect(StoreKitShop.purchase(coded).code == ProRules.foundersCode)
        try await settle(store) { store.status.isFounder }
        #expect(store.status.isFounder)

        await store.restore()
        #expect(store.status.isFounder)
        #expect(store.message == nil)
    }
}
