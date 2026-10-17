// SPDX-License-Identifier: GPL-3.0-only
// First run (ios/prd.json IOS-011): one screen and one action per step, in
// order. A step done in Settings checks itself when you come back, and
// moves on by itself; any step can be skipped, and Finish later leaves the
// rest on Home.
import SwiftUI
import UIKit

struct FirstRunScreen: View {
    @Bindable var setup: Setup
    @State var step: Setup.Step
    @State private var addingKey = false
    @State private var practice = ""
    @State private var check = ""
    @State private var opener = TakeOpener.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(SetupCopy.progress(step))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(Tokens.textDim)
                Spacer()
                Button(SetupCopy.later) { close() }
                    .buttonStyle(TapTargetStyle())
                    .foregroundStyle(Tokens.brand)
            }
            .padding(.horizontal, 24)
            StepDots(step: step, setup: setup)
                .padding(.horizontal, 24)
                .padding(.bottom, 12)
            ScrollView {
                page
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            actions
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
        }
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .onAppear {
            opener.setupUp = true
            follow()
        }
        .onDisappear {
            opener.setupUp = false
            opener.practicing = false
            dropPracticeTake()
        }
        .onChange(of: step) { was, _ in
            if was == .practice { dropPracticeTake() }
            follow()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { setup.refresh() }
            follow()
        }
        // A take started in another app while first run is up shows here,
        // since first run covers Home.
        .fullScreenCover(isPresented: $opener.showingOverSetup) { RecordingRoute() }
        // Waiting on the keyboard's report: look again every second.
        .task(id: step) {
            guard step == .keyboard else { return }
            while !Task.isCancelled, setup.status(step) != .done {
                try? await Task.sleep(for: .seconds(1))
                setup.refresh()
            }
        }
        .onChange(of: setup.status(step)) { was, now in
            // Done in Settings or here: move on by itself, after a moment to
            // see the check.
            guard was != .done, now == .done, step != .practice else { return }
            // Only from the step that turned done: Next may have moved on.
            let from = step
            Task {
                try? await Task.sleep(for: .milliseconds(900))
                if step == from { advance() }
            }
        }
        .onChange(of: practice) { _, text in
            if !text.isEmpty { setup.practiced() }
        }
        .sheet(isPresented: $addingKey, onDismiss: { setup.refresh() }) {
            // Done keeps a pasted key and comes back here; the step checks
            // itself as the sheet closes.
            NavigationStack { ProviderRoute(done: { addingKey = false }) }
                .preferredColorScheme(.dark)
        }
    }

    private var page: some View {
        VStack(alignment: .leading, spacing: 20) {
            Image(systemName: Self.symbol(step))
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(Tokens.brand)
                .accessibilityHidden(true)
            Text(SetupCopy.title(step))
                .font(.largeTitle.weight(.bold))
                .accessibilityAddTraits(.isHeader)
            Text(SetupCopy.why(step))
                .font(.title3)
                .foregroundStyle(Tokens.text)
            let taps = SetupCopy.taps(step)
            if !taps.isEmpty, setup.status(step) != .done || step == .practice {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(taps.enumerated()), id: \.offset) { index, tap in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text("\(index + 1)")
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                                .foregroundStyle(Tokens.brand)
                                .accessibilityHidden(true)
                            Text(tap)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Step \(index + 1). \(tap)")
                    }
                }
            }
            // The box makes the keyboard appear, and it reports itself.
            if step == .keyboard, setup.status(step) != .done {
                FirstRunBox(prompt: SetupCopy.checkBox, text: $check)
            }
            if step == .practice {
                FirstRunBox(prompt: SetupCopy.practiceBox, text: $practice)
                if setup.status(.practice) == .done {
                    Text(SetupCopy.practiceDone)
                        .font(.subheadline)
                        .foregroundStyle(Tokens.textDim)
                    SwipeGuide(still: reduceMotion)
                        .frame(maxWidth: .infinity)
                }
            }
            switch setup.status(step) {
            case .done:
                Note(text: SetupCopy.done, color: Tokens.ok, symbol: "checkmark.circle")
            case .denied:
                Note(text: SetupCopy.micDenied, color: Tokens.red, symbol: "mic.slash")
            case .todo, .skipped:
                EmptyView()
            }
        }
    }

    @ViewBuilder private var actions: some View {
        let status = setup.status(step)
        VStack(spacing: 4) {
            if status == .done {
                Primary(title: step == .practice ? SetupCopy.finish : SetupCopy.next) { advance() }
            } else {
                switch step {
                case .microphone where status == .denied, .keyboard:
                    Primary(title: SetupCopy.openSettings) { openSettings() }
                case .microphone:
                    Primary(title: SetupCopy.allow) { Task { await setup.allowMicrophone() } }
                case .key:
                    Primary(title: SetupCopy.addKey) { addingKey = true }
                case .practice:
                    EmptyView()
                }
                Secondary(title: SetupCopy.skip) {
                    setup.skip(step)
                    advance()
                }
            }
        }
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
    }

    /// The next step not done yet, or the end.
    private func advance() {
        guard let next = setup.step(after: step) else { return close() }
        step = next
    }

    /// A take from the practice box lands uncovered only while the box is
    /// on screen and murmur is in front.
    private func follow() {
        opener.practicing = step == .practice && scenePhase == .active
    }

    /// Leaving practice drops a practice take still starting or recording,
    /// so a take you walked away from never runs on.
    private func dropPracticeTake() {
        KeyboardBridge.live()?.hear(.cancel)
    }

    private func close() {
        setup.seen = true
        dismiss()
    }

    static func symbol(_ step: Setup.Step) -> String {
        switch step {
        case .microphone: "mic"
        case .keyboard: "keyboard"
        case .key: "key"
        case .practice: "waveform"
        }
    }
}

