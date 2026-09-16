# changelog

All user-facing changes, newest first, in plain language. Each release's section doubles as its GitHub release notes, and the app shows your current version's section on the home tab under what's new.

## 0.1.6 (unreleased)

- Smart lists: flip one switch and spoken sequences ("first..., then...") come out as numbered lists, item runs become bullets, and "bullet point" works as a spoken command. Off by default, and off means dictation behaves exactly as before.
- Mix providers: speech and cleanup can run on different services, each with its own key. Presets for Groq, OpenAI, and Mistral, plus local servers; DeepSeek, Cerebras, and OpenRouter for cleanup.
- Real costs up front: an estimated price per 1,000 words at your own speaking pace, each provider's billing quirks spelled out (Groq's free tier bills nothing), and rates from a catalog that is re-verified weekly and can refresh itself at launch.
- murmur knows whose key is saved: switch providers and it says when the saved key belongs elsewhere, walks you to the right field, and a green "connected" earned against one provider no longer vouches for another.
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
