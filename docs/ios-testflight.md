# Shipping Murmur iOS to TestFlight

The repeatable loop for getting a build onto Labroi's iPhone. Steps marked
**[Labroi]** need his Apple ID, his Team, or his hands; everything else is
scriptable. All commands run from `ios/`.

## One-time setup

1. **[Labroi]** An Apple Developer Program membership ($99/yr) on his Apple ID.
2. **[Labroi]** Tell the session the Team ID (Apple Developer site, Membership
   page, ten characters like `A1B2C3D4E5`). It goes into the two target build
   settings as `DEVELOPMENT_TEAM` with `CODE_SIGN_STYLE = Automatic`; Xcode
   then creates the App ID, the App Group, and profiles on first archive.
3. **[Labroi]** In [App Store Connect](https://appstoreconnect.apple.com),
   Apps, plus button, New App:
   - Platform iOS, Name `Murmur`, primary language English.
   - Bundle ID `com.labroi.murmur.ios` (appears after step 2's first archive
     registers it, or register it manually under Identifiers).
   - SKU anything memorable (`murmur-ios`).
4. Xcode signing pickup: open `ios/Murmur.xcodeproj`, select the Murmur
   target, Signing & Capabilities, choose the Team; repeat for the
   MurmurKeyboard target. Both must show the App Group
   `group.com.labroi.murmur.ios` with no red errors.

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

4. Export and upload. Create `ios/ExportOptions.plist` once:

       <?xml version="1.0" encoding="UTF-8"?>
       <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
       <plist version="1.0"><dict>
         <key>method</key><string>app-store-connect</string>
         <key>destination</key><string>upload</string>
       </dict></plist>

   Then:

       xcodebuild -exportArchive -archivePath build/Murmur.xcarchive \
         -exportOptionsPlist ExportOptions.plist

   **[Labroi]** The upload authenticates with his Apple ID. Either sign into
   Xcode (Settings, Accounts) once beforehand, or create an App Store Connect
   API key and pass `-authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID`.

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

- The keyboard extension inherits the archive's signing; if only the app
  target has a Team set, validation fails with a MurmurKeyboard profile
  error. Set the Team on both targets.
- Icons: `npm install` (or `npm run icons:ios`) must have run before
  archiving, or actool fails on the missing generated PNGs.
- TestFlight builds expire after 90 days; ship a new build before then.
