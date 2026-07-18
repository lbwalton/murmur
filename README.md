# Murmur

Push-to-talk dictation for Windows. Hold a key in any app, speak, release, and clean formatted text lands at your cursor. It is a from-scratch Windows answer to Wispr Flow, built to share: clone it, install, paste a free API key, and you are dictating in under five minutes.

Runs on Windows 10/11 today. A macOS port is planned in this same repo; until it lands, everything below is Windows.

## What it does

- **Hold to talk**: hold Right Ctrl (rebindable), speak, release to insert. There is also a toggle shortcut (Ctrl + Shift + Space) for long dictations.
- **Works everywhere**: Slack, Gmail, Docs, your IDE, anything with a text cursor. Focus never leaves the app you are typing in.
- **Live overlay**: a small floating meter shows your real waveform, a timer, and the result (word count or a readable error), then gets out of the way.
- **Smart formatting**: a fast LLM strips filler words, fixes punctuation and casing, and honors spoken commands like "new paragraph". It fails open: if formatting hiccups, you still get the raw transcript.
- **Custom dictionary**: names, brands, and acronyms spelled your way, hinted to Whisper and enforced by the formatter.
- **Learns from your fixes**: correct a transcript once (tray, Fix last dictation) and that exact fix applies to every future dictation; fix the same thing twice and the term joins your dictionary automatically.
- **Local history**: your last 200 dictations, stored only on your machine, with copy and delete.
- **Low cost by design**: Groq's free tier covers normal daily use. Heavy use costs about $0.04 per hour of speech. A local Whisper server drops in for $0.

## Quick start (from source)

