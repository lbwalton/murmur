# changelog

All user-facing changes, newest first, in plain language. Each release's section doubles as its GitHub release notes, and the app shows your current version's section on the home tab under what's new.

## 0.1.7 (2026-09-24)

- Brain dump: a second hotkey sends what you say to a notes file instead of your cursor. Pick any folder once (an Obsidian vault works as is) and each day's notes land in one inbox file under a time heading, formatted like any dictation. If the folder is ever unreachable, the note saves to murmur's own data folder, so nothing is lost.
- Your notes sort themselves, if you want: tasks copy to todo.md and ideas to ideas.md, each with a link back to the note, and your words are never reworded. A sentence holding several items files one line per item, and a spoken list lands as a lead line ("I need to buy:") with the items as checkboxes under it. Headings can name what each note was about.
- Duplicates and finished items wait for you: say something already on your list, or report a task done, and murmur holds it with your earlier line quoted, offering File it anyway, Tick it, or Skip. It never edits your lists on its own.
- Optional task reminders: desktop notifications at times you choose that say what is still open, with a click to open the list.
- Sort on a decision model (TypeSafe) if you like: it can only ever pick a label, answers in about a tenth of a second, and a line it is unsure of stays in your inbox. The log shows how sure it was of every line, never your words.
- Transform: select text in any app, hold the transform hotkey, and say what to do ("turn this into a list with action steps"). The result replaces the selection, the original is one paste-last away, and your clipboard comes back afterward. Text inside the selection is never treated as instructions, and a selection over 8,000 characters is not sent at all while your spoken words are kept.
- The first press after waking your computer works: if the microphone comes back silent, that press rebuilds capture while you talk and keeps your words.
- Fixed: a list's heading line is no longer filed as a task of its own, and paste-last notes in the log what it pasted and from where, never the text.

## 0.1.6 (2026-09-17)

- Smart lists: flip one switch and spoken sequences ("first..., then...") come out as numbered lists, item runs become bullets, and "bullet point" works as a spoken command. Off by default, and off means dictation behaves exactly as before.
- Mix providers: speech and cleanup can run on different services, each with its own key. Presets for Groq, OpenAI, and Mistral, plus local servers; DeepSeek, Cerebras, and OpenRouter for cleanup.
- Real costs up front: an estimated price per 1,000 words at your own speaking pace, each provider's billing quirks spelled out (Groq's free tier bills nothing), and rates from a catalog that is re-verified weekly and can refresh itself at launch.
- Every provider keeps its own key: saving one files it under the provider you are on, switching brings the right key along automatically, and each saved key lists in setup with its own remove. A green "connected" earned against one provider no longer vouches for another, and switching to a provider without a key walks you straight to the field that needs one.
- Paste your last dictation again with its own shortcut, customizable in settings.
- Pro can be deactivated to preview the free experience and reactivated in one click; your key stays parked on your machine, and Forget key removes it entirely for handoffs.
- Diagnostics you can trust: a local activity log names what happened to every dictation without ever containing your words or keys, Save report writes one readable file, and nothing sends itself anywhere.
- The microphone heals itself: when audio software reconfigures your mic underneath murmur, the next dictation detects the dead stream and rebuilds capture on the spot.
- Fixed: the tray click brings the window to the front instead of opening it buried; pasting no longer races slow apps, and your old clipboard returns only after the paste truly lands; a formed list keeps every item you spoke.

## 0.1.5 (2026-09-10)

- The microphone survives sleep. After waking your computer, dictation works again on its own: murmur watches its capture stream and rebuilds it whenever it dies, retrying until the mic answers. A dictation in progress when the mic dies keeps everything captured before the outage.

## 0.1.4 (2026-09-09)

- The onboarding wizard shows your new hotkey the moment you capture it.

## 0.1.3 (2026-09-09)

- A malformed entry in the stored settings file could crash the settings page into a blank window. Malformed dictionary, expansion, and profile entries are now dropped on load while the rest of the file survives.

## 0.1.2 (2026-09-09)

- Every window failure path writes to the log at the data folder's logs/murmur.log, and MURMUR_DEBUG=1 opens devtools beside the settings window. No behavior changes otherwise.

## 0.1.1 (2026-09-09)

- The first Pro release: license keys verified offline, founders window open.
- Windows tray icon no longer ghosts on light taskbars and follows theme changes live.
- Windows uses software rendering, sidestepping GPU drivers that left the window blank.
- Dictation no longer overwrites your clipboard: everything you copied, screenshots included, is restored after the paste.
- Fabricated trailing fillers from the speech engine are cleaned up, and the polish layer never introduces punctuation you did not dictate.

## 0.1.0 (2026-09-08)

- The first public release: push-to-talk dictation for Windows and macOS. Hold a hotkey, speak, release; your words land at the cursor in whatever app you are using. Bring your own key (Groq by default, any OpenAI-compatible endpoint works), keep your audio and transcripts between you and your provider, and earn your way up a Brazilian Jiu-Jitsu belt ladder while you dictate.
