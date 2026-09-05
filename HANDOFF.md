# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] A private note was removed before the repo went public.
- [ ] Undertone follow-ups in the old repo (`~/Projects/undertone`): the app still calls itself Murmur internally (productName, appId, App Store listing from US-113/114). Pause any App Store submission under the Murmur name; rebrand or drop it.
- [ ] Decide when the new `lbwalton/murmur` repo flips from private to public.

## Live verification queue

- [ ] US-007 hotkeys: run `npm run dev`, grant Accessibility and Input Monitoring to the dev Electron when macOS asks, then confirm hold-to-talk (default Alt+Space) flips state and toggle mode debounces rapid taps. Full end-to-end feel comes once recording (US-008) and insertion (US-011) land; a quick sanity pass now is enough.
- [ ] US-008 recording: with a real mic (grant the mic prompt), confirm a fast press-and-speak captures the very first word (the warm-mic pre-roll). Best tested together with US-010 transcription once it lands.
- [ ] US-009 overlay: while typing in another app, hold the hotkey and confirm the pill appears without the target app losing focus, waveform moves with your voice, timer ticks. `MURMUR_OVERLAY_PREVIEW=1 npm run dev` shows the pill anytime without a mic.

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