Prerequisites: [Node.js LTS](https://nodejs.org) and a microphone.

```powershell
git clone <this repo>
cd murmur
npm install
npm start
```

First launch opens a three-step setup: paste a key, allow the mic, try it. That's it. Murmur then lives in your system tray.

## Get a free Groq key

1. Go to [console.groq.com](https://console.groq.com) and sign up (free, no card).
2. Open **API Keys**, create a key, copy it.
3. Paste it into Murmur's setup screen, or later under Settings, Voice & model.

The key is stored only on your machine, in `%APPDATA%\murmur\settings.json`, and is sent only as the auth header to the API you configure.

## Using it

| Action | Default |
|---|---|
| Hold to talk | Hold **Right Ctrl**, release to insert |
| Toggle recording | **Ctrl + Shift + Space** |
| Cancel while recording | **Esc** |
| Fix last dictation | Tray icon menu |
| Settings / History | Tray icon menu |

Both keys are rebindable in Settings, General. The hold key can be a single key or a chord: click the keycap, then press one key or hold a combo like Ctrl + Shift.

The tray icon (white waveform bars, amber while recording) lives at the bottom-right of the taskbar next to the clock. Windows 11 hides it behind the **^** chevron by default; drag it out to pin it.

## Teach it your words

Two layers keep names, brands, and jargon spelled right:

- **Dictionary** (Settings, Dictionary): add terms like your company or product names. They are hinted to Whisper and enforced by the formatter.
- **Learned corrections**: when a dictation comes out wrong, tray, **Fix last dictation**, correct the text, save. That exact fix applies to every future dictation automatically. Fix the same thing twice and the term joins your dictionary on its own. Learned pairs are listed in the Dictionary tab, each deletable.

## Every setting, briefly

**General**: hold-to-talk key or chord; toggle shortcut; insertion method (Paste is instant, Type is slower but works in paste-hostile apps); restore clipboard after pasting; audio cues; launch at login; max recording length (1 minute to 1 hour, or No limit, which warns you because the mic stays hot and very long takes can hit the API's 25 MB upload cap).

**Voice & model**: API key with a Test button; microphone picker with a live level check; Keep mic warm (holds the mic open briefly after a dictation so the next one starts instantly; the mic-in-use indicator stays lit for that window, so it's a setting and can be Off); transcription model dropdown with prices inline; Smart formatting toggle and its model dropdown; language pin; Base URL under Advanced for local or alternate endpoints.

**Dictionary**: your terms plus everything Murmur has learned from your fixes.

**History**: your last 200 dictations, local only, with Fix, Copy, Delete, Clear all, and an off switch.

## Costs, and how to run it free

| Option | Cost | Notes |
|---|---|---|
| Groq free tier (default) | $0 | Generous daily allowance, plenty for normal dictation |
| Groq paid | ~$0.04 per hour of audio | whisper-large-v3-turbo; even heavy daily use is pennies per month |
| Local Whisper server | $0 | Fully offline and private, see below |
| OpenAI Whisper API | ~$0.36 per hour | Works by changing Base URL + model, 9x Groq's price |

Smart formatting uses `llama-3.1-8b-instant` on Groq, which is effectively free at dictation volumes. Turning Smart formatting off removes that call entirely.

Settings, Voice & model has dropdowns for both models, listing whatever your endpoint actually serves with approximate pay-as-you-go prices annotated inline. On the free tier the price annotations are moot: everything is $0 until you add billing.

**Going fully local**: run any OpenAI-compatible Whisper server, for example [speaches](https://github.com/speaches-ai/speaches) or faster-whisper-server, then in Settings, Voice & model, Advanced set Base URL to your server (like `http://localhost:8000/v1`). The model dropdowns refresh from the new endpoint. Nothing leaves your machine.

## Privacy

- Audio is sent only to the API you configured, only while you are dictating, and is not stored by Murmur anywhere.
- History and settings live in `%APPDATA%\murmur\` and never leave your machine. History can be turned off.
- Insertion uses the clipboard for a moment. Note that Windows Clipboard History (Win + V), if you have it enabled, may keep a copy of transcripts like anything else you copy.
- No analytics, no telemetry, no accounts.

## Troubleshooting

**Can't find the app after launching**: it lives in the system tray, bottom-right by the clock, often hidden behind the **^** chevron on Windows 11. It is the white waveform bars icon.

**"Microphone blocked"**: Windows Settings, Privacy & security, Microphone: turn on "Let desktop apps access your microphone".

**Hold-to-talk shows unavailable**: the global key hook (uiohook-napi) failed to load on your machine. The toggle shortcut still works. Re-running `npm install` usually fixes it.

**Nothing pastes into a specific app**: some apps block synthetic paste. Switch Settings, General, Insertion method to "Type it out" for those.

**Toggle shortcut does nothing**: another app owns that combo. Rebind it in Settings, General.

**SmartScreen warning on the portable .exe**: expected for unsigned internal tools. Click "More info", then "Run anyway", or run from source instead.

## For coworkers without Node

Someone on the team can run `npm run dist` and hand you `release/Murmur-<version>-portable.exe`. Double-click it, no install, no admin rights.

## For developers

```
src/main/       app lifecycle, tray, hotkeys, transcription, insertion
src/preload/    contextBridge APIs (renderers are fully sandboxed)
src/renderer/   overlay pill + settings window (vanilla HTML/CSS/JS)
scripts/        gen-icons.js writes every icon from code (no binary assets)
prd.json        the product spec: stories with acceptance criteria
```

- `npm run smoke` boots every subsystem headlessly and prints `SMOKE_RESULT` JSON.
- `npm run dist` builds a portable .exe and an NSIS installer into `release/`.
- Development follows `prd.json`: each story has acceptance criteria and a `passes` flag. Do not mark a story passing until every criterion is verified.

## Architecture in one paragraph

An Electron tray app. The main process owns hotkeys (Electron `globalShortcut` for the toggle, `uiohook-napi` keydown/keyup for hold-to-talk), a transparent click-through overlay window, and a state machine (idle, listening, processing). The overlay renderer owns the microphone: MediaRecorder captures webm/opus while an AnalyserNode drives the waveform. Audio goes to `{baseUrl}/audio/transcriptions` (Groq Whisper by default), optionally through `{baseUrl}/chat/completions` for cleanup, then text is inserted by a persistent PowerShell SendKeys helper via clipboard swap + Ctrl+V, and the clipboard is restored. No native build tools are needed anywhere: the only native module ships prebuilt binaries.

## License

MIT. In plain terms: anyone may use, copy, modify, redistribute, and sell this software or products built on it, closed-source included, as long as the copyright notice and license text ride along. There is no warranty.
