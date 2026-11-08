# Record and Transcribe in the App (IOS-006) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first real take: speak in the app, get your words back, never get words for silence, and never lose a take that failed.

**Architecture:** The rules go in MurmurCore, which tests on the Mac:
- the transcription request, desktop's `transcribe` in Swift (one WAV posted as a form, a timeout, one more try after a transient failure, desktop's failure kinds);
- the two silence guards in order, the speech gate before upload and the hallucination filter after;
- the WAV length reader that the waiting list uses.

The app adds:
- a microphone that records through AVAudioSession and converts to 16 kHz mono off the main actor;
- a store for failed takes in the app's own container, desktop's recovery folder in Swift;
- an `@Observable` take model that runs one thing at a time;
- a stand-in Dictate screen.

The smoke gains three checks: the gate on a generated tone and silence, a take through the in-app stand-in provider, and a failed take saved, listed, and retried.

**Tech Stack:** Swift 6 with strict concurrency, SwiftUI with Observation, Swift Testing, AVFoundation (AVAudioSession, AVAudioEngine, AVAudioConverter), Foundation's URLSession and URLProtocol, Synchronization's `Mutex`.

**Spec:** `ios/prd.json` IOS-006, with `conventions` (design, privacy, verify, docs, parity, stories), approved by LaBroi on 2026-10-10. Also `CLAUDE.md` and `DESIGN.md`. Desktop code this follows:
- `src/main/transcribe/provider.ts`: the request, the kinds, and the one retry.
- `src/main/transcribe/recovery.ts`: the folder, the records, keeping 20, and the WAV length.
- `src/main/retry.ts`: one at a time, and the audio goes only once its words are safe.
- `src/main/dictation.ts`: the gate before upload and the hallucination filter after.
- `src/renderer/settings/HomeView.tsx`: the waiting list's wording, delete audio?, and the 500 ms double-click guard.

**Proven before writing:** every Swift block below ran in a throwaway copy of `feature/ios` at 27146b7 before this plan was saved:
- `swift test` ran 78 MurmurCore tests: 59 existing and 19 new.
- `npm run ios:test` ran 71 app tests in the result bundle: 39 existing and 32 new.
- `npm run ios:smoke` printed `{"appGroup":true,"connectionTest":true,"keychain":true,"keyRing":true,"sharedJson":true,"speechGate":true,"transcription":true,"waitingTakes":true}`.
- `npm run test` (845) and its header and design lints were clean, and the build had no warnings.
- Two spikes settled questions this plan relies on:
  - **The converter holds back its last samples** (about 260 at 44.1 kHz) until it is told the stream ended, so `Capture.finish()` flushes it. Without that, a take loses its last sixtieth of a second.
  - **The simulator reports a file's protection through URL resource values, not file attributes.** It reports the class that was asked for, except that a file written with no protection reads as the default class, which is the one this story asks for. So the test catches a change to complete protection (which would stop a locked phone from saving) but cannot tell the default from the explicit setting.
- The screen was captured in the simulator in each state, at the default size and the largest accessibility size, and corrected:
  - The result sits in its own card.
  - The stop button is an outline.
  - Inline actions match the row actions' weight.
  - At accessibility sizes, Retry and Discard stack, which keeps the take's text from truncating.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **A transient failure (server, network, timeout) gets one more try, and a 4xx never does, as on desktop.** "One WAV" means one WAV per take; the second try resends the same WAV. If wrong: `retries = 0`.
2. **The timeout is URLRequest's 30 second timeout, as Test connection's is.** It ends a request that goes quiet for 30 seconds, so a long take that is still uploading steadily is not cut off. Desktop counts 30 seconds in total. If wrong: a task with a deadline around the request.
3. **The words show as the provider heard them, after the silence guards.** Formatting, the dictionary, expansions, and polish arrive with IOS-007 and IOS-013.
4. **A retried take's words go to the clipboard as well as the screen, as desktop's retry does.** The audio is deleted once its words are safe, and there is no history until IOS-012. Retry all joins every take's words with blank lines, so none are lost. If wrong: drop the copy, and keep the audio until history exists.
5. **The smoke's "local stub server" is the in-app URLProtocol stand-in from IOS-005 (its ruling 6), with a words host and a down host.** The smoke runs before launch on a blocked main thread, so its checks drive the MurmurCore pipeline and the store directly. The take model's flow is covered by `TakeModelTests`.
6. **Waiting takes stay out of iCloud backups**, so "the audio stays on this iPhone" is true. If wrong: one line.
7. **Takes are written with the after-first-unlock protection class, explicitly.** It is also iOS's default for app files. The test pins it against the class that would break saving while locked (see Proven before writing).
8. **The audio session is `.playAndRecord` with `.mixWithOthers` and `.defaultToSpeaker`, so music that is playing keeps playing.** IOS-009's warm session revisits it.
9. **Leaving the screen mid-take drops the take: nothing is kept or sent.** IOS-009's session will record in the background.
10. **A dead stream (a peak under `deadStreamPeak`) shows Heard nothing like any silent take.** Desktop also re-arms its capture, which belongs to the warm session (IOS-009), and the peak goes into the log with IOS-014.
11. **The take screen is a stand-in, reached as Dictate from the placeholder home.** The pill (IOS-010) and Home (IOS-012) replace it.
12. **Discard all is left out**, since the story asks for retry, retry all, and discard. Desktop added its Discard all later (US-096).
13. **The record button is red (record) and the stop button amber (live)**, per night studio. Retry is gold. Discard is dim until it asks Delete audio?, when it turns red.
14. **The live check waits for TestFlight 1 (IOS-015)**, as IOS-005's did.

## Global Constraints

