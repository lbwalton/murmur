# Shipping Murmur iOS: TestFlight, then the App Store

The repeatable loop for getting a build onto Labroi's iPhone, and below it,
the one-time path from TestFlight to a live App Store listing. Steps marked
**[Labroi]** need his Apple ID, his Team, or his hands; everything else is
scriptable. All commands run from `ios/`.

## One-time setup

1. **[Labroi]** An Apple Developer Program membership ($99/yr) on his Apple ID.
2. Done 2026-07-24: the Team ID `4B55ZVBVKN` is set as `DEVELOPMENT_TEAM` on
   all three targets with `CODE_SIGN_STYLE = Automatic`; Xcode creates the
   App ID, the App Group, and profiles on first archive.
3. Done 2026-08-15: the App Store Connect app record exists (App ID
   `6801927849`), created by **[Labroi]** under Apps, plus button, New App:
   - Platform iOS, Name `Murmur Voice Dictation` (plain `Murmur` and
     `Murmur Dictation` were both taken store-wide; the home-screen name
     stays `Murmur` via `CFBundleDisplayName`, and the store name is
     editable with any future version submission).
   - Bundle ID `com.labroi.murmur.ios`, SKU `murmur-ios`.
4. Signing is automatic and headless: `DEVELOPMENT_TEAM = 4B55ZVBVKN` plus
   `-allowProvisioningUpdates` on archive/export creates the profiles, no
   Xcode GUI pass needed. Both targets carry the App Group
   `group.com.labroi.murmur.ios`.

## Every release

1. Bump the version, one command, from the repo root:

       node scripts/bump-ios-version.js 0.1.0

   It rewrites `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` for every
   target in lockstep (App Store Connect rejects builds where the keyboard
   extension version differs from the app).

2. Make sure the gates are green:

       cd ios && xcodebuild -scheme Murmur -destination 'platform=iOS Simulator,name=iPhone 17' test
       cd .. && npm run smoke

3. Archive:

       cd ios
       xcodebuild -scheme Murmur -destination 'generic/platform=iOS' \
         -archivePath build/Murmur.xcarchive archive

4. Export and upload. `ios/ExportOptions.plist` already ships in the repo
   (method `app-store-connect`, destination `upload`). Authenticate with an
   App Store Connect API key, and prefix `PATH` with `/usr/bin` so Apple's
   rsync is used (see the rsync gotcha below, this is not optional):

       PATH="/usr/bin:$PATH" xcodebuild -exportArchive \
         -archivePath build/Murmur.xcarchive \
         -exportOptionsPlist ExportOptions.plist \
         -allowProvisioningUpdates \
         -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8 \
         -authenticationKeyID <KEYID> \
         -authenticationKeyIssuerID <ISSUER-ID>

   **[Labroi]** Generate the key once: App Store Connect, Users and Access,
   Integrations, App Store Connect API. **The role must be Admin** (App
   Manager cannot create the distribution signing profiles and fails with
   "Cloud signing permission error"). Download the `.p8` (one-time), note the
   Key ID and Issuer ID. The `.p8` lives in `~/.appstoreconnect/private_keys/`
   at `chmod 600`, never in the repo or a log; the Key ID and Issuer ID are
   not secrets but stay out of the repo too.

5. **[Labroi]** App Store Connect, Murmur, TestFlight tab. The build appears
   after processing (5 to 30 minutes; an email confirms). First build only:
   answer the export compliance question (Murmur uses only standard HTTPS,
   so the exempt encryption answer applies).

6. **[Labroi]** TestFlight, Internal Testing, add himself as tester. His
   iPhone gets a TestFlight notification; install from the TestFlight app.

7. **[Labroi]** On the phone after install: Settings, Murmur, Keyboards,
   turn on Murmur and Allow Full Access. Then the live loop: dictate in the
   app, and via the keyboard mic key in Messages and Notes.

## Privacy nutrition labels (first submission only)

**[Labroi]** answers the App Privacy questionnaire in App Store Connect.
The honest answers for Murmur as shipped:

- **Data collection: none.** Murmur's developer collects nothing, runs no
  servers, and has no analytics. Audio goes only to the API endpoint the
  user configured (Groq by default) to be transcribed, and the transcript
  comes straight back to the device. History, dictionary, corrections, and
  expansions never leave the phone. The API key lives in the Keychain.
- So: "Do you or your third-party partners collect data from this app?"
  answers **No** honestly for the developer side. If review pushes back
  about the transcription call, the fallback is declaring Audio Data,
  linked to identity No, tracking No, purpose App Functionality.
- Both bundles already ship a `PrivacyInfo.xcprivacy` manifest declaring
  no tracking, no collected data, and the UserDefaults required-reason
  API (CA92.1 in the app, 1C8F.1 in the keyboard for the App Group).

## Gotchas worth knowing

- Export "Copy failed" / rsync (hit on the first real upload, 2026-08-15):
  `xcodebuild -exportArchive` shells out to `rsync` to build the `.ipa`.
  Homebrew's rsync 3.4.x rejects the arguments Xcode passes and dies with
  `Copy failed` (`rsync error: syntax or usage error (code 1)`). Fix is to
  put Apple's openrsync first: prefix the export command with
  `PATH="/usr/bin:$PATH"`. This is baked into the step 4 command above.
- Signing role: the ASC API key used for export must be **Admin**, not App
  Manager. App Manager uploads fine but cannot create the distribution
  provisioning profiles, so `-allowProvisioningUpdates` fails with "Cloud
  signing permission error" before anything uploads.
