# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] A private note was removed before the repo went public.
- [ ] Undertone switchover (rebrand shipped 2026-09-05): Undertone.app is in /Applications with a violet icon, same permissions. When ready: quit the old Murmur.app, launch Undertone (your settings and history migrate automatically), re-enter your Groq key once (the encrypted store follows the app name), then drag Murmur.app to the Trash.
- [ ] Old iOS App Store listing (US-113/114 in the undertone repo) is still under the Murmur name. Pause any submission; redo as Undertone or drop it.
- [ ] The undertone repo has 5 Dependabot alerts (4 high). Legacy app, so decide: patch or ignore.
- [ ] Decide when the new `lbwalton/murmur` repo flips from private to public.

## Live verification queue

- [ ] US-007 hotkeys: run `npm run dev`, grant Accessibility and Input Monitoring to the dev Electron when macOS asks, then confirm hold-to-talk (default Alt+Space) flips state and toggle mode debounces rapid taps. Full end-to-end feel comes once recording (US-008) and insertion (US-011) land; a quick sanity pass now is enough.
- [ ] US-008 recording: with a real mic (grant the mic prompt), confirm a fast press-and-speak captures the very first word (the warm-mic pre-roll). Best tested together with US-010 transcription once it lands.
- [ ] US-009 overlay: while typing in another app, hold the hotkey and confirm the pill appears without the target app losing focus, waveform moves with your voice, timer ticks. `MURMUR_OVERLAY_PREVIEW=1 npm run dev` shows the pill anytime without a mic.
- [ ] US-010 transcription: enter your Groq key in the app (once the settings UI lands, or ask Claude to wire a quick entry path), then dictate a sentence and confirm the text lands on the clipboard. This one live run covers US-007, US-008, and US-010 together.
- [ ] US-011 insertion: dictate into three real apps (Notes, a browser text box, Slack or Messages) and confirm the text lands at the cursor, the app never loses focus, and whatever you had copied before is back on the clipboard afterward.
- [ ] US-019 wpm chip: after any dictation, the pill shows your words-per-minute for a beat before fading. Confirm you see it.
- [ ] US-012 silence: hold the hotkey for two seconds in silence and release. The pill should show the quiet no speech state and nothing gets inserted anywhere.

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
