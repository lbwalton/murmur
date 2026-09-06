# murmur settings, explained

Everything the settings window can do, in the order it appears. For provider setup (base URL, keys, model ids per provider) see [providers.md](./providers.md).

## What does the setup checklist mean?

The chips at the top of the setup panel track everything murmur needs to work: API key saved, provider connected, microphone, accessibility, input monitoring, and a valid hotkey. Green check means done. A red ✗ means click the chip: murmur scrolls to the exact field and highlights what to fix. The panel badge reads "all set" only when every step is green.

## How do I set my API key?

Paste your provider key into **Groq API key** and press Save. It is encrypted with your operating system's secure storage, kept only on your machine, and sent only to the provider you configured. Only a masked form (like `gsk_…OC9g`) is ever displayed. Remove deletes it. Then press **Test connection**: green `connected` proves the key and base URL work together.

## How do I change the hotkey?

Click the hotkey field, then press the combo you want. Two kinds work:

- **Modifiers plus a key**: press them together, like Ctrl+Shift+M or Alt+Space
- **Modifiers alone**: press and release just the modifiers, like Ctrl+Alt. Hold them to talk, release to stop, exactly like the fn key in other dictation tools

Escape cancels capture. **Reset** restores the platform default. Bare letters and digits are refused on purpose: a hotkey of plain `H` would trigger every time you typed the letter. Function keys (F1 to F24) may stand alone.

## What is the difference between hold to talk and toggle?

**Hold to talk**: recording runs while the hotkey is held, stops when released. Best for short, frequent dictations. **Toggle**: tap once to start, tap again to stop. Best for long passages. Rapid accidental double-taps are absorbed.

## What do the insert modes do?

**Paste at cursor** places the finished text wherever your cursor is, then restores whatever your clipboard held before (an image or file on the clipboard is never destroyed, and anything you copy mid-dictation wins). **Copy only** skips the paste and leaves the text on the clipboard for you to place manually. If pasting ever fails (a revoked permission, an unusual app), murmur falls back to copy so the dictation is never lost.

## What do the formatting levels mean?

- **Off**: the raw transcript, untouched
- **Light**: filler words removed, sentences capitalized
- **Full**: everything in light, plus spoken punctuation commands ("period", "comma", "new line", "new paragraph"), self-corrections ("scratch that"), number style, closing punctuation, and the AI cleanup pass through your configured cleanup model

The cleanup pass fails open: if the model is slow, wrong, or chatty, murmur inserts the deterministically formatted text instead. A dictation is never lost or delayed indefinitely because of the cleanup model.

## How does the custom dictionary work?

The dictionary fixes words the speech model keeps mishearing, names especially. Add a pair in Settings, dictionary: what it is heard as, and what it should be written as. Matching is whole-word and case-insensitive; output uses exactly the casing you typed, even at the start of a sentence, and even after the AI cleanup pass. Multi-word phrases work, and longer phrases win over shorter ones. The dictionary can only ever change words that were actually spoken: an unrelated dictation is never touched, and dictionary content can never leak into your text on its own.

## How do text expansions work?

An expansion turns a spoken trigger phrase into a saved snippet: say "insert my email" and your address appears; say "sign off" and your closing lines appear. Add pairs in Settings, dictionary, Expansions. Triggers match after formatting, so they work naturally mid-sentence and next to punctuation. Snippets insert exactly as written, line breaks and casing included, and a snippet's own content never triggers another expansion. When two triggers could match at the same spot, the longer one wins.

## What are the waveform styles?

How the overlay pill visualizes your voice while recording. **Bars** is the classic equalizer. **Speckle** is a dust field that drifts when quiet and vibrates with your speech. **Preview overlay** shows the pill anytime without dictating. More styles arrive as unlockables with the rank system.

## Which macOS permissions does murmur need, and why?

| Permission | Why murmur needs it |
| --- | --- |
| Microphone | Recording your dictation. Requested automatically on first use |
| Accessibility | Pressing Cmd+V for you, so text lands at your cursor |
| Input monitoring | Hearing the hotkey while other apps are focused. After granting, quit and reopen murmur |

The permissions panel shows live status and deep-links each one into System Settings. murmur never uses these for anything beyond the stated purpose; the code is open source and auditable.

## Why does silence never insert anything?

Two guards. Before upload: if the recording contains under about a fifth of a second of voiced audio, murmur discards it locally, and your audio never leaves the machine. After transcription: empty results and the stock phrases speech models hallucinate on silence ("Thank you.") are recognized and dropped. The pill shows a quiet "no speech" instead.

## Where does my data live?

Settings, history, and analytics live in your platform's application data folder, locally. The API key is encrypted at rest. Audio goes only to the provider you configured, only when there is speech, and failed uploads are kept in a local `recovery/` folder so nothing is lost. murmur has no servers of its own.
