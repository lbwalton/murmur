# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] A private note was removed before the repo went public.
- [ ] Undertone switchover (rebrand shipped 2026-09-05): Undertone.app is in /Applications with a violet icon, same permissions. When ready: quit the old Murmur.app, launch Undertone (your settings and history migrate automatically), re-enter your Groq key once (the encrypted store follows the app name), then drag Murmur.app to the Trash.
- [ ] Old iOS App Store listing (US-113/114 in the undertone repo) is still under the Murmur name. Decision 2026-09-06: keep it paused, then rename it to Undertone or retire it. murmur iOS will be a brand-new app record with a new bundle id when its phase opens (US-034).
- [ ] US-033 notarization: create an App Store Connect API key (Users and Access, then Integrations) for the Eze Media LLC team, or an app-specific password at appleid.apple.com. Hand me the values as environment variables and I run the first notarized build plus a clean-Mac open test. Until then, mac builds keep working exactly as today.
- [ ] The undertone repo has 5 Dependabot alerts (4 high). Legacy app, so decide: patch or ignore.
- [ ] Decide when the new `lbwalton/murmur` repo flips from private to public.

## Live verification queue

- [ ] US-032 journey (also covers US-035): open the journey tab, check your belt, the gold crown now centered on it, and the lvl. chip next to your rank; try the share card; bless or veto the look.
- [ ] US-031 cosmetics: dictate enough to hit white belt (a real session does it), watch pulse and the belt accent unlock, try the morning mist theme at blue.

- [ ] US-024 packaged mac app: open release/murmur-0.1.0-arm64.dmg, drag murmur to Applications, quit the dev version first, launch, grant permissions fresh, dictate. Cleanest if you retire the legacy Murmur.app beforehand (its data dir shares the packaged app name; murmur handles it safely either way).
- [ ] US-025 windows: both installers exist in release/ (murmur-0.1.0-x64.exe and murmur-0.1.0-arm64.exe); run whichever matches your PC (x64 if unsure), then silent install with /S, autostart after reboot, and one dictation loop there.

- [ ] US-008 recording: with a real mic (grant the mic prompt), confirm a fast press-and-speak captures the very first word (the warm-mic pre-roll). Best tested together with US-010 transcription once it lands.
- [ ] US-011 insertion: dictate into three real apps (Notes, a browser text box, Slack or Messages) and confirm the text lands at the cursor, the app never loses focus, and whatever you had copied before is back on the clipboard afterward.
- [ ] US-019 wpm chip: after any dictation, the pill shows your words-per-minute for a beat before fading. Confirm you see it.
- [ ] US-020 recap: turn on the daily recap in settings, set a time a few minutes out, wait for the notification, click it, confirm you land on the wrap-up tab. The Test button previews instantly.
- [ ] US-021 wizard: in settings hit Run wizard and walk it through, or test a truly clean profile anytime. Confirm the gates feel right and the test dictation works.
- [ ] US-023 design: give the window and the pill one aesthetic once-over and bless or veto. The tokens file is src/renderer/tokens.css if you want to tweak a shade.
- [ ] US-012 silence: hold the hotkey for two seconds in silence and release. The pill should show the quiet no speech state and nothing gets inserted anywhere.

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
