# Murmur Roadmap

> Generated from prd.json (21/30 stories verified). Do not edit by hand: change prd.json, then run `npm run roadmap`.

## Done and verified

- [x] **US-001** App shell, tray, and single instance
- [x] **US-002** Settings persistence
- [x] **US-003** Programmatic icon generation
- [x] **US-004** Toggle hotkey and recording pipeline
- [x] **US-005** Dictation overlay with live waveform
- [x] **US-006** Groq transcription provider
- [x] **US-007** Text insertion at the cursor
- [x] **US-008** Hold-to-talk
- [x] **US-009** Smart formatting and custom dictionary
- [x] **US-010** Local history
- [x] **US-011** First-run onboarding
- [x] **US-012** Polish: sounds, autostart, resilience
- [x] **US-013** Packaging and coworker docs
- [x] **US-014** Correction learning loop
- [x] **US-018** Text expansions
- [x] **US-021** API key encrypted at rest
- [x] **US-022** Instant-start mic
- [x] **US-026** Number formatting option
- [x] **US-027** Warm mic survives sleep and resume
- [x] **US-028** Silence never inserts text
- [x] **US-029** Dictionary prompt never leaks into transcripts

## Built, awaiting live verification

Each of these works in the required smoke checks; the remaining step is a human loop noted in prd.json.

- [ ] **US-015** macOS platform support
- [ ] **US-016** Formatting styles and levels
- [ ] **US-017** Auto structure formatting
- [ ] **US-019** Local usage analytics
- [ ] **US-020** Recap notifications
- [ ] **US-023** Overlay fly-in animation
- [ ] **US-030** The formatter never does what the dictation asks

## Planned

- [ ] **US-024** Signed and notarized macOS build
- [ ] **US-025** Auto-update from GitHub Releases

## iOS (prd-ios.json, 9/15 verified)

- [x] **US-101** Shared formatter spec
- [x] **US-102** Xcode project, app shell, and project law
- [x] **US-103** Transcription and formatting pipeline in Swift
- [x] **US-105** In-app dictation
- [x] **US-106** Keyboard extension
- [x] **US-107** The bounce: record, return, insert
- [x] **US-110** TestFlight on Labroi's iPhone
- [x] **US-111** Formatter parity: prompt echo and compliance guards on iOS
- [x] **US-112** Hot mic: in-place dictation after the first bounce
- [ ] **US-104** API key, settings, and onboarding · built, live check pending
- [ ] **US-108** Action Button and Siri Shortcut dictation · built, live check pending
- [ ] **US-109** Dictionary, corrections, and expansions on iOS · built, live check pending
- [ ] **US-115** Warm-claim recovery: the mic key never dead-ends when the app is gone · built, live check pending
- [ ] **US-113** App Store release
- [ ] **US-114** Ownership, license, and employer clearance

## Horizon (not yet stories)

- [ ] Paid tier sold outside the Mac App Store: license keys via a merchant of record (Lemon Squeezy or Polar shortlisted, both $0 upfront). Free forever from source.
- [ ] Marketing: repo transfer to the public-facing account, README as landing page, SEO pass, launch content.
