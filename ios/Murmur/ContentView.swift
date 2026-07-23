import SwiftUI

// The US-102 shell: night studio ink, the five-bar mark, and a quiet mono
// status line. Real dictation UI arrives with US-105; the status line only
// proves the murmur:// route lands here until then.
struct ContentView: View {
    @Binding var route: MurmurRoute?

    var body: some View {
        ZStack {
            NightStudio.ink.ignoresSafeArea()
            VStack(spacing: 28) {
                WaveMark()
                    .frame(width: 88, height: 44)
                Text("murmur")
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .foregroundStyle(NightStudio.text)
                Text(statusLine)
                    .font(NightStudio.mono(12))
                    .kerning(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(NightStudio.text.opacity(0.55))
            }
        }
        .preferredColorScheme(.dark)
    }

    private var statusLine: String {
        switch route {
        case .dictate(let session):
            return "bounce received \(session ?? "no session")"
        case .open:
            return "opened via url"
        case nil:
            return "ready"
        }
    }
}

// The five-bar waveform mark, the same shape the desktop tray and overlay
// draw. Idle keeps it warm text; amber arrives only with a live state.
struct WaveMark: View {
    static let ratios: [CGFloat] = [0.34, 0.62, 1.0, 0.52, 0.28]
    var color: Color = NightStudio.text.opacity(0.85)

    var body: some View {
        GeometryReader { geo in
            let barWidth = geo.size.width / (CGFloat(Self.ratios.count) * 1.9)
            HStack(spacing: barWidth * 0.9) {
                ForEach(Array(Self.ratios.enumerated()), id: \.offset) { _, ratio in
                    Capsule(style: .continuous)
                        .fill(color)
                        .frame(width: barWidth, height: max(barWidth, geo.size.height * ratio))
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}
