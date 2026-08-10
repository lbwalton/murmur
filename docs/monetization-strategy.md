# Murmur Monetization Strategy

Decided 2026-08-08. Goal is revenue-first, with open source as the marketing
engine. This is the business plan behind the code; the release gate that must clear
before any of it ships is tracked as US-114 (ownership, license, and employer
clearance) and detailed in `docs/ios-testflight.md`.

## Positioning: the anti-subscription dictation app

Wispr Flow is a cloud subscription that runs your voice through its own servers and
charges every month. Murmur is the opposite, and that opposite is the whole pitch:

> Pay once, own it. Bring your own key. Your voice goes straight to the transcription
> provider, transcription costs pennies, and the code is open so you can verify all
> of it.

That is a real, defensible position for a specific audience: privacy-conscious,
subscription-tired, technically-adjacent users. It does not try to out-feature a
funded incumbent. It sidesteps them.

## The model: open core, paid convenience

One open-source codebase. The desktop app is the free, open funnel that earns trust
and GitHub activity. The iOS app is the paid product. On iOS the "build it yourself"
path is genuinely painful (Apple Developer account, Xcode, expiring provisioning
profiles), so the one-tap App Store install has real value even though the code is
public. You sell the install and the polish, not secrecy or the keys.

Precedents that prove this works:

- **VoiceInk**: GPLv3, 4,400+ GitHub stars, $39.99 one-time, bring-your-own-key.
  Almost exactly this plan, already running in the wild.
- **Blink Shell**: GPLv3 and sold on the iOS App Store, which works because the
  author is the sole copyright holder.

## Platforms and pricing

| Surface | Distribution | Price | Notes |
|---|---|---|---|
| Desktop (Win/macOS) | GitHub releases, free + open | Free | The marketing funnel. Optional "support" license via a merchant of record is a lower-priority path already noted in the roadmap Horizon |
| iOS | App Store | Free download + one-time Pro unlock (IAP), target **$29 to $39** | Sits with VoiceInk ($39.99), undercuts the $149 to $249 lifetime crowd |
| Bring-your-own-key | Everywhere at launch | n/a | Murmur never holds a key or pays for inference, so per-user cost is ~$0 |

## Free vs Pro: gate by feature, not usage

Under bring-your-own-key you cannot honestly meter words. The user is paying the
transcription provider directly, so charging rent on their word count would be
charging for something you do not provide, and technical users would see through it
instantly. So the split is by capability:

- **Free (BYOK):** core push-to-talk dictation into a text field, the default
  formatter, one language.
- **Pro (one-time unlock):** the iOS keyboard extension (system-wide dictation in
  every app, the killer feature), custom vocabulary, custom formatting rules and
  snippets, command mode, 100+ languages, choice of model or endpoint, transcript
  history, and cross-device sync.

The keyboard is the strongest paywall on iOS: "try dictation free, pay once to use
it everywhere."

## Licensing

GPLv3, with Labroi as the **sole copyright holder**, a `CONTRIBUTING.md` carrying a
lightweight CLA, and **no external PRs accepted** (Labroi authors all code). Sole
ownership is what lets a GPLv3 project be sold on the App Store; one outside
contribution without a CLA can freeze that right. Pro features live in the open repo
behind an in-app-purchase check. Ownership must be confirmed clean first (US-114).

## Sync without servers

Cross-device sync ships in the one-time Pro tier with no backend to run:

- **Apple devices (iPhone, iPad, Mac):** iCloud/CloudKit. Apple hosts it, it is tied
  to the user's Apple ID, and it costs nothing to operate. Settings, vocabulary,
  formatting rules, snippets, and history sync through the user's own iCloud.
- **Windows:** piggyback on a folder the user already syncs (iCloud Drive, Dropbox,
  OneDrive). Murmur writes a small settings file there; their existing sync service
  moves the bytes. True automatic Windows-to-Apple sync is a natural Cloud-tier
  feature later.
- **The API key is never synced by default** (Keychain-only rule). Syncing it via
  the end-to-end-encrypted iCloud Keychain is a deliberate opt-in, not a default.

## Referrals

Keep the growth mechanic, change the currency. Wispr's "invite a friend, get a free
month" only works with a subscription. For a one-time app, referrals become discount
codes (both people save) or an affiliate payout. Apple supports this with offer codes.

## Phase 2: optional managed tier (after traction)

Once there are stars, reviews, and paying users, add an **optional** "Murmur Cloud"
subscription for non-technical users who never want to touch an API key. Murmur hosts
the key behind a proxy and meters usage (metering is honest here because now Murmur
pays). Price it well under Wispr, around **$4 to $5/mo**. Because the underlying
inference is nearly free, this tier is close to pure margin, and only opted-in users
cost anything. This captures mainstream and recurring revenue without giving up the
launch advantages or the privacy story.

## Market snapshot (verified 2026-08-08)

| App | Model | Price | Open source |
|---|---|---|---|
| Wispr Flow | Managed, hosts inference | $15/mo, $144/yr; free = 2,000 words/wk (1,000 on iPhone); no lifetime | No |
| VoiceInk | BYOK / local | $39.99 one-time | Yes, GPLv3, 4,400+ stars |
| MacWhisper | Local | ~$69 lifetime (Gumroad) | No |
| Voibe | Local + optional cloud | $149 lifetime | No |
| Superwhisper | BYOK / local | $8.49/mo, $84.99/yr, $249.99 lifetime | No |

**Cost of goods (why one-time works):** Groq `whisper-large-v3-turbo` is **$0.04 per
hour of audio**. 2,000 words is roughly 15 to 20 minutes of speech, so an entire week
of Wispr's free cap would cost about one cent of inference. A heavy user doing 50,000
words a month costs about 25 cents. Wispr charges a subscription because they eat that
bill at scale and fund a team; Murmur does not, which is exactly why it does not need
a subscription to launch, and why the Phase 2 managed tier is high margin when it
arrives.

## Open follow-ups

- First iOS release ships **Free** (the runbook's pricing step), with the Pro unlock
  added right after; revisit App Store pricing when Pro lands.
- Reconcile the desktop "paid license via merchant of record" idea in the roadmap
  Horizon with this plan (desktop stays the free funnel; a paid desktop license is
  optional and secondary to the iOS Pro unlock).
- Re-verify Wispr and Groq pricing before any number here is used in store copy or a
  billing decision; the figures above carry a 2026-08-08 check date.
