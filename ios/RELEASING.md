# Releasing murmur for iPhone

How a build gets from this repo to TestFlight (ios/prd.json IOS-015). Desktop has its own runbook in the root RELEASING.md. The order matters; each step assumes the previous one held.

## Version and build numbers

- **Version** is `MARKETING_VERSION` in `ios/project.yml` (0.1.0 for the TestFlight builds). Bump it in its own commit when an App Store version changes.
- **Build** is the number of commits behind the build (`git rev-list --count HEAD`). `npm run ios:release` sets it at archive time, along with the commit itself (`MurmurCommit` in the app's Info.plist), so `CURRENT_PROJECT_VERSION` in `ios/project.yml` stays 1 and is never edited by hand.
- App Store Connect refuses a build number it has seen, and any number lower than the newest one already uploaded for the same version. Commit counts only grow along one history, so ship from `feature/ios` or `main` with their full history. If a number is ever refused (a squash merge or a rebase dropped commits, or the same commit is uploaded twice), add a commit (`git commit --allow-empty -m "iOS: build bump"` is enough) or bump the version.

## What the Mac needs once

- The App Store Connect API key in the environment: `APPLE_API_KEY` (the path to the key file, which must be named `AuthKey_<key id>.p8`), `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`. On LaBroi's Mac they live in `~/.config/apple-notary/env`, which `~/.zshenv` loads. Never print them, log them, or commit them.
- The Apple Distribution certificate for Eze Media LLC (team 4B55ZVBVKN) in the login keychain.
- The App Store Connect record murmur voice dictation for `com.lbwalton.murmur.ios`, with its internal TestFlight group murmur team (IOS-004).

Signing uses the API key with automatic provisioning: the first archive creates the App Store profiles for the app and each extension. The archive also needs each target's development profile, which the API key cannot make: when a new extension is added, open `ios/murmur.xcodeproj` in Xcode once, signed in as the Eze Media LLC account, and look at the new target under Signing & Capabilities. Xcode makes its profile there (learned with the widgets extension, 2026-10-14). The command line does not see Xcode 27's signed-in account, so `--xcode-account` fails with No Accounts from a Terminal too. `--xcode-account` signs with the account signed in to Xcode instead, which works only from a Terminal that can read the login keychain. Xcode writes the key's id and path into `ios/build`, so never share that folder.

## Archive, check, and upload

1. **Gates.** `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke` green, on a commit with nothing uncommitted, pushed.
2. **Dry run.** `npm run ios:release` generates the project, archives murmur for the App Store, exports the signed ipa into `ios/build/release/<version>-<build>/export/`, and checks the ipa itself. Nothing is sent. The checks:
   - the version, the build number, and the commit;
   - export compliance set (below);
   - iPhone only, or, once iPad comes (IOS-027), every orientation on iPad, which Apple requires (error 90474);
   - the app and every extension carrying the same build;
   - each signed for the App Store: no test devices, no debugging, entitled to the app group.
3. **Upload, only after LaBroi says yes.** `npm run ios:release -- --upload` does all of that, then has Apple validate the ipa, then uploads it. It refuses uncommitted changes and shallow clones, so the build number always names the commit that shipped. The `--` matters: without it npm keeps the flag, and the release stops instead of guessing. A failure altool reports stops the release even when altool exits 0, as newer versions can.
4. **Processing.** App Store Connect processes the build, usually within 5 to 30 minutes. Apple usually emails when it is ready or when it is not and why. If nothing comes, open App Store Connect, murmur voice dictation, TestFlight, and look at the build's status; only after 24 hours in Processing is it worth asking Apple.

## Export compliance

murmur makes only HTTPS requests through Apple's own networking and adds no encryption of its own, so it is exempt. `ITSAppUsesNonExemptEncryption` is false in the app's Info.plist, and App Store Connect does not ask about encryption for each build. If murmur ever adds encryption of its own, this answer changes before the next upload.

## TestFlight test notes

Paste this into the build's What to Test in App Store Connect, TestFlight, under the build. Build 443 (TestFlight 1):

> First TestFlight build of murmur voice dictation. Finish first run: microphone, the murmur keyboard, Full Access, and your provider key. Then dictate with the murmur keyboard in Messages, Notes, Mail, and Safari. Try a take where you say nothing (nothing should be typed) and a take with Wi-Fi and cellular off (it should wait, then send when you retry). If something goes wrong, Settings, Diagnostics, Save report makes a report you can read and then share.

Build 473 (TestFlight 2, uploaded 2026-10-15; Claude sets it through the App Store Connect API):

> Second TestFlight build. New: Notes (keep a take as a note instead of typing it), Transform (select text, touch and hold the pill, tap Transform, and say how to change it; for more than a sentence, tap Copy first), and murmur Pro in Settings (purchases in TestFlight are free; Pro adds provider profiles and the supporter mark). Everything from the first build still applies. If something goes wrong, Settings, Diagnostics, Save report makes a report you can read and then share.

Build 477 (TestFlight 3, uploaded 2026-10-16, fixes from the first look at build 473; set the same way):

> Fixes from your first look: Add your key opens Provider and key again (it showed a blank screen, and so did Cleanup, Dictate, and New note), first run now asks for your key before the keyboard and the first take, and the key sheet has Done. Everything from build 473 still applies: Notes, Transform, and murmur Pro in Settings (purchases in TestFlight are free). If something goes wrong, Settings, Diagnostics, Save report makes a report you can read and then share.

Build 479 (TestFlight 4, uploaded 2026-10-17, the keyboard and Full Access as one first-run step, from the look at build 477; set the same way):

> Fixes from your look at build 477: the keyboard and Full Access are now one first-run step, Add the murmur keyboard, since both switches are on the same page in Settings. It checks itself once you pick murmur in the box with Full Access on, and the I added it button is gone. Everything from build 477 still applies: Add your key opens Provider and key, first run asks for your key before the keyboard and the first take, the key sheet has Done, and Notes, Transform, and murmur Pro are in Settings (purchases in TestFlight are free). If something goes wrong, Settings, Diagnostics, Save report makes a report you can read and then share.

## Internal testing

- The internal group is murmur team, with lbwalton@gmail.com in it (IOS-004). In App Store Connect, murmur voice dictation, TestFlight, Internal Testing, murmur team: if automatic distribution is on, each processed build joins the group by itself. If the new build is not listed under Builds, click the plus next to Builds and add it.
- On the iPhone, install TestFlight from the App Store and open the invite email sent to lbwalton@gmail.com. The phone's everyday Apple Account is labroi@me.com, a different one, and a build never shows in TestFlight under it (learned on the old record, 2026-08-15). If TestFlight shows no murmur or says the Apple Account does not match, open TestFlight, tap the account picture at the top right, sign out, and sign in as lbwalton@gmail.com; then open the invite again.

## Before inviting anyone else

- LaBroi's live checks in HANDOFF.md pass on his own iPhone first.
- External testers need Beta App Review: fill in Test Information in App Store Connect (a beta description, a feedback email, a contact, and review notes). murmur's core needs a provider key, so the review notes must say how a reviewer can test it, for example with a key on a spending limit made only for review, or the build is likely to come back as not testable.
- murmur collects nothing itself: takes go only to the provider you choose with your own key, and diagnostics are never sent by themselves.
- Problems found in TestFlight become fixes or stories in ios/prd.json before the next build (IOS-015).
