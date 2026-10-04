# murmur settings, explained

Everything the settings window can do. For provider setup (base URL, keys, model ids per provider) see [connecting a provider](./providers.md).

## What is the home view?

The window opens on your transcription log: every dictation, grouped by day, newest first, with the time, word count, and words-per-minute of each take. It updates live as you dictate. Each entry has a copy button, so a dictation that landed in the wrong window is one click from your clipboard. Above the log, once you have dictated at all, a card shows your time back for today (the minutes you did not spend typing, explained under "How does murmur calculate time earned back?") with this month and lifetime beneath it. A gold brush stroke under the number shows today against your typical day: the stroke is today, a dotted line carries on for the rest of a typical day, and a day past typical fills the width. The line under it says it in words, for example "63% of your typical day (41 min)", or "More than double your typical day" on a big one. Your typical day is the middle value (the median) of your time back across the days you dictated in the four weeks before today, so one huge day or one quiet day barely moves it. It needs three days with dictation in those four weeks, not counting today; until then the card says so and draws no stroke. A red ✗ next to the settings tab means setup needs attention.

## How is the settings tab organized, and how do I find a setting?

A rail on the left lists every section in three groups. Essentials: Provider and keys, Dictation, Dictionary. Features: Notes, Transform, Time back and recap. App: Look, System, murmur Pro. Click a section to scroll to it; the rail marks the section you are reading as you scroll, and a red dot beside a section means a setup check inside it needs you.

The search field at the top of the rail finds any setting by its name, its description, or a common word for it (type shortcut and Hotkey comes up, type log and Diagnostics does). Matches replace the section list while you type. Click one, or press Enter for the first (the arrow keys move between them), and murmur scrolls to that setting and highlights it, opening an Advanced fold if the setting lives inside one. Esc clears the search.

Settings most people never touch sit under a fold at the bottom of their section that says what it holds: Advanced under Provider and keys (base URL, profiles, price refresh, and the Groq defaults), and File layout under Notes. On and off settings are switches; short choices like Hold to talk or Toggle show every option as a button in a row.

## How long is my history kept, and where?

History lives only on your machine, in murmur's local data folder. The retention control at the bottom of the home view prunes entries older than 30 days, 90 days, or a year, or keeps everything forever. Clear all wipes the log instantly. Nothing about your history is ever uploaded anywhere.

## What happens on first launch?

A guided wizard walks the whole setup: welcome, provider key with a live connection test, macOS permissions with deep links and live status, hotkey capture, and a test dictation. Each step gates on actually being done, so finishing the wizard means murmur genuinely works. Skip anytime; the settings tab keeps tracking anything unfinished, and Run wizard under Settings, System starts it over whenever you like.

## What do "all set" and the Finish setup card mean?

murmur checks everything it needs to work: your API key saved, the provider connected, the microphone, accessibility, input monitoring (the last three on macOS), and a valid hotkey. When every check passes, setup folds away into a single **all set** badge at the top of the rail. Click the badge to see the checks listed.

When any check fails, a **Finish setup** card opens at the top of the settings column. It lists only what is missing, each with the button that fixes it right beside it: Add key walks you to the key field, Test runs the connection check, Open settings opens the matching macOS permission pane, and Set hotkey walks you to the hotkey. A row of small lamps and a count ("4 of 6 ready") show how far along you are, and a Ready line names what already works. A check that waits on another says so (the connection test runs by itself once a key is saved). Right after launch, while the first connection test is still running, the badge reads checking and the card stays closed. Once the last item passes, the card folds back into the all set badge.

## How do I set my API key?

Under Settings, Provider and keys, paste your key into the **API keys** list on your provider's line and press Save. It is encrypted with your operating system's secure storage, kept only on your machine, and sent only to that provider. Only a masked form (like `gsk_…OC9g`) is ever displayed, marked **in use**. Replace swaps in a new key; Remove deletes it. The Connection row right below tests it on its own after a save, and its Test button runs the check again: green `connected` proves the key and base URL work together.

Each provider keeps its own key, so the list also shows keys you saved for providers you are not using right now, one per line, each with its own Remove. Switching the Provider preset brings that provider's saved key back into use.

## How do I change the hotkey?

