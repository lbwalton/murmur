# murmur's App Store privacy answers

What LaBroi files for murmur voice dictation under App Privacy in App Store Connect (ios/prd.json IOS-026), and why. Checked 2026-10-22 against Apple's App privacy details page (developer.apple.com/app-store/app-privacy-details).

## What to file

- **Data collection:** No, murmur does not collect data. The App Store shows Data Not Collected.
- **Privacy Policy URL** (App Information): https://murmurapp.app/privacy/

## Why that is the true answer

Apple's definitions, as of the check date:

- "Collect" means sending data off the device so that you or your third-party partners can keep it longer than it takes to answer that request in real time.
- "Third-party partners" are analytics tools, advertising networks, third-party SDKs, and other outside vendors whose code you add to the app.

murmur adds no third-party code: the app, the keyboard, and the widgets build from this repo's Swift and MurmurCore alone, with no packages, SDKs, analytics, or ads. Eze Media LLC runs no server for the app and receives nothing from it. Every privacy manifest says no tracking, no tracking domains, and no collected data types, and `scripts/lib/privacy-manifest.test.js` fails if one ever says otherwise.

## What leaves the iPhone, and where it goes

Each of these happens only because the person asked for it, and none of it reaches murmur's maker:

- **A take's audio** goes over HTTPS to the transcription provider the person picked (Groq unless they chose another), under their own key. The provider's own terms cover it.
- **A take's words** go to the cleanup provider when Cleanup is Full with Polish on, and the selected text and the spoken instruction go to it for Transform. It is the same provider unless the person chose a separate one.
- **The dictionary's words** go along with takes as spelling hints: to transcription, and to cleanup.
- **A note's sentences** go to the cleanup provider when Sort into tasks and ideas is on, which says which file each belongs in.
- **Test connection** asks that provider for its list of models, with the person's key.
- **The keyboard** sends nothing anywhere. It hands takes to the app through the app group on the phone, and `scripts/lib/keyboard-network.test.js` fails if its code ever names a networking API.
- **A murmur Pro purchase** goes through Apple's StoreKit. murmur reads the App Store's record of purchases on the phone; the payment is Apple's.
- **A diagnostics report** leaves only when the person taps Save report and shares the file themselves.
- **Notes** are files in the folder the person picks; if that folder syncs (iCloud Drive, a synced vault), the sync service carries them under its own terms.

Everything else stays on the phone: history, settings, recordings waiting to be retried, belts and paintings, recaps (local notifications), and keys (the Keychain, which iOS keeps after the app is deleted until the person taps Remove key).

## When to answer again

Apple asks this again whenever practices change. Answer again before shipping anything that adds a package or SDK, a server murmur's maker runs, analytics, crash reporting that sends by itself, or an account.
