# Apply corrections on iPhone (IOS-030)

LaBroi asked for parity with desktop's US-105 (merged to main 2026-10-18, 278283f; main merged into feature/ios in e12887d). With Apply corrections on, a spoken slip-up (Tuesday, oh wait, I mean Wednesday) comes out as only the fix; off, the default, keeps today's behavior exactly.

## Task 1: the corrections rules move into shared/polish.json

Desktop keeps them inline in src/main/formatter/llm.ts since the merge: CORRECTIONS_PROMPT, CORRECTION_CUES, and the cap (4 + 8 per dropped cue). conventions.parity: they move to shared/ first, and desktop reads them with unchanged behavior.

- shared/polish.json gains `correctionsPrompt` (the ten lines, verbatim, curly apostrophe kept), `correctionCues` (wait, actually, sorry, rather, make that, i mean, i meant, let me rephrase), and `correctionCut: { slack: 4, perCue: 8 }`. The deeper floor stays `length.listFloor`. The comment says how the prompt is built with corrections and when a cut counts as a correction.
- llm.ts: `CORRECTIONS_PROMPT = polish.correctionsPrompt.join(' ')`; the cue pattern is built from `polish.correctionCues`, each cue escaped (none has a regex character today, so behavior is unchanged, and Swift can escape the same way); the cap reads `polish.correctionCut`.
- RED first: polish-shared.test.ts's mock gains `correctionsPrompt: ['Corrections line.']`, `correctionCues: ['kiwi']`, `correctionCut: { slack: 1, perCue: 1 }`, and listFloor 0.5; new tests: CORRECTIONS_PROMPT is the shared line; a cut that drops kiwi earns the deeper floor with corrections on; wait no longer counts; a cut past slack + perCue is rejected. They fail while llm.ts holds the literals.
- Unchanged: llm.test.ts's corrections tests and the llmFormatter smoke check pass untouched. The live probe runs again through OpenRouter pinned to Groq, as US-105's numbers were taken (MURMUR_PROBE_BASE_URL=https://openrouter.ai/api/v1, MURMUR_PROBE_ROUTE=groq, the OpenRouter key from the environment, never printed): at least 8 of 10 fixed, every trap kept.

## Task 2: shared vectors for corrections

- shared/polish-vectors.json: each validate case gains `corrections` (false for the 35 that exist). New cases, with smart lists on and off where it matters: the Mark fix kept with corrections on and rejected with it off; a next-sentence fix; curly apostrophes; and the rejects: every cue kept, no cue, added words, over the cap, No problem, below 0.4. Plus parity cases for Swift's traps: a Greek word ending in capital sigma (JavaScript's toLowerCase gives final ς), a precomposed against a decomposed accent (JavaScript compares code units; Swift's == does not), and a cue next to punctuation.
- polish-vectors.test.ts passes `corrections` and, with MURMUR_WRITE_VECTORS=1, writes desktop's answer (ok and text, or the reason) into every validate case before comparing, so every expected answer is desktop's own.

## Task 3: MurmurCore

- PolishRules decodes `correctionsPrompt`, `correctionCues`, `correctionCut`.
- `Polish.validate`, `request`, and `run` take `corrections: Bool` (no default: every caller decides). The prompt is system + smart lists + corrections + hints, joined with single spaces. With it on, the floor is listFloor when `cuesDropped > 0 && inputWords - outputWords <= slack + perCue * cuesDropped && onlySpokenWords`, as desktop's.
- spokenWords in JavaScript's terms: JS.lowercase (Swift's per-scalar lowercase plus Final_Sigma, as toLowerCase does), U+2018 and U+2019 to an apostrophe, split on JS.isSpace, letters and numbers (General_Category L and N) kept at each end, empties out. Words compared as UTF-16 code units, counted as a multiset. The cue count runs the pattern (JS.boundary, escaped cues) over the words joined with spaces.
- CleanupSettings gains `corrections` (default false; decodeIfPresent, so older saved settings read off); Cleanup.finish passes it to Polish.run.
- Tests (RED first): PolishVectorTests runs `v.corrections`; PolishTests: the exact prompt with corrections on (system, smart lists, corrections, hint, in that order) and exactly today's with it off; a correction cut through `run` kept on, fell back off. CleanupTests: settings saved without the field decode with it off; finish with a stand-in that answers the fix gives the fix on and the formatted text off. JSTests: lowercase matches toLowerCase for final sigma cases.

## Task 4: the app

- CleanupModel.corrections; CleanupScreen: an Apply corrections section right under Smart lists, at Full only. Footer, desktop's words without At Full formatting: "When you correct yourself (Tuesday, oh wait, I mean Wednesday), only the fix is typed. Off keeps the slip-up in." With Polish off it adds "It works through Polish, so it does nothing while Polish is off." The switch stays usable either way.
- DiagnosticsReport: `formatting: level=… numbers=… smartLists=… corrections=… polish=…`.
- Smoke: a `corrections` check against a new `fixer` stand-in that answers the fix: on gives the fix, off gives the formatted text unchanged with one fallback reason.
- Previews: Full with Apply corrections on, off, and on with Polish off. Renders at accessibility5, screen and full page, read before passing (feedback: renders, tap areas).
- Tests: CleanupModelTests (saved and read back; copy rules), DiagnosticsTests (the line says corrections=true, never words), render tests.

## Task 5: docs and spec

- ios/docs/iphone.md: "How do I make murmur fix my spoken slip-ups on iPhone?" matching docs/settings.md (examples, what counts, cue words that stay, how it fails open, the measured numbers with their date), and that it needs Polish on at Full.
- ios/prd.json IOS-030 notes; HANDOFF's IOS-030 live check; npm run roadmap.

## Review focus

1. Off is exactly today: the prompt, the floor, and the verdict for every existing vector.
2. JavaScript and Swift disagree on lowercase (final sigma), string equality (canonical equivalence), and \p classes: every word step works on code units or scalars, never on Swift's Character or ==.
3. A cue inside a word (awaited, unwaited) must not count: JS.boundary on both sides.
4. A long dictation where the model drops a cue and a real sentence: the cap must hold.
5. Saved settings from build 485 read with corrections off, and the keyboard's takes go through the same Cleanup.finish.
