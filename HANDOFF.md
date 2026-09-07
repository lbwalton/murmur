# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] Undertone switchover (rebrand shipped 2026-09-05): Undertone.app is in /Applications with a violet icon, same permissions. When ready: quit the old Murmur.app, launch Undertone (your settings and history migrate automatically), re-enter your Groq key once (the encrypted store follows the app name), then drag Murmur.app to the Trash.
- [x] Old iOS App Store listing renamed to Undertone Voice Dictation (2026-09-07). Its bundle id and SKU are frozen by Apple and invisible to users; murmur iOS gets a fresh app record later (US-034).
- [ ] US-033 notarization: certificate created, key recovered, first signed and notarized build running. When it lands, install THAT dmg for US-024 and open it like any download; no Gatekeeper override should be needed.
- [x] The undertone repo's 5 Dependabot alerts: patched by an agent 2026-09-07, awaiting GitHub's rescan to confirm they close.
- [ ] Decide when the new `lbwalton/murmur` repo flips from private to public.

## Live verification queue


- [ ] US-024 packaged mac app: WAIT for the freshly rebuilt dmg (it now carries the dev-to-packaged migration, so your belt, history, and founder marker follow you). Then: open release/murmur-0.1.0-arm64.dmg, drag murmur to Applications, quit the dev version first, launch, grant permissions fresh, re-enter your Groq key once (the encrypted key cannot cross app identities), dictate.
- [ ] US-025 windows: both installers exist in release/ (murmur-0.1.0-x64.exe and murmur-0.1.0-arm64.exe); run whichever matches your PC (x64 if unsure), then silent install with /S, autostart after reboot, and one dictation loop there.

- [ ] US-020 recap: solved in principle. The log proved macOS silently drops notifications from the unsigned dev build; the code is correct. Final check rides US-024: after installing the signed app, click Test there and the banner should appear (allow notifications for murmur when macOS asks).

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
