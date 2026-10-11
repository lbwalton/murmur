# MurmurCore Parity (IOS-003) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MurmurCore gives desktop's exact answer for formatting, the dictionary, expansions, the speech gate, the hallucination filters, and WAV encoding, proven by vectors both platforms run, and loads the provider catalog into Swift types.

**Architecture:** Desktop first, then Swift. Desktop moves the speech gate's numbers and the hallucination list into `shared/`, pins one formatter ordering rule, and gains three kinds of shared vectors (formatter edge cases, generated audio signals and transcripts, WAV bytes), all with unchanged behavior. Then MurmurCore ports the TypeScript in `src/shared/` to Swift on top of a small `JS` layer that gives ICU regular expressions JavaScript's meaning (ASCII word edges, JavaScript's whitespace, a strict `$`, UTF-16 positions, `Math.round`), and runs the same vector files.

**Tech Stack:** Swift 6 with Swift Testing and Foundation's `NSRegularExpression`; TypeScript with vitest on desktop; JSON in `shared/`.

**Spec:** `ios/prd.json` IOS-003 and `conventions.parity`, approved by LaBroi on 2026-10-10. Also `CLAUDE.md`. The TypeScript being ported: `src/shared/formatter.ts`, `dictionary.ts`, `expansions.ts`, `speech-gate.ts`, `wav.ts`, and `catalog.ts`.

**Proven before writing:** every Swift and TypeScript block below ran before this plan was saved. A scratch copy of MurmurCore ran all 51 formatter vectors, 11 signals, 13 transcripts, 6 trailing strips, 6 WAV cases, and the catalog tests: 21 tests, all green. Two sabotage checks proved the vectors bite: Swift's default rounding failed the WAV halves case, and ICU's own `\b` failed the ASCII word edge vector. A scratch copy of desktop's shared code with the new tests failed exactly where each task says it fails, then passed (120 tests) after the changes, and `tsc` was clean. Every expected value in the new vector files was computed by desktop's own code.

## Global Constraints

- Behavior lives in shared/ and nowhere else (`conventions.parity`): "When iOS needs a rule desktop keeps only in TypeScript (the cleanup and transform prompts and their checks, the speech gate's numbers), it moves into shared/ first, desktop reads it from there with unchanged behavior, and both platforms test against the same vectors."
- Desktop behavior is unchanged: every existing vitest passes with only its import paths edited, and `npm run typecheck`, `npm run test`, and `npm run smoke` stay green.
- MurmurCore stays a UI-free Swift package: `swift-tools-version: 6.0`, platforms `.iOS("26.0")` and `.macOS("15.0")`, Swift 6 language mode, no third-party packages. It must build with Xcode 26.6 (CI's `macos-26`) and Xcode 27 (local).
- Every `.ts` and `.swift` file starts with `// SPDX-License-Identifier: GPL-3.0-only`.
- JSON in `shared/` is written as `JSON.stringify(value, null, 2)` plus a newline, like the files already there.
- The product name is always lowercase murmur. No em dashes or spaced hyphens as clause separators in copy, comments, test names, or commits.
- Commits start with `IOS-003:`. Commit, then `git pull --rebase origin main` (git refuses a rebase pull while files are staged). Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`; `npm run smoke` too after any change under `src/main`. `swift test --package-path ios/MurmurCore` is the fast loop while working.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- Never push without LaBroi's OK, and run the review gate (an independent reviewer agent over the full diff) before any push.

## Review Focus

1. **Non-ASCII text beside commands, dictionary terms, and expansions** (café, señor, emoji, curly apostrophes). The iPhone must give desktop's output, including JavaScript's ASCII-only word edges and UTF-16 positions. Pinned by the eight parity vectors in Task 2 and `JSTests.wordEdgesAreASCII` in Task 5.
2. **A dictionary value holding a dollar sign** (a price like `$5`, or `$&` typed by hand). JavaScript's string replace treats `$$`, `$&`, `` $` ``, and `$'` specially; the iPhone must too. Pinned by the `$5` vector in Task 2 and `JSTests.replacementStringsFollowJavaScript` in Task 5.
3. **Two spoken phrases of the same length in a future `format-spec.json`.** JavaScript keeps the file's key order and Swift dictionaries keep none, so both platforms need one explicit order. Pinned by the desktop test in Task 2 and `equalLengthPhrasesGoInAlphabeticalOrder` in Task 6.
4. **A take that is empty or shorter than one gate window.** Nothing voiced, nothing kept, no crash. Pinned by the first two signals in Task 3, run by Swift in Task 7.
5. **WAV samples outside -1 to 1, at a half step, or NaN.** The same clamping and `Math.round` (halves up, so -16383.5 becomes -16383) as desktop, and a NaN writes 0 instead of crashing. Pinned by the WAV vectors in Task 4 and `WavVectorTests.aNaNSampleWritesZero` in Task 8.

---

### Task 1: The speech gate's numbers and the hallucination list move into shared/

**Files:**
- Create: `shared/speech-gate.json`
- Move: `src/shared/hallucinations.json` to `shared/hallucinations.json`
- Modify: `src/shared/speech-gate.ts` (the header comment, and the defaults at lines 19, 36, 59, and 70)
- Modify: the hallucination imports in `src/main/dictation.ts:8`, `src/main/formatter/llm.ts:6`, `src/main/transform/index.ts:11`, and `src/shared/speech-gate.test.ts:3`
- Test: `src/shared/speech-gate-shared.test.ts`

**Interfaces:**
- Produces: `shared/speech-gate.json` with numeric `windowMs`, `rmsThreshold`, `minVoicedMs`, `paddingMs`, and `deadStreamPeak`; `shared/hallucinations.json` with `phrases` and `artifactTails` (unchanged content). Tasks 3 and 7 read both.

- [ ] **Step 1: Write the failing test**

`src/shared/speech-gate-shared.test.ts` swaps other numbers in for the shared file, so it can only pass once the gate reads that file:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// The gate's numbers come from shared/speech-gate.json (ios/prd.json
// IOS-003): with other numbers swapped in, its defaults follow them.
import { describe, expect, it, vi } from 'vitest'
import { DEAD_STREAM_PEAK, hasSpeechEnergy, trimSilence, voicedMs } from './speech-gate'

vi.mock('../../shared/speech-gate.json', () => ({
  default: { windowMs: 60, rmsThreshold: 0.6, minVoicedMs: 900, paddingMs: 0, deadStreamPeak: 0.4 }
}))

const RATE = 16_000
const level = (seconds: number, value: number) => new Float32Array(Math.round(seconds * RATE)).fill(value)

describe('speech gate numbers from shared/speech-gate.json', () => {
  it('uses the shared window and threshold', () => {
    expect(voicedMs(level(1, 0.5), RATE)).toBe(0)
    expect(voicedMs(level(1, 0.7), RATE)).toBe(960)
  })

  it('uses the shared minimum voiced time', () => {
    expect(hasSpeechEnergy(level(1, 0.7), RATE)).toBe(true)
    expect(hasSpeechEnergy(level(0.5, 0.7), RATE)).toBe(false)
  })

  it('uses the shared padding', () => {
    const take = new Float32Array(2 * RATE)
    take.fill(0.7, RATE / 2, RATE)
    expect(trimSilence(take, RATE).length).toBe(6720)
  })

  it('uses the shared dead-stream peak', () => {
    expect(DEAD_STREAM_PEAK).toBe(0.4)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/shared/speech-gate-shared.test.ts`
Expected: FAIL, 4 tests, the first with `expected 990 to be +0`: the gate's defaults are hard-coded, so the swapped-in numbers change nothing.

- [ ] **Step 3: Write `shared/speech-gate.json`**

```json
{
  "version": 1,
  "comment": "The speech gate's numbers, the single source for every platform (ios/prd.json IOS-003). Audio is cut into windowMs windows; a window whose RMS reaches rmsThreshold counts as voiced, and a take needs minVoicedMs of voiced time to be sent. Trimming keeps paddingMs of audio on each side of the first and last voiced window. A take whose loudest sample is under deadStreamPeak is a dead capture stream, not a quiet person. Samples are 32-bit floats from -1 to 1, and window and padding lengths round to whole samples the way JavaScript's Math.round does (halves round up). Change behavior here or nowhere.",
  "windowMs": 30,
  "rmsThreshold": 0.01,
  "minVoicedMs": 200,
  "paddingMs": 250,
  "deadStreamPeak": 0.001
}
```

- [ ] **Step 4: Make the gate read it**

In `src/shared/speech-gate.ts`, end the header comment and add the import:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// The two silence guards. Before upload: an energy gate that measures
// voiced time. After transcription: a sanity filter for empty output and
// the stock phrases Whisper-family models hallucinate on silence.
// Either one firing means nothing is ever inserted. The numbers live in
// shared/speech-gate.json, which the iPhone app reads too.
import gate from '../../shared/speech-gate.json'
```

Then replace each default:

```ts
  const { windowMs = gate.windowMs, rmsThreshold = gate.rmsThreshold } = options
```

```ts
  const { minVoicedMs = gate.minVoicedMs } = options
```

```ts
export const DEAD_STREAM_PEAK = gate.deadStreamPeak
```

```ts
  const { windowMs = gate.windowMs, rmsThreshold = gate.rmsThreshold, paddingMs = gate.paddingMs } = options
```

- [ ] **Step 5: Move the hallucination list**

```bash
git mv src/shared/hallucinations.json shared/hallucinations.json
```

Then change each import to the new path:
- `src/main/dictation.ts:8`: `import hallucinations from '../../shared/hallucinations.json'`
- `src/main/formatter/llm.ts:6`: `import hallucinations from '../../../shared/hallucinations.json'`
- `src/main/transform/index.ts:11`: `import hallucinations from '../../../shared/hallucinations.json'`
- `src/shared/speech-gate.test.ts:3`: `import hallucinations from '../../shared/hallucinations.json'`

Run: `git grep -n "hallucinations.json" -- src scripts site`
Expected: only the four lines above, all pointing into `shared/`.

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `npx vitest run src/shared/speech-gate-shared.test.ts src/shared/speech-gate.test.ts`
Expected: PASS, the 4 new tests and every existing speech gate test unchanged.

- [ ] **Step 7: Gates and commit**

The dictation, cleanup, and transform imports changed, so desktop's smoke runs too. If its audio checks fail, run the same smoke on the commit before this one first: those checks flake when the Mac is busy.

```bash
npm run typecheck
npm run test
npm run smoke
npm run ios:test
npm run ios:smoke
git add shared/speech-gate.json shared/hallucinations.json src/shared/speech-gate.ts src/shared/speech-gate-shared.test.ts src/shared/speech-gate.test.ts src/main/dictation.ts src/main/formatter/llm.ts src/main/transform/index.ts
git commit -m "IOS-003: the speech gate's numbers and the hallucination list move into shared/"
git pull --rebase origin main
```

`npm run ios:smoke` now bundles 10 shared files instead of 8; the smoke counts them itself.

---

### Task 2: One order for equal-length phrases, and eight parity vectors

**Files:**
- Modify: `src/shared/formatter.ts:61` (the phrase sort)
- Modify: `shared/format-spec.json` (the `spokenPunctuation` comment)
- Modify: `shared/test-vectors.json` (eight vectors appended)
- Test: `src/shared/formatter.test.ts` (one new test)

**Interfaces:**
- Produces: the rule "longest phrase first; equal lengths in alphabetical order (UTF-16 code unit order)", which Task 6 implements in Swift as `phrasesLongestFirst`; and 51 vectors in `shared/test-vectors.json`.

- [ ] **Step 1: Write the failing test**

In `src/shared/formatter.test.ts`, add this test above `it('is a pure function...`:

```ts
  it('applies equal-length spoken phrases in alphabetical order', () => {
    // Every platform must agree on this order (format-spec.json). The map
    // lists b c first, and a b must still go first.
    const s = { ...(spec as unknown as FormatSpec), spokenPunctuation: { map: { 'b c': 'Y', 'a b': 'X' } } }
    expect(formatTranscript('a b c', { level: 'full', numbers: 'auto' }, s)).toBe('X c')
  })
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/shared/formatter.test.ts`
Expected: FAIL, `expected 'AY' to be 'X c'` (today the file's key order decides, so `b c` goes first).

- [ ] **Step 3: Pin the order**

In `src/shared/formatter.ts`, replace line 61:

```ts
  // Longest first; equal lengths in alphabetical order, so every
  // platform applies them the same way (format-spec.json).
  const phrases = Object.keys(map).sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
```

In `shared/format-spec.json`, in the `spokenPunctuation` comment, change `Longest phrase wins.` to `Longest phrase wins; phrases of equal length apply in alphabetical order.`

No shipped phrase shares a length with an overlapping one, so no output changes: every existing vector still passes.

- [ ] **Step 4: Append the parity vectors**

These record desktop's own output for the inputs most likely to trip a port (computed by desktop's code). They pass on desktop at once; they bite in Task 6.

```bash
node -e '
const fs = require("fs")
const file = "shared/test-vectors.json"
const data = JSON.parse(fs.readFileSync(file, "utf8"))
data.vectors.push(...JSON.parse(fs.readFileSync(0, "utf8")))
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n")
' <<'JSON'
[
  {
    "name": "an accented word before a spoken comma",
    "input": "café comma then tea",
    "expected": "Café, then tea."
  },
  {
    "name": "an emoji before a spoken period",
    "input": "all done 👍 period see you",
    "expected": "All done 👍. See you."
  },
  {
    "name": "a curly apostrophe before a spoken question mark",
    "input": "it’s fine question mark",
    "expected": "It’s fine?"
  },
  {
    "name": "word edges are ASCII, as in JavaScript: a term before an accented letter still matches",
    "settings": {
      "dictionary": [
        {
          "from": "caf",
          "to": "CAF"
        }
      ]
    },
    "input": "meet at the café later",
    "expected": "Meet at the CAFé later."
  },
  {
    "name": "a dictionary value with a dollar sign stays as written",
    "settings": {
      "dictionary": [
        {
          "from": "five bucks",
          "to": "$5"
        }
      ]
    },
    "input": "it costs five bucks",
    "expected": "It costs $5."
  },
  {
    "name": "an expansion after an accented word",
    "settings": {
      "expansions": [
        {
          "trigger": "my sig",
          "text": "Best,\nJosé"
        }
      ]
    },
    "input": "merci beaucoup my sig",
    "expected": "Merci beaucoup Best,\nJosé."
  },
  {
    "name": "filler beside an accented word",
    "input": "um señor uh period",
    "expected": "Señor."
  },
  {
    "name": "digits after an accented word",
    "settings": {
      "numbers": "digits"
    },
    "input": "année twenty two was good",
    "expected": "Année 22 was good."
  }
]
JSON
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run src/shared/formatter.test.ts`
Expected: PASS, 51 vectors plus the two named tests.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git add src/shared/formatter.ts src/shared/formatter.test.ts shared/format-spec.json shared/test-vectors.json
git commit -m "IOS-003: equal-length spoken phrases apply in alphabetical order; eight parity vectors"
git pull --rebase origin main
```

---

### Task 3: Shared speech vectors

**Files:**
- Create: `shared/speech-vectors.json`
- Test: `src/shared/speech-vectors.test.ts`

**Interfaces:**
- Consumes: `shared/speech-gate.json` and `shared/hallucinations.json` (Task 1).
- Produces: `shared/speech-vectors.json` with `signals` (each `name`, `sampleRate`, `segments`, `expected` of `voicedMs`, `hasSpeech`, `trimmedSamples`, `peak`, `deadStream`), `hallucinations` (each `text`, `expected` boolean), and `trailing` (each `text`, `expected` string). Task 7 runs it in Swift. A segment is `{ "kind": "silence", "samples": n }` or `{ "kind": "square", "samples": n, "amplitude": a, "periodSamples": p }`.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/speech-vectors.json. MurmurCore runs the same file, so a
// change in shared/ breaks both platforms or neither (ios/prd.json IOS-003).
import { describe, expect, it } from 'vitest'
import hallucinations from '../../shared/hallucinations.json'
import vectors from '../../shared/speech-vectors.json'
import {
  hasSpeechEnergy,
  isDeadStream,
  isHallucination,
  peakLevel,
  stripTrailingHallucinations,
  trimSilence,
  voicedMs
} from './speech-gate'

interface Segment {
  kind: string
  samples: number
  amplitude?: number
  periodSamples?: number
}

/** The audio a signal's segments describe (see the file's comment). */
function build(segments: Segment[]): Float32Array {
  const out = new Float32Array(segments.reduce((total, s) => total + s.samples, 0))
  let at = 0
  for (const s of segments) {
    if (s.kind === 'square' && s.amplitude !== undefined && s.periodSamples !== undefined) {
      const half = s.periodSamples / 2
      for (let i = 0; i < s.samples; i++) out[at + i] = Math.floor(i / half) % 2 === 0 ? s.amplitude : -s.amplitude
    }
    at += s.samples
  }
  return out
}

describe('shared/speech-vectors.json signals', () => {
  for (const signal of vectors.signals) {
    it(signal.name, () => {
      const samples = build(signal.segments)
      const peak = peakLevel(samples)
      expect({
        voicedMs: voicedMs(samples, signal.sampleRate),
        hasSpeech: hasSpeechEnergy(samples, signal.sampleRate),
        trimmedSamples: trimSilence(samples, signal.sampleRate).length,
        peak,
        deadStream: isDeadStream(peak)
      }).toEqual(signal.expected)
    })
  }
})

describe('shared/speech-vectors.json transcripts', () => {
  for (const verdict of vectors.hallucinations) {
    it(`whole transcript ${JSON.stringify(verdict.text)}`, () => {
      expect(isHallucination(verdict.text, hallucinations.phrases)).toBe(verdict.expected)
    })
  }
  for (const strip of vectors.trailing) {
    it(`trailing ${JSON.stringify(strip.text)}`, () => {
      expect(stripTrailingHallucinations(strip.text, hallucinations.artifactTails)).toBe(strip.expected)
    })
  }
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/shared/speech-vectors.test.ts`
Expected: FAIL, because `../../shared/speech-vectors.json` can't be found.

- [ ] **Step 3: Write `shared/speech-vectors.json`**

Every expected value here came from desktop's `speech-gate.ts`.

```json
{
  "version": 1,
  "comment": "Shared cases for the speech gate and the hallucination filters (ios/prd.json IOS-003), run by desktop (src/shared/speech-vectors.test.ts) and by MurmurCore (SpeechVectorTests). Signals are built from segments, never from audio files: silence is that many zero samples; square is that many samples alternating between +amplitude and -amplitude every periodSamples / 2 samples, starting positive, each stored as a 32-bit float. Expected values use speech-gate.json. hallucinations check the whole-transcript filter against the phrases in hallucinations.json; trailing checks the end-of-transcript strip against its artifactTails.",
  "signals": [
    {
      "name": "an empty take",
      "sampleRate": 16000,
      "segments": [],
      "expected": {
        "voicedMs": 0,
        "hasSpeech": false,
        "trimmedSamples": 0,
        "peak": 0,
        "deadStream": true
      }
    },
    {
      "name": "loud but shorter than one window",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "square",
          "samples": 100,
          "amplitude": 0.3,
          "periodSamples": 80
        }
      ],
      "expected": {
        "voicedMs": 0,
        "hasSpeech": false,
        "trimmedSamples": 0,
        "peak": 0.30000001192092896,
        "deadStream": false
      }
    },
    {
      "name": "a second of silence",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "silence",
          "samples": 16000
        }
      ],
      "expected": {
        "voicedMs": 0,
        "hasSpeech": false,
        "trimmedSamples": 0,
        "peak": 0,
        "deadStream": true
      }
    },
    {
      "name": "breath under the threshold",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "square",
          "samples": 16000,
          "amplitude": 0.005,
          "periodSamples": 80
        }
      ],
      "expected": {
        "voicedMs": 0,
        "hasSpeech": false,
        "trimmedSamples": 0,
        "peak": 0.004999999888241291,
        "deadStream": false
      }
    },
    {
      "name": "a dead capture stream",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "square",
          "samples": 16000,
          "amplitude": 0.0005,
          "periodSamples": 80
        }
      ],
      "expected": {
        "voicedMs": 0,
        "hasSpeech": false,
        "trimmedSamples": 0,
        "peak": 0.0005000000237487257,
        "deadStream": true
      }
    },
    {
      "name": "exactly the threshold is quiet, because 0.01 as a 32-bit sample is just under it",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "square",
          "samples": 16000,
          "amplitude": 0.01,
          "periodSamples": 80
        }
      ],
      "expected": {
        "voicedMs": 0,
        "hasSpeech": false,
        "trimmedSamples": 0,
        "peak": 0.009999999776482582,
        "deadStream": false
      }
    },
    {
      "name": "just above the threshold",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "square",
          "samples": 9600,
          "amplitude": 0.02,
          "periodSamples": 80
        }
      ],
      "expected": {
        "voicedMs": 600,
        "hasSpeech": true,
        "trimmedSamples": 9600,
        "peak": 0.019999999552965164,
        "deadStream": false
      }
    },
    {
      "name": "speech with silence around it",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "silence",
          "samples": 8000
        },
        {
          "kind": "square",
          "samples": 4800,
          "amplitude": 0.3,
          "periodSamples": 80
        },
        {
          "kind": "silence",
          "samples": 8000
        }
      ],
      "expected": {
        "voicedMs": 330,
        "hasSpeech": true,
        "trimmedSamples": 13280,
        "peak": 0.30000001192092896,
        "deadStream": false
      }
    },
    {
      "name": "a click shorter than the minimum voiced time",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "silence",
          "samples": 8000
        },
        {
          "kind": "square",
          "samples": 1440,
          "amplitude": 0.3,
          "periodSamples": 80
        },
        {
          "kind": "silence",
          "samples": 8000
        }
      ],
      "expected": {
        "voicedMs": 120,
        "hasSpeech": false,
        "trimmedSamples": 9920,
        "peak": 0.30000001192092896,
        "deadStream": false
      }
    },
    {
      "name": "two bursts with a pause",
      "sampleRate": 16000,
      "segments": [
        {
          "kind": "silence",
          "samples": 3200
        },
        {
          "kind": "square",
          "samples": 3200,
          "amplitude": 0.3,
          "periodSamples": 80
        },
        {
          "kind": "silence",
          "samples": 9600
        },
        {
          "kind": "square",
          "samples": 3200,
          "amplitude": 0.3,
          "periodSamples": 80
        },
        {
          "kind": "silence",
          "samples": 3200
        }
      ],
      "expected": {
        "voicedMs": 450,
        "hasSpeech": true,
        "trimmedSamples": 22400,
        "peak": 0.30000001192092896,
        "deadStream": false
      }
    },
    {
      "name": "a 48 kHz take",
      "sampleRate": 48000,
      "segments": [
        {
          "kind": "silence",
          "samples": 24000
        },
        {
          "kind": "square",
          "samples": 14400,
          "amplitude": 0.3,
          "periodSamples": 80
        },
        {
          "kind": "silence",
          "samples": 24000
        }
      ],
      "expected": {
        "voicedMs": 330,
        "hasSpeech": true,
        "trimmedSamples": 39840,
        "peak": 0.30000001192092896,
        "deadStream": false
      }
    }
  ],
  "hallucinations": [
    {
      "text": "Thank you.",
      "expected": true
    },
    {
      "text": "thank you for watching!",
      "expected": true
    },
    {
      "text": "“Thank you.”",
      "expected": true
    },
    {
      "text": "Thank you for the update.",
      "expected": false
    },
    {
      "text": "",
      "expected": true
    },
    {
      "text": "   ",
      "expected": true
    },
    {
      "text": "Please subscribe.",
      "expected": true
    },
    {
      "text": "send the invoice tomorrow",
      "expected": false
    },
    {
      "text": "thank-you",
      "expected": false
    },
    {
      "text": "Bye bye.",
      "expected": true
    },
    {
      "text": "Copyright",
      "expected": true
    },
    {
      "text": "So.",
      "expected": true
    },
    {
      "text": "So we ship today.",
      "expected": false
    }
  ],
  "trailing": [
    {
      "text": "Send the report today. Thanks for watching.",
      "expected": "Send the report today."
    },
    {
      "text": "Send it. Thank you.",
      "expected": "Send it. Thank you."
    },
    {
      "text": "Thanks for watching.",
      "expected": "Thanks for watching."
    },
    {
      "text": "Call me back! Please subscribe. Like and subscribe.",
      "expected": "Call me back!"
    },
    {
      "text": "Is it done? Transcribed by",
      "expected": "Is it done?"
    },
    {
      "text": "Ship it.  Subscribe to my channel!",
      "expected": "Ship it."
    }
  ]
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run src/shared/speech-vectors.test.ts`
Expected: PASS, 30 tests (11 signals, 13 transcripts, 6 trailing strips).

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git add shared/speech-vectors.json src/shared/speech-vectors.test.ts
git commit -m "IOS-003: shared speech vectors: generated tones and silence, and hallucination phrases"
git pull --rebase origin main
```

---

### Task 4: Shared WAV vectors

**Files:**
- Create: `shared/wav-vectors.json`
- Test: `src/shared/wav-vectors.test.ts`

**Interfaces:**
- Produces: `shared/wav-vectors.json` with `cases`, each `name`, `sampleRate`, `samples` (numbers), and `expectedHex` (lowercase hex of the whole file). Task 8 runs it in Swift.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/wav-vectors.json. MurmurCore runs the same file, so both
// platforms write the same bytes (ios/prd.json IOS-003).
import { describe, expect, it } from 'vitest'
import vectors from '../../shared/wav-vectors.json'
import { encodeWavPcm16 } from './wav'

describe('shared/wav-vectors.json', () => {
  for (const wavCase of vectors.cases) {
    it(wavCase.name, () => {
      const bytes = encodeWavPcm16(Float32Array.from(wavCase.samples), wavCase.sampleRate)
      expect(Buffer.from(bytes).toString('hex')).toBe(wavCase.expectedHex)
    })
  }
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/shared/wav-vectors.test.ts`
Expected: FAIL, because `../../shared/wav-vectors.json` can't be found.

- [ ] **Step 3: Write `shared/wav-vectors.json`**

Every `expectedHex` came from desktop's `encodeWavPcm16`. The second case holds the trap: -0.5 scales to -16383.5, which JavaScript rounds to -16383 (`01c0`), where Swift's default rounding gives -16384.

```json
{
  "version": 1,
  "comment": "Shared WAV encoding cases (ios/prd.json IOS-003), run by desktop (src/shared/wav-vectors.test.ts) and by MurmurCore (WavVectorTests). Each samples list is read as 32-bit floats (each JSON number rounded to the nearest float, as a Float32Array does), encoded as 16-bit mono PCM at sampleRate, and must produce exactly expectedHex. Samples clamp to -1 and 1, and scale by 32767 with halves rounding up, as JavaScript's Math.round does.",
  "cases": [
    {
      "name": "no samples is a bare header",
      "sampleRate": 16000,
      "samples": [],
      "expectedHex": "524946462400000057415645666d74201000000001000100803e0000007d0000020010006461746100000000"
    },
    {
      "name": "silence, full scale, and halves (Math.round sends -0.5 steps up)",
      "sampleRate": 16000,
      "samples": [
        0,
        0.5,
        -0.5,
        1,
        -1
      ],
      "expectedHex": "524946462e00000057415645666d74201000000001000100803e0000007d000002001000646174610a0000000000004001c0ff7f0180"
    },
    {
      "name": "samples outside -1 to 1 are clamped",
      "sampleRate": 16000,
      "samples": [
        1.5,
        -2,
        1.0000001
      ],
      "expectedHex": "524946462a00000057415645666d74201000000001000100803e0000007d0000020010006461746106000000ff7f0180ff7f"
    },
    {
      "name": "tiny samples round to zero",
      "sampleRate": 16000,
      "samples": [
        0.000001,
        -0.000001,
        0.0000152,
        -0.0000152
      ],
      "expectedHex": "524946462c00000057415645666d74201000000001000100803e0000007d00000200100064617461080000000000000000000000"
    },
    {
      "name": "ordinary speech values",
      "sampleRate": 16000,
      "samples": [
        0.1,
        -0.2,
        0.30000001,
        -0.123456,
        0.987654
      ],
      "expectedHex": "524946462e00000057415645666d74201000000001000100803e0000007d000002001000646174610a000000cd0c67e6662633f06a7e"
    },
    {
      "name": "a 48 kHz header",
      "sampleRate": 48000,
      "samples": [
        0.25
      ],
      "expectedHex": "524946462600000057415645666d7420100000000100010080bb0000007701000200100064617461020000000020"
    }
  ]
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run src/shared/wav-vectors.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git add shared/wav-vectors.json src/shared/wav-vectors.test.ts
git commit -m "IOS-003: shared WAV vectors, byte for byte"
git pull --rebase origin main
```

---

### Task 5: JavaScript's meaning in Swift

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/JS.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/JSTests.swift`

**Interfaces:**
- Produces (internal to MurmurCore, `@testable` in tests), all in `enum JS`:
  - pattern pieces `boundary`, `spaceMembers`, `space`, `nonSpace`, `end`, `lineEnd`, `lineStart` (String)
  - `escape(_ text: String) -> String`, `regex(_ pattern: String, ignoreCase: Bool = false) -> NSRegularExpression`
  - `isWord(_ unit: UInt16) -> Bool`, `isSpace(_ unit: UInt16) -> Bool`, `trim(_ text: String) -> String`, `wordCount(_ text: String) -> Int`, `round(_ x: Double) -> Double`
  - `replace(_ text: String, _ regex: NSRegularExpression, all: Bool = true, _ transform: (NSTextCheckingResult, NSString) -> String) -> String`
  - `replace(_ text: String, _ regex: NSRegularExpression, all: Bool = true, with replacement: String) -> String`
  - `lastIndex(of mark: String, in source: NSString) -> Int`, `less(_ a: String, _ b: String) -> Bool`

- [ ] **Step 1: Write the failing test**

Every expected value is what node prints for the same JavaScript.

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct JSTests {
    @Test func replacementStringsFollowJavaScript() {
        let bucks = JS.regex("bucks")
        let cases: [(String, String)] = [
            ("$$", "five $ now"), ("$&", "five bucks now"), ("$`", "five five  now"), ("$'", "five  now now"),
            ("$1", "five $1 now"), ("$<x>", "five $<x> now"), ("a$", "five a$ now"), ("$", "five $ now")
        ]
        for (template, expected) in cases {
            #expect(JS.replace("five bucks now", bucks, with: template) == expected, "\(template)")
        }
    }

    @Test func mathRoundSendsHalvesUp() {
        #expect(JS.round(2.5) == 3)
        #expect(JS.round(-2.5) == -2)
        #expect(JS.round(-16383.5) == -16383)
        #expect(JS.round(0.49999999999999994) == 0)
        #expect(JS.round(-0.4) == 0)
    }

    @Test func trimUsesJavaScriptWhitespace() {
        #expect(JS.trim("\u{FEFF}\u{3000} hi \u{2028}\n") == "hi")
        #expect(JS.trim("\u{85}hi") == "\u{85}hi")
    }

    /// What node prints for /\bé/, /\bcaf\b/, /\bé\b/, and /é\b/ on "café":
    /// true, true, false, false. An accented letter is not a word character.
    @Test(arguments: [
        ("\(JS.boundary)é", true), ("\(JS.boundary)caf\(JS.boundary)", true),
        ("\(JS.boundary)é\(JS.boundary)", false), ("é\(JS.boundary)", false)
    ])
    func wordEdgesAreASCII(_ pattern: String, _ matches: Bool) {
        let found = JS.regex(pattern).firstMatch(in: "café", range: NSRange(location: 0, length: "café".utf16.count))
        #expect((found != nil) == matches)
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `swift test --package-path ios/MurmurCore`
Expected: FAIL to compile, with `cannot find 'JS' in scope`.

- [ ] **Step 3: Write `JS.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// JavaScript's meaning, in Swift. Desktop's rules are JavaScript regular
// expressions and string methods; ICU (NSRegularExpression) reads most of
// them the same way, but not all: in JavaScript \b and \w are ASCII only,
// \s is a fixed set, $ without the m flag is the very end of the text,
// indexes count UTF-16 units, and Math.round sends halves up. These pieces
// close those gaps, so MurmurCore gives desktop's answer for any input,
// not only the shared vectors (ios/prd.json conventions.parity).
import Foundation

enum JS {
    /// \b: between an ASCII word character and anything else.
    static let boundary = "(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))"
    /// The members of \s, for use inside a character class.
    static let spaceMembers = "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"
    /// \s
    static let space = "[\(spaceMembers)]"
    /// \S
    static let nonSpace = "[^\(spaceMembers)]"
    /// $ without the m flag: the very end. (ICU's $ also matches before a
    /// final line break.)
    static let end = "\\z"
    /// $ with the m flag: before any of JavaScript's line terminators.
    static let lineEnd = "(?=[\\n\\r\\u2028\\u2029]|\\z)"
    /// ^ with the m flag: after any of JavaScript's line terminators.
    static let lineStart = "(?:^|(?<=[\\n\\r\\u2028\\u2029]))"

    /// A literal, safe inside a pattern.
    static func escape(_ text: String) -> String {
        NSRegularExpression.escapedPattern(for: text)
    }

    /// Patterns here are built from escaped literals, so one that fails to
    /// compile is a bug in this file, never bad input.
    static func regex(_ pattern: String, ignoreCase: Bool = false) -> NSRegularExpression {
        do {
            return try NSRegularExpression(pattern: pattern, options: ignoreCase ? [.caseInsensitive] : [])
        } catch {
            preconditionFailure("MurmurCore pattern \(pattern) does not compile: \(error)")
        }
    }

    /// An ASCII word character, \w.
    static func isWord(_ unit: UInt16) -> Bool {
        (0x30...0x39).contains(unit) || (0x41...0x5A).contains(unit) || (0x61...0x7A).contains(unit) || unit == 0x5F
    }

    /// A member of \s, which is also what trim and split(/\s+/) use.
    static func isSpace(_ unit: UInt16) -> Bool {
        switch unit {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
        default: false
        }
    }

    /// String.prototype.trim.
    static func trim(_ text: String) -> String {
        let units = Array(text.utf16)
        var start = 0
        var end = units.count
        while start < end, isSpace(units[start]) { start += 1 }
        while end > start, isSpace(units[end - 1]) { end -= 1 }
        return String(decoding: units[start..<end], as: UTF16.self)
    }

    /// How many words text.split(/\s+/) finds, empty pieces left out.
    static func wordCount(_ text: String) -> Int {
        var count = 0
        var inWord = false
        for unit in text.utf16 {
            if isSpace(unit) {
                inWord = false
            } else if !inWord {
                inWord = true
                count += 1
            }
        }
        return count
    }

    /// Math.round: the nearest whole number, halves toward positive infinity.
    static func round(_ x: Double) -> Double {
        let floor = x.rounded(.down)
        return x - floor >= 0.5 ? floor + 1 : floor
    }

    /// The first match, or every match when all is true, replaced by what
    /// transform returns: String.prototype.replace with a function.
    static func replace(
        _ text: String,
        _ regex: NSRegularExpression,
        all: Bool = true,
        _ transform: (NSTextCheckingResult, NSString) -> String
    ) -> String {
        let source = text as NSString
        let whole = NSRange(location: 0, length: source.length)
        let matches = all ? regex.matches(in: text, range: whole) : regex.firstMatch(in: text, range: whole).map { [$0] } ?? []
        guard !matches.isEmpty else { return text }
        var out = ""
        var cursor = 0
        for match in matches {
            out += source.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            out += transform(match, source)
            cursor = match.range.location + match.range.length
        }
        return out + source.substring(from: cursor)
    }

    /// String.prototype.replace with a string. As in JavaScript, $$ is a
    /// dollar sign, $& the match, $` the text before it, and $' the text
    /// after it; everything else, $1 included (these patterns capture
    /// nothing), stays as written.
    static func replace(_ text: String, _ regex: NSRegularExpression, all: Bool = true, with replacement: String) -> String {
        replace(text, regex, all: all) { match, source in
            substitute(replacement, for: match.range, in: source)
        }
    }

    private static func substitute(_ replacement: String, for match: NSRange, in source: NSString) -> String {
        guard replacement.contains("$") else { return replacement }
        let scalars = Array(replacement.unicodeScalars)
        var out = String.UnicodeScalarView()
        var i = 0
        while i < scalars.count {
            if scalars[i] == "$", i + 1 < scalars.count {
                let insert: String? =
                    switch scalars[i + 1] {
                    case "$": "$"
                    case "&": source.substring(with: match)
                    case "`": source.substring(to: match.location)
                    case "'": source.substring(from: match.location + match.length)
                    default: nil
                    }
                if let insert {
                    out.append(contentsOf: insert.unicodeScalars)
                    i += 2
                    continue
                }
            }
            out.append(scalars[i])
            i += 1
        }
        return String(out)
    }

    /// The position of the last mark before end, or -1: lastIndexOf.
    static func lastIndex(of mark: String, in source: NSString) -> Int {
        let found = source.range(of: mark, options: [.backwards, .literal])
        return found.location == NSNotFound ? -1 : found.location
    }

    /// JavaScript's < on strings: UTF-16 code unit order.
    static func less(_ a: String, _ b: String) -> Bool {
        a.utf16.lexicographicallyPrecedes(b.utf16)
    }
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: PASS, the 5 existing SharedData tests and the 4 JSTests (the word edge test runs 4 cases).

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git add ios/MurmurCore/Sources/MurmurCore/JS.swift ios/MurmurCore/Tests/MurmurCoreTests/JSTests.swift
git commit -m "IOS-003: JavaScript's regex and string meaning in Swift, for exact parity"
git pull --rebase origin main
```

---

### Task 6: The formatter, the dictionary, and expansions pass every vector

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/Formatter.swift`
- Create: `ios/MurmurCore/Sources/MurmurCore/Dictionary.swift`
- Create: `ios/MurmurCore/Sources/MurmurCore/Expansions.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/FormatterVectorTests.swift`

**Interfaces:**
- Consumes: `JS` (Task 5); `SharedData` and the test global `repoShared` (Foundation plan, `SharedDataTests.swift`); 51 vectors (Task 2).
- Produces (public, for the app in IOS-009 and IOS-010):
  - `struct FormatSpec: Decodable, Sendable` (`fillers.words`, `scratchThat.triggers`, `spokenPunctuation.map`, `listCommands.map`, `numbers.units`, `numbers.tens`, `terminalPunctuation.minWords`, `terminalPunctuation.append`)
  - `struct FormatOptions: Sendable, Equatable { var level: Level; var numbers: Numbers; var smartLists: Bool; init(level: .full, numbers: .auto, smartLists: false) }` with `enum Level: String, Codable { off, light, full }` and `enum Numbers: String, Codable { auto, words, digits }`
  - `func formatTranscript(_ raw: String, options: FormatOptions, spec: FormatSpec) -> String`
  - `struct DictionaryEntry: Codable, Sendable, Equatable { var from: String; var to: String }`, `func applyDictionary(_ text: String, _ entries: [DictionaryEntry]) -> String`, `func enforceDictionaryCasing(_ text: String, _ entries: [DictionaryEntry]) -> String`
  - `struct ExpansionEntry: Codable, Sendable, Equatable { var trigger: String; var text: String }`, `func applyExpansions(_ text: String, _ entries: [ExpansionEntry]) -> String`
  - internal `boundaryPattern(_ term: String) -> NSRegularExpression` and `phrasesLongestFirst(_ map: [String: String]) -> [(phrase: String, symbol: String)]`

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

struct FormatterVector: Decodable, Sendable, CustomTestStringConvertible {
    struct Settings: Decodable, Sendable {
        var level: FormatOptions.Level?
        var numbers: FormatOptions.Numbers?
        var smartLists: Bool?
        var dictionary: [DictionaryEntry]?
        var expansions: [ExpansionEntry]?
    }

    let name: String
    let settings: Settings?
    let input: String
    let expected: String

    var testDescription: String { name }

    static let all: [FormatterVector] = {
        struct File: Decodable { let vectors: [FormatterVector] }
        let data = (try? SharedData(directory: repoShared).data(named: "test-vectors.json")) ?? Data()
        return (try? JSONDecoder().decode(File.self, from: data).vectors) ?? []
    }()
}

let formatSpec: FormatSpec = {
    do {
        return try SharedData(directory: repoShared).decode(FormatSpec.self, from: "format-spec.json")
    } catch {
        preconditionFailure("format-spec.json does not load: \(error)")
    }
}()

@Suite struct FormatterVectorTests {
    @Test func everyVectorLoaded() throws {
        let data = try SharedData(directory: repoShared).data(named: "test-vectors.json")
        let raw = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let count = try #require((raw["vectors"] as? [Any])?.count)
        #expect(count > 0)
        #expect(FormatterVector.all.count == count)
    }

    /// Desktop's pipeline: the dictionary on raw text, formatting, exact
    /// dictionary casing, then expansions last.
    @Test(arguments: FormatterVector.all)
    func matchesDesktop(_ vector: FormatterVector) {
        let options = FormatOptions(
            level: vector.settings?.level ?? .full,
            numbers: vector.settings?.numbers ?? .auto,
            smartLists: vector.settings?.smartLists ?? false
        )
        let dictionary = vector.settings?.dictionary ?? []
        let formatted = formatTranscript(applyDictionary(vector.input, dictionary), options: options, spec: formatSpec)
        let result = applyExpansions(enforceDictionaryCasing(formatted, dictionary), vector.settings?.expansions ?? [])
        #expect(result == vector.expected)
    }

    @Test func equalLengthPhrasesGoInAlphabeticalOrder() throws {
        let data = try SharedData(directory: repoShared).data(named: "format-spec.json")
        var raw = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        raw["spokenPunctuation"] = ["map": ["b c": "Y", "a b": "X"]]
        let spec = try JSONDecoder().decode(FormatSpec.self, from: JSONSerialization.data(withJSONObject: raw))
        #expect(formatTranscript("a b c", options: FormatOptions(), spec: spec) == "X c")
    }

    @Test func everyUnitHasItsOwnValue() {
        let values = formatSpec.numbers.units.values
        #expect(Set(values).count == values.count)
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `swift test --package-path ios/MurmurCore`
Expected: FAIL to compile, with errors like `cannot find type 'FormatOptions' in scope` and `cannot find 'formatTranscript' in scope`.

- [ ] **Step 3: Write `Formatter.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The deterministic formatter, desktop's src/shared/formatter.ts in
// Swift. Pure, no IO: the rules come from shared/format-spec.json and the
// proof from shared/test-vectors.json. The cleanup model (IOS-010) falls
// back to this output on any failure.
import Foundation

public struct FormatSpec: Decodable, Sendable {
    public struct Words: Decodable, Sendable { public let words: [String] }
    public struct Triggers: Decodable, Sendable { public let triggers: [String] }
    public struct Phrases: Decodable, Sendable { public let map: [String: String] }
    public struct Numbers: Decodable, Sendable {
        public let units: [String: Int]
        public let tens: [String: Int]
    }
    public struct Terminal: Decodable, Sendable {
        public let minWords: Int
        public let append: String
    }

    public let fillers: Words
    public let scratchThat: Triggers
    public let spokenPunctuation: Phrases
    public let listCommands: Phrases
    public let numbers: Numbers
    public let terminalPunctuation: Terminal
}

public struct FormatOptions: Sendable, Equatable {
    public enum Level: String, Codable, Sendable { case off, light, full }
    public enum Numbers: String, Codable, Sendable { case auto, words, digits }

    public var level: Level
    public var numbers: Numbers
    /// The smart lists setting: spoken list commands convert only when true.
    public var smartLists: Bool

    public init(level: Level = .full, numbers: Numbers = .auto, smartLists: Bool = false) {
        self.level = level
        self.numbers = numbers
        self.smartLists = smartLists
    }
}

/// Format a raw transcript deterministically according to the spec.
public func formatTranscript(_ raw: String, options: FormatOptions, spec: FormatSpec) -> String {
    let trimmed = JS.trim(raw)
    if options.level == .off { return trimmed }

    var out = removeFillers(trimmed, spec.fillers.words)

    if options.level == .full {
        // Punctuation first: scratch that needs real sentence boundaries
        // to know where the current sentence starts.
        out = applySpokenPunctuation(out, spec.spokenPunctuation.map)
        // List commands share spoken punctuation's matching rules and stage.
        if options.smartLists { out = applySpokenPunctuation(out, spec.listCommands.map) }
        out = applyScratchThat(out, spec.scratchThat.triggers)
    }

    out = fixWhitespace(out)

    if options.level == .full && options.numbers == .digits {
        out = wordsToDigits(out, units: spec.numbers.units, tens: spec.numbers.tens)
    }
    if options.level == .full && options.numbers == .words {
        out = digitsToWords(out, units: spec.numbers.units)
    }

    out = capitalizeSentences(out)

    if options.level == .full {
        out = ensureTerminal(
            out,
            minWords: spec.terminalPunctuation.minWords,
            append: spec.terminalPunctuation.append,
            smartLists: options.smartLists
        )
    }
    return out
}

func removeFillers(_ text: String, _ words: [String]) -> String {
    guard !words.isEmpty else { return text }
    let names = words.map(JS.escape).joined(separator: "|")
    let pattern = "(?:^|\(JS.space))(?:\(names))(?=\(JS.space)|[.,!?;:]|\(JS.end))"
    return JS.replace(text, JS.regex(pattern, ignoreCase: true), with: "")
}

func applyScratchThat(_ text: String, _ triggers: [String]) -> String {
    var out = text
    while true {
        var earliest: NSRange?
        for trigger in triggers {
            let regex = JS.regex("\(JS.boundary)\(JS.escape(trigger))\(JS.boundary)[.,]?", ignoreCase: true)
            if let match = regex.firstMatch(in: out, range: NSRange(location: 0, length: out.utf16.count)),
                earliest.map({ match.range.location < $0.location }) ?? true
            {
                earliest = match.range
            }
        }
        guard let hit = earliest else { return out }
        // Delete from the start of the current sentence through the trigger.
        let source = out as NSString
        let before = source.substring(to: hit.location) as NSString
        let boundary = [".", "!", "?", "\n"].map { JS.lastIndex(of: $0, in: before) }.max() ?? -1
        let sentenceStart = boundary + 1
        let joined = source.substring(to: sentenceStart) + " " + source.substring(from: hit.location + hit.length)
        out = JS.replace(joined, JS.regex(" {2,}"), with: " ")
    }
}

/// Longest phrase first; equal lengths in alphabetical order, so every
/// platform applies them the same way (format-spec.json).
func phrasesLongestFirst(_ map: [String: String]) -> [(phrase: String, symbol: String)] {
    map.map { (phrase: $0.key, symbol: $0.value) }.sorted { a, b in
        let la = a.phrase.utf16.count
        let lb = b.phrase.utf16.count
        return la != lb ? la > lb : JS.less(a.phrase, b.phrase)
    }
}

func applySpokenPunctuation(_ text: String, _ map: [String: String]) -> String {
    var out = text
    for (phrase, symbol) in phrasesLongestFirst(map) {
        let pattern = "(?:^|\(JS.space))\(JS.escape(phrase))(?=\(JS.space)|[.,]|\(JS.end))[.,]?"
        out = JS.replace(out, JS.regex(pattern, ignoreCase: true), with: symbol)
    }
    return out
}

func fixWhitespace(_ text: String) -> String {
    var out = JS.replace(text, JS.regex("[ \\t]+"), with: " ")
    out = JS.replace(out, JS.regex(" ?([.,!?;:]) ?")) { match, source in
        source.substring(with: match.range(at: 1)) + " "
    }
    out = JS.replace(out, JS.regex("([.,!?;:]) (?=[.,!?;:])")) { match, source in
        source.substring(with: match.range(at: 1))
    }
    out = JS.replace(out, JS.regex(" ?\\n ?"), with: "\n")
    out = JS.replace(out, JS.regex("\\n{3,}"), with: "\n\n")
    out = JS.replace(out, JS.regex(" +\(JS.lineEnd)"), with: "")
    out = JS.replace(out, JS.regex("\(JS.lineStart) +"), with: "")
    return JS.trim(out)
}

func wordsToDigits(_ text: String, units: [String: Int], tens: [String: Int]) -> String {
    let tensNames = tens.keys.sorted(by: JS.less).map(JS.escape).joined(separator: "|")
    let unitNames = units.filter { (1...9).contains($0.value) }.keys.sorted(by: JS.less).map(JS.escape).joined(separator: "|")
    let pairs = JS.regex("\(JS.boundary)(\(tensNames))[ -](\(unitNames))\(JS.boundary)", ignoreCase: true)
    var out = JS.replace(text, pairs) { match, source in
        let ten = tens[source.substring(with: match.range(at: 1)).lowercased()]
        let unit = units[source.substring(with: match.range(at: 2)).lowercased()]
        // ICU folds a few exotic letters JavaScript would not match at all
        // (the long s, the Kelvin sign); leave those words alone.
        guard let ten, let unit else { return source.substring(with: match.range) }
        return String(ten + unit)
    }
    let allNames = Set(units.keys).union(tens.keys).sorted(by: JS.less).map(JS.escape).joined(separator: "|")
    out = JS.replace(out, JS.regex("\(JS.boundary)(\(allNames))\(JS.boundary)", ignoreCase: true)) { match, source in
        let word = source.substring(with: match.range)
        guard let value = units[word.lowercased()] ?? tens[word.lowercased()] else { return word }
        return String(value)
    }
    return out
}

func digitsToWords(_ text: String, units: [String: Int]) -> String {
    // format-spec.json gives every unit its own value, so one word per value.
    var byValue: [Int: String] = [:]
    for (word, value) in units.sorted(by: { JS.less($0.key, $1.key) }) where byValue[value] == nil {
        byValue[value] = word
    }
    return JS.replace(text, JS.regex("\(JS.boundary)([0-9]{1,2})\(JS.boundary)")) { match, source in
        let digits = source.substring(with: match.range)
        return Int(digits).flatMap { byValue[$0] } ?? digits
    }
}

func capitalizeSentences(_ text: String) -> String {
    var out = JS.replace(text, JS.regex("^\(JS.space)*([a-z])"), all: false) { match, source in
        source.substring(with: match.range).uppercased()
    }
    out = JS.replace(out, JS.regex("([.!?][\"')\\]]?\(JS.space)+|\\n+\(JS.space)*)([a-z])")) { match, source in
        source.substring(with: match.range(at: 1)) + source.substring(with: match.range(at: 2)).uppercased()
    }
    return out
}

func ensureTerminal(_ text: String, minWords: Int, append: String, smartLists: Bool) -> String {
    if text.isEmpty { return text }
    // A list never gets a period stapled onto its last item. Gated on the
    // setting: with smart lists off, even a raw transcript that happens to
    // start a line with a dash formats exactly as before.
    if smartLists {
        let source = text as NSString
        let lastLine = source.substring(from: JS.lastIndex(of: "\n", in: source) + 1)
        if lastLine.utf16.starts(with: "- ".utf16) { return text }
    }
    if JS.wordCount(text) < minWords { return text }
    if let last = text.utf16.last, JS.isWord(last) || last == 0x29 { return text + append }
    return text
}
```

- [ ] **Step 4: Write `Dictionary.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The custom dictionary, desktop's src/shared/dictionary.ts in Swift:
// spellings fixed in the raw transcript before formatting, then their
// exact casing re-asserted at the very end. Word-boundary safe: it only
// ever changes words that were actually spoken.
import Foundation

public struct DictionaryEntry: Codable, Sendable, Equatable {
    public var from: String
    public var to: String

    public init(from: String, to: String) {
        self.from = from
        self.to = to
    }
}

/// Whole-word or whole-phrase matcher, shared with expansions. \b only
/// works against word characters, so a term that starts or ends with a
/// symbol (c++) is bounded by whitespace or the edge instead.
func boundaryPattern(_ term: String) -> NSRegularExpression {
    let lead = term.utf16.first.map(JS.isWord) == true ? JS.boundary : "(?<!\(JS.nonSpace))"
    let tail = term.utf16.last.map(JS.isWord) == true ? JS.boundary : "(?!\(JS.nonSpace))"
    return JS.regex(lead + JS.escape(term) + tail, ignoreCase: true)
}

private func isUsable(_ entry: DictionaryEntry) -> Bool {
    !JS.trim(entry.from).isEmpty && !JS.trim(entry.to).isEmpty
}

/// Replace each entry's from (any case, whole words, phrases allowed)
/// with its to, as written. Longer phrases go first; empty entries are
/// skipped.
public func applyDictionary(_ text: String, _ entries: [DictionaryEntry]) -> String {
    let ordered = entries.enumerated().filter { isUsable($0.element) }.sorted { a, b in
        let la = a.element.from.utf16.count
        let lb = b.element.from.utf16.count
        return la != lb ? la > lb : a.offset < b.offset
    }
    var out = text
    for (_, entry) in ordered {
        out = JS.replace(out, boundaryPattern(JS.trim(entry.from)), with: JS.trim(entry.to))
    }
    return out
}

/// Re-assert each entry's exact casing wherever it appears, however
/// cased. Runs last, after capitalization and the cleanup model, so an
/// entry written in lowercase stays lowercase even at a sentence start.
public func enforceDictionaryCasing(_ text: String, _ entries: [DictionaryEntry]) -> String {
    var out = text
    for entry in entries where isUsable(entry) {
        out = JS.replace(out, boundaryPattern(JS.trim(entry.to)), with: JS.trim(entry.to))
    }
    return out
}
```

- [ ] **Step 5: Write `Expansions.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Text expansions, desktop's src/shared/expansions.ts in Swift: spoken
// triggers become saved snippets. Runs last, so triggers match clean
// formatted text and a snippet goes in exactly as written. One pass: a
// snippet is never rescanned, so one expansion can never set off another.
import Foundation

public struct ExpansionEntry: Codable, Sendable, Equatable {
    public var trigger: String
    public var text: String

    public init(trigger: String, text: String) {
        self.trigger = trigger
        self.text = text
    }
}

/// Replace each spoken trigger (any case, whole phrase) with its snippet.
/// At the same position the longest trigger wins, and matches never
/// overlap: one expansion per spot.
public func applyExpansions(_ text: String, _ entries: [ExpansionEntry]) -> String {
    let usable = entries.filter { !JS.trim($0.trigger).isEmpty && !JS.trim($0.text).isEmpty }
    guard !usable.isEmpty else { return text }

    struct Hit {
        let start: Int
        let end: Int
        let replacement: String
        let order: Int
    }
    var hits: [Hit] = []
    let whole = NSRange(location: 0, length: text.utf16.count)
    for entry in usable {
        for match in boundaryPattern(JS.trim(entry.trigger)).matches(in: text, range: whole) {
            let end = match.range.location + match.range.length
            hits.append(Hit(start: match.range.location, end: end, replacement: entry.text, order: hits.count))
        }
    }
    guard !hits.isEmpty else { return text }

    // Earliest first; at the same start the longest match wins.
    hits.sort { a, b in
        if a.start != b.start { return a.start < b.start }
        if a.end - a.start != b.end - b.start { return a.end - a.start > b.end - b.start }
        return a.order < b.order
    }
    let source = text as NSString
    var out = ""
    var cursor = 0
    for hit in hits where hit.start >= cursor {
        out += source.substring(with: NSRange(location: cursor, length: hit.start - cursor)) + hit.replacement
        cursor = hit.end
    }
    return out + source.substring(from: cursor)
}
```

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: PASS, including `matchesDesktop` with 51 cases. A failing case names the vector; compare the Swift step against the matching TypeScript function line by line before touching anything else.

- [ ] **Step 7: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git add ios/MurmurCore/Sources/MurmurCore/Formatter.swift ios/MurmurCore/Sources/MurmurCore/Dictionary.swift ios/MurmurCore/Sources/MurmurCore/Expansions.swift ios/MurmurCore/Tests/MurmurCoreTests/FormatterVectorTests.swift
git commit -m "IOS-003: the formatter, dictionary, and expansions in MurmurCore pass every shared vector"
git pull --rebase origin main
```

---

### Task 7: The speech gate and the hallucination filters

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/SpeechGate.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/SpeechVectorTests.swift`

**Interfaces:**
- Consumes: `JS` (Task 5); `shared/speech-gate.json`, `shared/hallucinations.json` (Task 1); `shared/speech-vectors.json` (Task 3).
- Produces (public): `struct SpeechGateSpec: Decodable, Sendable, Equatable` (the five numbers, as Double), `struct HallucinationList: Decodable, Sendable, Equatable { phrases; artifactTails }`, and `enum SpeechGate` with `voicedMs(_:sampleRate:spec:) -> Double`, `hasSpeechEnergy(_:sampleRate:spec:) -> Bool`, `peakLevel(_:) -> Double`, `isDeadStream(peak:spec:) -> Bool`, `trimSilence(_:sampleRate:spec:) -> [Float]`, `normalizeTranscript(_:) -> String`, `isHallucination(_:phrases:) -> Bool`, `stripTrailingHallucinations(_:phrases:) -> String`. Samples are `[Float]`, sample rates `Int`.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

struct SpeechVectors: Decodable, Sendable {
    struct Segment: Decodable, Sendable {
        let kind: String
        let samples: Int
        let amplitude: Double?
        let periodSamples: Int?
    }

    struct Signal: Decodable, Sendable, CustomTestStringConvertible {
        struct Expected: Decodable, Sendable {
            let voicedMs: Double
            let hasSpeech: Bool
            let trimmedSamples: Int
            let peak: Double
            let deadStream: Bool
        }

        let name: String
        let sampleRate: Int
        let segments: [Segment]
        let expected: Expected
        var testDescription: String { name }

        /// The audio the segments describe (speech-vectors.json comment).
        var samples: [Float] {
            var out: [Float] = []
            for segment in segments {
                guard segment.kind == "square", let amplitude = segment.amplitude, let period = segment.periodSamples else {
                    out.append(contentsOf: repeatElement(0, count: segment.samples))
                    continue
                }
                let level = Float(amplitude)
                for i in 0..<segment.samples { out.append((i / (period / 2)) % 2 == 0 ? level : -level) }
            }
            return out
        }
    }

    struct Verdict: Decodable, Sendable { let text: String; let expected: Bool }
    struct Strip: Decodable, Sendable { let text: String; let expected: String }

    let signals: [Signal]
    let hallucinations: [Verdict]
    let trailing: [Strip]

    static let file: SpeechVectors? = try? SharedData(directory: repoShared).decode(SpeechVectors.self, from: "speech-vectors.json")
}

let gateSpec: SpeechGateSpec? = try? SharedData(directory: repoShared).decode(SpeechGateSpec.self, from: "speech-gate.json")
let hallucinationList: HallucinationList? = try? SharedData(directory: repoShared).decode(HallucinationList.self, from: "hallucinations.json")

@Suite struct SpeechVectorTests {
    @Test func theSharedFilesLoad() throws {
        let file = try #require(SpeechVectors.file)
        #expect(!file.signals.isEmpty && !file.hallucinations.isEmpty && !file.trailing.isEmpty)
        #expect(gateSpec == SpeechGateSpec(windowMs: 30, rmsThreshold: 0.01, minVoicedMs: 200, paddingMs: 250, deadStreamPeak: 0.001))
        #expect(hallucinationList != nil)
    }

    @Test(arguments: SpeechVectors.file?.signals ?? [])
    func signalMatchesDesktop(_ signal: SpeechVectors.Signal) throws {
        let spec = try #require(gateSpec)
        let samples = signal.samples
        let peak = SpeechGate.peakLevel(samples)
        #expect(SpeechGate.voicedMs(samples, sampleRate: signal.sampleRate, spec: spec) == signal.expected.voicedMs)
        #expect(SpeechGate.hasSpeechEnergy(samples, sampleRate: signal.sampleRate, spec: spec) == signal.expected.hasSpeech)
        #expect(SpeechGate.trimSilence(samples, sampleRate: signal.sampleRate, spec: spec).count == signal.expected.trimmedSamples)
        #expect(peak == signal.expected.peak)
        #expect(SpeechGate.isDeadStream(peak: peak, spec: spec) == signal.expected.deadStream)
    }

    @Test func hallucinationsMatchDesktop() throws {
        let file = try #require(SpeechVectors.file)
        let list = try #require(hallucinationList)
        for verdict in file.hallucinations {
            #expect(SpeechGate.isHallucination(verdict.text, phrases: list.phrases) == verdict.expected, "\(verdict.text)")
        }
        for strip in file.trailing {
            #expect(SpeechGate.stripTrailingHallucinations(strip.text, phrases: list.artifactTails) == strip.expected, "\(strip.text)")
        }
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `swift test --package-path ios/MurmurCore`
Expected: FAIL to compile, with `cannot find type 'SpeechGateSpec' in scope`.

- [ ] **Step 3: Write `SpeechGate.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The two silence guards, desktop's src/shared/speech-gate.ts in Swift.
// Before upload: an energy gate that measures voiced time, with its
// numbers from shared/speech-gate.json. After transcription: a filter for
// empty output and the stock phrases Whisper-family models invent on
// silence, from shared/hallucinations.json. Either one firing means
// nothing is ever inserted.
import Foundation

public struct SpeechGateSpec: Decodable, Sendable, Equatable {
    public let windowMs: Double
    public let rmsThreshold: Double
    public let minVoicedMs: Double
    public let paddingMs: Double
    public let deadStreamPeak: Double
}

public struct HallucinationList: Decodable, Sendable, Equatable {
    /// Whole transcripts that are artifacts.
    public let phrases: [String]
    /// The subset safe to strip off the end of real speech.
    public let artifactTails: [String]
}

public enum SpeechGate {
    private static func windowSize(_ spec: SpeechGateSpec, _ sampleRate: Int) -> Int {
        max(1, Int(JS.round(spec.windowMs / 1000 * Double(sampleRate))))
    }

    private static func windowIsVoiced(_ samples: [Float], from start: Int, size: Int, spec: SpeechGateSpec) -> Bool {
        var sum = 0.0
        for i in start..<(start + size) {
            let sample = Double(samples[i])
            sum += sample * sample
        }
        return (sum / Double(size)).squareRoot() >= spec.rmsThreshold
    }

    /// Total milliseconds of windows whose RMS clears the threshold.
    public static func voicedMs(_ samples: [Float], sampleRate: Int, spec: SpeechGateSpec) -> Double {
        let size = windowSize(spec, sampleRate)
        var voiced = 0.0
        var start = 0
        while start + size <= samples.count {
            if windowIsVoiced(samples, from: start, size: size, spec: spec) { voiced += spec.windowMs }
            start += size
        }
        return voiced
    }

    /// True when the audio holds enough voiced time to be worth uploading.
    public static func hasSpeechEnergy(_ samples: [Float], sampleRate: Int, spec: SpeechGateSpec) -> Bool {
        voicedMs(samples, sampleRate: sampleRate, spec: spec) >= spec.minVoicedMs
    }

    /// The loudest absolute sample in the take: the capture health number.
    public static func peakLevel(_ samples: [Float]) -> Double {
        Double(samples.reduce(Float(0)) { max($0, abs($1)) })
    }

    /// A take this quiet is a dead capture stream, not a quiet person.
    public static func isDeadStream(peak: Double, spec: SpeechGateSpec) -> Bool {
        peak < spec.deadStreamPeak
    }

    /// Cut leading and trailing silence, keeping padding on both sides.
    /// Silence fed to speech models breeds invented phrases; voiced audio
    /// is never cut, so a spoken thank-you survives.
    public static func trimSilence(_ samples: [Float], sampleRate: Int, spec: SpeechGateSpec) -> [Float] {
        let size = windowSize(spec, sampleRate)
        var firstVoiced = -1
        var lastVoiced = -1
        var start = 0
        while start + size <= samples.count {
            if windowIsVoiced(samples, from: start, size: size, spec: spec) {
                if firstVoiced == -1 { firstVoiced = start }
                lastVoiced = start + size
            }
            start += size
        }
        if firstVoiced == -1 { return [] }
        let padding = Int(JS.round(spec.paddingMs / 1000 * Double(sampleRate)))
        return Array(samples[max(0, firstVoiced - padding)..<min(samples.count, lastVoiced + padding)])
    }

    private static let stripped: Set<UInt16> = Set(".,!?;:'\"\u{201C}\u{201D}\u{2018}\u{2019}-()[]".utf16)

    /// Lowercase, strip punctuation, and collapse whitespace, for exact
    /// matching. lowercased() matches JavaScript's toLowerCase except for
    /// a Greek capital sigma ending a word (σ here, ς there), which can
    /// never make a transcript equal one of the English phrases.
    public static func normalizeTranscript(_ text: String) -> String {
        var units: [UInt16] = []
        var pendingSpace = false
        for unit in text.lowercased().utf16 where !stripped.contains(unit) {
            if JS.isSpace(unit) {
                pendingSpace = true
                continue
            }
            if pendingSpace && !units.isEmpty { units.append(0x20) }
            pendingSpace = false
            units.append(unit)
        }
        return String(decoding: units, as: UTF16.self)
    }

    /// True when the transcript is empty or exactly one of the phrases
    /// after normalizing: a real dictation that merely contains one passes.
    public static func isHallucination(_ text: String, phrases: [String]) -> Bool {
        let normalized = normalizeTranscript(text)
        if normalized.isEmpty { return true }
        return phrases.contains { normalizeTranscript($0) == normalized }
    }

    /// Strip trailing sentences matching the phrases from a transcript of
    /// several sentences. Callers pass artifactTails, never the full list,
    /// so a real spoken sign-off always survives.
    public static func stripTrailingHallucinations(_ text: String, phrases: [String]) -> String {
        let trimmed = JS.trim(text)
        let source = trimmed as NSString
        var sentences: [String] = []
        var cursor = 0
        let breaks = JS.regex("(?<=[.!?])\(JS.space)+").matches(in: trimmed, range: NSRange(location: 0, length: source.length))
        for found in breaks {
            sentences.append(source.substring(with: NSRange(location: cursor, length: found.range.location - cursor)))
            cursor = found.range.location + found.range.length
        }
        sentences.append(source.substring(from: cursor))
        while sentences.count > 1, let last = sentences.last, isHallucination(last, phrases: phrases) {
            sentences.removeLast()
        }
        return sentences.joined(separator: " ")
    }
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: PASS, including `signalMatchesDesktop` with 11 cases and `hallucinationsMatchDesktop`.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git add ios/MurmurCore/Sources/MurmurCore/SpeechGate.swift ios/MurmurCore/Tests/MurmurCoreTests/SpeechVectorTests.swift
git commit -m "IOS-003: the speech gate and hallucination filters in MurmurCore pass the shared speech vectors"
git pull --rebase origin main
```

---

### Task 8: WAV encoding, byte for byte

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/Wav.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/WavVectorTests.swift`

**Interfaces:**
- Consumes: `JS.round` (Task 5); `shared/wav-vectors.json` (Task 4).
- Produces (public): `enum Wav { static let targetSampleRate = 16_000; static func encodePcm16(_ samples: [Float], sampleRate: Int) -> Data }`, and internal `Wav.pcm16(_ sample: Float) -> Int16`.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

struct WavCase: Decodable, Sendable, CustomTestStringConvertible {
    let name: String
    let sampleRate: Int
    let samples: [Double]
    let expectedHex: String
    var testDescription: String { name }

    static let all: [WavCase] = {
        struct File: Decodable { let cases: [WavCase] }
        return (try? SharedData(directory: repoShared).decode(File.self, from: "wav-vectors.json").cases) ?? []
    }()
}

@Suite struct WavVectorTests {
    @Test func theSharedFileLoads() {
        #expect(!WavCase.all.isEmpty)
    }

    /// Each JSON number becomes a 32-bit float the way a Float32Array
    /// makes one: parsed as a Double, then rounded to the nearest Float.
    @Test(arguments: WavCase.all)
    func bytesMatchDesktop(_ wavCase: WavCase) {
        let data = Wav.encodePcm16(wavCase.samples.map { Float($0) }, sampleRate: wavCase.sampleRate)
        #expect(data.map { String(format: "%02x", $0) }.joined() == wavCase.expectedHex)
    }

    @Test func aNaNSampleWritesZero() {
        #expect(Wav.pcm16(.nan) == 0)
        #expect(Wav.pcm16(.infinity) == 32767)
        #expect(Wav.pcm16(-.infinity) == -32767)
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `swift test --package-path ios/MurmurCore`
Expected: FAIL to compile, with `cannot find 'Wav' in scope`.

- [ ] **Step 3: Write `Wav.swift`**

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
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: PASS, including `bytesMatchDesktop` with 6 cases.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git add ios/MurmurCore/Sources/MurmurCore/Wav.swift ios/MurmurCore/Tests/MurmurCoreTests/WavVectorTests.swift
git commit -m "IOS-003: WAV encoding in MurmurCore writes desktop's bytes"
git pull --rebase origin main
```

---

### Task 9: The provider catalog as Swift types

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/ProviderCatalog.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/ProviderCatalogTests.swift`

**Interfaces:**
- Consumes: `shared/provider-catalog.json` (unchanged).
- Produces (public): `struct ProviderCatalog: Decodable, Sendable` with `catalogVersion`, `verifiedOn`, `estimate`, `providers`, and nested `Kind` (`stt`, `llm`, `decide`), `SttModel`, `LlmModel`, `Provider` (`id`, `name`, `kinds`, `baseUrl`, `llmBaseUrl?`, `keyUrl?`, `free?`, `verifiedOn`, `sources`, `nuances`, `sttModels`, `llmModels`, `keyPrefixes?`), and `Estimate`. Required and optional fields match desktop's `CatalogProvider` in `src/shared/catalog.ts`. IOS-005 builds the Provider screen on these.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct ProviderCatalogTests {
    func catalogJSON() throws -> [String: Any] {
        let data = try SharedData(directory: repoShared).data(named: "provider-catalog.json")
        return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func decodes(_ json: [String: Any]) -> Bool {
        guard let data = try? JSONSerialization.data(withJSONObject: json) else { return false }
        return (try? JSONDecoder().decode(ProviderCatalog.self, from: data)) != nil
    }

    @Test func theBundledCatalogLoads() throws {
        let catalog = try SharedData(directory: repoShared).decode(ProviderCatalog.self, from: "provider-catalog.json")
        #expect(catalog.catalogVersion == 1)
        let groq = try #require(catalog.providers.first)
        #expect(groq.id == "groq")
        #expect(groq.keyPrefixes == ["gsk_"])
        #expect(groq.keyUrl == "https://console.groq.com/keys")
        #expect(groq.kinds == [.stt, .llm])
        #expect(groq.sttModels.first?.id == "whisper-large-v3-turbo")
    }

    /// The fields desktop's CatalogProvider requires (src/shared/catalog.ts).
    @Test(arguments: ["id", "name", "kinds", "baseUrl", "verifiedOn", "sources", "nuances", "sttModels", "llmModels"])
    func aProviderMissingARequiredFieldFails(_ field: String) throws {
        var json = try catalogJSON()
        var providers = try #require(json["providers"] as? [[String: Any]])
        providers[0][field] = nil
        json["providers"] = providers
        #expect(!decodes(json))
    }

    @Test(arguments: ["catalogVersion", "verifiedOn", "estimate", "providers"])
    func aCatalogMissingARequiredFieldFails(_ field: String) throws {
        var json = try catalogJSON()
        json[field] = nil
        #expect(!decodes(json))
    }

    @Test(arguments: ["tokensPerWord", "promptOverheadTokens", "sessionsPer1kWords", "fallbackWpm"])
    func anEstimateMissingAFieldFails(_ field: String) throws {
        var json = try catalogJSON()
        var estimate = try #require(json["estimate"] as? [String: Any])
        estimate[field] = nil
        json["estimate"] = estimate
        #expect(!decodes(json))
    }

    @Test func aModelWithoutAnIdFails() throws {
        var json = try catalogJSON()
        var providers = try #require(json["providers"] as? [[String: Any]])
        var models = try #require(providers[0]["sttModels"] as? [[String: Any]])
        models[0]["id"] = nil
        providers[0]["sttModels"] = models
        json["providers"] = providers
        #expect(!decodes(json))
    }

    @Test func anUnknownKindFailsAsOnDesktop() throws {
        var json = try catalogJSON()
        var providers = try #require(json["providers"] as? [[String: Any]])
        providers[0]["kinds"] = ["stt", "tts"]
        json["providers"] = providers
        #expect(!decodes(json))
    }

    @Test func extraFieldsAreIgnored() throws {
        var json = try catalogJSON()
        json["somethingNew"] = true
        #expect(decodes(json))
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `swift test --package-path ios/MurmurCore`
Expected: FAIL to compile, with `cannot find 'ProviderCatalog' in scope`.

- [ ] **Step 3: Write `ProviderCatalog.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The provider catalog, shared/provider-catalog.json, as Swift types:
// the presets, their models and rates, key prefixes, and key pages
// (desktop's CatalogProvider in src/shared/catalog.ts). Every field
// desktop requires is required here too, so a catalog missing one fails
// to load on iPhone as it fails desktop's check.
import Foundation

public struct ProviderCatalog: Decodable, Sendable {
    public enum Kind: String, Decodable, Sendable {
        /// Speech to text.
        case stt
        /// An OpenAI-compatible chat model, for cleanup and transform.
        case llm
        /// A decision model that answers typed questions (brain dump sorting).
        case decide
    }

    public struct SttModel: Decodable, Sendable {
        public let id: String
        public let label: String?
        /// USD per hour of audio unless currency says otherwise.
        public let perHourUsd: Double?
        public let currency: String?
        public let minimumBillableSeconds: Double?
    }

    public struct LlmModel: Decodable, Sendable {
        public let id: String
        public let label: String?
        public let inputPerMTok: Double?
        public let outputPerMTok: Double?
        /// ISO 4217; USD when absent.
        public let currency: String?
    }

    public struct Provider: Decodable, Sendable {
        public let id: String
        public let name: String
        public let kinds: [Kind]
        public let baseUrl: String
        /// Cleanup uses this instead of baseUrl when present.
        public let llmBaseUrl: String?
        /// Where to get a key.
        public let keyUrl: String?
        /// Runs on the person's own machine at no cost.
        public let free: Bool?
        public let verifiedOn: String
        public let sources: [String]
        public let nuances: [String]
        public let sttModels: [SttModel]
        public let llmModels: [LlmModel]
        /// Key formats only this provider uses; listed only when unambiguous.
        public let keyPrefixes: [String]?
    }

    public struct Estimate: Decodable, Sendable {
        public let tokensPerWord: Double
        public let promptOverheadTokens: Double
        public let sessionsPer1kWords: Double
        public let fallbackWpm: Double
    }

    public let catalogVersion: Int
    public let verifiedOn: String
    public let estimate: Estimate
    public let providers: [Provider]
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: PASS, including 9 required provider fields, 4 catalog fields, and 4 estimate fields that each fail to load when removed.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git add ios/MurmurCore/Sources/MurmurCore/ProviderCatalog.swift ios/MurmurCore/Tests/MurmurCoreTests/ProviderCatalogTests.swift
git commit -m "IOS-003: the provider catalog loads into MurmurCore types, and a missing desktop field fails the test"
git pull --rebase origin main
```

---

### Task 10: IOS-003 passes

**Files:**
- Modify: `ios/prd.json` (IOS-003 `passes` and `notes`), then regenerate `ios/ROADMAP.md`

- [ ] **Step 1: Run every gate one last time**

```bash
npm run typecheck
npm run test
npm run smoke
swift test --package-path ios/MurmurCore
npm run ios:test
npm run ios:smoke
```

Expected: all green. `swift test` reports the SharedData, JS, formatter, speech, WAV, and catalog suites; `ios:smoke` reports `sharedJson` true with 12 bundled files.

- [ ] **Step 2: Mark IOS-003 passed**

Check every IOS-003 criterion against what ran. In `ios/prd.json`, set IOS-003 `passes` to `true`, and write `notes` saying how each was verified: the vector counts on each platform, the two moved files and the unchanged desktop suite, the speech and WAV vector counts, the catalog field tests, and the smoke results. Then run `npm run roadmap`.

- [ ] **Step 3: Commit**

```bash
git add ios/prd.json ios/ROADMAP.md
git commit -m "IOS-003 passes: MurmurCore gives desktop's answers on every shared vector"
git pull --rebase origin main
```

Push only with LaBroi's OK, after the review gate.
