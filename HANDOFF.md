# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] Undertone switchover (rebrand shipped 2026-09-05): Undertone.app is in /Applications with a violet icon, same permissions. When ready: quit the old Murmur.app, launch Undertone (your settings and history migrate automatically), re-enter your Groq key once (the encrypted store follows the app name), then drag Murmur.app to the Trash.
- [x] Old iOS App Store listing renamed to Undertone Voice Dictation (2026-09-07). Its bundle id and SKU are frozen by Apple and invisible to users; murmur iOS gets a fresh app record later (US-034).
- [x] The undertone repo's 5 Dependabot alerts: patched by an agent 2026-09-07, awaiting GitHub's rescan to confirm they close.
- [x] US-040 done 2026-09-08: history rewritten and rescanned clean, repo recreated fresh and flipped PUBLIC, v0.1.0 released. If any other machine has an old clone of murmur, re-clone it; the archive lives private at lbwalton/murmur-prerewrite-archive and can be deleted once you are comfortable.

## Live verification queue

- [ ] US-041 pro unlock, three things: (1) in the Stripe dashboard create a Payment Link for murmur Pro ($49; add a founders promo code for $39 if you want the launch window) and paste its URL into shared/pro.json buyUrl, then tell me and I ship it in v0.1.1. (2) decide the first Pro conveniences (nothing already free gets removed; cosmetics stay earned). (3) after a real test purchase, run: node scripts/issue-license.js <order-id> <buyer-email> and activate the printed key in settings.



- [ ] US-037 self-update: once lbwalton/murmur is public and two releases are published, install the older release and confirm it checks, downloads, and installs the newer one on quit without any manual step.


- [ ] US-024 packaged mac app: WAIT for the freshly rebuilt dmg (it now carries the dev-to-packaged migration, so your belt, history, and founder marker follow you). Then: open release/murmur-0.1.0-arm64.dmg, drag murmur to Applications, quit the dev version first, launch, grant permissions fresh, re-enter your Groq key once (the encrypted key cannot cross app identities), dictate.
- [ ] US-025 windows: both installers exist in release/ (murmur-0.1.0-x64.exe and murmur-0.1.0-arm64.exe); run whichever matches your PC (x64 if unsure), then silent install with /S, autostart after reboot, and one dictation loop there.

- [ ] US-020 recap, two quick steps in the installed app: (1) click the recap Test button once more now that notifications are allowed; a murmur recap banner with today's numbers should appear instantly. (2) For the full loop: turn Daily recap on, set a time two minutes out, wait for the banner, click it, confirm you land on the wrap-up tab.

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
