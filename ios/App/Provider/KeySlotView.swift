// SPDX-License-Identifier: GPL-3.0-only
// One provider's key rows: paste and save, or the saved mask and Remove;
// Get a key; Test connection; and the answer, inline (ios/prd.json
// IOS-005). The key field is secure, so the key can never be copied out.
import MurmurCore
import SwiftUI

struct KeySlotView: View {
    @Bindable var slot: KeySlot
    let provider: String
    let keyPage: URL?
    @State private var confirmingRemove = false

    var body: some View {
        if let masked = slot.masked {
            LabeledContent("\(provider) key") {
                Text(masked).monospaced().foregroundStyle(Tokens.textDim)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(provider) key saved, ending in \(masked.suffix(4))")
            Button("Remove key") { confirmingRemove = true }
                .buttonStyle(RowAction())
                .confirmationDialog(KeyCopy.removeQuestion(provider), isPresented: $confirmingRemove, titleVisibility: .visible) {
                    Button("Remove key", role: .destructive) { slot.remove() }
                }
        } else {
            SecureField(KeyCopy.pastePrompt(provider), text: $slot.draft)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .privacySensitive()
                .submitLabel(.done)
                .onSubmit { slot.save() }
                .accessibilityLabel("\(provider) key")
            if let note = slot.note {
                Note(text: note.words, color: Tokens.textDim, symbol: "info.circle")
            }
            Button("Save key") { slot.save() }
                .buttonStyle(RowAction())
                .disabled(!slot.canSave)
        }
        if let keyPage {
            Link("Get a \(provider) key", destination: keyPage)
                .buttonStyle(RowAction())
        }
        Button {
            Task { await slot.runTest() }
        } label: {
            if slot.test == .testing {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Testing…")
                }
            } else {
                Text("Test connection")
            }
        }
        .buttonStyle(RowAction())
        .disabled(!slot.canTest)
        if case .done(let verdict) = slot.test {
            Verdict(verdict: verdict, provider: provider)
        }
        if let failure = slot.failure {
            Note(text: failure, color: Tokens.red, symbol: "exclamationmark.triangle")
        }
    }
}

/// The test's answer: a title and what to do, green for works and clean
/// red for every failure. VoiceOver hears it as soon as it lands.
struct Verdict: View {
    let verdict: ConnectionVerdict
    let provider: String

    var body: some View {
        let words = verdict.words(provider: provider)
        let color = verdict.isSuccess ? Tokens.ok : Tokens.red
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: verdict.isSuccess ? "checkmark.circle" : "xmark.circle")
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 4) {
                Text(words.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(color)
                Text(words.detail)
                    .font(.subheadline)
                    .foregroundStyle(Tokens.text)
            }
        }
        .accessibilityElement(children: .combine)
        .onAppear {
            AccessibilityNotification.Announcement("\(words.title). \(words.detail)").post()
        }
    }
}

/// An action row in brand gold, dimmed while it cannot run. The whole
/// row is the tap target.
struct RowAction: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isEnabled ? Tokens.brand : Tokens.textDim)
            .opacity(configuration.isPressed ? 0.6 : 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
    }
}

/// A one-line note under a field.
struct Note: View {
    let text: String
    let color: Color
    let symbol: String

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.footnote)
            .foregroundStyle(color)
    }
}

#if DEBUG
#Preview("No key") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog)) }
#Preview("Wrong prefix") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, draft: "sk-abcdefgh1234")) }
#Preview("Saved key") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234")) }
#Preview("Testing") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .testing)) }
#Preview("Works") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .done(.works))) }
#Preview("Key rejected") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .done(.keyRejected(status: 401)))) }
#Preview("No connection") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .done(.noConnection))) }
#Preview("Provider message") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .done(.providerMessage("Rate limit reached for model whisper-large-v3-turbo. Try again in 20s.")))) }

private let groqURL = "https://api.groq.com/openai/v1"

private struct SlotPreview: View {
    let slot: KeySlot

    var body: some View {
        Form {
            Section {
                KeySlotView(slot: slot, provider: "Groq", keyPage: URL(string: "https://console.groq.com/keys"))
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
    }
}
#endif
