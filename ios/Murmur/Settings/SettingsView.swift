import SwiftUI

// The settings screen, night studio in Form clothing: same options and
// defaults as desktop, key handled by the Keychain-backed store.
struct SettingsView: View {
    @EnvironmentObject private var store: SettingsStore
    @Environment(\.dismiss) private var dismiss

    @State private var testing = false
    @State private var testResult: (ok: Bool, message: String)?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("gsk_...", text: $store.apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(NightStudio.mono(14))
                        .accessibilityLabel("Groq API key")
                    Button {
                        testConnection()
                    } label: {
                        HStack {
                            Text(testing ? "Testing..." : "Test connection")
                            Spacer()
                            if let result = testResult {
                                Text(result.message)
                                    .font(NightStudio.mono(11))
                                    .foregroundStyle(result.ok ? NightStudio.amber : NightStudio.red)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                    }
                    .disabled(testing || store.apiKey.isEmpty)
                    .accessibilityLabel("Test API connection")
                } header: {
                    Text("API key").font(NightStudio.mono(11))
                } footer: {
                    Text("Stored in the iOS Keychain on this device only. Free keys at console.groq.com.")
                }

                Section("Voice & model") {
                    LabeledContent("Model") {
                        TextField("whisper-large-v3-turbo", text: $store.model)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .accessibilityLabel("Transcription model")
                    }
                    Picker("Language", selection: $store.language) {
                        ForEach(SettingsStore.languageOptions, id: \.value) { option in
                            Text(option.label).tag(option.value)
                        }
                    }
                    .accessibilityLabel("Spoken language")
                }

                Section("Formatting") {
                    Toggle("Smart formatting", isOn: $store.smartFormat)
                        .accessibilityLabel("Smart formatting")
                    Picker("Style", selection: $store.formatStyle) {
                        ForEach(SettingsStore.styleOptions, id: \.value) { option in
                            Text(option.label).tag(option.value)
                        }
                    }
                    .accessibilityLabel("Formatting style")
                    Picker("Level", selection: $store.formatLevel) {
                        ForEach(SettingsStore.levelOptions, id: \.value) { option in
                            Text(option.label).tag(option.value)
                        }
                    }
                    .accessibilityLabel("Formatting level")
                    Picker("Numbers", selection: $store.numberStyle) {
                        ForEach(SettingsStore.numberOptions, id: \.value) { option in
                            Text(option.label).tag(option.value)
                        }
                    }
                    .accessibilityLabel("Number style")
                    LabeledContent("Formatting model") {
                        TextField("llama-3.1-8b-instant", text: $store.formatModel)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .accessibilityLabel("Formatting model")
                    }
                }

                Section {
                    Toggle("Keep history on this phone", isOn: $store.historyEnabled)
                        .accessibilityLabel("Keep dictation history on this phone")
                } header: {
                    Text("History").font(NightStudio.mono(11))
                } footer: {
                    Text("The last 200 dictations, stored only on this device. Turning this off stops new entries.")
                }

                Section {
                    Picker("Max take length", selection: $store.maxSeconds) {
                        Text("1 minute").tag(60)
                        Text("2 minutes").tag(120)
                        Text("5 minutes").tag(300)
                        Text("10 minutes").tag(600)
                    }
                    .accessibilityLabel("Maximum recording length")
                    LabeledContent("Base URL") {
                        TextField("https://api.groq.com/openai/v1", text: $store.baseUrl)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .accessibilityLabel("API base URL")
                    }
                } header: {
                    Text("Advanced").font(NightStudio.mono(11))
                } footer: {
                    Text("Any OpenAI-compatible endpoint works. Groq is the default because its Whisper hosting is fast and has a free tier.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(NightStudio.ink)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityLabel("Close settings")
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func testConnection() {
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
}
