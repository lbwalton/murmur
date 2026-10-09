# changelog

All user-facing changes, newest first, in plain language. Each release's section doubles as its GitHub release notes, and the app shows your current version's section on the home tab under what's new.

## 0.1.10 (unreleased)

- A painting a day: the wrap-up tab sets out a painting each day, one of fourteen subjects (bamboo, a lotus pond, a waterfall, a breaking wave, snowfall, and more), and every take adds its next brush stroke. It is sized to your typical day, finishes with murmur's seal in the color of your belt and the light of the hours you painted it in (a rising sun, a pale sun, a setting sun, or a crescent moon and stars), keeps growing with every take after, grows richer with your belt, keeps the days before in a strip you can open, and saves as a portrait card to post; Save the week strings the last seven days into one long scroll.

## 0.1.9 (2026-10-08)

- Ink waveforms: four new brush styles for the pill (ink dabs, flecks, rings, and one long ribbon), each earned at a belt. Settings, Look, Waveform now shows every style as a live preview of the pill moving to a made-up voice, so you can pick one by watching it.
- A new icon: an open brush loop with an amber dot inside, on the app, in the menu bar, and on the website.
- The Journey, painted: your belt as painted fabric with tape for each stripe, the road from white belt to red painted as far as you have come, the words and days still needed for your next rank (only what is new since you last looked draws itself in), and achievements as ink stamps. Point at a mark on the road, or at the level, to see what it takes.
- Promotions you can see: a new belt gets a short ceremony the next time you open the journey tab, a new stripe drops its tape onto your belt, and Share card paints a card from your last 30 days to save and post.
- Note receipts: after a note lands, a notification says where it went, and clicking it opens the note. Open last note sits in the menu bar menu, and Home shows your last note.
- Home draws today's time back as one gold stroke against a typical day, and wrap-up paints your day as a small painting, one stroke per dictation, with Save card.
- Analytics in ink: the last 14 days as brush dabs and the activity wall as blots of paint, and the wall keeps the period you picked.
- Every tab has its own title, an empty tab says how to fill it with your real hotkey, and the bar with the tabs stays at the top while you scroll.
- Deleting asks first: Clear all and a new discard all for recordings waiting to retry both name how many will go before anything is deleted, with keep them selected and the delete button in red.
- A long wait for your words keeps the pill shimmering, so it never looks frozen.
- If one of murmur's helper processes is ever stopped, the pill and the window rebuild themselves.
- Safer by design: murmur's windows load only murmur's own pages, and on Windows, code planted beside murmur can no longer run as murmur.

## 0.1.8 (2026-09-27)

- Time back: the home tab shows how many minutes dictating saved you today compared with typing, with this month and lifetime beneath, and the wrap-up and analytics carry the same number. It uses your typing speed, 40 words a minute unless you set your own in the recap settings.
- A nod as the minutes add up: a notification each time today's time back passes another half hour (Milestone alerts turns it off), the daily recap adds your number, and the menu bar icon's tooltip shows it.
- Overlay look: keep the full pill, pick a compact one, or go bare with just the waveform floating over your work.
- A dictation that fails to transcribe now waits on the home tab with a retry button instead of sitting in a folder. Fix the cause (a missing key, a dropped connection), click retry, and the words land in your log and on your clipboard, ready for paste-last. A note files into your notes folder at the time you spoke it.
- Settings, reorganized: a sidebar of sections with a search box, one list for all your API keys, and the setup checklist folds away once everything works.
- One Mac download for every Mac: murmur now runs on Intel Macs as well as Apple silicon, from the same download, on macOS 13 or later.
- Safer by design: other programs can no longer start murmur in developer modes that would borrow its microphone, accessibility, and input permissions.
- Download links that never go stale: murmur-mac.dmg and murmur-windows.exe on the latest release always serve the newest version.
- Fixed: applying a provider profile that brings back a saved key shows the key right away.

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
