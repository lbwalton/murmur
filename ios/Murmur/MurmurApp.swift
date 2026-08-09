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
                .task {
                    // Wire the hot mic once (US-112): it needs the current
                    // settings and history to run a background take with no
                    // view, and it starts listening for the keyboard's pokes.
                    HotMicManager.shared.configure(
                        settingsProvider: { store.pipelineSettings },
                        history: history,
                        warmSeconds: TimeInterval(store.warmSeconds))
                }
                .onChange(of: store.warmSeconds) { _, seconds in
                    HotMicManager.shared.setWarmSeconds(TimeInterval(seconds))
                }
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