Click the hotkey field, then press the combo you want. Two kinds work:

- **Modifiers plus a key**: press them together, like Ctrl+Shift+M or Alt+Space
- **Modifiers alone**: press and release just the modifiers, like Ctrl+Alt. Hold them to talk, release to stop, exactly like the fn key in other dictation tools

Escape cancels capture. **Reset** restores the platform default. Bare letters and digits are refused on purpose: a hotkey of plain `H` would trigger every time you typed the letter. Function keys (F1 to F24) may stand alone.

## How do I paste my last dictation again?

Set a chord under Settings, Dictation, Paste last dictation. Pressing it pastes your newest history entry wherever your cursor is, through the same insertion pipeline as a live dictation: handy when a busy app missed the original paste, or you want the same text somewhere else. The feature is off until you capture a chord, and Clear disarms it again.

Two rules keep the chord trustworthy. It needs a regular key (modifiers alone fire by accident), and it must not contain your dictation hotkey's modifiers (holding Ctrl+Alt+V with a Ctrl+Alt dictation hotkey would start a recording before the V lands), so murmur refuses those at capture and says why. murmur listens globally without swallowing keys, so pick a combo your apps ignore: a modifier plus an F-key (Ctrl+F12) is the safest shape. Holding the chord pastes once, and it does nothing while a recording or transcription is in flight. With empty history it plays the soft no-speech cue and touches nothing.

## How do I speak a note instead of pasting it?

Set a note chord and a notes folder under Settings, Notes. Holding the note chord records like a dictation, but the words append to a markdown file in that folder (an Obsidian vault works as is) instead of landing at your cursor. The whole feature, including custom file layouts, the never-lost fallback, and what Obsidian sees, is on its own page: [notes](./notes.md).

## How do I rewrite selected text by speaking?

Set a transform chord under Settings, Transform. Select text in any app, hold the chord, and say what to do ("tighten this paragraph"); the result replaces the selection, and paste-last brings the original back. What gets sent, the 8,000 character limit, the separate connection, and the Keep originals in history switch are on their own page: [transform](./transform.md).

## What is the difference between hold to talk and toggle?

**Hold to talk**: recording runs while the hotkey is held, stops when released. Best for short, frequent dictations. **Toggle**: tap once to start, tap again to stop. Best for long passages. Rapid accidental double-taps are absorbed.

## What do the insert modes do?

**Paste at cursor** places the finished text wherever your cursor is, then restores whatever your clipboard held before about a second and a half after the paste lands, giving even a busy target app time to read it (an image or file on the clipboard is never destroyed, and anything you copy mid-dictation wins). **Copy only** skips the paste and leaves the text on the clipboard for you to place manually. If pasting ever fails (a revoked permission, an unusual app), murmur falls back to copy so the dictation is never lost.

## What do the formatting levels mean?

- **Off**: the raw transcript, untouched
- **Light**: filler words removed, sentences capitalized
- **Full**: everything in light, plus spoken punctuation commands ("period", "comma", "new line", "new paragraph"), self-corrections ("scratch that"), number style, closing punctuation, and the AI cleanup pass through your configured cleanup model

The cleanup pass fails open: if the model is slow, wrong, or chatty, murmur inserts the deterministically formatted text instead. A dictation is never lost or delayed indefinitely because of the cleanup model.

## What is Smart lists, and how do I dictate a list?

Smart lists turns spoken structure into real structure. It is off by default (dictation behaves exactly as it always has) and lives in Settings, Dictation, Smart lists. With it on and formatting at Full, murmur formats lists two ways:

- **Automatically.** Speak a sequence ("first I want to email the team, then update the deck, then send it to the client") and it becomes a numbered list, one step per line. Run through items ("I need to pack socks, shirts, shoes, pants") and it becomes a bulleted list, one item per line. Ordinary prose stays prose; the cleanup model is instructed never to force a list onto normal sentences.
- **By command.** Say "bullet point", "next item", or "next bullet" to start a dash line yourself, the same way "period" and "new line" work today. Commands are deterministic: they work even when the cleanup model is unreachable.

Lists use plain text markers ("- " and "1. "), so they paste correctly everywhere, and markdown apps render them as lists. Automatic list recognition needs the cleanup pass (Full formatting and a working cleanup model); the spoken commands only need Full formatting. Verified against format-spec version 1 (2026-09-13).

