# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] Undertone switchover (rebrand shipped 2026-09-05): Undertone.app is in /Applications with a violet icon, same permissions. When ready: quit the old Murmur.app, launch Undertone (your settings and history migrate automatically), re-enter your Groq key once (the encrypted store follows the app name), then drag Murmur.app to the Trash.
- [x] Old iOS App Store listing renamed to Undertone Voice Dictation (2026-09-07). Its bundle id and SKU are frozen by Apple and invisible to users; murmur iOS gets a fresh app record later (US-034).
- [x] The undertone repo's 5 Dependabot alerts: patched by an agent 2026-09-07, awaiting GitHub's rescan to confirm they close.
- [x] US-040 done 2026-09-08: history rewritten and rescanned clean, repo recreated fresh and flipped PUBLIC, v0.1.0 released. If any other machine has an old clone of murmur, re-clone it; the archive lives private at lbwalton/murmur-prerewrite-archive and can be deleted once you are comfortable.

## Shipped

- [x] v0.1.6 published 2026-09-17: the full test-cycle release (smart lists, provider catalog and key ring, paste-last chord, license switching, diagnostics, the self-healing mic, tray and paste fixes, what's new, Eze Media LLC attribution). Both platforms, notarized, auto-update live.

## Live verification queue

- [x] US-050 brain dump capture, live-verified 2026-09-20 (steps 1 to 4 in the log; the renamed-vault case is now smoke-covered and the fixed build is installed): under Settings, notes, capture a note chord (Ctrl+F11 is a safe pick), click Choose folder, and pick your Obsidian vault. From another app, hold the chord and speak. Expect the pill to show a gold edge with a small note tag and say noted, and within seconds the words sit in murmur/inbox/<today>.md inside the vault under a ## time heading, formatted like a dictation, with Obsidian showing the file whether or not it was open. Then three more: (1) open File layout, set the path to Daily/{date}.md (or your daily note's real path), check the Today preview, dictate a note, and confirm it appended there; Reset to default afterwards. (2) Clear the folder, press the chord: the pill should say set a notes folder in settings with the soft cue, and nothing records. (3) Rename the vault folder for a minute, dictate a note, and confirm Last note says saved to murmur's data folder, the note is in Application Support/murmur/notes/murmur/inbox/, and logs/murmur.log has a notes folder unreachable line; rename it back. The tray menu should show Open today's inbox whenever a folder is set.

- [ ] US-053 wake-time silent stream (built 2026-09-18, needs the next build): sleep the Mac for a few minutes, wake it, wait ten seconds, then dictate. The FIRST press should deliver. In logs/murmur.log expect at most one "audio capture is silent; re-arming" line from the wake, then a delivered line with a healthy peak. Bonus, the budget: tap the Wave:3 mute ring, quit and relaunch murmur, wait forty seconds, and the log should show exactly one "audio capture is silent" line followed by one "stayed silent after 5 re-arms" line and then nothing more; unmute, dictate, and it delivers with no relaunch.
- [x] US-046 what's new (built 2026-09-16, in the next installed build): the home tab should show a "what's new in 0.1.6" line with an amber dot; open it, read the release story, and the dot should stay gone across restarts. The full-loop check comes free with the next real update after v0.1.6.
- [x] US-048 silent-stream heal (built 2026-09-16, in the next installed build): with murmur running, quit and reopen Wave Link, then dictate. Expect one soft no-speech flash (the heal fires here) and the very next dictation delivering normally, no murmur relaunch. The log shows the pair: a nospeech with peak near 0.000 plus the re-arming line, then a delivered line with a healthy peak.
- [x] US-047 diagnostics (built 2026-09-15, in the next installed build): tap the mute ring on the Wave:3 (or unplug the mic), dictate, and check logs/murmur.log shows a nospeech line with a near-zero peak; then Save report from Settings, setup, Diagnostics and read the file: version, hook state, settings summary with counts only, log tail, and none of your words anywhere.
- [ ] Copyright assignment paperwork: the app, README, and package.json now credit Eze Media LLC. Make it accurate on paper: sign the one-page assignment drafted at ~/Documents/murmur-copyright-assignment-2026.md (you to your LLC), date it, keep it with your LLC records. Not legal advice; have a lawyer glance at it if you want certainty.
- [x] US-041 license switching (built 2026-09-14, needs the next build): activate your founder key, then Deactivate on the setup tab. The app should show the free experience with a Reactivate Pro button; Reactivate must restore Pro without re-entering the key. Forget key only when you actually mean to delete it.
- [x] US-045 paste-last chord (built 2026-09-14, needs the next shipped build): capture a chord under Settings, dictation, Paste last dictation (Ctrl+F12 is a safe pick; Ctrl+Alt+V will be refused because it contains your dictation hotkey). Then: dictate something, click into another app, press the chord, the text pastes again. Hold the chord: exactly one paste. Press it mid-recording: nothing.
- [ ] US-044 provider connections: steps 2 and 3 live-verified 2026-09-17; only step 1 remains: (1) the pricing-watch workflow runs on your Claude subscription: in a terminal run `claude setup-token`, then add the printed token to the lbwalton/murmur repo as the CLAUDE_CODE_OAUTH_TOKEN secret (Settings, Secrets and variables, Actions). Token lives one year and its usage counts against your subscription, not a separate API bill (verified 2026-09-13). Without it the Monday check just fails quietly. (2) The key ring (needs the next build): your Groq key should appear as a labeled line item (Groq, gsk_ mask) under the key field, auto-assigned by its prefix. Switch to OpenAI: the field should say no OpenAI key yet and glow; paste an sk- key and BOTH keys should list, each removable. Switch back and forth: dictation uses the right key each time with no re-entering. (3) Set Cleanup connection to Separate, pick a second provider you hold a key for, save its key, Test, and dictate: transcription on Groq, cleanup on the second provider. Flip Price refresh off and on while you are there.
- [x] US-043 smart lists (built 2026-09-13, needs the next shipped build): turn on Settings, dictation, Smart lists. (1) Dictate "I need to pack socks, shirts, shoes, pants": expect a bulleted list. (2) Dictate "first email the team, then update the deck, then send it to the client": expect a numbered list. (3) Say "bullet point socks bullet point shoes": expect dash lines even if the cleanup model is off. Check one plain text field and one markdown app. With the toggle off, dictation must behave exactly as before.
- [x] US-005 tray window raise (fixed 2026-09-13, needs the next shipped build): with another app active and its windows covering screen center, click Open murmur in the tray. The settings window must come to the front immediately. Before the fix it opened buried behind the active app, so the click looked dead.
- [x] US-011 paste settle (fixed 2026-09-13, needs the next shipped build): dictate into a busy app and confirm the text pastes; whatever the clipboard held before should come back about a second and a half later (copy something first, dictate, then paste again manually to see the original return). Bonus check: two quick dictations back to back both land intact.

- [x] US-008 sleep recovery (v0.1.5): shipped notarized to both platforms, and LaBroi live-verified 2026-09-12 that the hotkey captures audio again after real sleep and wake on both the Mac and the PC. Story complete.

- [ ] US-041 pro unlock, what remains: (1) DONE 2026-09-14: Pro conveniences decided (profiles now, provider connections shipped free) and your founder key was issued directly (order id founder-owner-001) and activated. (2) Still open: one real test purchase at the live Payment Link (code FOUNDERS takes it to 39 dollars) to prove the paid path end to end, then issue that buyer key with scripts/issue-license.js. (3) Try profiles for real: save your Groq setup under a name, change the base URL, apply the profile to snap back (US-042). (4) Decide when the FOUNDERS code retires.





- [x] US-024 packaged mac app: effectively verified by daily use (you have run the installed, notarized app with permissions, key, and dictation since v0.1.x). Confirm and this closes.
- [x] US-025 windows: effectively verified by the PC auto-updating to v0.1.5 and the US-008 live check passing there 2026-09-12. Confirm the original install used the exe and autostart survives reboot, and this closes.

- [x] US-020 recap, two quick steps in the installed app: (1) click the recap Test button once more now that notifications are allowed; a murmur recap banner with today's numbers should appear instantly. (2) For the full loop: turn Daily recap on, set a time two minutes out, wait for the banner, click it, confirm you land on the wrap-up tab.

## Known follow-ups (not blocking)

- [ ] Brain dump recall wiring (pairs with US-050/051 when they ship): add a section to the 7am briefing and 6pm recap scripts that reads murmur/todo.md and the day's murmur/inbox note from the vault: open tasks first, captured ideas after.


- [ ] Synthetic smoke can flake on a real Mac (seen 2026-09-10 evening): the recording, recordingRecovery, recordingRevive, and dictationLoop checks all failed locally while pristine HEAD and CI stayed green. Cause is smoke-only: the muted oscillator feeding the hidden audio window stops being rendered by Chromium after ~2 quantums when the machine's audio state shifts (e.g. display asleep), so the watchdog reads it as a real stall. A live mic does not hit this (the input device clocks the graph). If it starts flaking in CI, make the synthetic source self-clocked instead of destination-pulled (e.g. drive the worklet without depending on ctx.destination consumption). Product capture code is unaffected.

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
