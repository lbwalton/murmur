import SwiftUI

@main
struct MurmurApp: App {
    @StateObject private var store = SettingsStore()
    @StateObject private var history = HistoryStore()
    @State private var route: MurmurRoute?

    var body: some Scene {
        WindowGroup {
            ContentView(route: $route)
                .environmentObject(store)
                .environmentObject(history)
                .onOpenURL { url in
                    route = MurmurRoute.parse(url)
                }
                .fullScreenCover(isPresented: .init(
                    get: { !store.onboarded },
                    set: { shown in if !shown { store.onboarded = true } }
                )) {
                    OnboardingView()
                        .environmentObject(store)
                }
        }
    }
}
