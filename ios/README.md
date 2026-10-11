# murmur for iPhone

The iPhone app: a keyboard that is a dictation pad around the waveform pill, backed by the murmur app, which holds the microphone, your key, the cleanup, and your history. The plan is [prd.json](prd.json); progress is [ROADMAP.md](ROADMAP.md). It is not on the App Store yet.

## What do I need to build it?

- A Mac with Xcode 26 or later, and an iOS 26 or later simulator runtime (Xcode, Settings, Components)
- Node 22 or later, and `npm install` run once at the repo root
- XcodeGen: `brew install xcodegen`

## How do I build and test it?

```
npm run ios:generate   # the colors, the icon, the shared rules, and ios/murmur.xcodeproj
open ios/murmur.xcodeproj
npm run ios:test       # MurmurCore's tests on the Mac, then the app's tests on a simulator
npm run ios:smoke      # builds the app, launches it headless, and prints SMOKE_RESULT
```

The tests and the smoke run on murmur's own simulator, named murmur smoke, created the first time and shut down afterward. Other simulators are left alone.

Nothing generated is committed: `ios/Generated`, `ios/build`, and `ios/murmur.xcodeproj` are rebuilt from `ios/project.yml`, `src/renderer/tokens.css`, the icon scripts, and `shared/`. Change those, never the generated files.

## How is it laid out?

- `project.yml`: the XcodeGen recipe for the app (`murmur`), the keyboard (`murmurKeyboard`), and the tests (`murmurTests`)
- `MurmurCore/`: murmur's rules in Swift, with no UI, tested by `swift test`
- `App/`: the app, which owns the microphone, the key, and history
- `Keyboard/`: the keyboard extension, which stays thin and never touches the network
- `Shared/`: code both targets compile, such as the app group (the shared drawer between them)

## Can I put my own build on my iPhone?

Yes. At the top of `project.yml`, change `DEVELOPMENT_TEAM`, `MURMUR_BUNDLE_ID`, and `MURMUR_APP_GROUP` to your own; the keyboard's id, the app group in both targets, and the scripts all follow from those three. Then run `npm run ios:generate` and build from Xcode. Simulator builds need no Apple account at all.
