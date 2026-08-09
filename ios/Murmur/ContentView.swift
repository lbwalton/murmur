import SwiftUI

// The app home: wordmark, the dictation surface, settings. The bounce
// status line only proves murmur:// routing until US-107 wires the real
// record-and-return loop.
struct ContentView: View {
    @Binding var route: MurmurRoute?
    @State private var showSettings = false
    @ObservedObject private var intentBroker = IntentDictationBroker.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            NightStudio.ink.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Text("murmur")
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .foregroundStyle(NightStudio.text)
                    Spacer()
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .foregroundStyle(NightStudio.text.opacity(0.6))
                            .font(.system(size: 18))
                    }
                    .accessibilityLabel("Open settings")
                }
                .padding(.horizontal, 22)
                .padding(.top, 8)

                DictationView()
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        // The keyboard's mic key lands here: recording starts on appear,
        // no taps (US-107). Keyed on the session TOKEN, not just "is a bounce
        // showing": consecutive dictations move route from one .dictate token
        // to the next without passing through nil, so an isPresented cover
        // would never tear down. A new token is a new item, so the finished
        // take's screen is replaced by a fresh recording one every time.
        .fullScreenCover(item: .init(
            get: { bounceSession.map { BounceItem(id: $0) } },
            set: { item in if item == nil { route = nil } }
        )) { item in
            BounceView(session: item.id) { route = nil }
        }
        // The Action Button and Siri Shortcut land here (US-108).
        .fullScreenCover(isPresented: $intentBroker.active) {
            IntentDictationView()
        }
        // Returning to the app must not resurrect the bounce screen from an
        // earlier dictation: the cover survives the user swiping away
        // mid-guide, and a later manual visit would find it stuck saying
        // STARTING over a recorder that is idle (US-112). A LIVE bounce is
        // recognizable by its App Group pending session, written by the
        // keyboard right before opening the URL and cleared when the result
        // is consumed, so only tokens without one are stale. Checked by token
        // rather than by recorder phase to stay safe against the
        // scene-activation vs URL-delivery ordering race on a cold bounce.
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            HotMicManager.shared.resetIfFinished()
            if let session = bounceSession,
               AppGroupStore().pendingSession()?.token != session,
               !HotMicManager.shared.isBusy {
                route = nil
            }
        }
        .preferredColorScheme(.dark)
    }

    private var bounceSession: String? {
        if case .dictate(let session) = route, let session, !session.isEmpty {
            return session
        }
        return nil
    }

    // Identity for the bounce cover. A distinct session token is a distinct
    // presentation, which is what makes fullScreenCover(item:) dismiss the
    // previous take and present a fresh BounceView whose onAppear starts a
    // new recording under the new token.
    private struct BounceItem: Identifiable, Equatable { let id: String }
}
