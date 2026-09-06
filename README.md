# murmur

Push-to-talk dictation that lives in your tray. Hold a key, speak, release, and clean text lands at your cursor in any app. Windows and macOS. Bring your own key: Groq Whisper by default, any OpenAI-compatible endpoint supported.

The name is always lowercase: murmur.

## Why murmur

- **Push to talk, everywhere.** One hotkey (a combo, or modifiers alone like Ctrl+Alt) works in every app. A quiet waveform pill shows you are live; text arrives at your cursor when you release.
- **Bring your own key.** Your audio goes to the provider you configure and nowhere else. At Groq's rates, typical use costs cents per month, and the analytics tab shows the estimate live.
- **Formatting that fails open.** Filler removal, spoken punctuation, self-corrections, a custom dictionary, text expansions, and an AI cleanup pass that can only ever improve a transcript: any model failure inserts the deterministic text instead. A dictation is never lost.
- **Local by default.** History, analytics, and settings live on your machine. The API key is encrypted at rest. No servers, no accounts, no telemetry.
- **Open source, GPL-3.0.** Read every line.

## Getting started

1. Install murmur (build from source below; packaged installers are coming)
2. Launch it: a guided wizard walks you through the rest
3. Get a free key at [console.groq.com/keys](https://console.groq.com/keys) and paste it in
4. Grant the OS permissions the wizard asks for (macOS: microphone, accessibility, input monitoring)
5. Hold your hotkey, say something, release

## Documentation

- [Settings, explained](docs/settings.md): every control and scenario
- [Connecting a provider](docs/providers.md): Groq (default), OpenAI, local servers, any OpenAI-compatible endpoint, and troubleshooting
- [Coworker quickstart](docs/quickstart.md): install to first dictation in five minutes
- [The journey](docs/journey.md): belts, achievements, and unlocks, BJJ style

## Privacy

Audio is recorded only while your hotkey is held, silence is trimmed locally, and recordings go only to the provider you configured. Silent takes never leave your machine at all. Failed uploads are kept locally in `recovery/` so nothing you said disappears. Transcripts and usage numbers stay local.

## Build from source

Requires Node 22+. No compilers, no build tools: every native piece ships prebuilt.

```
git clone https://github.com/lbwalton/murmur.git
cd murmur
npm install
npm run dev
```

Quality gates: `npm run typecheck`, `npm run test`, and `npm run smoke` (boots the real app headless and checks every subsystem). All three must be green before any commit.

Packaging: `npm run dist:mac` or `npm run dist:win`.

## Project process

`prd.json` is the spec: every change maps to a story with acceptance criteria and a verified flag. `ROADMAP.md` is generated from it. Before any push, an independent review agent examines the full diff; confirmed findings get fixed first.

## License

GPL-3.0-only. Copyright (c) 2026 LaBroi Walton. See [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
