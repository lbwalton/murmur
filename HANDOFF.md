# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] Undertone switchover (rebrand shipped 2026-09-05): Undertone.app is in /Applications with a violet icon, same permissions. When ready: quit the old Murmur.app, launch Undertone (your settings and history migrate automatically), re-enter your Groq key once (the encrypted store follows the app name), then drag Murmur.app to the Trash.
- [x] Old iOS App Store listing renamed to Undertone Voice Dictation (2026-09-07). Its bundle id and SKU are frozen by Apple and invisible to users; murmur iOS gets a fresh app record later (US-034).
- [x] The undertone repo's 5 Dependabot alerts: patched by an agent 2026-09-07, awaiting GitHub's rescan to confirm they close.
- [x] US-040 done 2026-09-08: history rewritten and rescanned clean, repo recreated fresh and flipped PUBLIC, v0.1.0 released. If any other machine has an old clone of murmur, re-clone it; the archive lives private at lbwalton/murmur-prerewrite-archive and can be deleted once you are comfortable.

## Live verification queue

- [ ] US-044 provider connections, two steps: (1) add the ANTHROPIC_API_KEY secret to the lbwalton/murmur repo (Settings, Secrets and variables, Actions) so the weekly pricing-watch workflow can run; without it the Monday check just fails quietly. (2) In the next shipped build: check the provider panel shows the preset dropdown, the cost line at your pace, and the Groq free tier note; then set Cleanup connection to Separate, pick DeepSeek (or any second provider you hold a key for), save its key, hit its Test button, and dictate: transcription should still run on Groq while cleanup runs on the second provider. Flip Price refresh off and back on while you are there.
- [ ] US-043 smart lists (built 2026-09-13, needs the next shipped build): turn on Settings, dictation, Smart lists. (1) Dictate "I need to pack socks, shirts, shoes, pants": expect a bulleted list. (2) Dictate "first email the team, then update the deck, then send it to the client": expect a numbered list. (3) Say "bullet point socks bullet point shoes": expect dash lines even if the cleanup model is off. Check one plain text field and one markdown app. With the toggle off, dictation must behave exactly as before.
- [ ] US-005 tray window raise (fixed 2026-09-13, needs the next shipped build): with another app active and its windows covering screen center, click Open murmur in the tray. The settings window must come to the front immediately. Before the fix it opened buried behind the active app, so the click looked dead.
- [ ] US-011 paste settle (fixed 2026-09-13, needs the next shipped build): dictate into a busy app and confirm the text pastes; whatever the clipboard held before should come back about a second and a half later (copy something first, dictate, then paste again manually to see the original return). Bonus check: two quick dictations back to back both land intact.

- [x] US-008 sleep recovery (v0.1.5): shipped notarized to both platforms, and LaBroi live-verified 2026-09-12 that the hotkey captures audio again after real sleep and wake on both the Mac and the PC. Story complete.

- [ ] US-041 pro unlock, what remains: (1) decide the first Pro conveniences (nothing already free gets removed; cosmetics stay earned). (2) make one real test purchase at the live Payment Link (code FOUNDERS takes it to 39 dollars), then run: node scripts/issue-license.js <order-id> <buyer-email> --founder and activate the printed key in settings (the founder flag marks you a founding member with the permanent ten percent). Then try profiles: save your Groq setup under a name, change the base URL, and apply the profile to snap back (US-042). (3) decide when the FOUNDERS code retires. The product, link, Managed Payments, and coupon were all configured 2026-09-08.





- [ ] US-024 packaged mac app: WAIT for the freshly rebuilt dmg (it now carries the dev-to-packaged migration, so your belt, history, and founder marker follow you). Then: open release/murmur-0.1.0-arm64.dmg, drag murmur to Applications, quit the dev version first, launch, grant permissions fresh, re-enter your Groq key once (the encrypted key cannot cross app identities), dictate.
- [ ] US-025 windows: both installers exist in release/ (murmur-0.1.0-x64.exe and murmur-0.1.0-arm64.exe); run whichever matches your PC (x64 if unsure), then silent install with /S, autostart after reboot, and one dictation loop there.

- [ ] US-020 recap, two quick steps in the installed app: (1) click the recap Test button once more now that notifications are allowed; a murmur recap banner with today's numbers should appear instantly. (2) For the full loop: turn Daily recap on, set a time two minutes out, wait for the banner, click it, confirm you land on the wrap-up tab.

## Known follow-ups (not blocking)

- [ ] Synthetic smoke can flake on a real Mac (seen 2026-09-10 evening): the recording, recordingRecovery, recordingRevive, and dictationLoop checks all failed locally while pristine HEAD and CI stayed green. Cause is smoke-only: the muted oscillator feeding the hidden audio window stops being rendered by Chromium after ~2 quantums when the machine's audio state shifts (e.g. display asleep), so the watchdog reads it as a real stall. A live mic does not hit this (the input device clocks the graph). If it starts flaking in CI, make the synthetic source self-clocked instead of destination-pulled (e.g. drive the worklet without depending on ctx.destination consumption). Product capture code is unaffected.

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
