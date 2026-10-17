// SPDX-License-Identifier: GPL-3.0-only
// Settings, murmur Pro (ios/prd.json IOS-025): what Pro adds, its price
// from the App Store, Get murmur Pro, Redeem a code, and Restore
// purchases; once bought, the supporter mark and the date you became one,
// and Founding member for a purchase made with a founders code. The free
// app never waits here: everything you use today stays free.
import StoreKit
import SwiftUI

struct ProScreen: View {
    let store: ProStore
    @State private var redeeming = false

    var body: some View {
        Form {
            switch store.status {
            case .pro(let since, let founder):
                Section {
                    Label(founder ? ProCopy.founding : ProCopy.active, systemImage: founder ? "seal.fill" : "checkmark.seal.fill")
                        .foregroundStyle(Tokens.brand)
                        .font(.headline)
                    Text(ProCopy.since(since))
                    if founder { Text(ProCopy.foundingPerk) }
                    Text(ProCopy.thanks).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)
            case .free:
                Section {
                    Text(ProCopy.pitch)
                }
                .listRowBackground(Tokens.panel)
                Section {
                    ForEach([ProCopy.profiles, ProCopy.early, ProCopy.markPerk], id: \.self) { Text($0) }
                } header: {
                    SectionTitle(ProCopy.adds)
                } footer: {
                    Text(ProCopy.earned).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)
                Section {
                    if !store.answered {
                        // The App Store has not answered yet: wait, never say
                        // Pro is not for sale.
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .accessibilityLabel(ProCopy.asking)
                    } else if let price = store.price {
                        Button(ProCopy.buy(price)) { Task { await store.buy() } }
                            .buttonStyle(RowAction())
                            .frame(minHeight: 44)
                            .disabled(store.busy != nil)
                    } else {
                        Text(ProCopy.unavailable).foregroundStyle(Tokens.textDim)
                    }
                    Button(ProCopy.redeem) { redeeming = true }
                        .buttonStyle(RowAction())
                        .frame(minHeight: 44)
                        .disabled(store.busy != nil)
                    Button(ProCopy.restore) { Task { await store.restore() } }
                        .buttonStyle(RowAction())
                        .frame(minHeight: 44)
                        .disabled(store.busy != nil)
                    if store.busy != nil { ProgressView().frame(maxWidth: .infinity) }
                    if let message = store.message {
                        Text(message).foregroundStyle(ProCopy.problems.contains(message) ? Tokens.red : Tokens.textDim)
                    }
                } footer: {
                    Text(ProCopy.founders).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(ProCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .offerCodeRedemption(isPresented: $redeeming) { _ in
            Task { await store.refresh() }
        }
        .task { await store.start() }
    }
}

/// Opens Settings, murmur Pro on the app's one Pro store.
struct ProRoute: View {
    var body: some View {
        ProScreen(store: ProStore.live())
    }
}

#if DEBUG
/// A shop for previews: a price or none, one purchase or none, and an
/// App Store that never answers when asked to wait.
struct PreviewShop: ProShop {
    var price: String? = "$39.99"
    var bought: ProPurchase?
    var waits = false

    func price(_ product: String) async -> String? {
        if waits { try? await Task.sleep(for: .seconds(3_600)) }
        return price
    }

    func purchases(_ product: String) async -> [ProPurchase] { bought.map { [$0] } ?? [] }
    func buy(_ product: String) async -> ProBuy { .cancelled }
    func restore() async -> ProRestore { .synced }
    func updates() -> AsyncStream<Void> { AsyncStream { _ in } }
}

extension ProStore {
    static func preview(bought: Bool, founder: Bool = false, price: String? = "$39.99", waits: Bool = false) -> ProStore {
        let purchase = ProPurchase(product: ProRules.productId, purchased: Date(timeIntervalSince1970: 1_791_590_400), revoked: nil, code: founder ? ProRules.foundersCode : nil)
        return ProStore(shop: PreviewShop(price: price, bought: bought ? purchase : nil, waits: waits))
    }
}

#Preview("Free, with a price") {
    NavigationStack { ProScreen(store: .preview(bought: false)) }.preferredColorScheme(.dark)
}

#Preview("Asking the App Store") {
    NavigationStack { ProScreen(store: .preview(bought: false, waits: true)) }.preferredColorScheme(.dark)
}

#Preview("Not for sale") {
    NavigationStack { ProScreen(store: .preview(bought: false, price: nil)) }.preferredColorScheme(.dark)
}

#Preview("Pro") {
    NavigationStack { ProScreen(store: .preview(bought: true)) }.preferredColorScheme(.dark)
}

#Preview("Founding member") {
    NavigationStack { ProScreen(store: .preview(bought: true, founder: true)) }.preferredColorScheme(.dark)
}

#Preview("Settings with the mark") {
    NavigationStack { SettingsScreen(pro: .preview(bought: true, founder: true)) }.preferredColorScheme(.dark)
}
#endif