- Swift 6 with strict concurrency; SwiftUI for screens; iOS 26 minimum (`stack`). No third-party Swift packages without LaBroi's OK.
- It must compile with Swift 6.3 (Xcode 26.6, CI's `macos-26`) as well as Swift 6.4 (Xcode 27, local). Bind SwiftUI fields by key path, and never hand `Binding(get:set:)` a closure: Swift 6.3 crashes turning a main-actor closure into Binding's setter (27146b7).
- MurmurCore stays UI-free and tests with `swift test --package-path ios/MurmurCore` on the Mac, no simulator.
- Privacy (`conventions.privacy`): your words and audio go only to the provider you chose. Audio between takes is never kept or sent. History, and here the waiting takes, stay in the app's own container, never the app group. Logs never hold your words or any key.
- Design (`conventions.design`): night studio tokens only, from the generated `Tokens.swift`.
  - Use the system font with Dynamic Type, a VoiceOver label on every control, and tap targets of at least 44 by 44 points. Text contrast is WCAG AA or better.
  - Copy is plain and sentence case, with lowercase murmur. Errors say what happened and what to do, in clean red. Red is only for record, errors, and the button that confirms a delete (DESIGN.md), and gold is the iPhone's color for tappable actions (LaBroi, 2026-10-12).
  - Each state ships a preview.
- Before building any screen, consult the `frontend-design`, `elite-saas-designer`, and `ui-skills-root` skills (CLAUDE.md). They were consulted for this plan.
- Behavior lives in `shared/` (`conventions.parity`). This story reads `shared/speech-gate.json` and `shared/hallucinations.json` and adds no rule files.
- Every `.swift` file starts with `// SPDX-License-Identifier: GPL-3.0-only`. The product name is always lowercase murmur. No em dashes or spaced hyphens as clause separators.
- Commits start with `IOS-006:`, then `git pull --rebase` (from `origin/feature/ios`, draft PR #11). Never rebase onto main.
- Before every commit run `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`. The fast loop is `swift test --package-path ios/MurmurCore`. Nothing desktop runs changes, so `npm run smoke` is not required.
- To read the app test count, open the newest result bundle; `npm run ios:test` prints only MurmurCore's summary:
  `xcrun xcresulttool get test-results summary --path "$(ls -td ios/build/DerivedData/Logs/Test/*.xcresult | head -1)"`
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- Run the review gate (an independent reviewer agent over the full diff) before any push.

## Review Focus

1. **A take with no key saved**, on first run or after switching providers. It waits with the reason no API key, sends nothing, and the screen points to Provider and key. Pinned by `TakeModelTests.noKeyWaitsWithoutSending` (Task 5).
2. **Retry all over several takes.** Every take's words survive, joined, and none delivers twice. Pinned by `TakeModelTests.retryAllKeepsEveryTakesWords` (Task 5).
3. **A quick double tap on Discard.** It never deletes. Pinned by `TakeModelTests.discardAsksFirstAndIgnoresADoubleTap` (Task 5).
4. **A waiting take's id that could name a path outside the folder.** It is refused. Pinned by `WaitingStoreTests.anIdThatIsNotATakeIsRefused` (Task 3).
5. **A microphone at any hardware rate** (48, 44.1, or 24 kHz, mono or stereo). It becomes 16 kHz mono at the same level, with the converter's tail flushed, and its tap never runs on the main actor. Pinned by `CaptureTests.anyMicrophoneFormatBecomes16kHzMono` and `theTapRunsOffTheMainThread` (Task 4).

## Files

MurmurCore (`ios/MurmurCore/Sources/MurmurCore/`, tests in `ios/MurmurCore/Tests/MurmurCoreTests/`):
- Create `Transcription.swift`: the request, `TranscriptionFailure`, `TranscriptionResult`. Test: `TranscriptionTests.swift`.
- Create `TakeAudio.swift`: `upload` (the gate, then trim and encode) and `heard` (the hallucination filter). Modify `Wav.swift`: add `durationMs`. Test: `TakeAudioTests.swift` (with `WavDurationTests`).

App (`ios/App/`, tests in `ios/AppTests/`):
- Create `Takes/WaitingStore.swift`: `TakeFailure`, `WaitingTake`, `WaitingStore`. Test: `WaitingStoreTests.swift`.
- Create `Takes/Microphone.swift`: the `Microphone` protocol, `DeviceMicrophone`, and `Capture`. Test: `CaptureTests.swift`.
- Create `Takes/TakeModel.swift` and `Smoke/ScriptedMicrophone.swift`. Modify `Settings/ConnectionStore.swift` (`BundledRules.takeRules`). Test: `TakeModelTests.swift`.
- Create `Takes/TakeCopy.swift` and `Takes/TakeScreen.swift`. Modify `ContentView.swift` (the Dictate row). Test: `TakeCopyTests.swift`.
- Modify `Smoke/StubProtocol.swift` (words and down hosts) and `Smoke/SmokeRunner.swift` (three checks).

Docs and records: `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json` (IOS-006 notes), and both roadmaps via `npm run roadmap`.

---

### Task 1: The transcription request

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/Transcription.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/TranscriptionTests.swift`

**Interfaces:**
- Consumes: `APIKey` (`secret`, `masked`), `BaseURL.problem` and `BaseURL.normalized`, `ConnectionTest.Send` (IOS-005).
- Produces: `public enum TranscriptionFailure: String, Codable, Sendable, CaseIterable { case auth, badrequest, server, network, timeout }`; `public enum TranscriptionResult: Equatable, Sendable { case words(String); case failed(TranscriptionFailure, detail: String) }`; `Transcription.request(wav:baseUrl:model:key:boundary:) -> URLRequest?`; `Transcription.run(wav:baseUrl:model:key:send:) async -> TranscriptionResult`; `Transcription.timeout == 30`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Synchronization
import Testing
@testable import MurmurCore

@Suite struct TranscriptionTests {
    let key = APIKey("gsk_abcdefgh1234")!
    let groq = "https://api.groq.com/openai/v1"
    let wav = Wav.encodePcm16([0.1, -0.1, 0.2], sampleRate: 16_000)

    func answer(_ status: Int, _ body: String = #"{"text":"send the invoice"}"#) -> ConnectionTest.Send {
        { request in
            (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    /// Counts calls, failing with each status in turn, then the last.
    final class Script: Sendable {
        let statuses: [Int]
        let calls = Mutex(0)
        init(_ statuses: [Int]) { self.statuses = statuses }

        var send: ConnectionTest.Send {
            { request in
                let index = self.calls.withLock { calls in
                    defer { calls += 1 }
                    return calls
                }
                let status = self.statuses[min(index, self.statuses.count - 1)]
                let body = status == 200 ? #"{"text":"recovered"}"# : "{}"
                return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
        }
    }

    @Test func itPostsOneWavWithTheModelAndKey() throws {
        let request = try #require(Transcription.request(wav: wav, baseUrl: groq + "/", model: "whisper-large-v3-turbo", key: key, boundary: "b"))
        #expect(request.url?.absoluteString == "https://api.groq.com/openai/v1/audio/transcriptions")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer gsk_abcdefgh1234")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "multipart/form-data; boundary=b")
        #expect(request.timeoutInterval == 30)
        let body = try #require(request.httpBody)
        let text = String(decoding: body, as: UTF8.self)
        #expect(text.contains(#"name="file"; filename="audio.wav""#))
        #expect(text.contains("Content-Type: audio/wav"))
        #expect(text.contains("name=\"model\"\r\n\r\nwhisper-large-v3-turbo\r\n"))
        #expect(text.contains("name=\"response_format\"\r\n\r\njson\r\n"))
        #expect(text.hasSuffix("--b--\r\n"))
        #expect(body.range(of: wav) != nil)
    }

    @Test func anAddressTheIPhoneCannotCallSendsNothing() async {
        #expect(Transcription.request(wav: wav, baseUrl: "http://192.168.1.5:8000/v1", model: "m", key: key) == nil)
        let script = Script([200])
        let result = await Transcription.run(wav: wav, baseUrl: "", model: "m", key: key, send: script.send)
        #expect(result == .failed(.network, detail: "not an address murmur can call"))
        #expect(script.calls.withLock { $0 } == 0)
    }

    @Test func aSuccessReadsTheWords() async {
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: answer(200)) == .words("send the invoice"))
    }

    @Test func aSuccessWithoutTextIsTheServer() async {
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: answer(200, "{}")) == .failed(.server, detail: "response missing text"))
    }

    @Test(arguments: [(401, TranscriptionFailure.auth), (403, .auth), (400, .badrequest), (404, .badrequest), (413, .badrequest), (429, .badrequest)])
    func aRefusalIsSortedAndNeverRetried(_ status: Int, _ kind: TranscriptionFailure) async {
        let script = Script([status])
        let result = await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: script.send)
        #expect(result == .failed(kind, detail: "http \(status)"))
        #expect(script.calls.withLock { $0 } == 1)
    }

    @Test func aServerFailureGetsOneMoreTry() async {
        let script = Script([500, 200])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: script.send) == .words("recovered"))
        #expect(script.calls.withLock { $0 } == 2)
    }

    @Test func twoServerFailuresGiveUp() async {
        let script = Script([503])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: script.send) == .failed(.server, detail: "http 503"))
        #expect(script.calls.withLock { $0 } == 2)
    }

    @Test func noAnswerInTimeIsATimeout() async {
        let slow: ConnectionTest.Send = { _ in throw URLError(.timedOut) }
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: slow) == .failed(.timeout, detail: "no response in 30 s"))
    }

    @Test func noConnectionIsTheNetwork() async {
        let offline: ConnectionTest.Send = { _ in throw URLError(.notConnectedToInternet) }
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: offline) == .failed(.network, detail: "url error -1009"))
    }

    /// The kinds are desktop's, word for word, since a waiting take's
    /// record names one.
    @Test func theKindsAreDesktops() {
        #expect(TranscriptionFailure.allCases.map(\.rawValue) == ["auth", "badrequest", "server", "network", "timeout"])
    }

    /// A failure's detail never carries the key, even when the provider
    /// echoes it.
    @Test func aDetailNeverHoldsTheKey() async {
        let echo = answer(500, #"{"error":{"message":"bad key gsk_abcdefgh1234"}}"#)
        let result = await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: echo)
        #expect(!"\(result)".contains(key.secret))
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `swift test --package-path ios/MurmurCore --filter TranscriptionTests`
Expected: the build fails with `cannot find 'Transcription' in scope`.

- [ ] **Step 3: Write the request**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The transcription request (ios/prd.json IOS-006), as desktop's
// src/main/transcribe/provider.ts makes it: one WAV posted as a form to
// {base}/audio/transcriptions with the chosen model and a 30 second
// timeout, one more try after a transient failure and never after a 4xx,
// and every failure sorted into desktop's kinds.
import Foundation

/// Why a transcription failed, in desktop's words for it.
public enum TranscriptionFailure: String, Codable, Sendable, CaseIterable {
    case auth, badrequest, server, network, timeout

    /// Worth one more try: the provider or the network may recover.
    var isTransient: Bool { self == .server || self == .network || self == .timeout }
}

public enum TranscriptionResult: Equatable, Sendable {
    case words(String)
    case failed(TranscriptionFailure, detail: String)
}

public enum Transcription {
    /// Desktop waits 30 seconds for an answer too.
    public static let timeout: TimeInterval = 30
    /// Tries after the first, for transient failures only.
    public static let retries = 1

    /// The request, or nil when the address is not one the iPhone can call.
    public static func request(wav: Data, baseUrl: String, model: String, key: APIKey, boundary: String = "murmur-\(UUID().uuidString)") -> URLRequest? {
        guard BaseURL.problem(baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(baseUrl.trimmingCharacters(in: .whitespaces)) + "/audio/transcriptions")
        else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("Bearer \(key.secret)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = form(wav: wav, model: model, boundary: boundary)
        return request
    }

    /// The form desktop sends: the file as audio.wav, the model, and a
    /// JSON answer.
    static func form(wav: Data, model: String, boundary: String) -> Data {
        var body = Data()
        func line(_ text: String) { body.append(Data((text + "\r\n").utf8)) }
        line("--\(boundary)")
        line(#"Content-Disposition: form-data; name="file"; filename="audio.wav""#)
        line("Content-Type: audio/wav")
        line("")
        body.append(wav)
        line("")
        for (name, value) in [("model", model), ("response_format", "json")] {
            line("--\(boundary)")
            line(#"Content-Disposition: form-data; name="\#(name)""#)
            line("")
            line(value)
        }
        line("--\(boundary)--")
        return body
    }

    public static func run(wav: Data, baseUrl: String, model: String, key: APIKey, send: ConnectionTest.Send) async -> TranscriptionResult {
        var result = await attempt(wav: wav, baseUrl: baseUrl, model: model, key: key, send: send)
        var remaining = retries
        while case .failed(let kind, _) = result, kind.isTransient, remaining > 0 {
            remaining -= 1
            result = await attempt(wav: wav, baseUrl: baseUrl, model: model, key: key, send: send)
        }
        return result
    }

    static func attempt(wav: Data, baseUrl: String, model: String, key: APIKey, send: ConnectionTest.Send) async -> TranscriptionResult {
        guard let request = request(wav: wav, baseUrl: baseUrl, model: model, key: key) else {
            return .failed(.network, detail: "not an address murmur can call")
        }
        do {
            let (body, response) = try await send(request)
            guard let http = response as? HTTPURLResponse else { return .failed(.network, detail: "no http answer") }
            return result(status: http.statusCode, body: body)
        } catch let error as URLError where error.code == .timedOut {
            return .failed(.timeout, detail: "no response in \(Int(timeout)) s")
        } catch let error as URLError {
            return .failed(.network, detail: "url error \(error.code.rawValue)")
        } catch {
            return .failed(.network, detail: "request failed")
        }
    }

    /// Desktop's sorting: 401 and 403 are the key, any other 4xx is the
    /// request, anything else that is not a success is the server, and a
    /// success without text is the server too.
    static func result(status: Int, body: Data) -> TranscriptionResult {
        switch status {
        case 401, 403:
            return .failed(.auth, detail: "http \(status)")
        case 400..<500:
            return .failed(.badrequest, detail: "http \(status)")
        case 200..<300:
            guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                  let text = object["text"] as? String
            else { return .failed(.server, detail: "response missing text") }
            return .words(text)
        default:
            return .failed(.server, detail: "http \(status)")
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `swift test --package-path ios/MurmurCore --filter TranscriptionTests`
Expected: 11 tests pass (16 cases).

- [ ] **Step 5: Commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/Transcription.swift ios/MurmurCore/Tests/MurmurCoreTests/TranscriptionTests.swift
git commit -m "IOS-006: MurmurCore sends one WAV to the transcription model and sorts every failure as desktop does"
```

### Task 2: The silence guards and the WAV length

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/TakeAudio.swift`
- Modify: `ios/MurmurCore/Sources/MurmurCore/Wav.swift` (add `durationMs`)
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/TakeAudioTests.swift`

**Interfaces:**
- Consumes: `SpeechGate` (`hasSpeechEnergy`, `trimSilence`, `isHallucination`, `stripTrailingHallucinations`), `SpeechGateSpec`, `HallucinationList`, `Wav.encodePcm16`; the tests' `gateSpec` and `hallucinationList` globals from `SpeechVectorTests.swift`.
- Produces: `TakeAudio.upload(_ samples: [Float], sampleRate: Int = 16_000, gate: SpeechGateSpec) -> Data?`; `TakeAudio.heard(_ transcript: String, list: HallucinationList) -> String?`; `Wav.durationMs(_ wav: Data) -> Int`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// A second of a 220 Hz tone at speaking level, padded with silence.
func spokenSecond(sampleRate: Int = 16_000, padding: Int = 8_000) -> [Float] {
    let tone = (0..<sampleRate).map { Float(0.3 * sin(2 * Double.pi * 220 * Double($0) / Double(sampleRate))) }
    return [Float](repeating: 0, count: padding) + tone + [Float](repeating: 0, count: padding)
}

@Suite struct TakeAudioTests {
    @Test func silenceIsNeverSent() throws {
        let gate = try #require(gateSpec)
        #expect(TakeAudio.upload([Float](repeating: 0, count: 32_000), gate: gate) == nil)
        #expect(TakeAudio.upload([Float](repeating: 0.001, count: 32_000), gate: gate) == nil)
        #expect(TakeAudio.upload([], gate: gate) == nil)
    }

    @Test func speechIsSentWithItsSilenceCut() throws {
        let gate = try #require(gateSpec)
        let samples = spokenSecond()
        let wav = try #require(TakeAudio.upload(samples, gate: gate))
        let trimmed = SpeechGate.trimSilence(samples, sampleRate: 16_000, spec: gate)
        #expect(wav == Wav.encodePcm16(trimmed, sampleRate: 16_000))
        #expect(trimmed.count < samples.count)
    }

    @Test(arguments: ["", "  ", "Thank you.", "thank you for watching"])
    func aPhraseInventedOnSilenceIsHeardAsNothing(_ transcript: String) throws {
        #expect(TakeAudio.heard(transcript, list: try #require(hallucinationList)) == nil)
    }

    @Test func realWordsAreKept() throws {
        let list = try #require(hallucinationList)
        #expect(TakeAudio.heard("Send the invoice tomorrow.", list: list) == "Send the invoice tomorrow.")
        #expect(TakeAudio.heard("Thanks for the help today. Thank you.", list: list) == "Thanks for the help today. Thank you.")
    }

    @Test func anInventedTailIsCut() throws {
        let list = try #require(hallucinationList)
        let tail = try #require(list.artifactTails.first)
        #expect(TakeAudio.heard("Send the invoice tomorrow. \(tail)", list: list) == "Send the invoice tomorrow.")
    }
}

@Suite struct WavDurationTests {
    @Test func itReadsTheLengthFromTheHeader() {
        #expect(Wav.durationMs(Wav.encodePcm16([Float](repeating: 0, count: 16_000), sampleRate: 16_000)) == 1000)
        #expect(Wav.durationMs(Wav.encodePcm16([Float](repeating: 0, count: 8_000), sampleRate: 16_000)) == 500)
        #expect(Wav.durationMs(Wav.encodePcm16([], sampleRate: 16_000)) == 0)
    }

    @Test func anythingElseIsZero() {
        #expect(Wav.durationMs(Data()) == 0)
        #expect(Wav.durationMs(Data("not a wav file at all".utf8)) == 0)
    }

    /// A header that promises more data than the file holds counts only
    /// what is there.
    @Test func aShortFileCountsWhatItHolds() {
        let full = Wav.encodePcm16([Float](repeating: 0, count: 16_000), sampleRate: 16_000)
        #expect(Wav.durationMs(full.prefix(44 + 16_000)) == 500)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `swift test --package-path ios/MurmurCore --filter "TakeAudioTests|WavDurationTests"`
Expected: the build fails with `cannot find 'TakeAudio' in scope` and `type 'Wav' has no member 'durationMs'`.

- [ ] **Step 3: Write the guards, and add the length reader to `Wav.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The two guards that keep silence from typing (ios/prd.json IOS-006), as
// desktop runs them in src/main/dictation.ts: the speech gate before
// upload, and the hallucination filter after transcription.
import Foundation

public enum TakeAudio {
    /// The WAV to upload: the take with its silent head and tail cut, or
    /// nil when the gate hears no speech, so nothing is sent.
    public static func upload(_ samples: [Float], sampleRate: Int = Wav.targetSampleRate, gate: SpeechGateSpec) -> Data? {
        guard SpeechGate.hasSpeechEnergy(samples, sampleRate: sampleRate, spec: gate) else { return nil }
        return Wav.encodePcm16(SpeechGate.trimSilence(samples, sampleRate: sampleRate, spec: gate), sampleRate: sampleRate)
    }

    /// The words worth keeping, or nil when the transcript is empty or
    /// only a phrase models invent on silence. A tail models add to real
    /// speech is cut using only the never-genuinely-spoken tails, so a
    /// real spoken thank-you survives.
    public static func heard(_ transcript: String, list: HallucinationList) -> String? {
        if SpeechGate.isHallucination(transcript, phrases: list.phrases) { return nil }
        return SpeechGate.stripTrailingHallucinations(transcript, phrases: list.artifactTails)
    }
}
```

`Wav.swift` in full, with `durationMs` added after `pcm16`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// WAV encoding for the recording pipeline, desktop's src/shared/wav.ts in
// Swift: 16 kHz mono 16-bit PCM, the format Whisper-style endpoints
// expect, byte for byte what desktop writes (shared/wav-vectors.json).
import Foundation

public enum Wav {
    public static let targetSampleRate = 16_000

    /// Mono float samples (-1 to 1) as a complete WAV file.
    public static func encodePcm16(_ samples: [Float], sampleRate: Int) -> Data {
        let dataLength = samples.count * 2
        var data = Data(capacity: 44 + dataLength)
        func ascii(_ text: String) { data.append(contentsOf: Array(text.utf8)) }
        func u32(_ value: Int) { withUnsafeBytes(of: UInt32(value).littleEndian) { data.append(contentsOf: $0) } }
        func u16(_ value: Int) { withUnsafeBytes(of: UInt16(value).littleEndian) { data.append(contentsOf: $0) } }

        ascii("RIFF")
        u32(36 + dataLength)
        ascii("WAVE")
        ascii("fmt ")
        u32(16) // fmt chunk size
        u16(1) // PCM
        u16(1) // mono
        u32(sampleRate)
        u32(sampleRate * 2) // byte rate
        u16(2) // block align
        u16(16) // bits per sample
        ascii("data")
        u32(dataLength)

        for sample in samples {
            withUnsafeBytes(of: pcm16(sample).littleEndian) { data.append(contentsOf: $0) }
        }
        return data
    }

    /// Clamp, scale by 32767, and round halves up, as desktop does. A NaN
    /// sample writes 0, as JavaScript's DataView does.
    static func pcm16(_ sample: Float) -> Int16 {
        let value = Double(sample)
        if value.isNaN { return 0 }
        return Int16(JS.round(Swift.max(-1, Swift.min(1, value)) * 32767))
    }

    /// Audio length from a PCM WAV header: data bytes over byte rate, as
    /// desktop's wavDurationMs reads it. Zero for anything else.
    public static func durationMs(_ wav: Data) -> Int {
        let bytes = [UInt8](wav)
        func ascii(_ at: Int) -> String { String(decoding: bytes[at..<(at + 4)], as: UTF8.self) }
        func u32(_ at: Int) -> Int { (0..<4).reduce(0) { $0 | Int(bytes[at + $1]) << (8 * $1) } }
        guard bytes.count >= 12, ascii(0) == "RIFF", ascii(8) == "WAVE" else { return 0 }
        var byteRate = 0
        var offset = 12
        while offset + 8 <= bytes.count {
            let id = ascii(offset)
            let size = u32(offset + 4)
            if id == "fmt ", offset + 20 <= bytes.count { byteRate = u32(offset + 16) }
            if id == "data" {
                let length = Swift.min(size, bytes.count - offset - 8)
                return byteRate > 0 ? Int(JS.round(Double(length) / Double(byteRate) * 1000)) : 0
            }
            offset += 8 + size + size % 2
        }
        return 0
    }
}
```

- [ ] **Step 4: Run them to see them pass, then the whole package**

Run: `swift test --package-path ios/MurmurCore`
Expected: 78 tests pass, with the 1 known issue `JSTests` records on purpose.

- [ ] **Step 5: Commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/TakeAudio.swift ios/MurmurCore/Sources/MurmurCore/Wav.swift ios/MurmurCore/Tests/MurmurCoreTests/TakeAudioTests.swift
git commit -m "IOS-006: silence never reaches the provider, and phrases models invent on silence are heard as nothing"
```

### Task 3: The waiting takes

**Files:**
- Create: `ios/App/Takes/WaitingStore.swift`
- Test: `ios/AppTests/WaitingStoreTests.swift`

**Interfaces:**
- Consumes: `Wav.durationMs` (Task 2).
- Produces: `struct TakeFailure: Codable, Equatable, Error, Sendable { let kind: String; let detail: String }` with `.noKey` and `.noSpeech`; `struct WaitingTake: Identifiable, Equatable, Sendable { id, savedAt, startedAt, audioMs, failure: TakeFailure? }`; `struct WaitingStore: Sendable` with `directory`, `.standard`, `keep == 20`, `save(_:startedAt:failure:now:) throws -> String`, `list()`, `take(_:)`, `audio(_:) throws -> Data`, `markFailed(_:_:) throws`, `remove(_:) throws`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@Suite struct WaitingStoreTests {
    let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "murmur-waiting-\(UUID().uuidString)", directoryHint: .isDirectory))
    let second = Wav.encodePcm16([Float](repeating: 0.1, count: 16_000), sampleRate: 16_000)
    let failure = TakeFailure(kind: "timeout", detail: "no response in 30 s")
    let saved = Date(timeIntervalSince1970: 1_790_000_000)

    @Test func aFailedTakeListsWithItsReasonAndLength() throws {
        let id = try store.save(second, startedAt: saved.addingTimeInterval(-3), failure: failure, now: saved)
        #expect(id == "recovery-1790000000000")
        #expect(store.list() == [WaitingTake(id: id, savedAt: saved, startedAt: saved.addingTimeInterval(-3), audioMs: 1000, failure: failure)])
        #expect(try store.audio(id) == second)
    }

    @Test func onlyTheNewest20AreKept() throws {
        for i in 0..<22 {
            try store.save(second, startedAt: saved, failure: failure, now: saved.addingTimeInterval(Double(i)))
        }
        let ids = store.list().map(\.id)
        #expect(ids.count == 20)
        #expect(ids.first == "recovery-1790000021000")
        #expect(ids.last == "recovery-1790000002000")
        let files = try FileManager.default.contentsOfDirectory(atPath: store.directory.path)
        #expect(files.count == 40)
    }

    /// Writable after first unlock, so a take that fails while the phone
    /// is locked still saves.
    @Test func filesAllowWritingAfterFirstUnlock() throws {
        let id = try store.save(second, startedAt: saved, failure: failure, now: saved)
        for name in ["\(id).wav", "\(id).json"] {
            let url = store.directory.appending(path: name)
            #expect(try url.resourceValues(forKeys: [.fileProtectionKey]).fileProtection == .completeUntilFirstUserAuthentication)
        }
    }

    @Test func theAudioStaysOutOfBackups() throws {
        try store.save(second, startedAt: saved, failure: failure, now: saved)
        #expect(try store.directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
    }

    @Test func aRetryThatFailsUpdatesTheReasonAndKeepsTheStart() throws {
        let id = try store.save(second, startedAt: saved.addingTimeInterval(-3), failure: failure, now: saved)
        try store.markFailed(id, .noSpeech)
        #expect(store.take(id)?.failure == .noSpeech)
        #expect(store.take(id)?.startedAt == saved.addingTimeInterval(-3))
    }

    @Test func removeDeletesAudioAndRecord() throws {
        let id = try store.save(second, startedAt: saved, failure: failure, now: saved)
        try store.remove(id)
        #expect(store.list().isEmpty)
        #expect(try FileManager.default.contentsOfDirectory(atPath: store.directory.path).isEmpty)
    }

    /// A take whose record is gone still lists, timed from its audio.
    @Test func aTakeWithoutItsRecordStillLists() throws {
        let id = try store.save(second, startedAt: saved, failure: failure, now: saved)
        try FileManager.default.removeItem(at: store.directory.appending(path: "\(id).json"))
        let take = try #require(store.take(id))
        #expect(take.failure == nil)
        #expect(take.startedAt == saved.addingTimeInterval(-1))
    }

    @Test(arguments: ["../settings", "recovery-12", "recovery-1790000000000/../x", "x"])
    func anIdThatIsNotATakeIsRefused(_ id: String) throws {
        try store.save(second, startedAt: saved, failure: failure, now: saved)
        #expect(store.take(id) == nil)
        #expect(throws: (any Error).self) { try store.audio(id) }
        try store.remove(id)
        #expect(store.list().count == 1)
    }

    @Test func anEmptyFolderListsNothing() {
        #expect(store.list().isEmpty)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'WaitingStore' in scope`. MurmurCore's 78 still pass first.

- [ ] **Step 3: Write the store**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Takes that were recorded but not transcribed (ios/prd.json IOS-006),
// kept as desktop keeps them (src/main/transcribe/recovery.ts): the WAV
// in the app's own container beside a small record of why it failed, the
// newest 20 kept. The files allow writing after first unlock, so a take
// that fails while the phone is locked still saves, and they stay out of
// backups, so the audio stays on this iPhone.
import Foundation
import MurmurCore

/// Why a take is waiting: a transcription failure kind (auth, network,
/// timeout, server, badrequest), or nospeech when a retry heard nothing.
struct TakeFailure: Codable, Equatable, Error, Sendable {
    let kind: String
    let detail: String

    static let noKey = TakeFailure(kind: "auth", detail: "no API key configured")
    static let noSpeech = TakeFailure(kind: "nospeech", detail: "no speech in the audio")
}

/// A waiting take as the screen sees it. No audio, no words.
struct WaitingTake: Identifiable, Equatable, Sendable {
    let id: String
    /// When the take failed and was saved.
    let savedAt: Date
    let startedAt: Date
    let audioMs: Int
    /// Nil when its record is missing or unreadable.
    let failure: TakeFailure?
}

struct WaitingStore: Sendable {
    static let keep = 20
    let directory: URL

    /// murmur's own container, never the app group the keyboard reads.
    static let standard = WaitingStore(directory: URL.applicationSupportDirectory.appending(path: "recovery", directoryHint: .isDirectory))

    private struct Record: Codable {
        let startedAt: Int64
        let failure: TakeFailure
    }

    private static func milliseconds(_ date: Date) -> Int64 { Int64((date.timeIntervalSince1970 * 1000).rounded()) }

    /// recovery- and 10 to 16 digits, so no id can name a path elsewhere.
    private static func isId(_ id: String) -> Bool {
        guard id.hasPrefix("recovery-") else { return false }
        let digits = id.dropFirst("recovery-".count)
        return (10...16).contains(digits.count) && digits.allSatisfy { $0.isASCII && $0.isNumber }
    }

    private func wav(_ id: String) -> URL { directory.appending(path: "\(id).wav") }
    private func record(_ id: String) -> URL { directory.appending(path: "\(id).json") }

    /// Saves a failed take and its record, then keeps only the newest 20.
    @discardableResult
    func save(_ audio: Data, startedAt: Date, failure: TakeFailure, now: Date = .now) throws -> String {
        try prepare()
        let id = "recovery-\(Self.milliseconds(now))"
        try audio.write(to: wav(id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        try write(Record(startedAt: Self.milliseconds(startedAt), failure: failure), id)
        prune()
        return id
    }

    /// Every waiting take, newest first.
    func list() -> [WaitingTake] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names
            .filter { $0.hasSuffix(".wav") }
            .compactMap { take(String($0.dropLast(4))) }
            .sorted { $0.savedAt > $1.savedAt }
    }

    /// One waiting take, or nil when its audio is gone or the id is not one.
    func take(_ id: String) -> WaitingTake? {
        guard Self.isId(id), let saved = Int64(id.dropFirst("recovery-".count)),
              let audio = try? Data(contentsOf: wav(id), options: .mappedIfSafe)
        else { return nil }
        let savedAt = Date(timeIntervalSince1970: Double(saved) / 1000)
        let audioMs = Wav.durationMs(audio)
        let stored = (try? Data(contentsOf: record(id))).flatMap { try? JSONDecoder().decode(Record.self, from: $0) }
        let startedAt = stored.map { Date(timeIntervalSince1970: Double($0.startedAt) / 1000) } ?? savedAt.addingTimeInterval(-Double(audioMs) / 1000)
        return WaitingTake(id: id, savedAt: savedAt, startedAt: startedAt, audioMs: audioMs, failure: stored?.failure)
    }

    func audio(_ id: String) throws -> Data {
        guard Self.isId(id) else { throw CocoaError(.fileNoSuchFile) }
        return try Data(contentsOf: wav(id))
    }

    /// Records why a retry failed, keeping when the take began.
    func markFailed(_ id: String, _ failure: TakeFailure) throws {
        guard let take = take(id) else { return }
        try write(Record(startedAt: Self.milliseconds(take.startedAt), failure: failure), id)
    }

    /// Deletes a take's audio and record.
    func remove(_ id: String) throws {
        guard Self.isId(id) else { return }
        for url in [wav(id), record(id)] where FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }

    private func prepare() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = directory
        try url.setResourceValues(values)
    }

    private func write(_ record: Record, _ id: String) throws {
        try JSONEncoder().encode(record).write(to: self.record(id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// Keeps the newest 20 takes (names sort by time) and drops any
    /// record whose audio is gone.
    private func prune() {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        let takes = names.filter { $0.hasSuffix(".wav") }.map { String($0.dropLast(4)) }.filter(Self.isId).sorted()
        let kept = Set(takes.suffix(Self.keep))
        for name in names {
            let id = name.hasSuffix(".wav") || name.hasSuffix(".json") ? String(name.prefix { $0 != "." }) : ""
            guard Self.isId(id), !kept.contains(id) else { continue }
            try? FileManager.default.removeItem(at: directory.appending(path: name))
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `WaitingStoreTests` passes (9 tests, 12 cases) and every earlier app test still passes.

- [ ] **Step 5: Commit**

```bash
git add ios/App/Takes/WaitingStore.swift ios/AppTests/WaitingStoreTests.swift
git commit -m "IOS-006: a failed take waits with its audio in the app's own container, the newest 20 kept"
```

### Task 4: The microphone

**Files:**
- Create: `ios/App/Takes/Microphone.swift`
- Test: `ios/AppTests/CaptureTests.swift`

**Interfaces:**
- Consumes: `Wav.targetSampleRate`.
- Produces: `@MainActor protocol Microphone: AnyObject { func allow() async -> Bool; func start() throws; func stop() -> [Float] }`; `enum MicrophoneError: Error { case noInput }`; `@MainActor final class DeviceMicrophone: Microphone`; `final class Capture: Sendable` with `init?(from: AVAudioFormat)`, `tap: AVAudioNodeTapBlock`, `append(_:)`, and `finish() -> [Float]`.

The microphone hardware itself cannot run in the simulator's tests; `Capture` holds everything that can be tested without it, and the live check covers the rest.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import AVFoundation
import Testing
@testable import murmur

@Suite struct CaptureTests {
    /// A second of a 440 Hz tone at amplitude 0.3, in buffers the size a
    /// microphone tap delivers.
    func feed(_ capture: Capture, rate: Double, channels: AVAudioChannelCount) throws {
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: rate, channels: channels))
        let frames = AVAudioFrameCount(rate / 10)
        for chunk in 0..<10 {
            let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames))
            buffer.frameLength = frames
            for channel in 0..<Int(channels) {
                let data = try #require(buffer.floatChannelData)[channel]
                for i in 0..<Int(frames) {
                    let t = Double(chunk * Int(frames) + i) / rate
                    data[i] = Float(0.3 * sin(2 * Double.pi * 440 * t))
                }
            }
            capture.append(buffer)
        }
    }

    func rms(_ samples: ArraySlice<Float>) -> Double {
        (samples.reduce(0.0) { $0 + Double($1 * $1) } / Double(samples.count)).squareRoot()
    }

    /// The microphone calls the tap on its own audio thread, so the tap
    /// must never belong to the main actor.
    @Test func theTapRunsOffTheMainThread() throws {
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
        let capture = try #require(Capture(from: format))
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4_800))
        buffer.frameLength = 4_800
        let tap = capture.tap
        let onMain = DispatchQueue(label: "audio").sync {
            tap(buffer, AVAudioTime(sampleTime: 0, atRate: 48_000))
            return Thread.isMainThread
        }
        #expect(!onMain)
        #expect(abs(capture.finish().count - 1_600) < 20)
    }

    @Test(arguments: [(48_000.0, AVAudioChannelCount(1)), (48_000, 2), (44_100, 1), (24_000, 1)])
    func anyMicrophoneFormatBecomes16kHzMono(_ rate: Double, _ channels: AVAudioChannelCount) throws {
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: rate, channels: channels))
        let capture = try #require(Capture(from: format))
        try feed(capture, rate: rate, channels: channels)
        let samples = capture.finish()
        #expect(abs(samples.count - 16_000) < 20)
        // The tone keeps its level (0.3 peak, 0.212 RMS) through the change.
        #expect(abs(rms(samples[2_000..<14_000]) - 0.212) < 0.02)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'Capture' in scope`.

- [ ] **Step 3: Write the microphone**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The microphone (ios/prd.json IOS-006): it asks the first time a take
// needs it, records mono through AVAudioSession, and hands back the take
// at 16 kHz, the rate the speech gate and the WAV use.
import AVFoundation
import MurmurCore
import Synchronization

@MainActor protocol Microphone: AnyObject {
    /// Asks the first time; true when murmur may record.
    func allow() async -> Bool
    func start() throws
    /// Stops and returns the take at 16 kHz.
    func stop() -> [Float]
}

enum MicrophoneError: Error {
    case noInput
}

@MainActor final class DeviceMicrophone: Microphone {
    private let engine = AVAudioEngine()
    private var capture: Capture?

    func allow() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: true
        case .denied: false
        default: await AVAudioApplication.requestRecordPermission()
        }
    }

    /// Music that is playing keeps playing (mixWithOthers).
    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
        try session.setActive(true)
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard let capture = Capture(from: format) else { throw MicrophoneError.noInput }
        self.capture = capture
        input.installTap(onBus: 0, bufferSize: 4096, format: format, block: capture.tap)
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            self.capture = nil
            throw error
        }
    }

    func stop() -> [Float] {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        defer { capture = nil }
        return capture?.finish() ?? []
    }
}

