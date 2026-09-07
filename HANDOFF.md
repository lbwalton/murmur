# Handoff: things only LaBroi can do

Live-verification items land here as stories complete. Check them off, then tell Claude so the story's `passes` flag can be set with notes.

## Now

- [ ] Undertone switchover (rebrand shipped 2026-09-05): Undertone.app is in /Applications with a violet icon, same permissions. When ready: quit the old Murmur.app, launch Undertone (your settings and history migrate automatically), re-enter your Groq key once (the encrypted store follows the app name), then drag Murmur.app to the Trash.
- [ ] Old iOS App Store listing (US-113/114 in the undertone repo) is still under the Murmur name. Decision 2026-09-06: keep it paused, then rename it to Undertone or retire it. murmur iOS will be a brand-new app record with a new bundle id when its phase opens (US-034).
- [ ] US-033 notarization: your existing team key was found on this Mac ([key id removed before public] in the standard folder), so no new key needed. One step remains: create a Developer ID Application certificate. Easiest path: Xcode, Settings, Accounts, select the Eze Media team, Manage Certificates, the plus button, Developer ID Application (Account Holder only). Tell me when it exists and I run the first notarized build.
- [x] The undertone repo's 5 Dependabot alerts: patched by an agent 2026-09-07, awaiting GitHub's rescan to confirm they close.
- [ ] Decide when the new `lbwalton/murmur` repo flips from private to public.

## Live verification queue


- [ ] US-024 packaged mac app: WAIT for the freshly rebuilt dmg (it now carries the dev-to-packaged migration, so your belt, history, and founder marker follow you). Then: open release/murmur-0.1.0-arm64.dmg, drag murmur to Applications, quit the dev version first, launch, grant permissions fresh, re-enter your Groq key once (the encrypted key cannot cross app identities), dictate.
- [ ] US-025 windows: both installers exist in release/ (murmur-0.1.0-x64.exe and murmur-0.1.0-arm64.exe); run whichever matches your PC (x64 if unsure), then silent install with /S, autostart after reboot, and one dictation loop there.

- [ ] US-020 recap: still hunting the missing notification. After the next relaunch, click Test once more; the app now logs whether macOS accepted the notification, and I read that log. Also worth one check: System Settings, Notifications, Electron, style set to Banners or Alerts (not None), and no Focus mode active.

## Standing needs

- A real Groq API key on this Mac for live transcription tests (never committed, entered through the app).
- Your Windows machine for US-025 verification when packaging lands.
