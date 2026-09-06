# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] A private note was removed before the repo went public.
- [ ] Undertone switchover (rebrand shipped 2026-09-05): Undertone.app is in /Applications with a violet icon, same permissions. When ready: quit the old Murmur.app, launch Undertone (your settings and history migrate automatically), re-enter your Groq key once (the encrypted store follows the app name), then drag Murmur.app to the Trash.
- [ ] Old iOS App Store listing (US-113/114 in the undertone repo) is still under the Murmur name. Pause any submission; redo as Undertone or drop it.
- [ ] The undertone repo has 5 Dependabot alerts (4 high). Legacy app, so decide: patch or ignore.
- [ ] Decide when the new `lbwalton/murmur` repo flips from private to public.

## Live verification queue

- [ ] US-008 recording: with a real mic (grant the mic prompt), confirm a fast press-and-speak captures the very first word (the warm-mic pre-roll). Best tested together with US-010 transcription once it lands.
- [ ] US-011 insertion: dictate into three real apps (Notes, a browser text box, Slack or Messages) and confirm the text lands at the cursor, the app never loses focus, and whatever you had copied before is back on the clipboard afterward.
- [ ] US-019 wpm chip: after any dictation, the pill shows your words-per-minute for a beat before fading. Confirm you see it.
- [ ] US-020 recap: turn on the daily recap in settings, set a time a few minutes out, wait for the notification, click it, confirm you land on the wrap-up tab. The Test button previews instantly.
- [ ] US-021 wizard: in settings hit Run wizard and walk it through, or test a truly clean profile anytime. Confirm the gates feel right and the test dictation works.
- [ ] US-022 sounds: dictate once and confirm the four cues (start, stop, insert, and force an error by turning off wifi) feel right at your volume.
- [ ] US-023 design: give the window and the pill one aesthetic once-over and bless or veto. The tokens file is src/renderer/tokens.css if you want to tweak a shade.
- [ ] US-012 silence: hold the hotkey for two seconds in silence and release. The pill should show the quiet no speech state and nothing gets inserted anywhere.

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