## What does the analytics tab show, and how is the cost estimated?

The analytics tab shows your dictation in numbers: minutes, words, sessions, time back, and an estimated cost for this month, the last fourteen days as brush dabs (each as tall as that day's words, today in gold, a day without dictation a faint speck), and lifetime totals. Time back is the minutes you did not spend typing, computed as described under "How does murmur calculate time earned back?" below. The cost figure is an estimate computed locally from your usage at published provider rates (from the provider catalog, `shared/provider-catalog.json`, each rate carrying its own verified-on date): audio time at the speech model's hourly rate, honoring Groq's 10-second minimum per request, plus an approximation of the cleanup model's token usage. Your provider bills you directly; murmur never sees your billing, and no numbers leave your machine. At typical usage, expect the estimate to read in cents, not dollars: that is the point of BYOK.

## How does the custom dictionary work?

The dictionary fixes words the speech model keeps mishearing, names especially. Add a pair in Settings, Dictionary, Custom words: what it is heard as, and what it should be written as. Matching is whole-word and case-insensitive; output uses exactly the casing you typed, even at the start of a sentence, and even after the AI cleanup pass. Multi-word phrases work, and longer phrases win over shorter ones. The dictionary can only ever change words that were actually spoken: an unrelated dictation is never touched, and dictionary content can never leak into your text on its own.

## How do text expansions work?

An expansion turns a spoken trigger phrase into a saved snippet: say "insert my email" and your address appears; say "sign off" and your closing lines appear. Add pairs in Settings, Dictionary, Expansions. Triggers match after formatting, so they work naturally mid-sentence and next to punctuation. Snippets insert exactly as written, line breaks and casing included, and a snippet's own content never triggers another expansion. When two triggers could match at the same spot, the longer one wins.

## What are the waveform styles?

How the overlay pill visualizes your voice while recording. Pick one in Settings, Look, Waveform: each style is a tile showing the real pill, moving to a made-up voice (your microphone is never used for the tiles). Click a tile to use it from your next dictation; the one in use is outlined in gold. Locked styles stay in the grid, dimmed, with the belt that earns them. With the keyboard, tab into the grid, move with the arrow keys, and press Enter or Space to pick. The tiles move only while you can see them, and with reduced motion turned on in your system settings each shows a still frame.

- **Bars** is the classic equalizer.
- **Speckle** is a dust field that drifts when quiet and vibrates with your speech.
- **Pulse** sends rings out from the dot as you speak. It arrives with your white belt.

Four more are painted with a brush, and each arrives with a belt:

- **Ink dabs** (white belt) are brush dabs at your voice level. Fresh paint is wet and bright, and it dries to gold as it scrolls away.
- **Ink flecks** (blue belt) are paint flecks that shiver with your voice and fling a drop on a loud syllable.
- **Ink rings** (purple belt) are dry-brush arcs that ripple out from the dot and break up as they travel.
- **Ink ribbon** (brown belt) is one continuous stroke your voice paints, thick when you are loud and thin when you are quiet.

Every ink style follows the same rules: wet paint while you speak, a sheen as it dries while murmur processes (and a softer one every 2 seconds if processing takes a while, so a long wait never looks frozen), flat once your words are inserted, a dry grey scrape when no speech was heard, and plain red with no brushwork for an error. With a custom accent color, the paint is your accent and it dries to a darker shade of it. Ink styles work in every overlay look, pill, compact, and bare. **Preview**, beside Overlay look, plays the whole cycle anytime without dictating: a few seconds of speaking, five seconds of drying (so you see the sheen repeat), then the words landing.

## How do I make the overlay smaller or less intrusive?

Settings, Look, Overlay look. Three looks:

- **Pill** is the classic: the dot, the waveform, and the timer in a rounded box.
- **Compact** is the same pill at about two thirds, for when the box covers what you are reading.
- **Bare** drops the box and the border entirely: just the waveform, with the timer in small type beneath it. Every bar, dot, and ring carries a faint ink edge that hugs it, so the waveform reads over a white page as well as a dark app, and the speckle, pulse, and ink styles fade out toward their edges instead of stopping at a line. It just appears, more instrument than window.

One rule holds in every look: text that has to be read (a hint such as "set a notes folder in settings", an error, no speech) always comes in the full pill, because a sentence with no backing is unreadable over a busy window. In bare, a note or a spoken edit shows its small mode tag but not the gold edge the pill wears, since there is no edge to color. Preview shows the current look without dictating. The overlay never takes focus and clicks pass straight through it in every look, so it can never steal a keystroke from the app you are dictating into.

## How do recaps and the wrap-up work?

Turn on Daily recap under Settings, Time back and recap, and pick a time. At that moment (or on the next wake if the machine was asleep, once per day) murmur sends a notification with your day's numbers, ending with your time back once the day has at least a minute of it: "4 sessions, 12 minutes, 1,240 words today. 19 minutes back." Clicking it opens the wrap-up tab: sessions, minutes spoken, words, best words-per-minute, your time back at your own typing speed, and every take from the day. The Test button fires a preview notification immediately without using up the day's recap.

## What is the time back milestone notification, and how do I turn it off?

Each time today's time back crosses a 30-minute mark (30 minutes, 1 hour, 1 hour 30 minutes, and so on) murmur shows one notification titled time back, reading for example "30 minutes earned back today." Clicking it opens the wrap-up. It is on by default, like belt promotions and achievement unlocks; unlike those it has a switch: Settings, Time back and recap, Milestone alerts.

The nod is decided on the same whole minutes the home card shows, so it arrives on the take where the card first reads 30 min, never a take later. Each mark is celebrated once per day. A take that jumps two marks at once gets one notification for the higher mark, a slow take that pulls the total back under a mark does not earn the mark again on the way back up, and changing your typing speed never re-fires a mark already shown. If a speed edit itself lifts the total past a mark, that mark is not celebrated that day: the nod is for takes, not edits. A new day starts clean. The number is also in the tray: hover the murmur icon and the tooltip reads "murmur · 42 min back today" once the day has any, plain murmur before that.

## How does murmur calculate time earned back?

Time back is the time you did not spend typing. For every dictation, murmur takes the words that landed, works out how long typing them would have taken at your typing speed, and subtracts the time you actually held the key. Those per-take numbers add up into today, this month, and lifetime, shown on the home card, the analytics tab, and the wrap-up.

The formula for one take is `words / typing speed - minutes spoken`. At the default 40 words per minute, a 400-word dictation spoken in two minutes is ten minutes of typing minus two of speaking: eight minutes back.

The typing speed is yours to set: Settings, Time back and recap, Typing speed, anywhere from 10 to 200 words per minute. 40 is a fair average for a working typist; if you know you type at 70, say so and the number gets honest. Nothing is stored per take, so changing the speed restates every day you have on record, past ones included.

Two rules keep the number truthful. A take where you held the key while thinking and said little counts against the day, because murmur cost that time; but a day never shows below zero. Notes dictated with the note chord count exactly like any other dictation. Spoken edits (the transform chord) never count: the original selection murmur keeps for recovery is a safety copy, not words you spoke, so it stays out of every number murmur keeps.

## Which macOS permissions does murmur need, and why?

| Permission | Why murmur needs it |
| --- | --- |
| Microphone | Recording your dictation. Requested automatically on first use |
| Accessibility | Pressing Cmd+V for you, so text lands at your cursor |
| Input monitoring | Hearing the hotkey while other apps are focused. After granting, quit and reopen murmur |

The macOS permissions list under Settings, System shows live status and deep-links each missing one into System Settings; a missing one also appears on the Finish setup card. murmur never uses these for anything beyond the stated purpose; the code is open source and auditable.

## What do the sound cues mean?

Quiet blips confirm what murmur is doing without you looking: a rising two-tone when recording starts, falling when it stops, a soft ding when text lands, a low note for no speech, and a buzz for errors. All synthesized live, no sound files anywhere. Settings, System, Sounds has the switch and a volume slider.

## Does murmur start automatically at login?

Turn on Start at login under Settings, System, and installed builds register with your OS to open in the tray at login. Development builds deliberately skip registering.

## What happens if murmur crashes?

The error is written to a small rotating log in murmur's data folder under `logs/`, and the app relaunches itself exactly once. If the relaunched instance hits trouble too, it stays running in a visibly degraded state instead of looping, and the log has the story. Your dictation history and settings are untouched by any of this.

## Why does silence never insert anything?

Two guards. Before upload: if the recording contains under about a fifth of a second of voiced audio, murmur discards it locally, and your audio never leaves the machine. After transcription: empty results and the stock phrases speech models hallucinate on silence ("Thank you.") are recognized and dropped. The pill shows a quiet "no speech" instead.

## Where does my data live?

Settings, history, and analytics live in your platform's application data folder, locally. The API key is encrypted at rest. Audio goes only to the provider you configured, only when there is speech, and failed uploads are kept in a local `recovery/` folder so nothing is lost. murmur has no servers of its own.

## What is the "getting active" grid on the analytics page?

A GitHub-style activity wall, painted. Every day you dictated is a small blot of paint; the deeper the color, the more words you dictated that day, scaled against your busiest day in the period. A day with no dictation is a faint dot. Today carries an outline, month and weekday labels frame the grid, hovering a day shows its date and word count, and the line above the wall totals the words for the whole period. Each blot's shape comes from its date, so the same history paints the same wall every time.

The period picker shows lifetime by default (everything since your first dictation, padded back to at least a full year so young walls keep their shape) and can jump to any single calendar year back to your first dictation.

The color picker chooses the fill: vibrant orange (the default), your belt color (follows your rank as you are promoted), or any belt color you have already earned; colors you have passed through stay yours for good. Locked colors list how to earn them. Dark colors like the black belt invert the wall automatically: every day sits on a white square and activity paints darker blots on it, so a dark fill never disappears into the background. Earning the black belt also unlocks the invert checkbox, which flips the wall to the white paper look for any fill color you choose (except near-white ones, which would vanish on paper). Cosmetic only; it changes nothing about what is counted.

## Can my accent color change the rest of the app?

Yes. The accent you pick under Settings, Look (any earned belt color, or the special accents like ember and moonlight) also tints data emphasis in the GUI: the journey's painted gates (the words stroke and the tally marks). The default signal amber stays reserved for live recording states, so choosing it leaves the gates in your belt's own color. The 14-day chart on the analytics tab is painted in ink instead (rice dabs with today in gold) and does not follow the accent.

## Why don't I see murmur notifications on my Mac?

Almost always a macOS permission. The Test button on the Daily recap row (Settings, Time back and recap) fires a real notification through the same pipe as belt promotions and achievements, so use it to check. If nothing appears: open System Settings, then Notifications, find the app in the list, switch Allow Notifications on, and pick the Banners or Alerts style. While running from source the app is listed as Electron; the installed app is listed as murmur. Notifications also stay hidden while a Focus mode is on.

## Where do I see what changed in an update?

The home tab keeps a quiet what's new line; a small amber dot appears when the running version is newer than the last one you looked at. Open it to read the current version's changes in plain language. The same text lives in the repo's CHANGELOG.md and on each GitHub release.

## What is the Price refresh setting?

murmur ships with a provider catalog: presets, model rates, and billing notes, each rate carrying the date it was verified against the vendor. Price refresh lives under Settings, Provider and keys, Advanced. With it on (the default), murmur downloads the newest catalog from the murmur repo once at launch, so the cost estimates stay current between app updates. It is a read-only file fetch from the same GitHub host the auto-updater already contacts, with nothing about you attached. Turn it off and murmur uses the rates this version shipped with. Either way, dictation never waits on it.

## What is the cleanup connection?

By default one provider handles both transcription and the cleanup pass. Setting Cleanup runs on to Separate (under Provider and keys) gives cleanup its own base URL, model, and encrypted key, so you can mix providers (Groq speech, DeepSeek cleanup). Details and per-provider setup live in the [providers guide](providers.md).

## What are provider profiles?

A murmur Pro convenience: save your whole provider setup (base URL, speech model, cleanup model, and the matching API key) under a name, then switch setups in one click from Provider and keys, Advanced, Profiles. Profiles carry the endpoint and models; keys stay in the per-provider key ring, so applying a profile automatically uses that provider's saved key. The free single provider setup is unchanged, profiles are additive.