/// Where you are in first run: one mark per step, gold for this one,
/// filled for those done.
private struct StepDots: View {
    let step: Setup.Step
    let setup: Setup

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Setup.Step.allCases, id: \.self) { each in
                Capsule()
                    .fill(each == step ? Tokens.brand : setup.status(each) == .done ? Tokens.cream55 : Tokens.cream14)
                    .frame(height: 4)
            }
        }
        .accessibilityHidden(true)
    }
}

/// The box a step's keyboard shows in.
struct FirstRunBox: View {
    let prompt: String
    @Binding var text: String
    @FocusState private var focused: Bool

    var body: some View {
        // The hint is its own text, so it wraps in full at any size (a text
        // field's hint stops at its line limit) and in dim text, which reads
        // at AA on the panel. It keeps its room once you type, so the box
        // never jumps; the field's title stays its VoiceOver label.
        ZStack(alignment: .topLeading) {
            Text(prompt)
                .foregroundStyle(Tokens.textDim)
                .opacity(text.isEmpty ? 1 : 0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            TextField(prompt, text: $text, prompt: Text(verbatim: ""), axis: .vertical)
                .lineLimit(2...5)
                .focused($focused)
        }
        .padding(14)
        // A tap anywhere in the box starts typing, the hint's lower lines and
        // the margin included, since a long hint makes the box taller than
        // the field. The catcher sits behind the field, so the field keeps
        // its own taps for the cursor and selection.
        .background {
            Color.clear
                .contentShape(RoundedRectangle(cornerRadius: 14))
                .onTapGesture { focused = true }
        }
        .background(RoundedRectangle(cornerRadius: 14).fill(Tokens.panel))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Tokens.panelEdge))
    }
}

private struct Primary: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.body.weight(.semibold))
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Capsule().fill(Tokens.brand))
                .foregroundStyle(Tokens.ink)
        }
        .buttonStyle(.plain)
    }
}

private struct Secondary: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(TapTargetStyle(fill: true))
            .foregroundStyle(Tokens.brand)
    }
}

/// A text button whose whole frame takes the tap, at least 44 points each
/// way: the frame sits inside the button, where a frame outside it grows the
/// layout but leaves the tap on the words.
struct TapTargetStyle: ButtonStyle {
    var fill = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(minWidth: 44, maxWidth: fill ? .infinity : nil, minHeight: 44)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

extension Setup.Step: Identifiable {
    var id: String { rawValue }
}

/// What is left of first run, on Home until it is all done.
struct SetupChecklist: View {
    let setup: Setup
    let resume: (Setup.Step) -> Void

    var body: some View {
        Section {
            ForEach(setup.remaining) { step in
                Button {
                    resume(step)
                } label: {
                    HStack {
                        StepIcon(step: step)
                        Text(SetupCopy.title(step))
                            .foregroundStyle(Tokens.text)
                        Spacer()
                        if setup.status(step) == .denied {
                            Image(systemName: "exclamationmark.circle")
                                .foregroundStyle(Tokens.red)
                                .accessibilityLabel("Needs attention")
                        }
                    }
                    .contentShape(Rectangle())
                }
            }
        } header: {
            SectionTitle(SetupCopy.homeTitle)
        } footer: {
            Text(SetupCopy.homeFooter).foregroundStyle(Tokens.textDim)
        }
        .listRowBackground(Tokens.panel)
    }
}

/// A step's symbol in Home's checklist, in a column the titles line up on.
/// The column grows with the text, so the symbol never runs into its title.
struct StepIcon: View {
    let step: Setup.Step
    @ScaledMetric(relativeTo: .body) private var width: CGFloat = 24

    var body: some View {
        Image(systemName: FirstRunScreen.symbol(step))
            .foregroundStyle(Tokens.brand)
            .frame(width: width)
            .accessibilityHidden(true)
    }
}
