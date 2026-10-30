# See your voice while you talk (IOS-031) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dictate and New note show the live pill, in the person's chosen Look, moving with their voice while a take records and following the take through its stages.

**Architecture:** Both screens draw `TakeButton` (ios/App/Takes/TakeScreen.swift). It gains a `PillCanvas` (the same PillView the keyboard and the listening session draw) between the record button and its status line, fed by `TakeModel.level` and staged by a new `TakeModel.pillStage`, which is the existing `PillStage(TakeModel.State)` mapping except that a retry from the waiting list shows the drying sheen. The look comes from `PillLook.read()`, re-read on appear as KeyboardScreen does. Previews and render tests inject the look and a demo voice.

**Tech Stack:** SwiftUI and UIKit (PillView through UIViewRepresentable), Swift Testing, the in-app smoke runner (`npm run ios:smoke`).

**Spec:** ios/prd.json, IOS-031 (its eight acceptance criteria and notes).

## Global Constraints

- Night studio tokens only; the design lint fails raw hex in ios/. Red only for record, errors, and delete confirms; amber for live states; gold for labels and iPhone action rows.
- The pill is the one bold thing; everything around it stays quiet. Interface motion settles without bounce. Reduce Motion gets still, finished frames, never a blank space.
- Dynamic Type up to accessibility5 without clipping; tap targets at least 44 by 44; a VoiceOver label on every control.
- CI runs Xcode 26.6 / Swift 6.3.3: bind by key path, never `Binding(get:set:)` with closures; split long float math into typed lets.
- murmur is always lowercase; no em dashes, double hyphens, or spaced hyphens in copy, comments, or commits.
- Gates before any commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, `npm run ios:smoke`.
- Before building the view, consult frontend-design, elite-saas-designer, and ui-skills-root inside night studio and DESIGN.md (CLAUDE.md, conventions.design).

## Review Focus

1. A retry from the waiting list: the pill shows the drying sheen while `retrying` is not empty, never the red of the take it retries, and settles when the retry ends.
2. Leaving Dictate mid-take (`cancel()`): the pill returns to rest and its display link stops; PillView stops its link when off window.
3. A keyboard take landing while Dictate is open shares the one TakeModel: the pill follows it, which is truthful, since the take is real.
4. The Look changed in Settings while Dictate is in the navigation stack: re-read on appear, so coming back shows the new look.
5. Reduce Motion switched on mid-take: PillView already observes the change and draws still frames.

---

### Task 1: The pill's stage for a take, retry included

**Files:**
- Modify: `ios/App/Pill/PillCanvas.swift` (the `PillStage` mapping)
- Modify: `ios/App/Takes/TakeModel.swift` (a `pillStage` property)
- Test: `ios/AppTests/PillTests.swift`

**Interfaces:**
- Produces: `PillStage.init(_ state: TakeModel.State, retrying: Bool)` and `TakeModel.pillStage: PillStage`.

- [ ] **Step 1: Write the failing tests** in PillTests, replacing `theAppFollowsTheTake` with every state and adding the retry:

```swift
    @Test func theAppFollowsTheTake() {
        let states: [TakeModel.State] = [
            .idle, .recording(since: .now), .transcribing, .words("hi"), .heardNothing(sent: true),
            .failed(TakeFailure(kind: "timeout", detail: "no response"), saved: true), .micOff, .micFailed,
        ]
        #expect(states.map { PillStage($0, retrying: false) } == [.idle, .recording, .processing, .inserted, .noSpeech, .error, .error, .error])
    }

    /// A retry from the waiting list dries like a take, never the red of
    /// the take it retries (IOS-031).
    @Test func aRetryShowsTheSheen() {
        let failed = TakeModel.State.failed(TakeFailure(kind: "timeout", detail: "no response"), saved: true)
        #expect(PillStage(failed, retrying: true) == .processing)
        #expect(PillStage(.idle, retrying: true) == .processing)
    }
```

- [ ] **Step 2: Run** `npm run ios:test`. Expected: the app tests fail to compile, since `PillStage(_:retrying:)` does not exist.
- [ ] **Step 3: Implement** in PillCanvas.swift: `init(_ state: TakeModel.State, retrying: Bool)` returns `.processing` when retrying, else the existing switch; keep `init(_ state:)` calling it with `retrying: false` so every caller keeps working. In TakeModel: `var pillStage: PillStage { PillStage(state, retrying: !retrying.isEmpty) }` with a one-line comment.
- [ ] **Step 4: Run** `npm run ios:test`. Expected: green, app tests one more than before.
- [ ] **Step 5: Commit** `IOS-031: the pill's stage for a take, a retry showing the drying sheen`.