- The keyboard extension inherits the archive's signing; if only the app
  target has a Team set, validation fails with a MurmurKeyboard profile
  error. Set the Team on both targets.
- Icons: `npm install` (or `npm run icons:ios`) must have run before
  archiving, or actool fails on the missing generated PNGs.
- Tester Apple ID vs device iCloud (hit on the first install, 2026-08-15):
  the developer/App Store Connect account and the phone's primary iCloud
  account are two different Apple IDs here. The build won't appear in the
  TestFlight app until it is signed into the *same* Apple ID that was added
  as the internal tester (the ASC/developer one), which is not the device's
  everyday iCloud login. Fix on the phone: TestFlight, account menu, sign in
  with the developer Apple ID and redeem there; or add the device's iCloud
  Apple ID as a tester (invite it as a user under Users and Access first).
  The exact account mapping is kept out of this repo; it lives in memory.
- TestFlight builds expire after 90 days; ship a new build before then.
- Distribution signing: this Mac carries the `Apple Distribution: Eze Media
  LLC (4B55ZVBVKN)` certificate; automatic signing uses it for the archive
  export. Dev builds installed from the command line sign under a personal
  development cert and expire after about 7 days; TestFlight builds do not.

## From TestFlight to the App Store (US-113, one-time)

Everything here happens in App Store Connect on the record created above.
All of it is **[Labroi]** except where noted; a session can draft every
piece of text and generate every image on request.

**Before anything in App Store Connect: clear ownership, license, and employer
sign-off (US-114).** This is a legal gate, not a formality. Publishing a paid,
open-source app you do not cleanly own, or rolling it out at work without
approval, is the one mistake here that is expensive to undo.

- **Ownership.** Confirm Labroi is the sole copyright holder. The origin code and
  a few early fix PRs were authored on the work computer, which is the only
  real exposure (Murmur is unrelated to the employer's business, so
  California Labor Code 2870 otherwise protects personal-time work). Cure it with a
  signed employer IP waiver: the ready-to-send email and acknowledgment live in
  `docs/ip-waiver-request.md`, kept local and gitignored on purpose. Have a
  California attorney review before relying on it.
- **Going forward.** Author all code at home on personal equipment and personal
  time. Filing GitHub issues from the work computer is fine (a bug report is not
  code); write the fixes at home.
- **License.** Relicense the repo to GPLv3 with Labroi as sole copyright holder, add
  a `CONTRIBUTING.md` with a lightweight CLA, and do not accept external PRs (Labroi
  authors all code). Sole ownership is what lets a GPLv3 project be sold on the App
  Store; a single outside contribution without a CLA can freeze that right.
- **Employer clearance, two separate lanes, do not conflate them.**
  - *Cybersecurity director* owns the "may I use this on company systems and share
    it with the team" decision. Lead with data handling (audio goes only to the
    user-configured API, keys live in the Keychain, the code is open and auditable,
    the developer runs no servers), then disclose the personal, App Store, and
    open-source plan as transparency. His approval prevents a shadow-IT problem later.
  - *People/HR* owns the IP side: the waiver above, and awareness of the side project.
  Keep ownership and money in the People and legal lane; keep the tool and data
  questions in the security lane.

1. **Listing content** (App Store tab, iOS App):
   - Name `Murmur`, subtitle (30 chars, e.g. `Push to talk. It types.`),
     description, keywords, promotional text. A session drafts these.
   - Screenshots: at minimum the 6.9-inch iPhone size; capture on the
     iPhone 17 Pro Max simulator (`xcrun simctl io booted screenshot`), a
     session can produce the set. Show the real app: dictation screen,
     keyboard in Messages, settings, onboarding.
   - The 1024 App Store icon ships in the asset catalog already
     (generated, opaque RGB).
2. **Privacy policy URL** (required even with zero data collection) and a
   **support URL**. A one-page static site stating what the app does with
   audio (sent only to the user-configured transcription API, nothing
   stored server-side, no analytics) satisfies both; host it on Vercel and
   keep the URL stable. A session can generate and deploy this page.
3. **App Privacy questionnaire**: answers documented above (collection:
   none).
4. **Age rating** questionnaire: no objectionable content, rates 4+.
5. **Pricing and availability**: Free, all territories (revisit when the
   Pro plan exists).
6. **App Review notes** (critical, the difference between a pass and a
   rejection):
   - **Test key**: the app requires a user-supplied Groq API key, so
     reviewers need one to see dictation work (guideline 2.1). Create a
     throwaway Groq key for review, paste it in the notes, revoke after
     approval. State: paste the key in onboarding step 1, tap Test
     connection.
   - **Background audio justification** (UIBackgroundModes audio, added by
     the hot mic): explain that recording is always user-initiated from
     the keyboard's mic key, the system orange mic indicator is visible
     the whole time, the session auto-releases after a short idle window
     (default 90s, user-configurable, off switch included), and no audio
     is captured outside an explicit dictation.
   - **Keyboard**: works without Full Access for typing keys (guideline
     4.4.1: basic function without Full Access, globe key present); Full
     Access is needed only to receive the finished transcript through the
     App Group, and the keyboard contains no networking or audio code.
   - **The bounce**: describe the murmur:// flow so the reviewer is not
     surprised the mic key opens the app (Apple forbids keyboard mic
     access; this is the compliant pattern).
7. **Submit for review.** Typical turnaround is 24 to 48 hours. Choose
   manual release so the store date is deliberate.
8. **If rejected**: the likely flags are the background audio mode or the
   keyboard; the notes above answer both. Respond in Resolution Center
   rather than resubmitting blind.
