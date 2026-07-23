import SwiftUI

@main
struct MurmurApp: App {
    @State private var route: MurmurRoute?

    var body: some Scene {
        WindowGroup {
            ContentView(route: $route)
                .onOpenURL { url in
                    route = MurmurRoute.parse(url)
                }
        }
    }
}
