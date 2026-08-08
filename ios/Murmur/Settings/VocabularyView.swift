import SwiftUI

// US-109: the vocabulary trio. Dictionary terms hint the transcriber and
// formatter, learned corrections show their counts, and expansions insert
// literal values that never leave the device.
struct VocabularyView: View {
    @EnvironmentObject private var store: SettingsStore

    @State private var newTerm = ""
    @State private var newTrigger = ""
    @State private var newValue = ""

    var body: some View {
        Form {
            Section {
                ForEach(store.dictionary, id: \.self) { term in
                    Text(term)
                        .foregroundStyle(NightStudio.text)
                }
                .onDelete { store.dictionary.remove(atOffsets: $0) }
                HStack {
                    TextField("Add a term (Murmur, Groq, LB)", text: $newTerm)
                        .autocorrectionDisabled()
                        .accessibilityLabel("New dictionary term")
                    Button("Add") {
                        let term = newTerm.trimmingCharacters(in: .whitespaces)
                        guard !term.isEmpty,
                              !store.dictionary.contains(where: { $0.lowercased() == term.lowercased() }) else { return }
                        store.dictionary.append(term)
                        newTerm = ""
                    }
                    .disabled(newTerm.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityLabel("Add dictionary term")
                }
            } header: {
                Text("Dictionary").font(NightStudio.mono(11))
            } footer: {
                Text("Names and jargon the transcriber should recognize. Fed to Whisper and the formatter, same as desktop.")
            }

            Section {
                if store.corrections.isEmpty {
                    Text("Nothing learned yet. Edit a dictation in History and Murmur learns the fix.")
                        .foregroundStyle(NightStudio.text.opacity(0.55))
                        .font(.footnote)
                }
                ForEach(Array(store.corrections.enumerated()), id: \.offset) { _, pair in
                    HStack {
                        Text("\(pair.from) \u{2192} \(pair.to)")
                            .foregroundStyle(NightStudio.text)
                        Spacer()
                        Text("\u{00D7}\(pair.count)")
                            .font(NightStudio.mono(11))
                            .foregroundStyle(NightStudio.text.opacity(0.45))
                    }
                }
                .onDelete { store.corrections.remove(atOffsets: $0) }
            } header: {
                Text("Learned corrections").font(NightStudio.mono(11))
            } footer: {
                Text("Applied to every transcript, case-insensitive, whole words. Fixed twice promotes the term into the dictionary.")
            }

            Section {
                ForEach(Array(store.expansions.enumerated()), id: \.offset) { index, expansion in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(expansion.trigger)
                                .foregroundStyle(NightStudio.text)
                            Text(expansion.value)
                                .font(.footnote)
                                .lineLimit(1)
                                .foregroundStyle(NightStudio.text.opacity(0.5))
                        }
                        Spacer()
                        Toggle("", isOn: .init(
                            get: { store.expansions[index].enabled },
                            set: { store.expansions[index].enabled = $0 }
                        ))
                        .labelsHidden()
                        .accessibilityLabel("Enable expansion \(expansion.trigger)")
                    }
                }
                .onDelete { store.expansions.remove(atOffsets: $0) }
                VStack(spacing: 8) {
                    TextField("Say this (my email)", text: $newTrigger)
                        .autocorrectionDisabled()
                        .accessibilityLabel("New expansion trigger")
                    TextField("Insert this (lb@example.com)", text: $newValue)
                        .autocorrectionDisabled()
                        .accessibilityLabel("New expansion value")
                    Button("Add expansion") {
                        let trigger = newTrigger.trimmingCharacters(in: .whitespaces)
                        guard !trigger.isEmpty, !newValue.isEmpty else { return }
                        store.expansions.append(Expansion(trigger: trigger, value: newValue))
                        newTrigger = ""
                        newValue = ""
                    }
                    .disabled(newTrigger.trimmingCharacters(in: .whitespaces).isEmpty || newValue.isEmpty)
                    .accessibilityLabel("Add expansion")
                }
            } header: {
                Text("Expansions").font(NightStudio.mono(11))
            } footer: {
                Text("Applied after everything else, on this device. The values never appear in any API request.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(NightStudio.ink)
        .navigationTitle("Vocabulary")
        .navigationBarTitleDisplayMode(.inline)
        .preferredColorScheme(.dark)
    }
}
