import SwiftUI

// The app home: wordmark, the dictation surface, settings. The bounce
// status line only proves murmur:// routing until US-107 wires the real
// record-and-return loop.
struct ContentView: View {
    @Binding var route: MurmurRoute?
    @State private var showSettings = false

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
        // no taps (US-107).
        .fullScreenCover(isPresented: .init(
            get: { bounceSession != nil },
            set: { shown in if !shown { route = nil } }
        )) {
            BounceView(session: bounceSession ?? "") { route = nil }
        }
        .preferredColorScheme(.dark)
    }

    private var bounceSession: String? {
        if case .dictate(let session) = route, let session, !session.isEmpty {
            return session
        }
        return nil
    }
}