/// Turns the input's buffers into 16 kHz mono as they arrive, on the
/// audio thread, so nothing here belongs to the main actor. The
/// converter keeps its state between buffers, so a take converts as one
/// stream.
final class Capture: Sendable {
    private struct State: ~Copyable {
        let converter: AVAudioConverter
        let output: AVAudioFormat
        var samples: [Float] = []
    }

    private let state: Mutex<State>

    /// Nil for a format with no audio in it (no input device).
    init?(from input: AVAudioFormat) {
        guard input.sampleRate > 0, input.channelCount > 0,
              let output = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(Wav.targetSampleRate), channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: input, to: output)
        else { return nil }
        converter.downmix = true
        state = Mutex(State(converter: converter, output: output))
    }

    /// The take, with the last samples the converter holds back flushed
    /// out. Call once, after the last buffer.
    func finish() -> [Float] {
        state.withLock { state in
            if let out = AVAudioPCMBuffer(pcmFormat: state.output, frameCapacity: 4_096) {
                var error: NSError?
                let status = state.converter.convert(to: out, error: &error) { _, inputStatus in
                    inputStatus.pointee = .endOfStream
                    return nil
                }
                if status != .error, let channel = out.floatChannelData {
                    state.samples.append(contentsOf: UnsafeBufferPointer(start: channel[0], count: Int(out.frameLength)))
                }
            }
            return state.samples
        }
    }

    /// The tap's block, made here so it never inherits the main actor.
    var tap: AVAudioNodeTapBlock {
        { [self] buffer, _ in append(buffer) }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        state.withLock { state in
            let ratio = state.output.sampleRate / buffer.format.sampleRate
            let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 64
            guard let out = AVAudioPCMBuffer(pcmFormat: state.output, frameCapacity: capacity) else { return }
            var fed = false
            var error: NSError?
            let status = state.converter.convert(to: out, error: &error) { _, inputStatus in
                if fed {
                    inputStatus.pointee = .noDataNow
                    return nil
                }
                fed = true
                inputStatus.pointee = .haveData
                return buffer
            }
            guard status != .error, let channel = out.floatChannelData else { return }
            state.samples.append(contentsOf: UnsafeBufferPointer(start: channel[0], count: Int(out.frameLength)))
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `CaptureTests` passes (2 tests, 5 cases).

- [ ] **Step 5: Commit**

```bash
git add ios/App/Takes/Microphone.swift ios/AppTests/CaptureTests.swift
git commit -m "IOS-006: the microphone asks the first time and turns any input into 16 kHz mono off the main actor"
```

### Task 5: The take

**Files:**
- Create: `ios/App/Takes/TakeModel.swift`, `ios/App/Smoke/ScriptedMicrophone.swift`
- Modify: `ios/App/Settings/ConnectionStore.swift` (`BundledRules.takeRules`)
- Test: `ios/AppTests/TakeModelTests.swift`

**Interfaces:**
- Consumes: Tasks 1 to 4; `ConnectionStore.load(catalog:)`, `KeyRing.key(for:)`, `MemoryKeyRing`, `ProviderCatalog` (IOS-005).
- Produces: `struct TakeRules: Sendable { gate, hallucinations }`; `BundledRules.takeRules() throws -> TakeRules`; `@Observable @MainActor final class TakeModel` with `State` (`idle`, `recording(since:)`, `transcribing`, `words(String)`, `heardNothing(sent:)`, `failed(TakeFailure, saved:)`, `micOff`, `micFailed`), `state`, `waiting`, `retrying`, `armed`, `message`, `isRecording`, `isBusy`, `toggle()`, `start()`, `stop()`, `cancel()`, `retry(_:)`, `discard(_:)`, and `TakeModel.doubleTap == 0.5`; `State.isRecording` and `State.hasResult`; `@MainActor final class ScriptedMicrophone: Microphone` with `allowed`, `startError`, `samples`, `asked`, `started`, and the nonisolated `tone` and `silence`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Synchronization
import Testing
@testable import murmur

/// A provider that answers each request with the next of its replies,
/// then the last, and remembers what it was sent.
final class FakeProvider: Sendable {
    let replies: Mutex<[(Int, String)]>
    let sent = Mutex<[URLRequest]>([])

    init(_ replies: [(Int, String)]) {
        self.replies = Mutex(replies)
    }

    static func says(_ words: String) -> FakeProvider { FakeProvider([(200, #"{"text":"\#(words)"}"#)]) }

    var requests: [URLRequest] { sent.withLock { $0 } }

    func answer(_ replies: [(Int, String)]) { self.replies.withLock { $0 = replies } }

    var send: ConnectionTest.Send {
        { request in
            self.sent.withLock { $0.append(request) }
            let (status, body) = self.replies.withLock { replies in replies.count > 1 ? replies.removeFirst() : replies[0] }
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }
}

@MainActor @Suite struct TakeModelTests {
    let groq = "https://api.groq.com/openai/v1"
    let catalog: ProviderCatalog
    let rules: TakeRules
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "murmur-takes-\(UUID().uuidString)", directoryHint: .isDirectory))
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let sink = Sink()

    /// What a take copied, and the time it reads.
    @MainActor final class Sink {
        var copied: [String] = []
        var now = Date(timeIntervalSince1970: 1_790_000_000)
    }

    init() throws {
        catalog = try BundledRules.catalog()
        rules = try BundledRules.takeRules()
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
    }

    func model(_ provider: FakeProvider) -> TakeModel {
        TakeModel(
            microphone: microphone, store: store, rules: rules, catalog: catalog,
            connections: ConnectionStore(defaults: defaults), ring: ring, send: provider.send,
            copy: { [sink] text in sink.copied.append(text) },
            now: { [sink] in sink.now }
        )
    }

    func pass(_ seconds: TimeInterval) {
        sink.now = sink.now.addingTimeInterval(seconds)
    }

    func take(_ model: TakeModel) async {
        await model.start()
        pass(2)
        await model.stop()
    }

    @Test func theFirstTakeAsksForTheMicrophone() async {
        let model = model(.says("hello"))
        await model.start()
        #expect(microphone.asked == 1)
        #expect(model.state == .recording(since: Date(timeIntervalSince1970: 1_790_000_000)))
    }

    @Test func noMicrophoneSaysHowToTurnItOn() async {
        microphone.allowed = false
        let model = model(.says("hello"))
        await model.start()
        #expect(model.state == .micOff)
        #expect(microphone.started == 0)
    }

    @Test func aMicrophoneThatWillNotStartSaysSo() async {
        microphone.startError = MicrophoneError.noInput
        let model = model(.says("hello"))
        await model.start()
        #expect(model.state == .micFailed)
    }

    @Test func aSpokenTakeComesBackAsWords() async throws {
        let provider = FakeProvider.says("Send the invoice tomorrow.")
        let model = model(provider)
        await take(model)
        #expect(model.state == .words("Send the invoice tomorrow."))
        let request = try #require(provider.requests.first)
        #expect(provider.requests.count == 1)
        #expect(request.url?.absoluteString == groq + "/audio/transcriptions")
        #expect(String(decoding: try #require(request.httpBody), as: UTF8.self).contains("whisper-large-v3-turbo"))
        #expect(model.waiting.isEmpty)
    }

    @Test func silenceIsNeverSent() async {
        microphone.samples = ScriptedMicrophone.silence
        let provider = FakeProvider.says("Thank you.")
        let model = model(provider)
        await take(model)
        #expect(model.state == .heardNothing(sent: false))
        #expect(provider.requests.isEmpty)
        #expect(model.waiting.isEmpty)
    }

    @Test func aPhraseInventedOnSilenceIsHeardNothing() async {
        let model = model(.says("Thank you."))
        await take(model)
        #expect(model.state == .heardNothing(sent: true))
        #expect(model.waiting.isEmpty)
    }

    @Test func aFailedTakeWaitsWithItsAudio() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        let failure = TakeFailure(kind: "server", detail: "http 503")
        #expect(model.state == .failed(failure, saved: true))
        let waiting = try #require(model.waiting.first)
        #expect(model.waiting.count == 1)
        #expect(waiting.failure == failure)
        #expect(waiting.startedAt == Date(timeIntervalSince1970: 1_790_000_000))
        #expect(try store.audio(waiting.id) == TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate))
    }

    @Test func noKeyWaitsWithoutSending() async {
        try? ring.remove(for: groq)
        let provider = FakeProvider.says("hello")
        let model = model(provider)
        await take(model)
        #expect(model.state == .failed(.noKey, saved: true))
        #expect(provider.requests.isEmpty)
        #expect(model.waiting.first?.failure == .noKey)
    }

    @Test func aRetryDeliversTheWordsThenDeletesTheAudio() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        provider.answer([(200, #"{"text":"Send the invoice tomorrow."}"#)])
        await model.retry(model.waiting.map(\.id))
        #expect(model.state == .words("Send the invoice tomorrow."))
        #expect(sink.copied == ["Send the invoice tomorrow."])
        #expect(model.waiting.isEmpty)
        #expect(store.list().isEmpty)
        #expect(model.message == "Done: the words are above and on your clipboard.")
    }

    /// Retry all keeps every take's words, not only the last.
    @Test func retryAllKeepsEveryTakesWords() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        pass(5)
        await take(model)
        #expect(model.waiting.count == 2)
        provider.answer([(200, #"{"text":"First."}"#), (200, #"{"text":"Second."}"#)])
        await model.retry(model.waiting.map(\.id))
        #expect(model.state == .words("First.\n\nSecond."))
        #expect(sink.copied.last == "First.\n\nSecond.")
        #expect(model.waiting.isEmpty)
        #expect(model.message == "Done: 2 takes. Their words are above and on your clipboard.")
    }

    @Test func aRetryThatFailsAgainUpdatesTheReason() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        provider.answer([(401, "{}")])
        await model.retry(model.waiting.map(\.id))
        #expect(model.waiting.first?.failure == TakeFailure(kind: "auth", detail: "http 401"))
        #expect(model.message == "Still could not transcribe. The reason is updated below; the audio stays until you retry or discard it.")
        #expect(sink.copied.isEmpty)
    }

    @Test func aRetryThatHearsNothingSaysSo() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        provider.answer([(200, #"{"text":"Thank you."}"#)])
        await model.retry(model.waiting.map(\.id))
        #expect(model.waiting.first?.failure == .noSpeech)
    }

    /// Discard turns into delete audio?, and the second tap of a quick
    /// double tap never deletes.
    @Test func discardAsksFirstAndIgnoresADoubleTap() async throws {
        let model = model(FakeProvider([(503, "{}")]))
        await take(model)
        let id = try #require(model.waiting.first?.id)
        model.discard(id)
        #expect(model.armed == id)
        pass(0.2)
        model.discard(id)
        #expect(model.waiting.count == 1)
        pass(0.4)
        model.discard(id)
        #expect(model.waiting.isEmpty)
        #expect(model.armed == nil)
    }

    @Test func leavingMidTakeKeepsAndSendsNothing() async {
        let provider = FakeProvider.says("hello")
        let model = model(provider)
        await model.start()
        model.cancel()
        #expect(model.state == .idle)
        #expect(provider.requests.isEmpty)
        #expect(model.waiting.isEmpty)
    }

    @Test func aRetryWaitsWhileATakeRecords() async {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        await model.start()
        await model.retry(model.waiting.map(\.id))
        #expect(provider.requests.count == 2)
        #expect(model.isRecording)
    }

    /// The take reads today's provider choice each time.
    @Test func aTakeUsesTheChosenProvider() async throws {
        var settings = ConnectionStore(defaults: defaults).load(catalog: catalog)
        settings.transcription.baseUrl = "https://api.openai.com/v1"
        settings.transcription.sttModel = "gpt-transcribe"
        ConnectionStore(defaults: defaults).save(settings)
        try ring.save(try #require(APIKey("sk-openaiopenai2222")), for: "https://api.openai.com/v1")
        let provider = FakeProvider.says("hello there")
        let model = model(provider)
        await take(model)
        let request = try #require(provider.requests.first)
        #expect(request.url?.absoluteString == "https://api.openai.com/v1/audio/transcriptions")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer sk-openaiopenai2222")
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'ScriptedMicrophone' in scope` and `type 'BundledRules' has no member 'takeRules'`.

- [ ] **Step 3: Write the scripted microphone, the rules loader, and the model**

`ios/App/Smoke/ScriptedMicrophone.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// A stand-in microphone for the smoke and the tests: it hands back the
// samples it was given, so a take runs end to end with no hardware.
import Foundation
import MurmurCore

@MainActor final class ScriptedMicrophone: Microphone {
    var allowed = true
    var startError: (any Error)?
    var samples: [Float]
    private(set) var asked = 0
    private(set) var started = 0

    init(samples: [Float] = []) {
        self.samples = samples
    }

    func allow() async -> Bool {
        asked += 1
        return allowed
    }

    func start() throws {
        if let startError { throw startError }
        started += 1
    }

    func stop() -> [Float] { samples }

    /// A second of a 220 Hz tone at speaking level between half seconds
    /// of silence, at 16 kHz.
    nonisolated static let tone: [Float] = {
        let rate = Double(Wav.targetSampleRate)
        let quiet = [Float](repeating: 0, count: Wav.targetSampleRate / 2)
        let voiced = (0..<Wav.targetSampleRate).map { Float(0.3 * sin(2 * Double.pi * 220 * Double($0) / rate)) }
        return quiet + voiced + quiet
    }()

    /// Two seconds of nothing.
    nonisolated static let silence = [Float](repeating: 0, count: Wav.targetSampleRate * 2)
}
```

`ios/App/Settings/ConnectionStore.swift` in full, with `BundledRules` now reading any shared file through one helper:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Where the provider choices live between launches: the app's own
// defaults, never the app group, since the keyboard makes no requests
// (ios/prd.json conventions.privacy). Base URLs and model ids only; the
// key stays in the key ring.
import Foundation
import MurmurCore

struct ConnectionStore {
    static let defaultsKey = "connection"
    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The saved choices, or the catalog's defaults when there are none
    /// or they no longer read.
    func load(catalog: ProviderCatalog) -> ConnectionSettings {
        guard let data = defaults.data(forKey: Self.defaultsKey),
              let saved = try? JSONDecoder().decode(ConnectionSettings.self, from: data)
        else { return ConnectionSettings(defaultsFrom: catalog) }
        return saved
    }

    func save(_ settings: ConnectionSettings) {
        defaults.set(try? JSONEncoder().encode(settings), forKey: Self.defaultsKey)
    }
}

enum BundledRules {
    /// The rule files the build copied into the app (shared/).
    private static func shared() throws -> SharedData {
        guard let directory = Bundle.main.url(forResource: "shared", withExtension: nil) else {
            throw SharedDataError.missing("shared")
        }
        return SharedData(directory: directory)
    }

    static func catalog() throws -> ProviderCatalog {
        try shared().decode(ProviderCatalog.self, from: "provider-catalog.json")
    }

    /// The speech gate's numbers and the phrases models invent on silence.
    static func takeRules() throws -> TakeRules {
        let shared = try shared()
        return TakeRules(
            gate: try shared.decode(SpeechGateSpec.self, from: "speech-gate.json"),
            hallucinations: try shared.decode(HallucinationList.self, from: "hallucinations.json")
        )
    }
}
```

`ios/App/Takes/TakeModel.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// One take in the app (ios/prd.json IOS-006): record, keep silence from
// typing, send one WAV to the chosen provider, and show the words, Heard
// nothing, or why it failed. A failed take waits with its audio for a
// retry, as on desktop (src/main/retry.ts): one thing runs at a time, and
// a take's audio goes only once its words are safe.
import Foundation
import MurmurCore

/// The shared rules a take runs on, read once from the app bundle.
struct TakeRules: Sendable {
    let gate: SpeechGateSpec
    let hallucinations: HallucinationList
}

@Observable @MainActor final class TakeModel {
    enum State: Equatable {
        case idle
        case recording(since: Date)
        case transcribing
        case words(String)
        /// sent is false when the gate stopped it before upload.
        case heardNothing(sent: Bool)
        /// saved is false when even the audio could not be kept.
        case failed(TakeFailure, saved: Bool)
        case micOff
        case micFailed
    }

    /// Two taps closer together than this are one double tap.
    static let doubleTap: TimeInterval = 0.5

    private(set) var state: State = .idle
    private(set) var waiting: [WaitingTake] = []
    /// The waiting takes a retry is running through, or empty.
    private(set) var retrying: [String] = []
    /// The waiting take whose Discard now asks delete audio?
    private(set) var armed: String?
    private(set) var message: String?

    @ObservationIgnored private var starting = false
    @ObservationIgnored private var armedAt = Date.distantPast
    @ObservationIgnored private let microphone: any Microphone
    @ObservationIgnored private let store: WaitingStore
    @ObservationIgnored private let rules: TakeRules
    @ObservationIgnored private let catalog: ProviderCatalog
    @ObservationIgnored private let connections: ConnectionStore
    @ObservationIgnored private let ring: any KeyRing
    @ObservationIgnored private let send: ConnectionTest.Send
    @ObservationIgnored private let copy: @MainActor (String) -> Void
    @ObservationIgnored private let now: @MainActor () -> Date

    init(
        microphone: any Microphone, store: WaitingStore, rules: TakeRules, catalog: ProviderCatalog,
        connections: ConnectionStore, ring: any KeyRing, send: @escaping ConnectionTest.Send,
        copy: @escaping @MainActor (String) -> Void, now: @escaping @MainActor () -> Date = { .now }
    ) {
        self.microphone = microphone
        self.store = store
        self.rules = rules
        self.catalog = catalog
        self.connections = connections
        self.ring = ring
        self.send = send
        self.copy = copy
        self.now = now
        waiting = store.list()
    }

    var isRecording: Bool {
        state.isRecording
    }

    /// Transcribing or retrying: one thing at a time.
    var isBusy: Bool {
        state == .transcribing || !retrying.isEmpty
    }

    func toggle() async {
        if isRecording { await stop() } else { await start() }
    }

    func start() async {
        guard !starting, !isRecording, !isBusy else { return }
        starting = true
        defer { starting = false }
        message = nil
        armed = nil
        guard await microphone.allow() else {
            state = .micOff
            return
        }
        do {
            try microphone.start()
            state = .recording(since: now())
        } catch {
            state = .micFailed
        }
    }

    func stop() async {
        guard case .recording(let since) = state else { return }
        let samples = microphone.stop()
        guard let wav = TakeAudio.upload(samples, gate: rules.gate) else {
            state = .heardNothing(sent: false)
            return
        }
        state = .transcribing
        switch await words(for: wav) {
        case .success(let words):
            state = words.map(State.words) ?? .heardNothing(sent: true)
        case .failure(let failure):
            let saved = (try? store.save(wav, startedAt: since, failure: failure, now: now())) != nil
            waiting = store.list()
            state = .failed(failure, saved: saved)
        }
    }

    /// Leaving the screen mid-take drops the take: nothing is kept or sent.
    func cancel() {
        guard isRecording else { return }
        _ = microphone.stop()
        state = .idle
    }

    /// Runs the waiting takes one at a time through today's provider.
    /// Their words show here and go to the clipboard, so a retried take is
    /// safe before its audio is deleted.
    func retry(_ ids: [String]) async {
        guard !ids.isEmpty, !isRecording, !isBusy else { return }
        retrying = ids
        message = nil
        armed = nil
        defer { retrying = [] }
        var delivered: [String] = []
        var failed = 0
        for id in ids {
            guard let audio = try? store.audio(id) else { continue }
            switch await words(for: audio) {
            case .success(.some(let words)):
                delivered.append(words)
                copy(delivered.joined(separator: "\n\n"))
                try? store.remove(id)
            case .success(.none):
                try? store.markFailed(id, .noSpeech)
                failed += 1
            case .failure(let failure):
                try? store.markFailed(id, failure)
                failed += 1
            }
            waiting = store.list()
        }
        if !delivered.isEmpty { state = .words(delivered.joined(separator: "\n\n")) }
        message = TakeCopy.retried(delivered: delivered.count, failed: failed)
    }

    /// The first tap asks delete audio?, and a later tap deletes. The
    /// second tap of a quick double tap is ignored.
    func discard(_ id: String) {
        guard !isBusy else { return }
        guard armed == id else {
            armed = id
            armedAt = now()
            message = nil
            return
        }
        guard now().timeIntervalSince(armedAt) >= Self.doubleTap else { return }
        armed = nil
        do {
            try store.remove(id)
        } catch {
            message = "murmur could not delete that recording. Try again."
        }
        waiting = store.list()
    }

    /// The words, nil when the provider heard only silence, or why it failed.
    private func words(for wav: Data) async -> Result<String?, TakeFailure> {
        let settings = connections.load(catalog: catalog)
        let baseUrl = settings.transcription.baseUrl
        guard let key = (try? ring.key(for: baseUrl)) ?? nil else { return .failure(.noKey) }
        switch await Transcription.run(wav: wav, baseUrl: baseUrl, model: settings.transcription.sttModel, key: key, send: send) {
        case .words(let text):
            return .success(TakeAudio.heard(text, list: rules.hallucinations))
        case .failed(let kind, let detail):
            return .failure(TakeFailure(kind: kind.rawValue, detail: detail))
        }
    }
}

extension TakeModel.State {
    var isRecording: Bool {
        if case .recording = self { true } else { false }
    }

    /// Something to show under the button: words, Heard nothing, or a failure.
    var hasResult: Bool {
        switch self {
        case .idle, .recording, .transcribing: false
        default: true
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `TakeModelTests` passes (16 tests).

- [ ] **Step 5: Commit**

```bash
git add ios/App/Takes/TakeModel.swift ios/App/Smoke/ScriptedMicrophone.swift ios/App/Settings/ConnectionStore.swift ios/AppTests/TakeModelTests.swift
git commit -m "IOS-006: a take records, keeps silence from typing, and waits for a retry when it fails"
```

### Task 6: The Dictate screen

**Files:**
- Create: `ios/App/Takes/TakeCopy.swift`, `ios/App/Takes/TakeScreen.swift`
- Modify: `ios/App/ContentView.swift`
- Test: `ios/AppTests/TakeCopyTests.swift`

**Interfaces:**
- Consumes: Task 5's model; `RowAction`, `Note`, and `SectionTitle` (IOS-005); `Tokens`.
- Produces: `TakeCopy` (`reason`, `remedy`, `heardNothing(sent:)`, `micOff`, `micFailed`, `lostAudio`, `waitingIntro`, `retried(delivered:failed:)`, `when`, `length`); `TakeScreen`, `TakeRoute`, `TakeModel.live()`, and the `TakePreview` previews.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@Suite struct TakeCopyTests {
    /// Every kind a take can fail with has its own plain reason.
    @Test func everyFailureHasItsOwnReason() {
        let kinds = TranscriptionFailure.allCases.map(\.rawValue) + ["nospeech"]
        let reasons = kinds.map { TakeCopy.reason(TakeFailure(kind: $0, detail: "")) } + [TakeCopy.reason(.noKey)]
        #expect(Set(reasons).count == reasons.count)
        #expect(!reasons.contains(TakeCopy.reason(TakeFailure(kind: "something new", detail: ""))))
    }

    @Test func noKeyIsNotARejectedKey() {
        #expect(TakeCopy.reason(.noKey) == "No API key is saved for your provider.")
        #expect(TakeCopy.reason(TakeFailure(kind: "auth", detail: "http 401")) == "Your provider did not accept the key.")
    }

    @Test func aLengthReadsLikeDesktops() {
        #expect(TakeCopy.length(400) == "1s")
        #expect(TakeCopy.length(4_400) == "4s")
        #expect(TakeCopy.length(75_000) == "1m 15s")
    }

    @Test func aRetrySaysWhatHappened() {
        #expect(TakeCopy.retried(delivered: 1, failed: 0) == "Done: the words are above and on your clipboard.")
        #expect(TakeCopy.retried(delivered: 2, failed: 1) == "2 transcribed and on your clipboard, 1 still waiting.")
        #expect(TakeCopy.retried(delivered: 0, failed: 2).hasPrefix("Still could not transcribe."))
    }

    /// The product name stays lowercase even where a sentence starts.
    @Test func murmurStaysLowercase() {
        let kinds = TranscriptionFailure.allCases.map(\.rawValue) + ["nospeech", "other"]
        let words = kinds.map { TakeCopy.reason(TakeFailure(kind: $0, detail: "")) }
            + [TakeCopy.heardNothing(sent: true), TakeCopy.heardNothing(sent: false), TakeCopy.micOff, TakeCopy.micFailed, TakeCopy.lostAudio, TakeCopy.waitingIntro]
        for line in words {
            #expect(!line.contains("Murmur"))
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'TakeCopy' in scope`.

- [ ] **Step 3: Write the copy, the screen, and the Dictate row**

`ios/App/Takes/TakeCopy.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The take screen's words, in one place: plain, sentence case, and for
// every failure what happened and what to do (ios/prd.json
// conventions.design). The reasons follow desktop's waiting list.
import Foundation

enum TakeCopy {
    /// Why a take is waiting, as a sentence.
    static func reason(_ failure: TakeFailure?) -> String {
        guard let failure else { return "murmur lost the reason for this one." }
        switch failure.kind {
        case "auth" where failure == .noKey: return "No API key is saved for your provider."
        case "auth": return "Your provider did not accept the key."
        case "network": return "murmur could not reach your provider."
        case "timeout": return "Your provider did not answer in time."
        case "server": return "Your provider had a problem on its end."
        case "badrequest": return "Your provider refused the audio or the model name."
        case "nospeech": return "No speech was heard in it."
        default: return "Something went wrong."
        }
    }

    /// What to do about it, after the reason.
    static func remedy(_ failure: TakeFailure) -> String {
        switch failure.kind {
        case "auth": return "Check Provider and key, then retry it below."
        case "badrequest": return "Check the model in Provider and key, then retry it below."
        default: return "It is saved below, so you can retry it."
        }
    }

    static func heardNothing(sent: Bool) -> String {
        sent
            ? "Your provider heard only silence, so murmur kept nothing."
            : "murmur heard no speech, so it sent nothing. Speak a little closer, then try again."
    }

    static let micOff = "Turn on Microphone for murmur in Settings, then try again."
    static let micFailed = "The microphone did not start. If another app is using it, close that app, then try again."
    static let lostAudio = "murmur could not save the audio either, so this take is gone."
    static let waitingIntro = "Recorded but not transcribed. The audio stays on this iPhone until you retry or discard it."

    /// What a retry says when it is done, as desktop's waiting list does.
    static func retried(delivered: Int, failed: Int) -> String {
        switch (delivered, failed) {
        case (0, _): "Still could not transcribe. The reason is updated below; the audio stays until you retry or discard it."
        case (1, 0): "Done: the words are above and on your clipboard."
        case (_, 0): "Done: \(delivered) takes. Their words are above and on your clipboard."
        default: "\(delivered) transcribed and on your clipboard, \(failed) still waiting."
        }
    }

    /// When and how long, for a waiting take's row.
    static func when(_ take: WaitingTake, now: Date = .now) -> String {
        let time = take.savedAt.formatted(date: .omitted, time: .shortened)
        let day = Calendar.current.isDate(take.savedAt, inSameDayAs: now) ? "Today" : take.savedAt.formatted(.dateTime.month(.abbreviated).day())
        return "\(day) \(time), \(length(take.audioMs))"
    }

    static func length(_ ms: Int) -> String {
        let seconds = max(1, Int((Double(ms) / 1000).rounded()))
        return seconds < 60 ? "\(seconds)s" : "\(seconds / 60)m \(seconds % 60)s"
    }
}
```

`ios/App/Takes/TakeScreen.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The take screen (ios/prd.json IOS-006): one button to talk, the words
// or Heard nothing or what went wrong, and the takes waiting to retry.
// A quiet stand-in until the pill (IOS-010) and Home (IOS-012) arrive.
import MurmurCore
import SwiftUI
import UIKit

struct TakeScreen: View {
    @State var model: TakeModel

    var body: some View {
        List {
            Section {
                TakeButton(model: model)
            }
            .listRowBackground(Tokens.panel)

            if model.state.hasResult {
                Section {
                    TakeResult(state: model.state)
                }
                .listRowBackground(Tokens.panel)
            }

            if !model.waiting.isEmpty || model.message != nil {
                WaitingSection(model: model)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Dictate")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { model.cancel() }
    }
}

/// Start a take, and stop it: red to record, amber while live.
struct TakeButton: View {
    let model: TakeModel
    @ScaledMetric(relativeTo: .largeTitle) private var size: CGFloat = 72

    var body: some View {
        Button {
            Task { await model.toggle() }
        } label: {
            VStack(spacing: 12) {
                Image(systemName: model.isRecording ? "stop.circle" : "record.circle")
                    .font(.system(size: size))
                    .foregroundStyle(model.isRecording ? Tokens.amber : Tokens.red)
                    .accessibilityHidden(true)
                status
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.vertical, 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(model.isBusy)
        .opacity(model.isBusy ? 0.5 : 1)
        .accessibilityLabel(model.isRecording ? "Stop the take" : "Start a take")
    }

    @ViewBuilder private var status: some View {
        switch model.state {
        case .recording(let since):
            TimelineView(.periodic(from: since, by: 1)) { context in
                HStack(spacing: 8) {
                    Circle().fill(Tokens.amber).frame(width: 8, height: 8)
                    Text("Recording \(Self.elapsed(since, context.date))").monospacedDigit()
                }
                .font(.headline)
            }
        case .transcribing:
            HStack(spacing: 8) {
                ProgressView()
                Text("Transcribing…")
            }
            .font(.headline)
        default:
            Text("Start a take").font(.headline)
        }
    }

    static func elapsed(_ since: Date, _ now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(since)))
        return "\(seconds / 60):" + String(format: "%02d", seconds % 60)
    }
}

/// What the last take gave: its words, Heard nothing, or what went wrong.
struct TakeResult: View {
    let state: TakeModel.State

    var body: some View {
        switch state {
        case .words(let words):
            Text(words)
                .textSelection(.enabled)
                .announced(words)
            Button("Copy words") { UIPasteboard.general.string = words }
                .buttonStyle(RowAction())
        case .heardNothing(let sent):
            Outcome(title: "Heard nothing", detail: TakeCopy.heardNothing(sent: sent), color: Tokens.textDim, symbol: "waveform.slash")
        case .failed(let failure, let saved):
            Outcome(title: "Not transcribed", detail: "\(TakeCopy.reason(failure)) \(saved ? TakeCopy.remedy(failure) : TakeCopy.lostAudio)", color: Tokens.red, symbol: "xmark.circle")
        case .micOff:
            Outcome(title: "murmur cannot hear you", detail: TakeCopy.micOff, color: Tokens.red, symbol: "mic.slash")
            if let settings = URL(string: UIApplication.openSettingsURLString) {
                Link("Open Settings", destination: settings)
                    .buttonStyle(RowAction())
            }
        case .micFailed:
            Outcome(title: "The microphone did not start", detail: TakeCopy.micFailed, color: Tokens.red, symbol: "mic.slash")
        case .idle, .recording, .transcribing:
            EmptyView()
        }
    }
}

/// A title in its color and the sentence under it, heard by VoiceOver as
/// soon as it lands.
struct Outcome: View {
    let title: String
    let detail: String
    let color: Color
    let symbol: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: symbol)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(color)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Tokens.text)
            }
        }
        .accessibilityElement(children: .combine)
        .announced("\(title). \(detail)")
    }
}

extension View {
    /// VoiceOver hears the words as soon as they appear.
    func announced(_ words: String) -> some View {
        onAppear { AccessibilityNotification.Announcement(words).post() }
    }
}

/// Takes waiting to retry: Retry, Retry all, and Discard, which asks
/// delete audio? in red before it deletes.
struct WaitingSection: View {
    let model: TakeModel

    var body: some View {
        Section {
            if let message = model.message {
                Text(message)
                    .font(.subheadline)
                    .announced(message)
            }
            if model.waiting.count > 1 {
                Button(model.retrying.count > 1 ? "Retrying…" : "Retry all") {
                    Task { await model.retry(model.waiting.map(\.id)) }
                }
                .buttonStyle(RowAction())
                .disabled(model.isBusy || model.isRecording)
            }
            ForEach(model.waiting) { take in
                WaitingRow(take: take, model: model)
            }
        } header: {
            SectionTitle("Waiting to retry")
        } footer: {
            if !model.waiting.isEmpty {
                Text(TakeCopy.waitingIntro).foregroundStyle(Tokens.textDim)
            }
        }
        .listRowBackground(Tokens.panel)
    }
}

struct WaitingRow: View {
    let take: WaitingTake
    let model: TakeModel
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(TakeCopy.when(take)).font(.subheadline.weight(.semibold))
                Text(TakeCopy.reason(take.failure)).font(.subheadline).foregroundStyle(Tokens.textDim)
            }
            .accessibilityElement(children: .combine)
            // At accessibility sizes the two actions stack, so neither clips.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    retry
                    discard
                }
            } else {
                HStack {
                    retry
                    Spacer()
                    discard
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var retry: some View {
        Button(model.retrying.contains(take.id) ? "Retrying…" : "Retry") {
            Task { await model.retry([take.id]) }
        }
        .buttonStyle(InlineAction(color: Tokens.brand))
        .disabled(model.isBusy || model.isRecording)
    }

    private var discard: some View {
        let armed = model.armed == take.id
        return Button(armed ? "Delete audio?" : "Discard") { model.discard(take.id) }
            .buttonStyle(InlineAction(color: armed ? Tokens.red : Tokens.textDim))
            .disabled(model.isBusy)
            .accessibilityHint(armed ? "Tap again to delete this recording." : "")
    }
}

/// A short action that shares its row with another, so each keeps its
/// own tap target of at least 44 points.
struct InlineAction: ButtonStyle {
    let color: Color
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isEnabled ? color : Tokens.textDim)
            .opacity(configuration.isPressed ? 0.6 : 1)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

extension TakeModel {
    /// The real screen: the device microphone, today's provider and key,
    /// and a session that keeps no cookies or cache.
    static func live() -> TakeModel? {
        guard let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules() else { return nil }
        let session = URLSession(configuration: .ephemeral)
        return TakeModel(
            microphone: DeviceMicrophone(), store: .standard, rules: rules, catalog: catalog,
            connections: ConnectionStore(), ring: KeychainKeyRing(), send: { try await session.data(for: $0) },
            copy: { UIPasteboard.general.string = $0 }
        )
    }
}

/// Opens the take screen, built once the shared rules are read.
struct TakeRoute: View {
    @State private var model: TakeModel?
    @State private var failed = false

    var body: some View {
        Group {
            if let model {
                TakeScreen(model: model)
            } else if failed {
                Note(text: "murmur could not read its rules. Reinstall murmur to fix it.", color: Tokens.red, symbol: "exclamationmark.triangle")
                    .padding()
            }
        }
        .task {
            guard model == nil else { return }
            model = TakeModel.live()
            failed = model == nil
        }
    }
}

#if DEBUG
#Preview("Ready") { TakePreview(.ready) }
#Preview("Recording") { TakePreview(.recording) }
#Preview("Words") { TakePreview(.words) }
#Preview("Heard nothing") { TakePreview(.silence) }
#Preview("Provider heard silence") { TakePreview(.inventedPhrase) }
#Preview("Failed and waiting") { TakePreview(.failed) }
#Preview("Delete audio?") { TakePreview(.armed) }
#Preview("No microphone") { TakePreview(.micOff) }

/// The take screen in one of its states, driven by a scripted microphone
/// and a stand-in provider, so nothing records or leaves the Mac.
struct TakePreview: View {
    enum Scene { case ready, recording, words, silence, inventedPhrase, failed, armed, micOff }

    let scene: Scene
    @State private var model: TakeModel?

    init(_ scene: Scene) { self.scene = scene }

    var body: some View {
        NavigationStack {
            if let model { TakeScreen(model: model) }
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task { model = await Self.model(for: scene) }
    }

    static func model(for scene: Scene) async -> TakeModel? {
        guard let rules = try? BundledRules.takeRules(), let catalog = try? BundledRules.catalog(),
              let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate),
              let defaults = UserDefaults(suiteName: "murmur.previews.\(UUID().uuidString)")
        else { return nil }
        let microphone = ScriptedMicrophone(samples: scene == .silence ? ScriptedMicrophone.silence : ScriptedMicrophone.tone)
        microphone.allowed = scene != .micOff
        let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "murmur-previews-\(UUID().uuidString)", directoryHint: .isDirectory))
        if scene == .failed || scene == .armed {
            _ = try? store.save(wav, startedAt: .now.addingTimeInterval(-600), failure: TakeFailure(kind: "timeout", detail: "no response in 30 s"), now: .now.addingTimeInterval(-590))
            _ = try? store.save(wav, startedAt: .now.addingTimeInterval(-300), failure: .noKey, now: .now.addingTimeInterval(-290))
        }
        let ring = MemoryKeyRing()
        if let key = APIKey("gsk_previewpreview1234") { try? ring.save(key, for: "https://api.groq.com/openai/v1") }
        let status = scene == .failed ? 503 : 200
        let words = scene == .inventedPhrase ? "Thank you." : "Send the invoice to Dana tomorrow morning, and copy the team on the thread."
        let model = TakeModel(
            microphone: microphone, store: store, rules: rules, catalog: catalog, connections: ConnectionStore(defaults: defaults), ring: ring,
            send: { request in
                let body = Data(#"{"text":"\#(words)"}"#.utf8)
                return (body, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            },
            copy: { _ in }
        )
        switch scene {
        case .words, .silence, .inventedPhrase, .failed:
            await model.start()
            await model.stop()
        case .recording, .micOff:
            await model.start()
        case .armed:
            if let id = model.waiting.first?.id { model.discard(id) }
        case .ready:
            break
        }
        return model
    }
}
#endif
```

`ios/App/ContentView.swift` in full:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI

/// A quiet placeholder until Home (IOS-012) replaces it: the way to a
/// take and to the Provider screen, and nothing else.
struct ContentView: View {
    var body: some View {
        NavigationStack {
            List {
                Group {
                    NavigationLink("Dictate") { TakeRoute() }
                    NavigationLink("Provider and key") { ProviderRoute() }
                }
                .listRowBackground(Tokens.panel)
            }
            .scrollContentBackground(.hidden)
            .background(Tokens.ink)
            .foregroundStyle(Tokens.text)
            .navigationTitle("murmur")
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView()
}
```

- [ ] **Step 4: Run them to see them pass, and check the build is clean**

Run: `npm run ios:test`, then read the result bundle, and `npm run test` for the header and design lints.
Expected: 71 app tests pass, the build log has no `warning:` from `ios/App`, and `npm run test` passes 845.

- [ ] **Step 5: Commit**

```bash
git add ios/App/Takes/TakeCopy.swift ios/App/Takes/TakeScreen.swift ios/App/ContentView.swift ios/AppTests/TakeCopyTests.swift
git commit -m "IOS-006: the Dictate screen shows the words, Heard nothing, or what went wrong, and the takes waiting to retry"
```

### Task 7: The smoke

**Files:**
- Modify: `ios/App/Smoke/SmokeRunner.swift` (three checks), `ios/App/Smoke/StubProtocol.swift` (words and down hosts)

**Interfaces:**
- Consumes: Tasks 1 to 3 and `ScriptedMicrophone.tone` and `.silence` (Task 5).
- Produces: smoke checks `speechGate`, `transcription`, and `waitingTakes`; `StubProtocol.wordsBaseUrl`, `downBaseUrl`, and `words`.

- [ ] **Step 1: Write the failing checks**

`ios/App/Smoke/SmokeRunner.swift` in full:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The headless smoke (npm run ios:smoke): launched with --smoke, the app
// runs every subsystem check, prints one SMOKE_RESULT line, and exits.
// The same contract as desktop's smoke: {"ok": Bool, "checks": {name: Bool}},
// and a failed check explains itself on a line starting "smoke <name>:".
import Foundation
import MurmurCore
import Synchronization

struct SmokeRequest: Equatable {
    /// How many shared rule files the build bundled; -1 when not given,
    /// which no real count matches.
    let sharedCount: Int

    /// Nil unless the app was launched with --smoke.
    init?(arguments: [String]) {
        guard arguments.contains("--smoke") else { return nil }
        let prefix = "--shared-count="
        sharedCount = arguments.lazy
            .filter { $0.hasPrefix(prefix) }
            .compactMap { Int($0.dropFirst(prefix.count)) }
            .first ?? -1
    }
}

struct SmokeFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

enum SmokeRunner {
    static func runAndExit(_ request: SmokeRequest) -> Never {
        let checks: [(name: String, run: () throws -> Void)] = [
            ("appGroup", checkAppGroup),
            ("keychain", checkKeychain),
            ("keyRing", checkKeyRing),
            ("connectionTest", checkConnectionTest),
            ("speechGate", checkSpeechGate),
            ("transcription", checkTranscription),
            ("waitingTakes", checkWaitingTakes),
            ("sharedJson", { try checkSharedJson(expected: request.sharedCount) })
        ]
        var results: [String: Bool] = [:]
        for check in checks {
            do {
                try check.run()
                results[check.name] = true
            } catch {
                results[check.name] = false
                emit("smoke \(check.name): \(error)")
            }
        }
        let ok = results.values.allSatisfy { $0 }
        let payload: [String: Any] = ["ok": ok, "checks": results]
        let json = (try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])) ?? Data()
        emit("SMOKE_RESULT " + String(decoding: json, as: UTF8.self))
        exit(ok ? 0 : 1)
    }

    /// Unbuffered, so nothing is lost when the app exits right after.
    private static func emit(_ line: String) {
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }

    static func checkAppGroup() throws {
        guard let container = AppGroup.containerURL else {
            throw SmokeFailure("no container for \(AppGroup.identifier)")
        }
        let probe = container.appendingPathComponent("smoke-\(UUID().uuidString).txt")
        defer { try? FileManager.default.removeItem(at: probe) }
        try Data("murmur smoke".utf8).write(to: probe)
        let back = try String(contentsOf: probe, encoding: .utf8)
        guard back == "murmur smoke" else { throw SmokeFailure("read back \(back)") }
    }

    static func checkKeychain() throws {
        let store = KeychainStore(service: "com.lbwalton.murmur.ios.smoke")
        let account = "smoke"
        defer { try? store.delete(account: account) }
        try store.save("not-a-real-key", account: account)
        guard try store.read(account: account) == "not-a-real-key" else {
            throw SmokeFailure("read back a different value")
        }
        try store.delete(account: account)
        guard try store.read(account: account) == nil else {
            throw SmokeFailure("delete left the item behind")
        }
    }

    /// A dummy key through the key ring: saved, read back, filed in the
    /// app's own Keychain access group (never the app group, which the
    /// keyboard can read), kept out of the app's defaults, and deleted.
    static func checkKeyRing() throws {
        let ring = KeychainKeyRing()
        let url = "https://smoke.invalid/v1/"
        defer { try? ring.remove(for: url) }
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        try ring.save(key, for: url)
        guard try ring.key(for: "https://smoke.invalid/v1") == key else {
            throw SmokeFailure("read back a different key")
        }
        let group = try ring.store.accessGroup(account: BaseURL.normalized(url)) ?? ""
        guard group != AppGroup.identifier, group.hasSuffix("." + (Bundle.main.bundleIdentifier ?? "?")) else {
            throw SmokeFailure("the key sits in access group \(group)")
        }
        guard !"\(UserDefaults.standard.dictionaryRepresentation())".contains(key.secret) else {
            throw SmokeFailure("the key reached the app's defaults")
        }
        try ring.remove(for: url)
        guard try ring.key(for: url) == nil else { throw SmokeFailure("remove left the key behind") }
    }

    /// Test connection against the local stand-in, once for each answer.
    static func checkConnectionTest() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let session = StubProtocol.session()
        for answer in StubProtocol.Answer.allCases {
            let verdict = waitFor { await ConnectionTest.run(baseUrl: answer.baseUrl, key: key, send: { try await session.data(for: $0) }) }
            guard verdict == answer.expected else {
                throw SmokeFailure("\(answer.rawValue) gave \(verdict), expected \(answer.expected)")
            }
        }
    }

    /// A generated tone passes the speech gate and a generated silence
    /// does not; a phrase models invent on silence is heard as nothing.
    static func checkSpeechGate() throws {
        let rules = try BundledRules.takeRules()
        guard TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) != nil else {
            throw SmokeFailure("the tone did not pass the gate")
        }
        guard TakeAudio.upload(ScriptedMicrophone.silence, gate: rules.gate) == nil else {
            throw SmokeFailure("silence passed the gate")
        }
        guard TakeAudio.heard("Thank you.", list: rules.hallucinations) == nil,
              TakeAudio.heard("Send the invoice tomorrow.", list: rules.hallucinations) != nil
        else { throw SmokeFailure("the hallucination filter misjudged a transcript") }
    }

    /// A take, gated and encoded, goes to the local stand-in through the
    /// real URLSession, and its words come back.
    static func checkTranscription() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let rules = try BundledRules.takeRules()
        guard let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) else { throw SmokeFailure("the tone did not pass the gate") }
        let session = StubProtocol.session()
        let result = waitFor { await Transcription.run(wav: wav, baseUrl: StubProtocol.wordsBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard case .words(let text) = result, TakeAudio.heard(text, list: rules.hallucinations) == StubProtocol.words else {
            throw SmokeFailure("the stand-in gave \(result)")
        }
    }

    /// A take that fails waits in a scratch folder with protection that
    /// allows writing after first unlock, then a retry delivers it and its
    /// audio goes.
    static func checkWaitingTakes() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "smoke-waiting-\(UUID().uuidString)", directoryHint: .isDirectory))
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let rules = try BundledRules.takeRules()
        guard let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) else { throw SmokeFailure("the tone did not pass the gate") }
        let session = StubProtocol.session()
        let down = waitFor { await Transcription.run(wav: wav, baseUrl: StubProtocol.downBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard case .failed(let kind, let detail) = down, kind == .server else { throw SmokeFailure("the down host gave \(down)") }
        let id = try store.save(wav, startedAt: .now, failure: TakeFailure(kind: kind.rawValue, detail: detail))
        guard store.list().map(\.id) == [id], store.take(id)?.failure?.kind == "server" else { throw SmokeFailure("the failed take did not list") }
        let protection = try store.directory.appending(path: "\(id).wav").resourceValues(forKeys: [.fileProtectionKey]).fileProtection
        guard protection == .completeUntilFirstUserAuthentication else { throw SmokeFailure("the audio has protection \(String(describing: protection))") }
        let audio = try store.audio(id)
        let retried = waitFor { await Transcription.run(wav: audio, baseUrl: StubProtocol.wordsBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard retried == .words(StubProtocol.words) else { throw SmokeFailure("the retry gave \(retried)") }
        try store.remove(id)
        guard store.list().isEmpty else { throw SmokeFailure("the delivered take is still waiting") }
    }

    /// Runs async work to the end from the smoke's synchronous start.
    private static func waitFor<T: Sendable>(_ work: @escaping @Sendable () async -> T) -> T {
        let result = Mutex<T?>(nil)
        let done = DispatchSemaphore(value: 0)
        Task.detached {
            let value = await work()
            result.withLock { $0 = value }
            done.signal()
        }
        done.wait()
        guard let value = result.withLock({ $0 }) else { preconditionFailure("the work signaled without a value") }
        return value
    }

    static func checkSharedJson(expected: Int) throws {
        guard let directory = Bundle.main.url(forResource: "shared", withExtension: nil) else {
            throw SmokeFailure("no shared folder in the app bundle")
        }
        let names = try SharedData(directory: directory).validateAll()
        guard names.count == expected else {
            throw SmokeFailure("bundled \(names.count) shared rules, expected \(expected)")
        }
    }
}
```

- [ ] **Step 2: Run the smoke to see it fail**

Run: `npm run ios:smoke`
Expected: the build fails with `type 'StubProtocol' has no member 'wordsBaseUrl'`.

- [ ] **Step 3: Give the stand-in its transcription hosts**

`ios/App/Smoke/StubProtocol.swift` in full:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// A local stand-in provider for the smoke (ios/prd.json IOS-005, IOS-006):
// it answers Test connection and transcriptions inside the app, through
// the real URLSession, without a network or a server.
import Foundation
import MurmurCore

final class StubProtocol: URLProtocol {
    /// One stand-in host for each answer Test connection can give.
    enum Answer: String, CaseIterable {
        case works, rejected, offline, message

        var baseUrl: String { "https://\(rawValue).stub.invalid/v1" }

        var expected: ConnectionVerdict {
            switch self {
            case .works: .works
            case .rejected: .keyRejected(status: 401)
            case .offline: .noConnection
            case .message: .providerMessage("Model overloaded")
            }
        }
    }

    /// The transcription stand-ins: one that hears words, one that is down.
    static let wordsBaseUrl = "https://words.stub.invalid/v1"
    static let downBaseUrl = "https://down.stub.invalid/v1"

    /// What the words host hears when a whole take reaches it.
    static let words = "smoke words from the stand-in"

    /// The only key the stand-ins accept, so a missing header fails.
    static let key = "smoke-not-a-real-key-1234"

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host?.hasSuffix(".stub.invalid") == true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let name = url.host?.split(separator: ".").first.map(String.init) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let authorized = request.value(forHTTPHeaderField: "Authorization") == "Bearer \(Self.key)"
        let (status, body): (Int, String)
        switch (name, Answer(rawValue: name)) {
        case ("words", _):
            (status, body) = !authorized ? (401, "{}") : Self.isWholeTake(request) ? (200, #"{"text":"\#(Self.words)"}"#) : (400, "{}")
        case ("down", _):
            (status, body) = (503, #"{"error":{"message":"Service unavailable"}}"#)
        case (_, .offline?):
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        case (_, .works?):
            (status, body) = authorized ? (200, #"{"data":[]}"#) : (401, "{}")
        case (_, .rejected?):
            (status, body) = (401, #"{"error":{"message":"Invalid API Key"}}"#)
        case (_, .message?):
            (status, body) = (503, #"{"error":{"message":"Model overloaded"}}"#)
        case (_, nil):
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])
        if let response { client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed) }
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    /// A take reached us whole: a form with a WAV file and a model in it.
    /// URLSession hands a protocol the body as a stream.
    private static func isWholeTake(_ request: URLRequest) -> Bool {
        guard let body = request.httpBody ?? request.httpBodyStream.map(read) else { return false }
        let text = String(decoding: body, as: UTF8.self)
        return body.range(of: Data("RIFF".utf8)) != nil && body.range(of: Data("WAVE".utf8)) != nil
            && text.contains(#"filename="audio.wav""#) && text.contains(#"name="model""#)
    }

    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 16_384)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
```

- [ ] **Step 4: Run the smoke to see it pass**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT {"checks":{"appGroup":true,"connectionTest":true,"keychain":true,"keyRing":true,"sharedJson":true,"speechGate":true,"transcription":true,"waitingTakes":true},"ok":true}`

- [ ] **Step 5: Commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift ios/App/Smoke/StubProtocol.swift
git commit -m "IOS-006: the smoke runs a tone and silence through the gate and a take through a local stand-in"
```

### Task 8: Docs, the live check, and the records

**Files:**
- Modify: `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json` (IOS-006 notes), `ROADMAP.md` and `ios/ROADMAP.md` (by `npm run roadmap`)

- [ ] **Step 1: Answer the two questions in the iPhone docs**

Append to `ios/docs/iphone.md`:

```markdown
## What happens when a dictation fails on iPhone?

murmur keeps the recording, and you can retry it.

- If your provider cannot be reached, does not answer in time, has a problem on its end, turns down your key, or refuses the audio, murmur says Not transcribed, gives the reason in plain words, and keeps the recording.
- A problem with the server or the network gets one more try by itself before murmur calls the take failed. A refused key or request is never retried by itself.
- The recording waits under Waiting to retry on the Dictate screen. Tap Retry to send it again with the provider and key you have now, or Retry all to send each one in turn.
- A retried take's words show on the screen and go to your clipboard, so they are safe before the recording is deleted.
- To delete a recording, tap Discard, then tap Delete audio? when it turns red. A quick double tap never deletes.
- murmur keeps the 20 most recent waiting recordings. They stay on this iPhone: they go only to your provider when you retry, and they are left out of iCloud backups.
- A take that fails while the iPhone is locked still saves, as long as the iPhone has been unlocked once since it started.

## Why did murmur hear nothing?

murmur shows Heard nothing when a take has no speech in it, so silence never turns into words. Two checks make sure of it, the same ones murmur uses on Mac and Windows:

- Before sending, murmur measures the recording. With less than a fifth of a second of speech in it, nothing is sent. Speak a little closer to the microphone, and check that another app is not using it.
- Speech models sometimes answer silence with a stock phrase, such as "Thank you." or "Thanks for watching." When that phrase is all that comes back, murmur keeps nothing. A thank-you inside your own sentences is kept.

murmur also trims the silence at the start and end of each take before sending it, because trailing silence is where those stock phrases come from.

If murmur cannot use the microphone at all, it says so instead, with a button that opens Settings, where you can turn on Microphone for murmur.
```

- [ ] **Step 2: Add the live check to HANDOFF.md**, under the IOS-005 item:

```markdown
- [ ] IOS-006 live check, once TestFlight 1 is on your iPhone (IOS-015; added 2026-10-12). (1) Open murmur and tap Dictate. (2) Tap Start a take. The first time, iOS asks to use the microphone: tap Allow. (3) Say a sentence, then tap the button again. Your words should appear under it within a few seconds. (4) Tap Start a take again, stay silent for three seconds, and tap the button. It should say Heard nothing. (5) Tell Claude what each one did.
```

- [ ] **Step 3: Write IOS-006's notes in `ios/prd.json`** (passes stays false and needs_human true). Record how each criterion was verified, naming the tests and smoke checks above and every ruling. Criterion 8, the live check, waits for TestFlight 1. Then run `npm run roadmap`.

- [ ] **Step 4: Run every gate**

Run: `npm run typecheck`, `npm run test`, `npm run ios:test`, `npm run ios:smoke`.
Expected: typecheck clean; 845 desktop tests; 78 MurmurCore tests (1 known issue); 71 app tests; smoke 8/8 true.

- [ ] **Step 5: Commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json ROADMAP.md ios/ROADMAP.md
git commit -m "IOS-006: the iPhone docs answer failed dictations and Heard nothing, and the live check waits on TestFlight 1"
```