### Task 2: The pill on Dictate and New note

**Files:**
- Modify: `ios/App/Takes/TakeScreen.swift` (`TakeButton`, `TakeScreen`, `TakePreview`)
- Modify: `ios/App/Notes/NoteTakeScreen.swift` only if New note's previews need the look
- Create: `ios/AppTests/TakeRenderTests.swift`

**Interfaces:**
- Consumes: `TakeModel.pillStage` (Task 1), `PillCanvas`, `PillLook.read()`, `DemoVoice.level`.
- Produces: `TakeButton(model:purpose:look:level:)`, where `look: PillLook?` (nil reads the saved look on appear) and `level: (@MainActor () -> Float)?` (nil reads `model.level`); `TakeScreen(model:look:level:)` passing them through; `TakePreview(_ scene:, style:)` with a new `.transcribing` scene.

- [ ] **Step 1: Consult the design skills** (frontend-design, elite-saas-designer, ui-skills-root) on the layout: the pill sits between the record icon and the status line at the shot size (236 by 56), so feedback is beside the point of action and the card does not jump when a take starts. Record the decision in the plan's ledger.
- [ ] **Step 2: Write the failing render tests** in TakeRenderTests: for each of `.ready, .recording, .transcribing, .words, .silence` and each of `PillStyle.bars` and `.ribbon`, render `TakePreview(scene, style:)` at the default size and at `.accessibility5`, plus the full page at accessibility5, save each shot, and expect ink above 0.02 (the pattern in NoteRenderTests). Add `theTranscribingSceneHoldsTheSend`: `await TakePreview.model(for: .transcribing)` gives `state == .transcribing`.
- [ ] **Step 3: Run** `npm run ios:test`. Expected: compile failure, since `TakePreview(_:style:)` and `.transcribing` do not exist.
- [ ] **Step 4: Implement.** In TakeButton, inside the button's VStack between the icon and the status: `PillCanvas(style: shown.style, stage: model.pillStage, level: level ?? { model.level }, palette: shown.palette).frame(width: 236, height: 56).accessibilityHidden(true)`, where `shown` is `look ?? saved` and `saved` is `@State` read with `PillLook.read()` in `.onAppear`. TakeScreen passes `look` and `level` through. TakePreview: a `style` parameter (default `.bars`) passed as `PillLook(style:)`, `DemoVoice.level` as the level for `.recording`, and a `.transcribing` scene whose `send` sleeps an hour, started with `Task { await model.stop() }` after `start()`, waiting until the state is `.transcribing` before returning. Add #Preview entries for the new scene and an ink style.
- [ ] **Step 5: Run** `npm run ios:test`, then read every saved shot at accessibility5: nothing clipped, the pill whole, the button's tap area unchanged. Expected: green.
- [ ] **Step 6: Commit** `IOS-031: Dictate and New note show the live pill in your Look`.

### Task 3: Smoke check

**Files:**
- Modify: `ios/App/Smoke/SmokeRunner.swift`

- [ ] **Step 1: Add `("takePill", checkTakePill)`** after `pill`, failing until written: build a TakeModel with a `FedMicrophone` at 16 kHz and polish off (as `sessionFailure` does), `await model.start()`, `microphone.hear(ScriptedMicrophone.tone)`, then require `model.level > 0` and `model.pillStage == .recording`; `await model.stop()`, then require `model.level == 0` and `model.pillStage == .inserted`.
- [ ] **Step 2: Run** `npm run ios:smoke`. Expected: `takePill` true and every other check still true.
- [ ] **Step 3: Commit** `IOS-031: a smoke check that a take's pill hears the voice`.

### Task 4: Docs, notes, review

**Files:**
- Modify: `ios/docs/iphone.md` (a new answer, How do I know murmur is hearing me?, near What does the pill show on iPhone?)
- Modify: `ios/prd.json` (IOS-031 notes), `HANDOFF.md` (the live check), `ios/ROADMAP.md` (by `npm run roadmap`)

- [ ] **Step 1: Write the docs answer**: in Dictate and New note, the pill moves with your voice while a take records, in the look you chose; flat bars mean murmur hears nothing, so check the microphone; Reduce Motion shows a still pill.
- [ ] **Step 2: Run all gates**, then the review gate: an independent opus reviewer over the whole IOS-031 range against CLAUDE.md, DESIGN.md, conventions, and the Review Focus above. Fix confirmed findings test-first.
- [ ] **Step 3: Record** how each criterion was verified in IOS-031's notes (passes stays false for the live check), add the live check to HANDOFF.md as numbered plain steps, run `npm run roadmap`, commit, push to PR #11, and ask LaBroi before any TestFlight upload.
