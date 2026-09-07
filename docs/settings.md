# murmur settings, explained

Everything the settings window can do, in the order it appears. For provider setup (base URL, keys, model ids per provider) see [providers.md](./providers.md).

## What is the home view?

The window opens on your transcription log: every dictation, grouped by day, newest first, with the time, word count, and words-per-minute of each take. It updates live as you dictate. Each entry has a copy button, so a dictation that landed in the wrong window is one click from your clipboard. A red ✗ next to the settings tab means setup needs attention.

## How long is my history kept, and where?

History lives only on your machine, in murmur's local data folder. The retention control at the bottom of the home view prunes entries older than 30 days, 90 days, or a year, or keeps everything forever. Clear all wipes the log instantly. Nothing about your history is ever uploaded anywhere.

## What happens on first launch?

A guided wizard walks the whole setup: welcome, provider key with a live connection test, macOS permissions with deep links and live status, hotkey capture, and a test dictation. Each step gates on actually being done, so finishing the wizard means murmur genuinely works. Skip anytime; the setup checklist keeps tracking anything unfinished, and Run wizard in settings starts it over whenever you like.

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

## What does the analytics tab show, and how is the cost estimated?

The analytics tab shows your dictation in numbers: minutes, words, sessions, and an estimated cost for this month, a fourteen-day activity chart, and lifetime totals. The cost figure is an estimate computed locally from your usage at Groq's published rates (verified 2026-09-05, in `shared/rates.json`): audio time at the speech model's hourly rate, honoring Groq's 10-second minimum per request, plus an approximation of the cleanup model's token usage. Your provider bills you directly; murmur never sees your billing, and no numbers leave your machine. At typical usage, expect the estimate to read in cents, not dollars: that is the point of BYOK.

## How does the custom dictionary work?

The dictionary fixes words the speech model keeps mishearing, names especially. Add a pair in Settings, dictionary: what it is heard as, and what it should be written as. Matching is whole-word and case-insensitive; output uses exactly the casing you typed, even at the start of a sentence, and even after the AI cleanup pass. Multi-word phrases work, and longer phrases win over shorter ones. The dictionary can only ever change words that were actually spoken: an unrelated dictation is never touched, and dictionary content can never leak into your text on its own.

## How do text expansions work?

An expansion turns a spoken trigger phrase into a saved snippet: say "insert my email" and your address appears; say "sign off" and your closing lines appear. Add pairs in Settings, dictionary, Expansions. Triggers match after formatting, so they work naturally mid-sentence and next to punctuation. Snippets insert exactly as written, line breaks and casing included, and a snippet's own content never triggers another expansion. When two triggers could match at the same spot, the longer one wins.

## What are the waveform styles?

How the overlay pill visualizes your voice while recording. **Bars** is the classic equalizer. **Speckle** is a dust field that drifts when quiet and vibrates with your speech. **Preview overlay** shows the pill anytime without dictating. More styles arrive as unlockables with the rank system.

## How do recaps and the wrap-up work?

Turn on the daily recap in Settings and pick a time. At that moment (or on the next wake if the machine was asleep, once per day) murmur sends a notification with your day's numbers. Clicking it opens the wrap-up tab: sessions, minutes spoken, words, best words-per-minute, an estimate of the typing time you saved, and every take from the day. The Test button fires a preview notification immediately without using up the day's recap.

## Which macOS permissions does murmur need, and why?

| Permission | Why murmur needs it |
| --- | --- |
| Microphone | Recording your dictation. Requested automatically on first use |
| Accessibility | Pressing Cmd+V for you, so text lands at your cursor |
| Input monitoring | Hearing the hotkey while other apps are focused. After granting, quit and reopen murmur |

The permissions panel shows live status and deep-links each one into System Settings. murmur never uses these for anything beyond the stated purpose; the code is open source and auditable.

## What do the sound cues mean?

Quiet blips confirm what murmur is doing without you looking: a rising two-tone when recording starts, falling when it stops, a soft ding when text lands, a low note for no speech, and a buzz for errors. All synthesized live, no sound files anywhere. The system panel has the on/off switch and a volume slider.

## Does murmur start automatically at login?

Turn on Start at login in the system panel and installed builds register with your OS to open in the tray at login. Development builds deliberately skip registering.

## What happens if murmur crashes?

The error is written to a small rotating log in murmur's data folder under `logs/`, and the app relaunches itself exactly once. If the relaunched instance hits trouble too, it stays running in a visibly degraded state instead of looping, and the log has the story. Your dictation history and settings are untouched by any of this.

## Why does silence never insert anything?

Two guards. Before upload: if the recording contains under about a fifth of a second of voiced audio, murmur discards it locally, and your audio never leaves the machine. After transcription: empty results and the stock phrases speech models hallucinate on silence ("Thank you.") are recognized and dropped. The pill shows a quiet "no speech" instead.

## Where does my data live?

Settings, history, and analytics live in your platform's application data folder, locally. The API key is encrypted at rest. Audio goes only to the provider you configured, only when there is speech, and failed uploads are kept in a local `recovery/` folder so nothing is lost. murmur has no servers of its own.

## What is the "getting active" grid on the analytics page?

A GitHub-style activity wall. Every square is a day; the deeper the fill, the more words you dictated that day, scaled against your busiest day in the period. Today carries an outline, month and weekday labels frame the grid, hovering a square shows its date and word count, and the line above the wall totals the words for the whole period.

The period picker shows lifetime by default (everything since your first dictation, padded back to at least a full year so young walls keep their shape) and can jump to any single calendar year back to your first dictation.

The color picker chooses the fill: vibrant orange (the default), your belt color (follows your rank as you are promoted), or any belt color you have already earned; colors you have passed through stay yours for good. Locked colors list how to earn them. Dark colors like the black belt invert the wall automatically: empty squares turn light and activity darkens them, so a dark fill never disappears into the background. Cosmetic only; it changes nothing about what is counted.

## Can my accent color change the rest of the app?

Yes. The accent you pick in settings (any earned belt color, or the special accents like ember and moonlight) also tints data emphasis in the GUI: the 14-day chart bars and the journey progress bars. The default signal amber stays reserved for live recording states, so choosing it keeps the quiet cream look in charts.

## Why don't I see murmur notifications on my Mac?

Almost always a macOS permission. The Test button in the recap section fires a real notification through the same pipe as belt promotions and achievements, so use it to check. If nothing appears: open System Settings, then Notifications, find the app in the list, switch Allow Notifications on, and pick the Banners or Alerts style. While running from source the app is listed as Electron; the installed app is listed as murmur. Notifications also stay hidden while a Focus mode is on.
