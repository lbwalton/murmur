import SwiftUI

// First run: the three things Murmur needs, one screen each, skippable but
// remembered. Never shows again once completed (onboarded flag).
struct OnboardingView: View {
    @EnvironmentObject private var store: SettingsStore
    @State private var step = 0

    @State private var testing = false
    @State private var testResult: (ok: Bool, message: String)?
    @State private var micGranted: Bool?

    private let recorder = Recorder()

    var body: some View {
        ZStack {
            NightStudio.ink.ignoresSafeArea()
            VStack(spacing: 0) {
                Text("STEP \(step + 1) OF 4")
                    .font(NightStudio.mono(11))
                    .kerning(1.2)
                    .foregroundStyle(NightStudio.text.opacity(0.45))
                    .padding(.top, 32)
                    .accessibilityLabel("Onboarding step \(step + 1) of 4")

                TabView(selection: $step) {
                    keyStep.tag(0)
                    micStep.tag(1)
                    keyboardStep.tag(2)
                    doneStep.tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .indexViewStyle(.page(backgroundDisplayMode: .always))
            }
        }
        .preferredColorScheme(.dark)
    }

    // ------------------------------------------------------------ step 1

    private var keyStep: some View {
        stepScaffold(
            title: "A free Groq key",
            body: "Murmur sends your voice to Groq's Whisper API and types back what you said. Groq has a free tier; grab a key and paste it here."
        ) {
            Link("Get a key at console.groq.com", destination: URL(string: "https://console.groq.com/keys")!)
                .font(.body.weight(.semibold))
                .foregroundStyle(NightStudio.amber)
                .accessibilityLabel("Open the Groq console to create a key")

            SecureField("Paste your key (gsk_...)", text: $store.apiKey)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityLabel("Groq API key")

            Button(testing ? "Testing..." : "Test connection") {
                testing = true
                testResult = nil
                let settings = store.pipelineSettings
                Task {
                    let result = await Transcriber.testConnection(settings: settings)
                    await MainActor.run {
                        testResult = result
                        testing = false
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(NightStudio.amber)
            .disabled(testing || store.apiKey.isEmpty)
            .accessibilityLabel("Test API connection")

            if let result = testResult {
                Text(result.message)
                    .font(NightStudio.mono(12))
                    .foregroundStyle(result.ok ? NightStudio.amber : NightStudio.red)
                    .accessibilityLabel(result.message)
            }

            nextButton(label: testResult?.ok == true ? "Next" : "Skip for now")
        }
    }

    // ------------------------------------------------------------ step 2

    private var micStep: some View {
        stepScaffold(
            title: "Your microphone",
            body: "Recording happens only while you hold the talk button, and audio goes only to the API you configured. Nothing is stored."
        ) {
            Button(micGranted == true ? "Microphone allowed" : "Allow the microphone") {
                Task {
                    let granted = await recorder.requestPermission()
                    await MainActor.run { micGranted = granted }
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(NightStudio.amber)
            .disabled(micGranted == true)
            .accessibilityLabel("Allow microphone access")

            if micGranted == false {
                Text("Denied. Enable it later in Settings, Murmur, Microphone.")
                    .font(NightStudio.mono(12))
                    .foregroundStyle(NightStudio.red)
            }

            nextButton(label: micGranted == true ? "Next" : "Skip for now")
        }
    }

    // ------------------------------------------------------------ step 3

    private var keyboardStep: some View {
        stepScaffold(
            title: "Add the keyboard",
            body: "The Murmur keyboard puts a mic key in every app. iOS keyboards cannot record audio, so the mic key hops here, you speak, and your words return to where you were typing."
        ) {
            VStack(alignment: .leading, spacing: 10) {
                instruction("1.", "Open the Settings app.")
                instruction("2.", "Tap Murmur, then Keyboards.")
                instruction("3.", "Turn on Murmur.")
                instruction("4.", "Turn on Allow Full Access.")
            }

            Text("Full Access is what lets the keyboard read your finished dictation from Murmur's shared store. The keyboard contains no networking code; nothing you type goes anywhere.")
                .font(.footnote)
                .foregroundStyle(NightStudio.text.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(NightStudio.amber)
            .accessibilityLabel("Open the Settings app")

            nextButton(label: "Next")
        }
    }

    // ------------------------------------------------------------ step 4

    private var doneStep: some View {
        stepScaffold(
            title: "Speak anywhere",
            body: "Hold the big button in Murmur to dictate here, or tap the mic key on the Murmur keyboard in any app. Settings can retune everything later."
        ) {
            Button("Start using Murmur") {
                store.onboarded = true
            }
            .buttonStyle(.borderedProminent)
            .tint(NightStudio.amber)
            .accessibilityLabel("Finish onboarding and start using Murmur")
        }
    }

    // ------------------------------------------------------------ helpers

    private func stepScaffold<Content: View>(
        title: String, body: String, @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Text(title)
                .font(.system(size: 30, weight: .semibold, design: .rounded))
                .foregroundStyle(NightStudio.text)
            Text(body)
                .font(.body)
                .foregroundStyle(NightStudio.text.opacity(0.75))
                .fixedSize(horizontal: false, vertical: true)
            content()
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func instruction(_ number: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(number)
                .font(NightStudio.mono(13))
                .foregroundStyle(NightStudio.amber)
            Text(text)
                .foregroundStyle(NightStudio.text)
        }
        .accessibilityElement(children: .combine)
    }

    private func nextButton(label: String) -> some View {
        Button(label) {
            withAnimation { step += 1 }
        }
        .buttonStyle(.bordered)
        .tint(NightStudio.text.opacity(0.6))
        .accessibilityLabel("\(label), go to the next step")
    }
}
