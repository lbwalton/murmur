# The Painted Journey (IOS-018) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The iPhone Journey is painted the way desktop paints it, by desktop's own code: the belt, the road, the two gates, and the achievements as ink stamps. A new belt gets desktop's ceremony and a new stripe drops its tape. Every word stays a native view.

**Architecture:**
- **Desktop's code, shared.** Desktop's brush engine (`src/renderer/brush.ts`) and Journey painter (`src/renderer/settings/journeyPaint.ts`) are bundled by Vite at `npm run ios:generate` into one page, `Generated/web/journey.html`, which ships in the app.
  - The road, gate, and ceremony math that lived in desktop's Journey view and ceremony moves into `journeyPaint.ts`, so desktop and the page import one module. Desktop's behavior is unchanged.
- **The page is locked down.** It loads from its bundle file with read access to its own folder only. Its content policy refuses every fetch, and the web view refuses every navigation but that file's first load.
- **Pictures, not a live canvas.** `JourneyPainter` keeps the page in a web view that is never on screen and asks it for pictures (PNG data). The Journey shows them as images, with native text beside and over them.
  - The ceremony is the one exception: it runs the page on screen for its animation, with the rank as native text over it.
  - The tape drop is thirteen still frames, played natively.
- **Achievements and the ceremony's memory are ported too.** `evaluateAchievements` and `toCelebrate` move to MurmurCore. Two new shared vector files, with desktop's own answers, keep both platforms equal.
  - History now stores the local hour of each take, as desktop does, for the hour-of-day achievements.

**Tech Stack:** Swift 6, Swift Testing, SwiftUI, WebKit (WKWebView), TypeScript, Vite (library build, IIFE), vitest.

**Spec:**
- `ios/prd.json` IOS-018, with `conventions`, `CLAUDE.md`, and `DESIGN.md`. The brushwork rules: paint is code-drawn, errors never splatter, and Reduce Motion gets a finished painting.
- Desktop's src/renderer/brush.ts, settings/journeyPaint.ts, JourneyView.tsx, Ceremony.tsx, and celebrate.ts, and src/shared/achievements.ts, all murmur's own.

The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** in a throwaway copy of `feature/ios` at 80c3076:
- `npm run typecheck` was clean; `npm run test` passed 957 (922 + 26 vectors + 6 journeyPaint + 3 page build); `npm run smoke` (desktop) was ok.
- `swift test` passed 117 (112 + 5).
- `npm run ios:test` passed 276 app tests (250 + 26).
- `npm run ios:smoke` printed twenty true checks, `achievements` and `journeyPage` among them.
- Screens rendered and read: the painted Journey (belt, road scrolled to you, gates, tallies), all fourteen stamps, and the blue belt ceremony. That read caught three problems, all fixed here:
  - **The ceremony painted at size zero.** It painted before its layout knew the size; it now paints once the size is known.
  - **A cold start ran past the wait.** The page's first start on a cold simulator launch took over five seconds; the wait is now fifteen.
  - **Desktop's road label.** The label on your spot now reads as desktop's does.
- **Same seed, same marks.** One stamp, the "1k" stamp, and a belt were painted from the same seed in Electron (the desktop app's Chromium) and on the iPhone simulator (WebKit), then compared pixel by pixel:

| Picture | Ink overlap | Pixels apart by more than 48 of 255 |
|---|---|---|
| Stamp | 99.1% | 0.04% |
| Belt | 99.8% | 0.01% |
| "1k" stamp | 94.7% | 2.2% |

  The "1k" difference is the numerals' font: the Mac's text face against the iPhone's system font. The brush marks are identical.
- **Timing.** Once the page is up, a stamp paints in about 56 ms, a tape frame in about 19 ms, and the road in about 51 ms. The page's first start took 2.6 s in the test run.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **Pictures from a page that is never on screen, shown as native images.** Only the ceremony shows the web view itself, under native text. Every word, the belt name, gate numbers, road labels, stamp names, and hints, is a native view, so Dynamic Type and VoiceOver work as everywhere else.
   - The stamps' numerals ("1k", "30") and the founder crown are part of the painted marks, as on desktop. Each stamp's VoiceOver label carries its name, and its hint when not earned.
   - If wrong: painting text natively over the stamps instead.
2. **The page is one bundle file, loaded with read access to its own folder.** Its content policy is `default-src 'none'`, with inline script and style only and `data:` images. Navigation is allowed once, for that file; if iOS ends the page's process, the page loads that file once more.
3. **Same marks, measured with a tolerance.**
   - The same request painted twice on the same simulator differed in 7 of 107,520 color bytes, each by one level: GPU rounding.
   - Tests compare paintings with `PaintingDifference.same`: no byte more than 2 levels apart, and fewer than 0.5% of bytes differing.
   - The Mac comparison lives in the notes; its images stay in the scratchpad, since no binaries go in the repo.
4. **History stores the local hour,** desktop's rule, for night owl and early bird. Older takes fall back to their hour now. The vector files and the smoke run the same.
5. **Ceremony memory is desktop's.** It is the highest rank celebrated, by ladder place, in `UserDefaults` under desktop's key name (`murmur-ceremony-rank`), and it only rises.
   - It is decided when the Journey opens and again when practice climbs while it is open.
   - The newest new belt gets the ceremony; a stripe on the belt you hold gets its tape after.
6. **The ceremony closes on its own after desktop's 4.6 seconds, except with VoiceOver on,** where it waits for a tap or the escape gesture so the rank can be heard. It is one button-like element that reads the rank, its title, and what earned it.
7. **No warm-up at app launch.** The page starts when the Journey opens, so opening murmur to dictate stays fast.
   - Until the paintings land, the Journey shows IOS-017's plain drawing, and the paintings fade in; with Reduce Motion they simply appear.
   - The page gets 15 seconds to start; once it has failed, later asks fail at once until the page restarts.
   - If wrong: warming the page when Home appears.
8. **Only the ceremony and the tape drop move.** These stay still for now:
   - desktop's gates drawing on from where you last saw them (US-095);
   - the road and belt painting in;
   - desktop's hover notes on the road's marks, since a phone has no hover.

   Desktop's motion there is subtle, and frames for it are a follow-up if wanted.
9. **The road is shown at desktop's full size (1500 by 120 points), scrolled sideways to you,** as desktop's road scrolls. Its labels are capped at the xxLarge text size so they stay under their marks; VoiceOver reads the road as one element with your rank's place.
10. **The Home row keeps IOS-017's plain belt.** Desktop draws marks at 32 points and below plainly, never brushed.
11. **The Mac comparison ran the iPhone's bundle in Electron,** desktop's own Chromium, outside the desktop app window. It is the same source files (journeyPaint.ts and brush.ts), compiled once.
12. **The README's layout list gains `Live/` and `Widgets/`,** missing since IOS-016, along with the new `Web/`.
13. **No founder on iPhone yet,** as in IOS-017: the page's road is practice's road.

## Global Constraints

- Swift 6, iOS 26, compiling on Swift 6.3 (CI's Xcode 26.6).
- `shared/` stays the single source of shared rules; both platforms test the same vector files.
- Design: night studio tokens; no raw colors in code (the design lint checks).
  - Gold for labels and your place on the road.
  - Paint only where something happened: the belt, the road, the gates, the stamps, and the ceremony. Errors never splatter.
  - Reduce Motion always gets a finished painting.
- Renderers and pages stay sandboxed: the painter page reaches nothing outside its own file.
- Every source file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-018:`, then `git pull --rebase`.
  - Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
  - Also `npm run smoke` for the desktop task.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **A page that never starts, or whose process iOS ends mid-visit.** The Journey must stay readable and the paintings must come back.
   - Pinned by `JourneyArtTests.withoutThePageNothingIsPainted` and `JourneyPainterTests.aMissingPageFailsInTime` (Tasks 5 and 7).
   - The restart path itself (`webViewWebContentProcessDidTerminate`) cannot be forced in a test; check it by reading.
2. **The page reaching anything outside its own file.** Pinned by these `JourneyPainterTests` (Task 5):
   - `thePageCanFetchNothing`;
   - `thePageCannotNavigate`;
   - `thePageIsOneFileInTheBundle`.
3. **A ceremony replaying, or a belt never celebrated.** Pinned by `celebrate-vectors` on both platforms (Tasks 1 and 2) and by `JourneyCelebrationTests` (Task 6).
4. **The two platforms earning different achievements** (the hour, the day, the order). Pinned by:
   - `achievement-vectors` on both platforms (Tasks 1 and 2);
   - `JourneyAchievementTests.aTakeKeepsTheHourItWasSpokenIn` (Task 6);
   - the smoke's `achievements` check (Task 8).
5. **Words painted into a picture, where Dynamic Type and VoiceOver cannot reach them.** Pinned by `journeyPaint.test.ts`'s "leaves its words off for a page that sets them natively" (Task 3).

---

### Task 1: The shared achievement and ceremony vectors

**Files:** Create:
- `shared/achievement-vectors.json` and `shared/celebrate-vectors.json`;
- `src/shared/achievement-vectors.test.ts` and `src/renderer/settings/celebrate-vectors.test.ts`.

Desktop is the oracle. Each case's answers came from desktop's own `evaluateAchievements` and `toCelebrate`, so these tests pass on arrival; they pin desktop's behavior for the Swift ports in Task 2.

- [ ] **Step 1: Add the vectors and their desktop tests**

`shared/achievement-vectors.json`, whole (12 cases):

```json
{
  "note": "Takes run through desktop's evaluateAchievements (src/shared/achievements.ts) with shared/achievements.json: each take's time, words, length, and the local day and hour it was spoken in, as history keeps them; expect lists what was earned and when, oldest first. Both platforms run these (IOS-018).",
  "cases": [
    {
      "name": "nothing yet earns nothing",
      "events": [],
      "expect": []
    },
    {
      "name": "the first take earns first words",
      "events": [
        {"at":1767625200000,"words":12,"durationMs":60000,"day":"2026-01-05","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000}
      ]
    },
    {
      "name": "three days in a row earn a streak, a gap starts it over",
      "events": [
        {"at":1767625200000,"words":10,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767711600000,"words":10,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767884400000,"words":10,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767970800000,"words":10,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1768057200000,"words":10,"durationMs":60000,"day":"2026-01-10","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"streak-3","at":1768057200000}
      ]
    },
    {
      "name": "seven days in a row",
      "events": [
        {"at":1767625200000,"words":5,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767711600000,"words":5,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767798000000,"words":5,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767884400000,"words":5,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767970800000,"words":5,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1768057200000,"words":5,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768143600000,"words":5,"durationMs":60000,"day":"2026-01-11","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"streak-3","at":1767798000000},
        {"id":"streak-7","at":1768143600000}
      ]
    },
    {
      "name": "a thousand words in one day, over several takes",
      "events": [
        {"at":1767625200000,"words":400,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767627000000,"words":400,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767628800000,"words":300,"durationMs":60000,"day":"2026-01-05","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"day-1k","at":1767628800000}
      ]
    },
    {
      "name": "five and ten thousand words in a day",
      "events": [
        {"at":1767625200000,"words":6000,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767711600000,"words":10500,"durationMs":60000,"day":"2026-01-06","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"day-1k","at":1767625200000},
        {"id":"day-5k","at":1767625200000},
        {"id":"day-10k","at":1767711600000}
      ]
    },
    {
      "name": "a hundred takes",
      "events": [
        {"at":1767625200000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625260000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625320000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625380000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625440000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625500000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625560000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625620000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625680000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767625740000,"words":3,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767711600000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767711660000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767711720000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767711780000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767711840000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767711900000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767711960000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767712020000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767712080000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767712140000,"words":3,"durationMs":60000,"day":"2026-01-06","hour":15},
        {"at":1767798000000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798060000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798120000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798180000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798240000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798300000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798360000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798420000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798480000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767798540000,"words":3,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767884400000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884460000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884520000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884580000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884640000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884700000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884760000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884820000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884880000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767884940000,"words":3,"durationMs":60000,"day":"2026-01-08","hour":15},
        {"at":1767970800000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767970860000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767970920000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767970980000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767971040000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767971100000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767971160000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767971220000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767971280000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1767971340000,"words":3,"durationMs":60000,"day":"2026-01-09","hour":15},
        {"at":1768057200000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057260000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057320000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057380000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057440000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057500000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057560000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057620000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057680000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768057740000,"words":3,"durationMs":60000,"day":"2026-01-10","hour":15},
        {"at":1768143600000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768143660000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768143720000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768143780000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768143840000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768143900000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768143960000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768144020000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768144080000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768144140000,"words":3,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768230000000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230060000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230120000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230180000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230240000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230300000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230360000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230420000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230480000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768230540000,"words":3,"durationMs":60000,"day":"2026-01-12","hour":15},
        {"at":1768316400000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316460000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316520000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316580000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316640000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316700000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316760000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316820000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316880000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768316940000,"words":3,"durationMs":60000,"day":"2026-01-13","hour":15},
        {"at":1768402800000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768402860000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768402920000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768402980000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768403040000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768403100000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768403160000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768403220000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768403280000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15},
        {"at":1768403340000,"words":3,"durationMs":60000,"day":"2026-01-14","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"streak-3","at":1767798000000},
        {"id":"streak-7","at":1768143600000},
        {"id":"sessions-100","at":1768403340000}
      ]
    },
    {
      "name": "a five minute take is a marathon",
      "events": [
        {"at":1767625200000,"words":50,"durationMs":299999,"day":"2026-01-05","hour":15},
        {"at":1767711600000,"words":50,"durationMs":300000,"day":"2026-01-06","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"marathon","at":1767711600000}
      ]
    },
    {
      "name": "after midnight and before dawn",
      "events": [
        {"at":1767625200000,"words":20,"durationMs":60000,"day":"2026-01-05","hour":23},
        {"at":1767711600000,"words":20,"durationMs":60000,"day":"2026-01-06","hour":2},
        {"at":1767798000000,"words":20,"durationMs":60000,"day":"2026-01-07","hour":5},
        {"at":1767884400000,"words":20,"durationMs":60000,"day":"2026-01-08","hour":6}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"night-owl","at":1767711600000},
        {"id":"streak-3","at":1767798000000},
        {"id":"early-bird","at":1767798000000}
      ]
    },
    {
      "name": "a week away and back is a comeback",
      "events": [
        {"at":1767625200000,"words":30,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1768143600000,"words":30,"durationMs":60000,"day":"2026-01-11","hour":15},
        {"at":1768834800000,"words":30,"durationMs":60000,"day":"2026-01-19","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"comeback","at":1768834800000}
      ]
    },
    {
      "name": "takes out of order are walked in time order",
      "events": [
        {"at":1767798000000,"words":10,"durationMs":60000,"day":"2026-01-07","hour":15},
        {"at":1767625200000,"words":10,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767711600000,"words":10,"durationMs":60000,"day":"2026-01-06","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000},
        {"id":"streak-3","at":1767798000000}
      ]
    },
    {
      "name": "a stored day that goes back keeps the streak as it is",
      "events": [
        {"at":1767625200000,"words":10,"durationMs":60000,"day":"2026-01-05","hour":15},
        {"at":1767628800000,"words":10,"durationMs":60000,"day":"2026-01-04","hour":16},
        {"at":1767711600000,"words":10,"durationMs":60000,"day":"2026-01-06","hour":15}
      ],
      "expect": [
        {"id":"first-words","at":1767625200000}
      ]
    }
  ]
}
```

`shared/celebrate-vectors.json`, whole (14 cases):

```json
{
  "note": "Promotions run through desktop's toCelebrate (src/renderer/settings/celebrate.ts): which new belt gets the ceremony, which stripe gets the tape, and the highest rank reached, as rank ids. seen is the highest rank already celebrated, or null with no record yet. Both platforms run these (IOS-018).",
  "cases": [
    {
      "name": "a new belt gets the ceremony",
      "promotions": [
        {"id":"white","at":1787408000000},
        {"id":"blue","at":1789913600000}
      ],
      "seen": "white",
      "now": 1790000000000,
      "expect": {"belt":"blue","tape":null,"reached":"blue"}
    },
    {
      "name": "a stripe gets the tape",
      "promotions": [
        {"id":"blue","at":1787408000000},
        {"id":"blue-1","at":1789913600000}
      ],
      "seen": "blue",
      "now": 1790000000000,
      "expect": {"belt":null,"tape":"blue-1","reached":"blue-1"}
    },
    {
      "name": "a black belt degree gets the tape",
      "promotions": [
        {"id":"black-1","at":1789913600000}
      ],
      "seen": "black",
      "now": 1790000000000,
      "expect": {"belt":null,"tape":"black-1","reached":"black-1"}
    },
    {
      "name": "the first coral belt gets the ceremony",
      "promotions": [
        {"id":"coral-7","at":1789913600000}
      ],
      "seen": "black-6",
      "now": 1790000000000,
      "expect": {"belt":"coral-7","tape":null,"reached":"coral-7"}
    },
    {
      "name": "the first belt with no record yet",
      "promotions": [
        {"id":"white","at":1789956800000}
      ],
      "seen": null,
      "now": 1790000000000,
      "expect": {"belt":"white","tape":null,"reached":"white"}
    },
    {
      "name": "a belt earned a while back still plays before its newer stripe",
      "promotions": [
        {"id":"blue","at":1781360000000},
        {"id":"blue-1","at":1789827200000}
      ],
      "seen": "white-4",
      "now": 1790000000000,
      "expect": {"belt":"blue","tape":"blue-1","reached":"blue-1"}
    },
    {
      "name": "one take that climbs a stripe, a belt, and a stripe",
      "promotions": [
        {"id":"white-4","at":1789913600000},
        {"id":"blue","at":1789913600000},
        {"id":"blue-1","at":1789913600000}
      ],
      "seen": "white-3",
      "now": 1790000000000,
      "expect": {"belt":"blue","tape":"blue-1","reached":"blue-1"}
    },
    {
      "name": "two belts at once play the newer",
      "promotions": [
        {"id":"blue","at":1789913600000},
        {"id":"purple","at":1789913600000}
      ],
      "seen": "white-4",
      "now": 1790000000000,
      "expect": {"belt":"purple","tape":null,"reached":"purple"}
    },
    {
      "name": "ranks at the mark never replay",
      "promotions": [
        {"id":"white","at":1789740800000},
        {"id":"blue","at":1789913600000}
      ],
      "seen": "blue",
      "now": 1790000000000,
      "expect": null
    },
    {
      "name": "ranks below the mark never replay",
      "promotions": [
        {"id":"white","at":1789913600000}
      ],
      "seen": "purple",
      "now": 1790000000000,
      "expect": null
    },
    {
      "name": "an old promotion on first open",
      "promotions": [
        {"id":"blue","at":1789913599999}
      ],
      "seen": null,
      "now": 1790000000000,
      "expect": null
    },
    {
      "name": "a promotion exactly a day old on first open",
      "promotions": [
        {"id":"blue","at":1789913600000}
      ],
      "seen": null,
      "now": 1790000000000,
      "expect": {"belt":"blue","tape":null,"reached":"blue"}
    },
    {
      "name": "no promotions",
      "promotions": [],
      "seen": null,
      "now": 1790000000000,
      "expect": null
    },
    {
      "name": "an unknown rank is ignored",
      "promotions": [
        {"id":"white","at":1789913600000},
        {"id":"gold-9","at":1789956800000}
      ],
      "seen": null,
      "now": 1790000000000,
      "expect": {"belt":"white","tape":null,"reached":"white"}
    }
  ]
}
```

`src/shared/achievement-vectors.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/achievement-vectors.json through the achievements. MurmurCore
// runs the same file, so a change to either side breaks both platforms or
// neither (ios/prd.json IOS-018).
import { describe, expect, it } from 'vitest'
import achievements from '../../shared/achievements.json'
import vectors from '../../shared/achievement-vectors.json'
import { type AchievementsFile, evaluateAchievements } from './achievements'
import type { SessionEvent } from './history'

interface Case {
  name: string
  events: { at: number; words: number; durationMs: number; day: string; hour: number }[]
  expect: { id: string; at: number }[]
}

describe('shared/achievement-vectors.json', () => {
  for (const c of vectors.cases as Case[]) {
    it(c.name, () => {
      const events: SessionEvent[] = c.events.map((e) => ({ at: e.at, durationMs: e.durationMs, rawText: '', finalText: '', words: e.words, wpm: 0, day: e.day, hour: e.hour }))
      expect(evaluateAchievements(events, achievements as unknown as AchievementsFile)).toEqual(c.expect)
    })
  }
})
```

`src/renderer/settings/celebrate-vectors.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/celebrate-vectors.json through toCelebrate. MurmurCore runs
// the same file, so both platforms celebrate the same promotions
// (ios/prd.json IOS-018).
import { describe, expect, it } from 'vitest'
import ranks from '../../../shared/ranks.json'
import vectors from '../../../shared/celebrate-vectors.json'
import type { RankSpec } from '../../shared/ranks'
import { toCelebrate } from './celebrate'

const LADDER = (ranks as { ranks: RankSpec[] }).ranks

interface Case {
  name: string
  promotions: { id: string; at: number }[]
  seen: string | null
  now: number
  expect: { belt: string | null; tape: string | null; reached: string } | null
}

describe('shared/celebrate-vectors.json', () => {
  for (const c of vectors.cases as Case[]) {
    it(c.name, () => {
      const seen = c.seen === null ? null : LADDER.findIndex((r) => r.id === c.seen)
      const got = toCelebrate(c.promotions, LADDER, seen, c.now)
      expect(got === null ? null : { belt: got.belt?.id ?? null, tape: got.tape?.id ?? null, reached: LADDER[got.reached].id }).toEqual(c.expect)
    })
  }
})
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/shared/achievement-vectors.test.ts src/renderer/settings/celebrate-vectors.test.ts`
Expected: 26 pass. Then `npm run test` passes 948.

- [ ] **Step 3: Run the gates and commit**

```bash
git add shared/achievement-vectors.json shared/celebrate-vectors.json src/shared/achievement-vectors.test.ts src/renderer/settings/celebrate-vectors.test.ts
git commit -m "IOS-018: desktop's achievements and ceremony answers on shared cases, for both platforms to run"
```

### Task 2: Achievements and the ceremony's choice in MurmurCore

**Files:**
- Create `ios/MurmurCore/Sources/MurmurCore/Achievements.swift` and `Celebrations.swift`.
- Modify `Ranks.swift` (a public `Promotion` init).
- Test `ios/MurmurCore/Tests/MurmurCoreTests/AchievementVectorTests.swift` and `CelebrateVectorTests.swift`.

**Interfaces:**
- Produces `AchievementSpec` (with `Condition`), `AchievementsFile`, `AchievementEvent(at:words:durationMs:day:hour:)`, `EarnedAchievement`, and `Achievements.evaluate(_:spec:)`.
- Produces `Celebration` (`belt`, `tape`, `reached`), `Celebrations.toCelebrate(_:ladder:seen:now:)`, `Celebrations.freshMs`, and `Promotion(id:at:)`.

- [ ] **Step 1: Write the failing tests**

`ios/MurmurCore/Tests/MurmurCoreTests/AchievementVectorTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/achievement-vectors.json: histories desktop ran through its
/// achievements.
struct AchievementVectors: Decodable {
    struct Event: Decodable {
        let at: Int64
        let words: Int
        let durationMs: Int
        let day: String
        let hour: Int
    }

    struct Earned: Decodable, Equatable {
        let id: String
        let at: Int64
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let events: [Event]
        let expect: [Earned]

        var testDescription: String { name }
    }

    let cases: [Case]

    static let file: AchievementVectors? = try? SharedData(directory: repoShared).decode(AchievementVectors.self, from: "achievement-vectors.json")
    static let spec: AchievementsFile? = try? SharedData(directory: repoShared).decode(AchievementsFile.self, from: "achievements.json")
}

@Suite struct AchievementVectorTests {
    @Test func theVectorsAndTheAchievementsLoad() throws {
        #expect(try #require(AchievementVectors.file).cases.count >= 10)
        let spec = try #require(AchievementVectors.spec)
        #expect(spec.achievements.count == 14)
        #expect(!spec.achievements.contains { $0.condition == .unknown })
    }

    @Test(arguments: AchievementVectors.file?.cases ?? [])
    func eachHistoryEarnsAsOnDesktop(_ vector: AchievementVectors.Case) throws {
        let spec = try #require(AchievementVectors.spec)
        let events = vector.events.map { AchievementEvent(at: $0.at, words: $0.words, durationMs: $0.durationMs, day: $0.day, hour: $0.hour) }
        let earned = Achievements.evaluate(events, spec: spec)
        #expect(earned.map(\.id) == vector.expect.map(\.id))
        #expect(earned.map(\.at) == vector.expect.map(\.at))
    }

    /// Days apart as desktop counts them, across a month and a year.
    @Test func daysApartAsDesktopCountsThem() {
        #expect(Achievements.distance("2026-01-31", "2026-02-01") == 1)
        #expect(Achievements.distance("2026-12-31", "2027-01-07") == 7)
        #expect(Achievements.distance("2026-03-10", "2026-03-08") == -2)
    }
}
```

`ios/MurmurCore/Tests/MurmurCoreTests/CelebrateVectorTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/celebrate-vectors.json: promotions desktop ran through its
/// toCelebrate.
struct CelebrateVectors: Decodable {
    struct Moment: Decodable {
        let id: String
        let at: Int64
    }

    struct Expected: Decodable, Equatable {
        let belt: String?
        let tape: String?
        let reached: String
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let promotions: [Moment]
        let seen: String?
        let now: Int64
        let expect: Expected?

        var testDescription: String { name }
    }

    let cases: [Case]

    static let file: CelebrateVectors? = try? SharedData(directory: repoShared).decode(CelebrateVectors.self, from: "celebrate-vectors.json")
    static let ladder: [RankSpec]? = (try? SharedData(directory: repoShared).decode(RanksFile.self, from: "ranks.json"))?.ranks
}

@Suite struct CelebrateVectorTests {
    @Test func theVectorsLoad() throws {
        #expect(try #require(CelebrateVectors.file).cases.count >= 10)
    }

    @Test(arguments: CelebrateVectors.file?.cases ?? [])
    func eachCelebratesAsOnDesktop(_ vector: CelebrateVectors.Case) throws {
        let ladder = try #require(CelebrateVectors.ladder)
        let seen = vector.seen.flatMap { id in ladder.firstIndex { $0.id == id } }
        let got = Celebrations.toCelebrate(vector.promotions.map { Promotion(id: $0.id, at: $0.at) }, ladder: ladder, seen: seen, now: vector.now)
        let shown = got.map { CelebrateVectors.Expected(belt: $0.belt?.id, tape: $0.tape?.id, reached: ladder[$0.reached].id) }
        #expect(shown == vector.expect)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `swift test --package-path ios/MurmurCore`
Expected: the build fails with `cannot find type 'AchievementsFile' in scope` and `cannot find 'Celebrations' in scope`.

- [ ] **Step 3: Port them**

`ios/MurmurCore/Sources/MurmurCore/Achievements.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The achievements (ios/prd.json IOS-018), as desktop's
// src/shared/achievements.ts earns them from shared/achievements.json: the
// first take, streaks of days in a row, words in one day, lifetime takes, a
// marathon take, the hour it was spoken, and coming back after a quiet
// spell. Each is earned once, at the take that first met it.
// shared/achievement-vectors.json keeps both platforms equal.
import Foundation

public struct AchievementSpec: Decodable, Sendable, Equatable {
    public enum Condition: Sendable, Equatable {
        case firstSession
        case streak(days: Int)
        case dayWords(words: Int)
        case lifetimeSessions(count: Int)
        case marathon(durationMs: Int)
        case timeOfDay(fromHour: Int, toHour: Int)
        case comeback(quietDays: Int)
        /// A kind this build does not know yet: never earned.
        case unknown
    }

    public let id: String
    public let name: String
    public let hint: String
    public let condition: Condition

    private enum Keys: String, CodingKey { case id, name, hint, condition }
    private enum ConditionKeys: String, CodingKey { case type, days, words, count, durationMs, fromHour, toHour, quietDays }

    public init(from decoder: any Decoder) throws {
        let box = try decoder.container(keyedBy: Keys.self)
        id = try box.decode(String.self, forKey: .id)
        name = try box.decode(String.self, forKey: .name)
        hint = try box.decode(String.self, forKey: .hint)
        let c = try box.nestedContainer(keyedBy: ConditionKeys.self, forKey: .condition)
        switch try c.decode(String.self, forKey: .type) {
        case "firstSession": condition = .firstSession
        case "streak": condition = .streak(days: try c.decode(Int.self, forKey: .days))
        case "dayWords": condition = .dayWords(words: try c.decode(Int.self, forKey: .words))
        case "lifetimeSessions": condition = .lifetimeSessions(count: try c.decode(Int.self, forKey: .count))
        case "marathon": condition = .marathon(durationMs: try c.decode(Int.self, forKey: .durationMs))
        case "timeOfDay": condition = .timeOfDay(fromHour: try c.decode(Int.self, forKey: .fromHour), toHour: try c.decode(Int.self, forKey: .toHour))
        case "comeback": condition = .comeback(quietDays: try c.decode(Int.self, forKey: .quietDays))
        default: condition = .unknown
        }
    }
}

public struct AchievementsFile: Decodable, Sendable {
    public let achievements: [AchievementSpec]
}

/// One take as the achievements see it: when, how many words, how long,
/// and the local day and hour it was recorded at.
public struct AchievementEvent: Sendable, Equatable {
    /// Epoch milliseconds.
    public let at: Int64
    public let words: Int
    public let durationMs: Int
    public let day: String
    public let hour: Int

    public init(at: Int64, words: Int, durationMs: Int, day: String, hour: Int) {
        self.at = at
        self.words = words
        self.durationMs = durationMs
        self.day = day
        self.hour = hour
    }
}

public struct EarnedAchievement: Sendable, Equatable {
    public let id: String
    /// When it was first earned, epoch milliseconds.
    public let at: Int64
}

public enum Achievements {
    /// Days from one yyyy-MM-dd key to another, as desktop counts them:
    /// both read as UTC midnights, so the math has no timezone.
    static func distance(_ from: String, _ to: String) -> Int {
        guard let a = midnight(from), let b = midnight(to) else { return 0 }
        return Int(((b - a) / 86_400).rounded())
    }

    private static func midnight(_ day: String) -> TimeInterval? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))?.timeIntervalSince1970
    }

    /// Every achievement earned, with the moment each was first earned,
    /// oldest first.
    public static func evaluate(_ events: [AchievementEvent], spec: AchievementsFile) -> [EarnedAchievement] {
        var earned: [(id: String, at: Int64, order: Int)] = []
        var have = Set<String>()
        func award(_ id: String, _ at: Int64) {
            guard have.insert(id).inserted else { return }
            earned.append((id, at, earned.count))
        }
        var sessions = 0
        var streak = 0
        var previous: String?
        var wordsByDay: [String: Int] = [:]
        // Swift's sort is not stable; the index keeps equal times in order, as
        // JavaScript's sort does.
        let sorted = events.enumerated().sorted { $0.element.at != $1.element.at ? $0.element.at < $1.element.at : $0.offset < $1.offset }.map(\.element)
        for event in sorted {
            sessions += 1
            let day = event.day
            let gap = previous.map { distance($0, day) } ?? 0
            if previous == nil || gap > 1 {
                streak = 1
            } else if gap == 1 {
                streak += 1
            }
            wordsByDay[day, default: 0] += event.words
            let dayTotal = wordsByDay[day] ?? 0
            for spec in spec.achievements {
                switch spec.condition {
                case .firstSession: award(spec.id, event.at)
                case .streak(let days): if streak >= days { award(spec.id, event.at) }
                case .dayWords(let words): if dayTotal >= words { award(spec.id, event.at) }
                case .lifetimeSessions(let count): if sessions >= count { award(spec.id, event.at) }
                case .marathon(let durationMs): if event.durationMs >= durationMs { award(spec.id, event.at) }
                case .timeOfDay(let from, let to): if event.hour >= from, event.hour < to { award(spec.id, event.at) }
                case .comeback(let quietDays): if gap >= quietDays { award(spec.id, event.at) }
                case .unknown: break
                }
            }
            previous = day
        }
        return earned.sorted { $0.at != $1.at ? $0.at < $1.at : $0.order < $1.order }.map { EarnedAchievement(id: $0.id, at: $0.at) }
    }
}
```

`ios/MurmurCore/Sources/MurmurCore/Celebrations.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// What the Journey celebrates when it opens (ios/prd.json IOS-018), as
// desktop's src/renderer/settings/celebrate.ts decides it: every rank
// climbed past the highest one already celebrated. A new belt among them
// gets the ceremony (the newest one); a stripe or degree on the current
// belt gets its tape, after the ceremony if both.
// shared/celebrate-vectors.json keeps both platforms equal.
import Foundation

public struct Celebration: Sendable, Equatable {
    /// The new belt to hold the ceremony for, if one was earned.
    public let belt: RankSpec?
    /// The current rank, when it is a stripe or degree earned since.
    public let tape: RankSpec?
    /// The ladder index of the highest rank now reached: remember it.
    public let reached: Int
}

public enum Celebrations {
    /// A promotion this fresh is celebrated even with no record yet (the
    /// first open after the very first belt), in milliseconds.
    public static let freshMs: Int64 = 24 * 60 * 60 * 1000

    /// Celebrates by height, not by date: promotions are recomputed from
    /// the history that remains, so the same ranks can carry newer dates;
    /// a rank at or below the highest already celebrated (`seen`) never
    /// plays again. With no record, only promotions from the last day
    /// count, so a long history never replays its old belts.
    public static func toCelebrate(_ promotions: [Promotion], ladder: [RankSpec], seen: Int?, now: Int64) -> Celebration? {
        let indexed = promotions.compactMap { promotion in
            ladder.firstIndex { $0.id == promotion.id }.map { (promotion: promotion, index: $0) }
        }
        guard let latest = indexed.last else { return nil }
        let fresh = indexed.filter { item in
            if let seen { return item.index > seen }
            return now - item.promotion.at <= freshMs
        }
        guard let top = fresh.last else { return nil }
        func newBelt(_ index: Int) -> Bool {
            index == 0 || ladder[index - 1].belt != ladder[index].belt
        }
        let belt = fresh.last { newBelt($0.index) }
        let tape = !newBelt(top.index) && (belt.map { top.index > $0.index } ?? true) ? ladder[top.index] : nil
        return Celebration(belt: belt.map { ladder[$0.index] }, tape: tape, reached: latest.index)
    }
}
```

In `Ranks.swift`, give `Promotion` a public init:

```swift
public struct Promotion: Sendable, Equatable {
    public let id: String
    public let at: Int64

    public init(id: String, at: Int64) {
        self.id = id
        self.at = at
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: 117 tests pass (1 known issue on purpose).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/Achievements.swift ios/MurmurCore/Sources/MurmurCore/Celebrations.swift ios/MurmurCore/Sources/MurmurCore/Ranks.swift ios/MurmurCore/Tests/MurmurCoreTests/AchievementVectorTests.swift ios/MurmurCore/Tests/MurmurCoreTests/CelebrateVectorTests.swift
git commit -m "IOS-018: MurmurCore earns achievements and picks what to celebrate as desktop does"
```

### Task 3: Desktop's road, gate, and ceremony math in one module

**Files:** Modify:
- `src/renderer/settings/journeyPaint.ts`, `JourneyView.tsx`, and `Ceremony.tsx`;
- `src/renderer/settings/journeyPaint.test.ts`.

**Interfaces:** Produces, from `journeyPaint.ts`:
- `roadRanks(ladder, founder)`, `sinceRank(have, from, need)`, `roadPlace(progress, ladder)`, and `roadGroups(road)`;
- `ceremonyScene(rank, W, H, colors)`;
- `paintRoad`'s new last parameter `text = true`.

Desktop's behavior does not change: JourneyView and Ceremony import what they defined themselves before.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/settings/journeyPaint.test.ts`, replace the imports after `vitest` with:

```ts
import cosmetics from '../../../shared/cosmetics.json'
import ranks from '../../../shared/ranks.json'
import type { SessionEvent } from '../../shared/history'
import { type RanksFile, computeProgress } from '../../shared/ranks'
import {
  ROAD,
  beltOnInk,
  ceremonyScene,
  daysPerMark,
  drawFrom,
  journeyColors,
  paintRoad,
  rankX,
  roadGroups,
  roadPlace,
  roadRanks,
  sealPaint,
  sinceRank,
  youX
} from './journeyPaint'
```

At the end of the file, add:

```ts
// The road and the ceremony as the iPhone's painter page uses them too
// (IOS-018): one module, so both platforms paint the same road.
describe('the road, shared with the iPhone', () => {
  const spec = ranks as unknown as RanksFile
  const day = (n: number): string => `2026-09-${String(10 + n).padStart(2, '0')}`
  const takes = (words: number[]): SessionEvent[] =>
    words.map((w, i) => ({ at: 1_789_000_000_000 + i * 86_400_000, durationMs: 1000, rawText: '', finalText: '', words: w, wpm: 0, day: day(i) }))

  it('runs every rank after none, the founder rank only on the founder road', () => {
    const road = roadRanks(spec.ranks, false)
    expect(road[0].id).toBe('white')
    expect(road.some((r) => r.id === 'none' || r.founderOnly)).toBe(false)
    expect(roadRanks(spec.ranks, true).length).toBe(road.length + spec.ranks.filter((r) => r.founderOnly).length)
  })

  it('measures since your rank, and a closed gate is the whole way', () => {
    expect(sinceRank(7_380, 6_000, 12_000)).toBeCloseTo(0.23)
    expect(sinceRank(5_000, 6_000, 12_000)).toBe(0)
    expect(sinceRank(13_000, 6_000, 12_000)).toBe(1)
    expect(sinceRank(10, 6, 6)).toBe(1)
  })

  it('places practice on the road by the slower gate', () => {
    const progress = computeProgress(takes([1300, 1300]), spec)
    const place = roadPlace(progress, spec.ranks)
    expect(place.road[place.roadIndex].id).toBe('white-1')
    expect(place.toNext).toBeCloseTo(Math.min(sinceRank(2600, 2500, 6000), sinceRank(2, 2, 4)))
    expect(place.you).toBeCloseTo(youX(place.roadIndex, place.toNext, place.road.length))
    const none = roadPlace(computeProgress([], spec), spec.ranks)
    expect(none.roadIndex).toBe(-1)
    expect(none.you).toBe(ROAD.pad)
  })

  it('leaves its words off for a page that sets them natively', () => {
    const progress = computeProgress(takes([1300, 1300]), spec)
    const place = roadPlace(progress, spec.ranks)
    const written = (text: boolean): string[] => {
      const said: string[] = []
      const ctx = new Proxy({} as Record<string | symbol, unknown>, {
        get: (target, key) => {
          if (key in target) return target[key]
          if (key === 'fillText') return (words: string) => said.push(words)
          if (key === 'measureText') return () => ({ width: 30 })
          return () => undefined
        },
        set: (target, key, value) => {
          target[key] = value
          return true
        }
      }) as unknown as CanvasRenderingContext2D
      paintRoad(ctx, place.road, place.roadIndex, place.you, place.you, '2,600 words', journeyColors(cosmetics.beltColors), 'monospace', text)
      return said
    }
    expect(written(true)).toContain('2,600 words')
    expect(written(true)).toContain('white')
    expect(written(false)).toEqual([])
  })

  it('names each belt group once, under where it starts, coral once', () => {
    const road = roadRanks(spec.ranks, false)
    const groups = roadGroups(road)
    expect(groups.map((g) => g.name)).toEqual(['white', 'blue', 'purple', 'brown', 'black', 'coral', 'red'])
    expect(groups[1].x).toBe(rankX(road.findIndex((r) => r.belt === 'blue'), road.length))
  })
})

describe('the ceremony scene', () => {
  it('sweeps the new belt in its own color, splats, and lays a rice stroke', () => {
    const c = journeyColors(cosmetics.beltColors)
    const blue = (ranks as unknown as RanksFile).ranks.find((r) => r.id === 'blue')
    if (!blue) throw new Error('no blue belt')
    const items = ceremonyScene(blue, 390, 844, c)
    expect(items.length).toBe(4)
    expect(items[0].stroke?.opts.rgb).toEqual(beltOnInk('blue', c))
    expect(items.filter((i) => i.splat).length).toBe(2)
    expect(items.map((i) => i.start ?? 0)).toEqual([...items.map((i) => i.start ?? 0)].sort((a, b) => a - b))
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/renderer/settings/journeyPaint.test.ts`
Expected: the suite fails to load: `roadPlace` and `ceremonyScene` are not exported.

- [ ] **Step 3: Move the math**

In `journeyPaint.ts`:

1. Replace the two import lines with:

```ts
import type { ProgressReport, RankSpec } from '../../shared/ranks'
import {
  type Rgb,
  type SceneItem,
  cachedBrush,
  clamp,
  flickEase,
  lerp,
  mix,
  mulberry,
  parseColor,
  path,
  rgba,
  splat,
  stroke,
  tokenColor
} from '../brush'
```

2. After `const groupName = ...`, add:

```ts
/** The road: every rank after the starting none, the founder-only rank
 *  only on the founder's road. */
export function roadRanks(ladder: readonly RankSpec[], founder: boolean): RankSpec[] {
  return ladder.filter((rank) => rank.id !== 'none' && (!rank.founderOnly || founder))
}

/** Share of the way from your rank's total to the next one's: the road,
 *  the words stroke, and the tallies all measure since your current rank,
 *  so they always agree. */
export function sinceRank(have: number, from: number, need: number): number {
  return need <= from ? 1 : clamp((have - from) / (need - from), 0, 1)
}

/** Where practice stands on the road: its ranks, your rank's place on it
 *  (-1 before the first belt), the share of the way to the next rank (the
 *  slower gate), and your x. */
export function roadPlace(
  progress: ProgressReport,
  ladder: readonly RankSpec[]
): { road: RankSpec[]; roadIndex: number; toNext: number; you: number } {
  const road = roadRanks(ladder, progress.founder)
  const { words, activeDays } = progress.totals
  const roadIndex = road.findIndex((r) => r.id === progress.practice.rank.id)
  const at = roadIndex >= 0 ? road[roadIndex] : null
  const next = progress.practice.next
  const toNext = next
    ? Math.min(sinceRank(words, at?.words ?? 0, next.words ?? 0), sinceRank(activeDays, at?.activeDays ?? 0, next.activeDays ?? 0))
    : 1
  return { road, roadIndex, toNext, you: youX(roadIndex, toNext, road.length) }
}

/** The group names under the road and where each starts: one per name
 *  (the two coral belts share one). Drawing them without overlap is the
 *  painter's job (it measures them). */
export function roadGroups(road: readonly RankSpec[]): { name: string; x: number }[] {
  const out: { name: string; x: number }[] = []
  GROUPS.forEach((g, gi) => {
    const first = road.findIndex((r) => r.belt === g)
    if (first < 0) return
    if (gi > 0 && groupName(GROUPS[gi - 1]) === groupName(g)) return
    out.push({ name: groupName(g), x: rankX(first, road.length) })
  })
  return out
}
```

3. In `paintRoad`, add a last parameter after `mono: string`:

```ts
  mono: string,
  /** False leaves the words off (the group names and your words), for a
   *  page that sets them as native text over the painting (IOS-018). */
  text = true
```

   Then guard both of its `fillText` calls with it:
   - change `if (!named && x0 >= labelEnd + 10) {` to `if (text && !named && x0 >= labelEnd + 10) {`;
   - change the last line, `ctx.fillText(label, you, y - 20)`, to `if (text) ctx.fillText(label, you, y - 20)`.

4. At the end of the file, add desktop's ceremony scene, moved from `Ceremony.tsx` unchanged except that it takes the colors:

```ts
// --------------------------------------------------------- ceremony ---

/** The promotion ceremony's painting (US-077): the sweep in the belt's
 *  color, an ember splat, a splat of the belt's color, and a chalky rice
 *  stroke above. */
export function ceremonyScene(rank: RankSpec, W: number, H: number, c: JourneyColors): SceneItem[] {
  const col = beltOnInk(rank.belt, c)
  const yc = H * 0.34
  const bw = Math.min(H * 0.24, 210)
  return [
    {
      start: 140,
      dur: 720,
      stroke: {
        P: path(
          [
            [-W * 0.06, yc + bw * 0.3],
            [W * 0.3, yc - bw * 0.12],
            [W * 0.66, yc + bw * 0.08],
            [W * 1.06, yc - bw * 0.22]
          ],
          3
        ),
        B: cachedBrush(990, 40),
        opts: { width: bw, rgb: col, dry: 0.3, core: 0.85, ts: 0.02, te: 0.12 }
      }
    },
    {
      start: 520,
      splat: { sp: splat(992, W * 0.24, yc + bw * 0.62, { r: bw * 0.18, count: 20, mist: 30, dir: 2.4, spread: 0.9, reach: 3 }), rgb: col }
    },
    {
      start: 560,
      dur: 420,
      stroke: {
        P: path(
          [
            [W * 0.12, yc - bw * 0.85],
            [W * 0.4, yc - bw * 1.0],
            [W * 0.62, yc - bw * 0.88]
          ],
          2
        ),
        B: cachedBrush(993, 30),
        opts: { width: bw * 0.12, rgb: c.rice, alpha: 0.7, dry: 0.75 }
      }
    },
    {
      start: 620,
      splat: {
        sp: splat(991, W * 0.78, yc - bw * 0.55, { r: bw * 0.22, count: 26, mist: 40, dir: -0.6, spread: 1.1, reach: 3, blob: true }),
        rgb: c.ember
      }
    }
  ]
}
```

In `Ceremony.tsx`:
- Replace the brush and journeyPaint imports with `import { type Surface, animateScene, paintScene } from '../brush'` and `import { ceremonyScene, journeyColors } from './journeyPaint'`.
- Delete the `scene` function and its comment.
- Change `const items = scene(props.rank, W, H)` to `const items = ceremonyScene(props.rank, W, H, journeyColors(BELT_HEX))`.

In `JourneyView.tsx`:
- In the brush import, drop `clamp`. In the journeyPaint import, replace `youX` with `roadPlace,` and `sinceRank`.
- Delete the file's own `roadRanks` const (with its comment) and its `sinceRank` function (with its comment), leaving one blank line after `cssValue`.
- In `Road`, replace the lines from `const road = roadRanks(progress.founder)` through `const you = youX(roadIndex, toNext, road.length)` with:

```ts
  const { road, roadIndex, toNext, you } = roadPlace(progress, LADDER)
  const haveWords = progress.totals.words
  const at = roadIndex >= 0 ? road[roadIndex] : null
  const next = progress.practice.next
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/renderer/settings/journeyPaint.test.ts`
Expected: 16 pass. Then `npm run typecheck` is clean and `npm run test` passes 954.

- [ ] **Step 5: Run the gates, the desktop smoke too, and commit**

Run: `npm run smoke` as well. Expected: `"ok":true`. The audio checks can flake when the Mac is loaded; rerun alone before blaming the diff.

```bash
git add src/renderer/settings/journeyPaint.ts src/renderer/settings/JourneyView.tsx src/renderer/settings/Ceremony.tsx src/renderer/settings/journeyPaint.test.ts
git commit -m "IOS-018: desktop's road, gates, and ceremony math move into the Journey painter for both platforms"
```

### Task 4: The painter page and its build

**Files:**
- Create `ios/Web/journey.ts` and `ios/Web/journey.html`.
- Modify `scripts/lib/ios.js`, `scripts/ios.js`, `ios/project.yml`, and `tsconfig.json`.
- Test `scripts/lib/ios.test.js`.

**Interfaces:**
- Consumes Task 3's exports.
- Produces the page global `window.murmurJourney`:
  - `picture(request)` returns `{ png, groups?, you? }`, where `request.kind` is `belt`, `road`, `words`, `tallies`, or `stamp`;
  - `ceremony({ rank, width, height, reduced })` returns `boolean`.
- Produces the message `{ type: 'ready' }` to the `journey` handler.
- Produces `Generated/web/journey.html` in the app bundle's `web` folder.
- Produces `journeyScript(result)` and `fillJourneyPage(template, tokens, script)`.

- [ ] **Step 1: Write the failing tests**

In `scripts/lib/ios.test.js`, add `fillJourneyPage,` after `exportOptionsPlist,` and `journeyScript,` after `findOnPath,` in the import list. At the end of the file, add:

```js
describe('the Journey page (IOS-018)', () => {
  const template = '<style>/*TOKENS*/</style><script>/*SCRIPT*/</script>'

  it('takes the one script Vite built', () => {
    expect(journeyScript([{ output: [{ type: 'asset', source: 'x' }, { type: 'chunk', code: 'var a=1' }] }])).toBe('var a=1')
    expect(journeyScript({ output: [{ type: 'chunk', code: 'var b=2' }] })).toBe('var b=2')
    expect(() => journeyScript([{ output: [] }])).toThrow(/no script/)
  })

  it('sets the tokens and the script into the page, as written', () => {
    const page = fillJourneyPage(template, ':root { --ink: #0f0e11; }', 'a.replace(/x/, "$&")')
    expect(page).toBe('<style>:root { --ink: #0f0e11; }</style><script>a.replace(/x/, "$&")</script>')
  })

  it('refuses a script that could close its own tag, and a page without its marks', () => {
    expect(() => fillJourneyPage(template, '', 'x("</script>")')).toThrow(/closing script tag/)
    expect(() => fillJourneyPage('<script>/*SCRIPT*/</script>', '', 'x')).toThrow(/TOKENS/)
    expect(() => fillJourneyPage(template + '/*SCRIPT*/', '', 'x')).toThrow(/SCRIPT/)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run scripts/lib/ios.test.js`
Expected: the 3 new tests fail with `journeyScript is not a function`.

- [ ] **Step 3: Write the page and its build**

In `scripts/lib/ios.js`, before `module.exports = {`, add the following. Then add `journeyScript,` and `fillJourneyPage` at the end of the exports (after `keyFileProblem,`).

```js
/** The bundled script from Vite's build result: one chunk, as a string. */
function journeyScript(result) {
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output ?? [])
  const chunk = outputs.find((o) => o.type === 'chunk')
  if (!chunk || !chunk.code) throw new Error('the Journey page built no script')
  return chunk.code
}

/** The page with the tokens and the script set in. A script that could
 *  close its own tag, or a page missing a mark, stops the build. */
function fillJourneyPage(template, tokens, script) {
  for (const mark of ['/*TOKENS*/', '/*SCRIPT*/']) {
    if (template.split(mark).length !== 2) throw new Error(`the Journey page needs exactly one ${mark}`)
  }
  if (/<\/script/i.test(script)) throw new Error('the Journey script contains a closing script tag')
  return template.replace('/*TOKENS*/', () => tokens).replace('/*SCRIPT*/', () => script)
}
```

In `scripts/ios.js`, add `fillJourneyPage,` and `journeyScript,` after `altoolFailure,` in the require list. Before `async function generateAll() {`, add:

```js
/** The Journey's painter page (IOS-018): desktop's brush engine and
 *  Journey painter, bundled by Vite into one script and set into the page
 *  with the tokens, so the app's web view loads one file and nothing else. */
async function buildJourneyPage() {
  const { build } = await import('vite')
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      lib: { entry: join(iosDir, 'Web', 'journey.ts'), formats: ['iife'], name: 'murmurJourneyPage', fileName: () => 'journey.js' }
    }
  })
  const script = journeyScript(out)
  const tokens = readFileSync(join(root, 'src', 'renderer', 'tokens.css'), 'utf8')
  const page = fillJourneyPage(readFileSync(join(iosDir, 'Web', 'journey.html'), 'utf8'), tokens, script)
  mkdirSync(join(generated, 'web'), { recursive: true })
  writeFileSync(join(generated, 'web', 'journey.html'), page)
}
```

In `generateAll`, after the `copySharedJson` line, add `await buildJourneyPage()`.

`ios/Web/journey.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// The iPhone Journey's painter page (ios/prd.json IOS-018): desktop's own
// brush engine and Journey painter (src/renderer/brush.ts and
// settings/journeyPaint.ts), bundled into the app at build time and run in
// a web view that loads nothing else. murmur asks it for pictures (the
// belt, the road, the gates, the stamps) and for the promotion ceremony;
// every word stays a native view beside or over the painting.
import cosmetics from '../../shared/cosmetics.json'
import ranks from '../../shared/ranks.json'
import { animateScene, paintScene, type Surface } from '../../src/renderer/brush'
import {
  ROAD,
  beltOnInk,
  ceremonyScene,
  journeyColors,
  paintBelt,
  paintRoad,
  paintStamp,
  paintTallies,
  paintWordsGate,
  roadGroups,
  roadPlace,
  sinceRank
} from '../../src/renderer/settings/journeyPaint'
import type { ProgressReport, RankSpec } from '../../src/shared/ranks'

const LADDER = (ranks as { ranks: RankSpec[] }).ranks
const BELT_HEX = (cosmetics as { beltColors: Record<string, string> }).beltColors

/** Where practice stands, as murmur's own math found it. */
export interface Standing {
  rank: string
  next: string | null
  words: number
  days: number
}

export type PictureRequest =
  | { kind: 'belt'; width: number; height: number; scale: number; belt: string; stripes: number; drop?: number }
  | { kind: 'road'; scale: number; standing: Standing }
  | { kind: 'words'; width: number; height: number; scale: number; standing: Standing }
  | { kind: 'tallies'; width: number; height: number; scale: number; standing: Standing }
  | { kind: 'stamp'; size: number; scale: number; id: string; got: boolean; seed: number }

export interface Picture {
  png: string
  /** The road's group names and your place, for native text over it. */
  groups?: { name: string; x: number }[]
  you?: number
}

/** A token's value, as desktop's Journey reads its fonts. */
function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function rank(id: string | null): RankSpec | null {
  return id === null ? null : (LADDER.find((r) => r.id === id) ?? null)
}

/** Just enough of a progress report for the road: practice is the rank,
 *  as on the iPhone, where there is no founder yet. */
export function progressFor(standing: Standing): ProgressReport {
  const at = rank(standing.rank) ?? LADDER[0]
  const next = rank(standing.next)
  const practice = { rank: at, index: LADDER.indexOf(at), next, words: null, activeDays: null }
  return {
    ...practice,
    totals: { words: standing.words, activeDays: standing.days },
    promotions: [],
    founder: false,
    practice,
    level: 1
  }
}

function canvas(width: number, height: number, scale: number): { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const el = document.createElement('canvas')
  el.width = Math.round(width * scale)
  el.height = Math.round(height * scale)
  const ctx = el.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  return { el, ctx }
}

/** One picture, as a PNG data URL. */
export function picture(req: PictureRequest): Picture {
  const colors = journeyColors(BELT_HEX)
  switch (req.kind) {
    case 'belt': {
      const { el, ctx } = canvas(req.width, req.height, req.scale)
      const newest = Math.min(req.stripes, req.belt === 'black' ? 6 : 4) - 1
      paintBelt(ctx, req.width, req.height, req.belt, req.stripes, colors, 1, req.drop === undefined ? undefined : { i: newest, k: req.drop })
      return { png: el.toDataURL('image/png') }
    }
    case 'road': {
      const { el, ctx } = canvas(ROAD.W, ROAD.H, req.scale)
      const place = roadPlace(progressFor(req.standing), LADDER)
      paintRoad(ctx, place.road, place.roadIndex, place.you, place.you, '', colors, token('--font-mono', 'monospace'), false)
      return { png: el.toDataURL('image/png'), groups: roadGroups(place.road), you: place.you }
    }
    case 'words': {
      const { el, ctx } = canvas(req.width, req.height, req.scale)
      const at = rank(req.standing.rank)
      const next = rank(req.standing.next)
      const pct = next ? sinceRank(req.standing.words, at?.words ?? 0, next.words ?? 0) : 1
      paintWordsGate(ctx, req.width, req.height, pct, beltOnInk(at?.belt ?? 'none', colors), colors)
      return { png: el.toDataURL('image/png') }
    }
    case 'tallies': {
      const { el, ctx } = canvas(req.width, req.height, req.scale)
      const at = rank(req.standing.rank)
      const next = rank(req.standing.next)
      const start = at?.activeDays ?? 0
      const need = (next?.activeDays ?? start) - start
      const have = req.standing.days - start
      paintTallies(ctx, req.width, req.height, need, have, beltOnInk(at?.belt ?? 'none', colors), colors, 1, have)
      return { png: el.toDataURL('image/png') }
    }
    case 'stamp': {
      const { el, ctx } = canvas(req.size, req.size, req.scale)
      paintStamp(ctx, req.size, req.id, req.got, req.seed, colors, token('--font-body', 'sans-serif'))
      return { png: el.toDataURL('image/png') }
    }
  }
}

function surface(id: string, width: number, height: number): Surface | null {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLCanvasElement)) return null
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  el.style.width = `${width}px`
  el.style.height = `${height}px`
  const ctx = el.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { canvas: el, ctx, dpr }
}

/** The ceremony on the page's own canvases: animated, or the finished
 *  painting with Reduce Motion. */
export function ceremony(req: { rank: string; width: number; height: number; reduced: boolean }): boolean {
  const at = rank(req.rank)
  const { width, height } = req
  const base = surface('base', width, height)
  const fx = surface('fx', width, height)
  if (!at || !base || !fx) return false
  const items = ceremonyScene(at, width, height, journeyColors(BELT_HEX))
  if (req.reduced) paintScene(base.ctx, items)
  else animateScene(base, fx, items)
  return true
}

declare global {
  interface Window {
    murmurJourney?: { picture: typeof picture; ceremony: typeof ceremony }
    webkit?: { messageHandlers?: { journey?: { postMessage: (message: unknown) => void } } }
  }
}

if (typeof window !== 'undefined') {
  window.murmurJourney = { picture, ceremony }
  window.webkit?.messageHandlers?.journey?.postMessage({ type: 'ready' })
}
```

`ios/Web/journey.html`, whole:

```html
<!doctype html>
<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- The iPhone Journey's painter page (ios/prd.json IOS-018). npm run
     ios:generate fills in the tokens and the bundled script; the page
     loads nothing else and may fetch nothing. -->
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
/*TOKENS*/
html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
canvas { position: fixed; inset: 0; }
</style>
</head>
<body>
<canvas id="base"></canvas>
<canvas id="fx"></canvas>
<script>
/*SCRIPT*/
</script>
</body>
</html>
```

In `tsconfig.json`'s `include`, add `"ios/Web",` after `"shared",`. In `ios/project.yml`, after the app's `Generated/shared` source, add:

```yaml
      - path: Generated/web
        type: folder
        buildPhase: resources
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run scripts/lib/ios.test.js`, then `npm run typecheck`, then `npm run ios:generate`.
Expected:
- the tests pass, and typecheck is clean;
- `ios/Generated/web/journey.html` exists (about 27 KB), with one inline script that sets `murmurJourney`;
- `npm run test` passes 957.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Web scripts/lib/ios.js scripts/lib/ios.test.js scripts/ios.js ios/project.yml tsconfig.json
git commit -m "IOS-018: the Journey's painter page, desktop's brush and painter bundled into the app at build time"
```

### Task 5: The painter in the app

**Files:** Create `ios/App/Journey/JourneyPainter.swift`. Test `ios/AppTests/JourneyPainterTests.swift`.

**Interfaces:**
- Consumes the page (Task 4).
- Produces:
  - `JourneyPage.url`;
  - `OneLoad`, `JourneyMessages`, and `JourneyPicture` (`image`, `groups`, `you`);
  - `JourneyPainter` (`shared`, `init(page:)`, `web`, `waitUntilReady(seconds:)`, `picture(_:scale:)`, `ceremony(rank:size:reduced:)`, and `Failure`);
  - `JourneyStanding` and `JourneyArtwork` (`belt`, `road`, `words`, `tallies`, `stamp`, and `fields`);
  - in the tests, `PaintingDifference`.

- [ ] **Step 1: Write the failing tests**

`ios/AppTests/JourneyPainterTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
import WebKit
@testable import murmur

/// How two paintings differ, pixel by pixel: the share of color bytes that
/// differ and the largest difference. A canvas on the GPU can round a
/// blend by one level from run to run, which nobody can see.
struct PaintingDifference {
    let share: Double
    let largest: Int

    /// The same painting, give or take the GPU's rounding.
    var same: Bool { largest <= 2 && share < 0.005 }

    init(_ a: UIImage, _ b: UIImage) {
        let left = Self.bytes(a)
        let right = Self.bytes(b)
        guard left.count == right.count, !left.isEmpty else {
            share = 1
            largest = 255
            return
        }
        var differing = 0
        var largest = 0
        for index in left.indices where left[index] != right[index] {
            differing += 1
            largest = max(largest, abs(Int(left[index]) - Int(right[index])))
        }
        share = Double(differing) / Double(left.count)
        self.largest = largest
    }

    static func bytes(_ image: UIImage) -> [UInt8] {
        guard let cg = image.cgImage else { return [] }
        var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            return true
        }
        return drawn ? bytes : []
    }
}

/// The Journey's painter page in its web view (IOS-018).
@MainActor @Suite(.serialized) struct JourneyPainterTests {
    let standing = JourneyStanding(rank: "white-2", next: "white-3", words: 7380, days: 7)

    @Test func thePageIsInTheAppAndSaysReady() async throws {
        let url = try #require(JourneyPage.url)
        #expect(try String(contentsOf: url, encoding: .utf8).contains("murmurJourney"))
        try await JourneyPainter().waitUntilReady()
    }

    /// A page that never says ready fails in time, so the Journey keeps its
    /// plain drawing.
    @Test func aMissingPageFailsInTime() async {
        await #expect(throws: JourneyPainter.Failure.notReady) {
            try await JourneyPainter(page: nil).waitUntilReady(seconds: 0.3)
        }
    }

    /// A picture comes back as an image of the size asked for, at the
    /// screen's scale, and the same request paints the same picture.
    @Test func aBeltIsPaintedAtItsSize() async throws {
        let painter = JourneyPainter()
        let request = JourneyArtwork.belt(belt: "blue", stripes: 2, width: 168, height: 40, drop: nil)
        let belt = try await painter.picture(request, scale: 2)
        #expect(belt.image.size == CGSize(width: 168, height: 40))
        #expect(belt.image.scale == 2)
        let again = try await painter.picture(request, scale: 2)
        #expect(PaintingDifference(again.image, belt.image).same)
    }

    /// Mid drop the newest tape is still in the air: the frame differs from
    /// the finished belt, and the last frame is the finished belt.
    @Test func theTapeDropsOntoTheBelt() async throws {
        let painter = JourneyPainter()
        let finished = try await painter.picture(.belt(belt: "white", stripes: 3, width: 140, height: 30, drop: nil), scale: 2)
        let middle = try await painter.picture(.belt(belt: "white", stripes: 3, width: 140, height: 30, drop: 0.3), scale: 2)
        let landed = try await painter.picture(.belt(belt: "white", stripes: 3, width: 140, height: 30, drop: 1), scale: 2)
        #expect(!PaintingDifference(middle.image, finished.image).same)
        #expect(PaintingDifference(landed.image, finished.image).same)
    }

    /// The road comes back without its words, and with where to set them.
    @Test func theRoadComesWithItsWords() async throws {
        let road = try await JourneyPainter().picture(.road(standing), scale: 2)
        #expect(road.image.size == CGSize(width: 1500, height: 120))
        #expect(road.groups.map(\.name).prefix(3) == ["white", "blue", "purple"])
        #expect(road.groups.map(\.name).contains("coral"))
        let you = try #require(road.you)
        #expect(you > 34 && you < 1500)
    }

    @Test func gatesAndStampsArePainted() async throws {
        let painter = JourneyPainter()
        for request in [
            JourneyArtwork.words(standing, width: 320, height: 34),
            .tallies(standing, width: 320, height: 44),
            .stamp(id: "streak-7", got: true, seed: 1209, size: 76),
            .stamp(id: "marathon", got: false, seed: 1290, size: 76)
        ] {
            let picture = try await painter.picture(request, scale: 3)
            #expect(picture.image.size.width > 0)
        }
    }

    /// The ceremony paints on the page's own canvases; an unknown rank
    /// paints nothing.
    @Test func theCeremonyPaints() async throws {
        let painter = JourneyPainter()
        try await painter.ceremony(rank: "blue", size: CGSize(width: 390, height: 844), reduced: true)
        await #expect(throws: JourneyPainter.Failure.badPicture) {
            try await painter.ceremony(rank: "gold-9", size: CGSize(width: 390, height: 844), reduced: true)
        }
    }

    /// The page can fetch nothing: its content policy refuses it, even a
    /// file beside it in the bundle.
    @Test func thePageCanFetchNothing() async throws {
        let painter = JourneyPainter()
        try await painter.waitUntilReady()
        for target in ["https://example.com", "journey.html"] {
            let answer = try await painter.web.callAsyncJavaScript(
                "try { await fetch(target); return 'fetched' } catch { return 'refused' }", arguments: ["target": target], contentWorld: .page
            )
            #expect(answer as? String == "refused")
        }
    }

    /// The page cannot go anywhere: after its own file loads, every
    /// navigation is refused, and the painter keeps working.
    @Test func thePageCannotNavigate() async throws {
        let painter = JourneyPainter()
        try await painter.waitUntilReady()
        let page = painter.web.url
        for target in ["https://example.com", "journey.html"] {
            _ = try? await painter.web.evaluateJavaScript("location.href = '\(target)'; 1")
            try await Task.sleep(for: .milliseconds(400))
            #expect(painter.web.url == page)
        }
        let kind = try await painter.web.evaluateJavaScript("typeof window.murmurJourney")
        #expect(kind as? String == "object")
    }

    /// The page is one file in the bundle's web folder.
    @Test func thePageIsOneFileInTheBundle() throws {
        let page = try #require(JourneyPage.url)
        #expect(page.isFileURL)
        #expect(page.path().hasPrefix(Bundle.main.bundlePath))
        #expect(page.deletingLastPathComponent().lastPathComponent == "web")
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:generate && npm run ios:test`
Expected: the app test build fails with `cannot find type 'JourneyStanding' in scope`.

- [ ] **Step 3: Write the painter**

`ios/App/Journey/JourneyPainter.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Journey's painter (ios/prd.json IOS-018): a web view running the page
// npm run ios:generate builds from desktop's own brush engine and Journey
// painter. murmur asks it for pictures and shows them as images, or, for
// the ceremony, shows the web view itself under native text, so every word
// on the Journey stays a native view. The page is one file in the app
// bundle, with read access to its own folder only; its content policy
// refuses every fetch, and the web view refuses every navigation but that
// one file's first load.
import UIKit
import WebKit

/// The page in the app bundle.
enum JourneyPage {
    static var url: URL? {
        Bundle.main.url(forResource: "journey", withExtension: "html", subdirectory: "web")
    }

    /// A web view for the page: nothing kept between launches, no windows,
    /// and the page's messages to murmur.
    @MainActor static func configuration(messages: JourneyMessages) -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController.add(messages, name: "journey")
        return configuration
    }
}

/// Lets the page's own file load once and nothing after it. If iOS ends the
/// page's process (it can, to free memory), the page loads once more.
final class OneLoad: NSObject, WKNavigationDelegate {
    private let allowed: URL
    private var loaded = false
    var onRestart: (@MainActor () -> Void)?

    init(allowing url: URL) {
        allowed = url
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        let allow = !loaded && action.request.url?.standardizedFileURL == allowed.standardizedFileURL
        if allow { loaded = true }
        decisionHandler(allow ? .allow : .cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loaded = false
        MainActor.assumeIsolated { onRestart?() }
        webView.loadFileURL(allowed, allowingReadAccessTo: allowed.deletingLastPathComponent())
    }
}

/// The page's messages to murmur: for now, that it is ready. The web view's
/// content controller holds this strongly, so it holds nothing back.
final class JourneyMessages: NSObject, WKScriptMessageHandler {
    var onReady: (@MainActor () -> Void)?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard (message.body as? [String: Any])?["type"] as? String == "ready" else { return }
        MainActor.assumeIsolated { onReady?() }
    }
}

/// A picture the page painted, with the road's words to set natively.
struct JourneyPicture {
    let image: UIImage
    /// On the road: each belt group's name and where it starts, in points.
    var groups: [(name: String, x: CGFloat)] = []
    /// On the road: where you stand, in points.
    var you: CGFloat?
}

@MainActor final class JourneyPainter {
    enum Failure: Error { case noPage, notReady, badPicture }

    /// The painter for the Journey's pictures, never on screen.
    static let shared = JourneyPainter()

    let web: WKWebView
    private let navigation: OneLoad?
    private let messages = JourneyMessages()
    private var ready = false
    /// The page never said ready in time (or there is none): later asks
    /// fail at once, until the page starts over.
    private var gaveUp = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    init(page: URL? = JourneyPage.url) {
        web = WKWebView(frame: CGRect(x: 0, y: 0, width: 400, height: 400), configuration: JourneyPage.configuration(messages: messages))
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.accessibilityElementsHidden = true
        navigation = page.map { OneLoad(allowing: $0) }
        web.navigationDelegate = navigation
        messages.onReady = { [weak self] in self?.becameReady() }
        navigation?.onRestart = { [weak self] in
            self?.ready = false
            self?.gaveUp = false
        }
        if let page {
            web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        } else {
            gaveUp = true
        }
    }

    private func becameReady() {
        ready = true
        for continuation in waiting { continuation.resume() }
        waiting = []
    }

    /// Waits for the page to say it is ready. A cold start of the page's
    /// process can take a few seconds; the Journey reads plainly meanwhile.
    func waitUntilReady(seconds: Double = 15) async throws {
        if ready { return }
        if gaveUp { throw Failure.notReady }
        let deadline = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard let self, !self.ready else { return }
            self.gaveUp = true
            for continuation in self.waiting { continuation.resume() }
            self.waiting = []
        }
        await withCheckedContinuation { waiting.append($0) }
        deadline.cancel()
        guard ready else { throw Failure.notReady }
    }

    /// One picture from the page.
    func picture(_ request: JourneyArtwork, scale: CGFloat) async throws -> JourneyPicture {
        try await waitUntilReady()
        var asked = request.fields
        asked["scale"] = scale
        let answer = try await web.callAsyncJavaScript("return window.murmurJourney.picture(request)", arguments: ["request": asked], contentWorld: .page)
        guard let body = answer as? [String: Any], let png = body["png"] as? String,
              let comma = png.firstIndex(of: ","), let data = Data(base64Encoded: String(png[png.index(after: comma)...])),
              let image = UIImage(data: data, scale: scale)
        else { throw Failure.badPicture }
        var picture = JourneyPicture(image: image)
        if let groups = body["groups"] as? [[String: Any]] {
            picture.groups = groups.compactMap { group in
                guard let name = group["name"] as? String, let x = group["x"] as? Double else { return nil }
                return (name, CGFloat(x))
            }
        }
        picture.you = (body["you"] as? Double).map { CGFloat($0) }
        return picture
    }

    /// The promotion ceremony, painted on this web view's own canvases at
    /// this size: animated, or finished at once with Reduce Motion.
    func ceremony(rank: String, size: CGSize, reduced: Bool) async throws {
        try await waitUntilReady()
        let request: [String: Any] = ["rank": rank, "width": size.width, "height": size.height, "reduced": reduced]
        let answer = try await web.callAsyncJavaScript("return window.murmurJourney.ceremony(request)", arguments: ["request": request], contentWorld: .page)
        guard answer as? Bool == true else { throw Failure.badPicture }
    }
}

/// Where practice stands, as the page reads it.
struct JourneyStanding: Hashable {
    let rank: String
    let next: String?
    let words: Int
    let days: Int

    var fields: [String: Any] {
        ["rank": rank, "next": next ?? NSNull(), "words": words, "days": days]
    }
}

/// A picture the page paints, sized in points.
enum JourneyArtwork: Hashable {
    /// drop runs 0 to 1 while the newest stripe's tape slaps on.
    case belt(belt: String, stripes: Int, width: Double, height: Double, drop: Double?)
    case road(JourneyStanding)
    case words(JourneyStanding, width: Double, height: Double)
    case tallies(JourneyStanding, width: Double, height: Double)
    case stamp(id: String, got: Bool, seed: Int, size: Double)

    var fields: [String: Any] {
        switch self {
        case let .belt(belt, stripes, width, height, drop):
            var fields: [String: Any] = ["kind": "belt", "belt": belt, "stripes": stripes, "width": width, "height": height]
            if let drop { fields["drop"] = drop }
            return fields
        case let .road(standing):
            return ["kind": "road", "standing": standing.fields]
        case let .words(standing, width, height):
            return ["kind": "words", "standing": standing.fields, "width": width, "height": height]
        case let .tallies(standing, width, height):
            return ["kind": "tallies", "standing": standing.fields, "width": width, "height": height]
        case let .stamp(id, got, seed, size):
            return ["kind": "stamp", "id": id, "got": got, "seed": seed, "size": size]
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `JourneyPainterTests` passes (10 tests), and the app total is 260.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Journey/JourneyPainter.swift ios/AppTests/JourneyPainterTests.swift
git commit -m "IOS-018: a painter that asks the page for pictures and can reach nothing else"
```

### Task 6: Hours, achievements, and what to celebrate

**Files:**
- Modify `ios/App/History/History.swift`, `ios/App/Journey/JourneyRules.swift`, `ios/App/Settings/ConnectionStore.swift`, and `ios/App/Journey/Journey.swift`.
- Test `ios/AppTests/JourneyPaintedTests.swift`.

**Interfaces:**
- Consumes Task 2 and Task 5 (`JourneyStanding`).
- Produces `HistoryEntry.hour`, `HistoryEntry.hourOf(_:calendar:)`, and `HistoryEntry.achievementEvent`.
- Produces `JourneyRules.achievements`.
- Produces `Journey.earned(_:rules:)`, `Journey.standing(_:)`, `Journey.stampSeed(_:)`, and `Journey.celebrate(_:rules:memory:now:)`.
- Produces `CelebrationMemory` (`key`, `defaults`, `seen`, and `remember(_:)`).
- Produces the new `JourneyCopy` lines: `road`, `roadNote`, `bothGates`, `achievements`, `roadPlace(_:of:)`, `youWords(_:)`, `stamp(_:earned:hint:)`, `earnedWith(_:)`, and `continueHint`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
import UIKit
@testable import murmur

/// The hours and achievements behind the painted Journey (IOS-018).
@Suite struct JourneyAchievementTests {
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    func calendar(_ zone: String) throws -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: zone))
        return calendar
    }

    /// A take keeps the local hour it was spoken in, as it keeps its day.
    @Test func aTakeKeepsTheHourItWasSpokenIn() throws {
        // 16:13 UTC is 01:13 the next day in Tokyo.
        let tokyo = HistoryEntry(at: at.addingTimeInterval(2 * 3600), durationMs: 320_000, words: "one two", calendar: try calendar("Asia/Tokyo"))
        #expect(tokyo.hour == 1)
        #expect(HistoryEntry.hourOf(tokyo.at, calendar: try calendar("UTC")) == 16)
        let event = tokyo.achievementEvent
        #expect(event == AchievementEvent(at: 1_790_007_200_000, words: 2, durationMs: 320_000, day: "2026-09-22", hour: 1))
        let encoded = try JSONEncoder().encode(tokyo)
        #expect(try JSONDecoder().decode(HistoryEntry.self, from: encoded).hour == 1)
    }

    /// A take kept before hours were stored still counts, at the hour it
    /// falls in now.
    @Test func anOlderTakeWithoutAnHourStillCounts() throws {
        let old = #"{"id":"6F9619FF-8B86-D011-B42D-00C04FC964FF","at":780000000,"durationMs":1000,"words":"one two three","wordCount":3,"retried":false,"day":"2025-09-20"}"#
        let entry = try JSONDecoder().decode(HistoryEntry.self, from: Data(old.utf8))
        #expect(entry.hour == nil)
        #expect(entry.achievementEvent.hour == HistoryEntry.hourOf(entry.at))
        #expect(entry.achievementEvent.day == "2025-09-20")
    }

    @Test func theAchievementsLoad() throws {
        let rules = try BundledRules.journey()
        #expect(rules.achievements.achievements.count == 14)
        #expect(rules.achievements.achievements.first?.id == "first-words")
    }

    /// The achievements come from this iPhone's takes, the hour included.
    @Test func achievementsComeFromThisIPhonesTakes() throws {
        let rules = try BundledRules.journey()
        let utc = try calendar("UTC")
        // 1_790_000_000 is 14:13 UTC; eleven hours later is 01:13 the next day.
        let late = HistoryEntry(at: at.addingTimeInterval(11 * 3600), durationMs: 1000, words: "late", calendar: utc)
        #expect(Journey.earned([], rules: rules).isEmpty)
        #expect(Journey.earned([late], rules: rules).map(\.id) == ["first-words", "night-owl"])
    }

    /// Where practice stands, and each stamp's seed, as desktop has them.
    @Test func theStandingAndTheSeedsAreDesktops() throws {
        let rules = try BundledRules.journey()
        let utc = try calendar("UTC")
        let words = Array(repeating: "word", count: 1300).joined(separator: " ")
        let entries = (0..<2).map { HistoryEntry(at: at.addingTimeInterval(Double($0) * 86_400), durationMs: 1000, words: words, calendar: utc) }
        let standing = Journey.standing(Journey.report(entries, rules: rules))
        #expect(standing == JourneyStanding(rank: "white-1", next: "white-2", words: 2600, days: 2))
        #expect(Journey.stampSeed(0) == 1200)
        #expect(Journey.stampSeed(2) == 1218)
    }
}

/// What the Journey celebrates when it opens (IOS-018).
@Suite struct JourneyCelebrationTests {
    let start = Date(timeIntervalSince1970: 1_790_000_000)

    func memory() -> (CelebrationMemory, UserDefaults, String) {
        let name = "journey-celebration-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name) ?? .standard
        return (CelebrationMemory(defaults: defaults), defaults, name)
    }

    /// The memory only ever rises.
    @Test func theMemoryOnlyRises() {
        let (memory, defaults, name) = memory()
        defer { defaults.removePersistentDomain(forName: name) }
        #expect(memory.seen == nil)
        memory.remember(5)
        memory.remember(3)
        #expect(memory.seen == 5)
        memory.remember(7)
        #expect(memory.seen == 7)
    }

    func takes(_ words: [Int]) throws -> [HistoryEntry] {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = try #require(TimeZone(identifier: "UTC"))
        return words.enumerated().map { day, count in
            HistoryEntry(at: start.addingTimeInterval(Double(day) * 86_400), durationMs: 1000, words: Array(repeating: "word", count: count).joined(separator: " "), calendar: utc)
        }
    }

    /// A fresh first belt gets the ceremony once; opening again plays
    /// nothing.
    @Test func aNewBeltPlaysOnce() throws {
        let rules = try BundledRules.journey()
        let (memory, defaults, name) = memory()
        defer { defaults.removePersistentDomain(forName: name) }
        let report = Journey.report(try takes([150]), rules: rules)
        let first = Journey.celebrate(report, rules: rules, memory: memory, now: start.addingTimeInterval(3600))
        #expect(first.ceremony?.id == "white")
        #expect(first.tape == nil)
        let again = Journey.celebrate(report, rules: rules, memory: memory, now: start.addingTimeInterval(7200))
        #expect(again.ceremony == nil && again.tape == nil)
    }

    /// A stripe on the belt you hold gets its tape, not the ceremony.
    @Test func aNewStripeGetsItsTape() throws {
        let rules = try BundledRules.journey()
        let (memory, defaults, name) = memory()
        defer { defaults.removePersistentDomain(forName: name) }
        memory.remember(1)
        let report = Journey.report(try takes([1300, 1300]), rules: rules)
        let shown = Journey.celebrate(report, rules: rules, memory: memory, now: start.addingTimeInterval(2 * 86_400))
        #expect(shown.ceremony == nil)
        #expect(shown.tape?.id == "white-1")
        #expect(memory.seen == report.practice.index)
    }

    /// A long history opened for the first time replays nothing, and sets
    /// the mark so nothing below it ever plays.
    @Test func anOldHistoryReplaysNothing() throws {
        let rules = try BundledRules.journey()
        let (memory, defaults, name) = memory()
        defer { defaults.removePersistentDomain(forName: name) }
        let report = Journey.report(try takes([1300, 1300]), rules: rules)
        let shown = Journey.celebrate(report, rules: rules, memory: memory, now: start.addingTimeInterval(30 * 86_400))
        #expect(shown.ceremony == nil && shown.tape == nil)
        #expect(memory.seen == report.practice.index)
    }
}

@Suite struct JourneyPaintedCopyTests {
    @Test func theRoadAndTheStampsSayWhereYouAre() throws {
        let rules = try BundledRules.journey()
        #expect(JourneyCopy.roadPlace(0, of: 30) == "Before the first belt, 30 ranks ahead")
        #expect(JourneyCopy.roadPlace(3, of: 30) == "Rank 3 of 30")
        #expect(JourneyCopy.youWords(1) == "you, 1 word")
        #expect(JourneyCopy.youWords(7380) == "you, 7,380 words")
        #expect(JourneyCopy.stamp("night owl", earned: true, hint: "dictate after midnight") == "night owl, earned")
        #expect(JourneyCopy.stamp("night owl", earned: false, hint: "dictate after midnight") == "night owl, not yet earned. dictate after midnight")
        let blue = try #require(rules.ranks.ranks.first { $0.id == "blue" })
        #expect(JourneyCopy.earnedWith(blue) == "25,000 words, 14 days on the mat")
        let founder = try #require(rules.ranks.ranks.first { $0.founderOnly == true })
        #expect(JourneyCopy.earnedWith(founder) == nil)
    }

    @Test func everyNewLineFollowsTheWritingRules() {
        for line in [JourneyCopy.road, JourneyCopy.roadNote, JourneyCopy.bothGates, JourneyCopy.achievements, JourneyCopy.continueHint] {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}

/// What murmur asks the painter page for.
@Suite struct JourneyArtworkTests {
    @Test func eachRequestCarriesWhatThePageReads() {
        let belt = JourneyArtwork.belt(belt: "blue", stripes: 2, width: 280, height: 60, drop: nil).fields
        #expect(belt["kind"] as? String == "belt" && belt["stripes"] as? Int == 2)
        #expect(belt["drop"] == nil)
        #expect(JourneyArtwork.belt(belt: "blue", stripes: 2, width: 280, height: 60, drop: 0.5).fields["drop"] as? Double == 0.5)
        let top = JourneyStanding(rank: "red-10", next: nil, words: 9_000_000, days: 4000)
        let road = JourneyArtwork.road(top).fields
        #expect((road["standing"] as? [String: Any])?["next"] is NSNull)
        let stamp = JourneyArtwork.stamp(id: "marathon", got: false, seed: 1290, size: 76).fields
        #expect(stamp["id"] as? String == "marathon" && stamp["got"] as? Bool == false && stamp["seed"] as? Int == 1290)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `value of type 'HistoryEntry' has no member 'hour'` and `type 'Journey' has no member 'earned'`.

- [ ] **Step 3: Store the hour, load the achievements, and decide what to celebrate**

In `ios/App/History/History.swift`, replace the `HistoryEntry` struct with:

```swift
struct HistoryEntry: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    /// When the take was spoken.
    let at: Date
    /// How long it recorded.
    let durationMs: Int
    let words: String
    let wordCount: Int
    /// A take that failed first and came back on a retry (IOS-006).
    let retried: Bool
    /// The local day it was spoken on, kept as it was then, as desktop
    /// keeps it, so a timezone change never moves a take to another day and
    /// a belt once earned stays earned (IOS-017). Nil on takes kept before.
    let day: String?
    /// The local hour it was spoken in, 0 to 23, kept the same way for the
    /// achievements that count the hour (IOS-018). Nil on takes kept before.
    let hour: Int?

    init(id: UUID = UUID(), at: Date, durationMs: Int, words: String, retried: Bool = false, calendar: Calendar = .current) {
        self.id = id
        self.at = at
        self.durationMs = max(0, durationMs)
        self.words = words
        wordCount = words.split(whereSeparator: \.isWhitespace).count
        self.retried = retried
        day = Self.dayKey(at, calendar: calendar)
        hour = Self.hourOf(at, calendar: calendar)
    }

    /// A local day as yyyy-MM-dd, the form desktop's dayKey writes: always
    /// in the Gregorian calendar, as desktop's dates are, whatever calendar
    /// the phone is set to. Only the given calendar's time zone counts.
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        let parts = gregorian.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// The local hour, 0 to 23, in the given calendar's time zone.
    static func hourOf(_ date: Date, calendar: Calendar = .current) -> Int {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        return gregorian.component(.hour, from: date)
    }

    /// The take as the achievements see it.
    var achievementEvent: AchievementEvent {
        AchievementEvent(at: rankEvent.at, words: wordCount, durationMs: durationMs, day: day ?? Self.dayKey(at), hour: hour ?? Self.hourOf(at))
    }

    /// The take as the belt math sees it.
    var rankEvent: RankEvent {
        RankEvent(at: Int64((at.timeIntervalSince1970 * 1000).rounded()), words: wordCount, day: day ?? Self.dayKey(at))
    }
}
```

In `ios/App/Settings/ConnectionStore.swift`, replace `BundledRules.journey()` with:

```swift
    static func journey() throws -> JourneyRules {
        let shared = try shared()
        return JourneyRules(
            ranks: try shared.decode(RanksFile.self, from: "ranks.json"),
            beltColors: try shared.decode(BeltColors.self, from: "cosmetics.json").beltColors,
            achievements: try shared.decode(AchievementsFile.self, from: "achievements.json")
        )
    }
```

`ios/App/Journey/JourneyRules.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The belt ladder and the belts' colors (ios/prd.json IOS-017) and the
// achievements (IOS-018), from the shared data both platforms read:
// shared/ranks.json, the belt colors in shared/cosmetics.json, and
// shared/achievements.json.
import Foundation
import MurmurCore
import SwiftUI

/// The ladder, the belts' colors, and the achievements, read once from the
/// app bundle.
struct JourneyRules: Sendable {
    let ranks: RanksFile
    /// Belt name to its color, from shared/cosmetics.json.
    let beltColors: [String: String]
    /// shared/achievements.json (IOS-018).
    let achievements: AchievementsFile

    /// The app's own, read once.
    static let live: JourneyRules? = try? BundledRules.journey()

    func color(_ belt: String) -> Color {
        (beltColors[belt] ?? beltColors["none"]).map { Color(hex: $0) } ?? Tokens.textDim
    }

    /// A belt's color as fabric on night studio's dark ground, as desktop's
    /// beltOnInk paints it: white as rice paper, the black belt lifted
    /// toward grey so it never vanishes, coral as coral.
    func fabric(_ belt: String) -> Color {
        switch belt {
        case "white": Tokens.rice
        case "black": color("black").mix(with: Tokens.textDim, by: 0.45)
        case let coral where coral.hasPrefix("coral"): color("coral-black")
        default: color(belt)
        }
    }
}

struct BeltColors: Decodable {
    let beltColors: [String: String]
}

private extension Color {
    /// A color from the shared data's #rrggbb; private to this file, so
    /// every other color still comes from the tokens.
    init(hex: String) {
        let digits = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        let red = Double((digits >> 16) & 0xFF) / 255
        let green = Double((digits >> 8) & 0xFF) / 255
        let blue = Double(digits & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: 1)
    }
}
```

`ios/App/Journey/Journey.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Belts and stripes on iPhone (ios/prd.json IOS-017): the same ladder,
// gates, and math as desktop (shared/ranks.json, MurmurCore's Ranks), run
// over the takes this iPhone keeps in history. One Journey across devices
// comes with the murmur account (IOS-029).
import Foundation
import MurmurCore

enum Journey {
    /// Where this iPhone's takes have reached.
    static func report(_ entries: [HistoryEntry], rules: JourneyRules) -> ProgressReport {
        Ranks.progress(entries.map(\.rankEvent), spec: rules.ranks)
    }

    /// The achievements these takes have earned (IOS-018).
    static func earned(_ entries: [HistoryEntry], rules: JourneyRules) -> [EarnedAchievement] {
        Achievements.evaluate(entries.map(\.achievementEvent), spec: rules.achievements)
    }

    /// Where practice stands, for the painter.
    static func standing(_ report: ProgressReport) -> JourneyStanding {
        JourneyStanding(rank: report.practice.rank.id, next: report.practice.next?.id, words: report.totals.words, days: report.totals.activeDays)
    }

    /// What to celebrate as the Journey opens, as desktop decides it: the
    /// newest new belt gets the ceremony, and a stripe on the belt you hold
    /// gets its tape. How high practice stands is remembered either way, so
    /// nothing at or below it plays again.
    static func celebrate(_ report: ProgressReport, rules: JourneyRules, memory: CelebrationMemory, now: Date) -> (ceremony: RankSpec?, tape: RankSpec?) {
        let ms = Int64((now.timeIntervalSince1970 * 1000).rounded())
        let celebration = Celebrations.toCelebrate(report.promotions, ladder: rules.ranks.ranks, seen: memory.seen, now: ms)
        memory.remember(report.practice.index)
        let tape = celebration?.tape.flatMap { $0.id == report.practice.rank.id ? $0 : nil }
        return (celebration?.belt, tape)
    }

    /// A stamp's seed, as desktop seeds it: by its place in the list.
    static func stampSeed(_ index: Int) -> Int {
        1200 + index * 9
    }
}

/// The highest rank already celebrated, by its place on the ladder, kept
/// across launches. It only ever rises, so belts earned again after a
/// cleared history never replay.
struct CelebrationMemory {
    static let key = "murmur-ceremony-rank"
    let defaults: UserDefaults

    var seen: Int? {
        defaults.object(forKey: Self.key) as? Int
    }

    func remember(_ index: Int) {
        defaults.set(max(seen ?? index, index), forKey: Self.key)
    }
}

/// What the Journey says.
enum JourneyCopy {
    static let title = "Journey"
    static let toward = "Toward"
    static let promotions = "Promotions"
    static let top = "You hold the highest belt practice earns."
    static let devices = "Belts count the takes on this iPhone. One Journey across your devices comes with the murmur account."

    static func level(_ level: Int) -> String {
        "Level \(level)"
    }

    /// Words toward the next belt; once the gate holds, what you have and
    /// what it needed.
    static func words(_ gate: GateProgress) -> String {
        gate.have >= gate.need
            ? "\(gate.have.formatted()) words, \(gate.need.formatted()) needed"
            : "\(gate.have.formatted()) of \(gate.need.formatted()) words"
    }

    static func days(_ gate: GateProgress) -> String {
        gate.have >= gate.need
            ? "\(gate.have.formatted()) \(gate.have == 1 ? "day" : "days") you dictated, \(gate.need.formatted()) needed"
            : "\(gate.have.formatted()) of \(gate.need.formatted()) \(gate.need == 1 ? "day" : "days") you dictated"
    }

    /// What earns the first belt, while there are no promotions yet.
    static func firstBelt(_ next: RankSpec?) -> String {
        guard let next, let words = next.words else { return "Your takes earn belts here." }
        return "Your first \(words.formatted()) words earn the \(next.label)."
    }

    static func promoted(_ at: Date) -> String {
        at.formatted(date: .abbreviated, time: .omitted)
    }

    static let road = "The road"
    static let roadNote = "Every rank from white belt to red, left to right, painted as far as your words and days have taken you. The gold ring is your next promotion."
    static let bothGates = "Both gates must close. Words come from dictating; days only from showing up."
    static let achievements = "Achievements"

    /// Where you stand on the road, for VoiceOver.
    static func roadPlace(_ place: Int, of count: Int) -> String {
        place <= 0 ? "Before the first belt, \(count) ranks ahead" : "Rank \(place) of \(count)"
    }

    /// Your words over your spot on the road, as desktop labels it.
    static func youWords(_ words: Int) -> String {
        "you, \(words.formatted()) \(words == 1 ? "word" : "words")"
    }

    static func stamp(_ name: String, earned: Bool, hint: String) -> String {
        earned ? "\(name), earned" : "\(name), not yet earned. \(hint)"
    }

    /// What the ceremony says under the rank.
    static func earnedWith(_ rank: RankSpec) -> String? {
        guard let words = rank.words, let days = rank.activeDays else { return nil }
        return "\(words.formatted()) words, \(days.formatted()) \(days == 1 ? "day" : "days") on the mat"
    }

    static let continueHint = "Tap to continue"
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected:
- `JourneyAchievementTests` passes 5, `JourneyCelebrationTests` 4, `JourneyPaintedCopyTests` 2, and `JourneyArtworkTests` 1;
- the app total is 272.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/History/History.swift ios/App/Journey/JourneyRules.swift ios/App/Settings/ConnectionStore.swift ios/App/Journey/Journey.swift ios/AppTests/JourneyPaintedTests.swift
git commit -m "IOS-018: each take keeps its hour, and the Journey knows the achievements and what to celebrate"
```

### Task 7: The painted Journey and the ceremony

**Files:**
- Create `ios/App/Journey/JourneyArt.swift` and `ios/App/Journey/Ceremony.swift`.
- Replace `ios/App/Journey/JourneyScreen.swift`.
- Test: add to `ios/AppTests/JourneyPaintedTests.swift`.

**Interfaces:**
- Consumes Tasks 5 and 6.
- Produces `JourneyArt` (`beltSize`, `wordsHeight`, `talliesHeight`, `stampSize`, `tapeFrames`, `tapeDuration`, `belt`, `road`, `words`, `tallies`, `stamps`, `tape`, `painted`, `paint(...)`, and `paintTape(_:scale:)`).
- Produces `CeremonyView(rank:close:)` and `CeremonyRank`.
- Produces `JourneyScreen(history:rules:memory:)`.

- [ ] **Step 1: Write the failing tests**

At the end of `ios/AppTests/JourneyPaintedTests.swift`, add:

```swift
/// The paintings for a report, from the real page (IOS-018).
@MainActor @Suite(.serialized) struct JourneyArtTests {
    func report(_ words: [Int]) throws -> (ProgressReport, JourneyRules) {
        let rules = try BundledRules.journey()
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = try #require(TimeZone(identifier: "UTC"))
        let start = Date(timeIntervalSince1970: 1_790_000_000)
        let entries = words.enumerated().map { day, count in
            HistoryEntry(at: start.addingTimeInterval(Double(day) * 86_400), durationMs: 1000, words: Array(repeating: "word", count: count).joined(separator: " "), calendar: utc)
        }
        return (Journey.report(entries, rules: rules), rules)
    }

    @Test func everythingIsPainted() async throws {
        let (report, rules) = try report([1300, 1300])
        let art = JourneyArt(painter: JourneyPainter())
        await art.paint(report, rules: rules, earned: ["first-words"], gateWidth: 320, scale: 2)
        #expect(art.belt?.size == JourneyArt.beltSize)
        #expect(art.road?.groups.isEmpty == false)
        #expect(art.words?.size == CGSize(width: 320, height: JourneyArt.wordsHeight))
        #expect(art.tallies?.size == CGSize(width: 320, height: JourneyArt.talliesHeight))
        #expect(art.stamps.count == rules.achievements.achievements.count)
        #expect(art.painted == 2)
    }

    /// Before the row has a width the gates wait; the rest still paints.
    @Test func theGatesWaitForTheirWidth() async throws {
        let (report, rules) = try report([1300])
        let art = JourneyArt(painter: JourneyPainter())
        await art.paint(report, rules: rules, earned: [], gateWidth: 0, scale: 2)
        #expect(art.belt != nil)
        #expect(art.words == nil && art.tallies == nil)
    }

    /// The tape drops in frames that land on the finished belt.
    @Test func theTapeDropsInFrames() async throws {
        let (report, rules) = try report([1300, 1300])
        let painter = JourneyPainter()
        let art = JourneyArt(painter: painter)
        await art.paintTape(report.rank, scale: 2)
        #expect(art.tape.count == JourneyArt.tapeFrames)
        await art.paint(report, rules: rules, earned: [], gateWidth: 320, scale: 2)
        let first = try #require(art.tape.first)
        let last = try #require(art.tape.last)
        let belt = try #require(art.belt)
        #expect(PaintingDifference(last, belt).same)
        #expect(!PaintingDifference(first, belt).same)
    }

    /// With no page, nothing is painted and nothing waits: the Journey keeps
    /// its plain drawing.
    @Test func withoutThePageNothingIsPainted() async throws {
        let (report, rules) = try report([1300])
        let art = JourneyArt(painter: JourneyPainter(page: nil))
        let clock = ContinuousClock()
        let took = try await clock.measure {
            await art.paint(report, rules: rules, earned: [], gateWidth: 320, scale: 2)
            await art.paintTape(try #require(rules.ranks.ranks.first { $0.id == "white-1" }), scale: 2)
        }
        #expect(art.belt == nil && art.road == nil && art.stamps.isEmpty && art.tape.isEmpty)
        #expect(took < .seconds(2))
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'JourneyArt' in scope`.

- [ ] **Step 3: Write the art, the ceremony, and the screen**

`ios/App/Journey/JourneyArt.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Journey's paintings (ios/prd.json IOS-018), asked of the painter page
// for where practice stands: the belt, the road, the two gates, and a
// stamp per achievement. Until a picture arrives, or if the page fails,
// the screen keeps its plain native drawing, so the Journey always reads.
import MurmurCore
import Observation
import UIKit

@MainActor @Observable final class JourneyArt {
    /// Desktop's belt is 560 by 120; on iPhone it is set at half that.
    static let beltSize = CGSize(width: 280, height: 60)
    static let wordsHeight: Double = 34
    static let talliesHeight: Double = 44
    static let stampSize: Double = 76
    /// Frames of the tape drop, played over desktop's 520 ms.
    static let tapeFrames = 13
    static let tapeDuration = 0.52

    private(set) var belt: UIImage?
    private(set) var road: JourneyPicture?
    private(set) var words: UIImage?
    private(set) var tallies: UIImage?
    private(set) var stamps: [String: UIImage] = [:]
    /// The newest stripe's tape slapping on, first frame to last.
    private(set) var tape: [UIImage] = []
    /// How many paintings have landed: each one fades in.
    private(set) var painted = 0

    @ObservationIgnored private let painter: JourneyPainter

    init(painter: JourneyPainter = .shared) {
        self.painter = painter
    }

    /// Paints everything for this report. The gates take the row's width.
    func paint(_ report: ProgressReport, rules: JourneyRules, earned: Set<String>, gateWidth: Double, scale: CGFloat) async {
        let standing = Journey.standing(report)
        let size = Self.beltSize
        belt = try? await painter.picture(.belt(belt: report.rank.belt, stripes: report.rank.stripes, width: size.width, height: size.height, drop: nil), scale: scale).image
        road = try? await painter.picture(.road(standing), scale: scale)
        if report.practice.next != nil, gateWidth > 0 {
            words = try? await painter.picture(.words(standing, width: gateWidth, height: Self.wordsHeight), scale: scale).image
            tallies = try? await painter.picture(.tallies(standing, width: gateWidth, height: Self.talliesHeight), scale: scale).image
        }
        painted += 1
        for (index, spec) in rules.achievements.achievements.enumerated() {
            let got = earned.contains(spec.id)
            let artwork = JourneyArtwork.stamp(id: spec.id, got: got, seed: Journey.stampSeed(index), size: Self.stampSize)
            if let image = try? await painter.picture(artwork, scale: scale).image { stamps[spec.id] = image }
        }
        painted += 1
    }

    /// The frames of the newest stripe's tape slapping onto this belt.
    func paintTape(_ rank: RankSpec, scale: CGFloat) async {
        let size = Self.beltSize
        var frames: [UIImage] = []
        for frame in 0..<Self.tapeFrames {
            let k = Double(frame) / Double(Self.tapeFrames - 1)
            guard let image = try? await painter.picture(.belt(belt: rank.belt, stripes: rank.stripes, width: size.width, height: size.height, drop: k), scale: scale).image else { return }
            frames.append(image)
        }
        tape = frames
    }
}
```

`ios/App/Journey/Ceremony.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The promotion ceremony (ios/prd.json IOS-018), as desktop holds it: one
// big stroke in the new belt's color, splatter, and the rank set large.
// The painting runs in the painter page on screen; the rank, its title,
// and what earned it are native text over it. A tap, or VoiceOver's
// escape, continues; without VoiceOver it also closes on its own after
// desktop's 4.6 seconds. Reduce Motion shows the finished painting at once.
import MurmurCore
import SwiftUI
import WebKit

/// The page's web view, as a view.
private struct Stage: UIViewRepresentable {
    let painter: JourneyPainter

    func makeUIView(context: Context) -> WKWebView { painter.web }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct CeremonyView: View {
    static let duration = 4.6
    static let textDelay = 0.48

    let rank: RankSpec
    let close: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @State private var painter: JourneyPainter?
    @State private var painted = false
    @State private var shown = false
    @ScaledMetric(relativeTo: .largeTitle) private var rankSize = 48

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .top) {
                if let painter {
                    Stage(painter: painter)
                        .ignoresSafeArea()
                        .accessibilityHidden(true)
                }
                VStack(spacing: 14) {
                    Text(rank.label)
                        .font(.system(size: rankSize, weight: .heavy).width(.condensed))
                        .multilineTextAlignment(.center)
                        .minimumScaleFactor(0.6)
                    Text("\u{201C}\(rank.title)\u{201D}")
                        .font(.title3.italic())
                        .foregroundStyle(Tokens.textDim)
                    if let earned = JourneyCopy.earnedWith(rank) {
                        Text(earned)
                            .font(.system(.footnote, design: .monospaced))
                    }
                    Text(JourneyCopy.continueHint)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(Tokens.textDim)
                        .padding(.top, 14)
                }
                .padding(.horizontal, 16)
                .padding(.top, geometry.size.height * 0.54)
                .opacity(shown ? 1 : 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .foregroundStyle(Tokens.text)
            .contentShape(Rectangle())
            .onTapGesture(perform: close)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(.escape, close)
            .accessibilityAction(named: JourneyCopy.continueHint, close)
            .task(id: geometry.size) {
                await paint(geometry.size)
            }
        }
        .background(Tokens.ink.opacity(0.95))
        .task {
            if reduceMotion {
                shown = true
            } else {
                try? await Task.sleep(for: .seconds(Self.textDelay))
                withAnimation(.easeOut(duration: 0.4)) { shown = true }
            }
            guard !voiceOver else { return }
            try? await Task.sleep(for: .seconds(Self.duration - (reduceMotion ? 0 : Self.textDelay)))
            close()
        }
    }

    /// Paints once the size is known: the stroke goes on the first time,
    /// and a new size repaints the finished picture, as desktop does.
    private func paint(_ size: CGSize) async {
        guard size.width > 0, size.height > 0 else { return }
        let painter = painter ?? JourneyPainter()
        self.painter = painter
        let finished = reduceMotion || painted
        painted = true
        try? await painter.ceremony(rank: rank.id, size: size, reduced: finished)
    }
}
```

`ios/App/Journey/JourneyScreen.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Journey on iPhone (ios/prd.json IOS-017, painted in IOS-018): the
// belt with its stripes, the road, the words and days toward the next
// belt, the achievements as ink stamps, and the dated promotions. The
// paintings come from desktop's own painter (JourneyArt); every word is a
// native view beside or over them. A new belt gets the ceremony when the
// Journey opens, and a new stripe slaps its tape onto the belt.
import MurmurCore
import SwiftUI

struct JourneyScreen: View {
    let history: History
    let rules: JourneyRules
    var memory = CelebrationMemory(defaults: .standard)

    @Environment(\.displayScale) private var scale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var art = JourneyArt()
    @State private var gateWidth: Double = 0
    @State private var ceremony: CeremonyRank?
    @State private var decidedIndex: Int?
    @State private var pendingTape: RankSpec?
    @State private var tapeFrame: Int?

    var body: some View {
        let report = Journey.report(history.entries, rules: rules)
        let earned = Set(Journey.earned(history.entries, rules: rules).map(\.id))
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    hero(report)
                    Text(report.rank.label)
                        .font(.title3.weight(.semibold))
                    Text("\u{201C}\(report.rank.title)\u{201D}")
                        .foregroundStyle(Tokens.textDim)
                    Text(JourneyCopy.level(report.level))
                        .font(.system(.footnote, design: .monospaced))
                        .foregroundStyle(Tokens.brand)
                }
                .padding(.vertical, 8)
                .accessibilityElement(children: .combine)
            }
            .listRowBackground(Tokens.panel)

            Section {
                RoadStrip(picture: art.road, words: report.totals.words, place: road(report))
                    .listRowInsets(EdgeInsets())
                if let words = report.words, let days = report.activeDays {
                    Gate(text: JourneyCopy.words(words), pct: words.pct, picture: art.words, height: JourneyArt.wordsHeight)
                        .onGeometryChange(for: Double.self) { $0.size.width } action: { gateWidth = $0 }
                    Gate(text: JourneyCopy.days(days), pct: days.pct, picture: art.tallies, height: JourneyArt.talliesHeight)
                    Text(JourneyCopy.bothGates)
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                } else {
                    Text(JourneyCopy.top)
                }
            } header: {
                SectionTitle(report.next.map { "\(JourneyCopy.toward) \($0.label)" } ?? JourneyCopy.road)
            } footer: {
                Text(JourneyCopy.roadNote).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                Stamps(achievements: rules.achievements.achievements, earned: earned, pictures: art.stamps)
                    .padding(.vertical, 8)
            } header: {
                SectionTitle(JourneyCopy.achievements)
            }
            .listRowBackground(Tokens.panel)

            Section {
                if report.promotions.isEmpty {
                    Text(JourneyCopy.firstBelt(report.next))
                        .foregroundStyle(Tokens.textDim)
                } else {
                    ForEach(report.promotions.reversed(), id: \.id) { promotion in
                        let rank = rules.ranks.ranks.first { $0.id == promotion.id }
                        LabeledContent(rank?.label ?? promotion.id, value: JourneyCopy.promoted(Date(timeIntervalSince1970: TimeInterval(promotion.at) / 1000)))
                    }
                }
            } header: {
                SectionTitle(JourneyCopy.promotions)
            } footer: {
                Text(JourneyCopy.devices).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(JourneyCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.35), value: art.painted)
        .task(id: PaintKey(standing: Journey.standing(report), earned: earned, gateWidth: gateWidth, scale: scale)) {
            decide(report)
            if let tape = pendingTape, art.tape.isEmpty, !reduceMotion {
                await art.paintTape(tape, scale: scale)
                tapeFrame = art.tape.isEmpty ? nil : 0
            }
            await art.paint(report, rules: rules, earned: earned, gateWidth: gateWidth, scale: scale)
            if ceremony == nil { await playTape() }
        }
        .fullScreenCover(item: $ceremony) { shown in
            CeremonyView(rank: shown.rank) { withoutAnimation { ceremony = nil } }
                .presentationBackground(.clear)
        }
        .onChange(of: ceremony == nil) { _, closed in
            if closed { Task { await playTape() } }
        }
    }

    /// The belt, painted, or mid tape drop; plain until the painting lands.
    @ViewBuilder private func hero(_ report: ProgressReport) -> some View {
        let size = JourneyArt.beltSize
        if let frame = tapeFrame, art.tape.indices.contains(frame) {
            Image(uiImage: art.tape[frame]).resizable().frame(width: size.width, height: size.height)
        } else if let belt = art.belt {
            Image(uiImage: belt).resizable().frame(width: size.width, height: size.height)
        } else {
            BeltSwatch(rank: report.rank, rules: rules)
                .frame(width: 168, height: 18)
                .frame(height: size.height, alignment: .leading)
        }
    }

    /// Your place on the road, counting the ranks after the starting none.
    private func road(_ report: ProgressReport) -> (place: Int, count: Int) {
        let road = rules.ranks.ranks.filter { $0.id != "none" && $0.founderOnly != true }
        return ((road.firstIndex { $0.id == report.practice.rank.id } ?? -1) + 1, road.count)
    }

    /// What to celebrate, decided when the Journey opens and again when
    /// practice climbs while it is open, as desktop decides it. How high you
    /// have climbed is remembered either way, so nothing below replays.
    private func decide(_ report: ProgressReport) {
        guard decidedIndex.map({ report.practice.index > $0 }) ?? true else { return }
        decidedIndex = report.practice.index
        let celebration = Journey.celebrate(report, rules: rules, memory: memory, now: .now)
        pendingTape = celebration.tape
        if let belt = celebration.ceremony { withoutAnimation { ceremony = CeremonyRank(rank: belt) } }
    }

    /// The new stripe's tape slaps on, once the ceremony (if any) is over.
    private func playTape() async {
        guard pendingTape != nil else { return }
        pendingTape = nil
        guard !reduceMotion, !art.tape.isEmpty else {
            tapeFrame = nil
            return
        }
        for frame in art.tape.indices {
            tapeFrame = frame
            try? await Task.sleep(for: .seconds(JourneyArt.tapeDuration / Double(art.tape.count)))
        }
        tapeFrame = nil
    }

    private func withoutAnimation(_ change: () -> Void) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction, change)
    }
}

/// The new belt the ceremony is for.
struct CeremonyRank: Identifiable {
    let rank: RankSpec
    var id: String { rank.id }
}

/// What the paintings depend on: a change repaints.
private struct PaintKey: Hashable {
    let standing: JourneyStanding
    let earned: Set<String>
    let gateWidth: Double
    let scale: CGFloat
}

/// The road, at desktop's own size, scrolled to where you stand: the
/// painting, the belt names under it, and your words over your spot.
private struct RoadStrip: View {
    let picture: JourneyPicture?
    let words: Int
    let place: (place: Int, count: Int)

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                ZStack(alignment: .topLeading) {
                    if let picture {
                        Image(uiImage: picture.image)
                            .resizable()
                            .frame(width: 1500, height: 120)
                        ForEach(picture.groups, id: \.name) { group in
                            Text(group.name)
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(Tokens.textDim)
                                .fixedSize()
                                .offset(x: group.x, y: 88)
                        }
                        if let you = picture.you {
                            Text(JourneyCopy.youWords(words))
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(Tokens.brand)
                                .fixedSize()
                                .frame(width: 200)
                                // Near either end it stays on the road, as desktop's does.
                                .offset(x: min(max(you - 100, 0), 1300), y: 28)
                            Color.clear.frame(width: 1, height: 1).offset(x: you).id("you")
                        }
                    }
                }
                .frame(width: 1500, height: 120, alignment: .topLeading)
            }
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
            .onChange(of: picture?.you) { _, _ in proxy.scrollTo("you", anchor: .center) }
        }
        .frame(height: 120)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(JourneyCopy.road)
        .accessibilityValue(JourneyCopy.roadPlace(place.place, of: place.count))
    }
}

/// One gate: its numbers over the painted stroke or tallies, or a quiet
/// bar until the painting lands.
private struct Gate: View {
    let text: String
    let pct: Double
    let picture: UIImage?
    let height: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text)
            if let picture {
                Image(uiImage: picture)
                    .resizable()
                    .frame(height: height)
                    .accessibilityHidden(true)
            } else {
                ProgressView(value: pct)
                    .tint(pct >= 1 ? Tokens.brand : Tokens.textDim)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// The achievements as ink stamps: earned ones in ink, the rest as dashed
/// rings with what earns them.
struct Stamps: View {
    let achievements: [AchievementSpec]
    let earned: Set<String>
    let pictures: [String: UIImage]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 12, alignment: .top)], spacing: 16) {
            ForEach(achievements, id: \.id) { spec in
                let got = earned.contains(spec.id)
                VStack(spacing: 6) {
                    if let picture = pictures[spec.id] {
                        Image(uiImage: picture)
                            .resizable()
                            .frame(width: JourneyArt.stampSize, height: JourneyArt.stampSize)
                    } else {
                        Circle()
                            .strokeBorder(Tokens.textDim.opacity(0.5), style: StrokeStyle(lineWidth: 1.2, dash: [3, 4]))
                            .frame(width: JourneyArt.stampSize, height: JourneyArt.stampSize)
                    }
                    Text(spec.name)
                        .font(.footnote)
                        .foregroundStyle(got ? Tokens.text : Tokens.textDim)
                    if !got {
                        Text(spec.hint)
                            .font(.caption2)
                            .foregroundStyle(Tokens.textDim)
                    }
                }
                .multilineTextAlignment(.center)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(JourneyCopy.stamp(spec.name, earned: got, hint: spec.hint))
            }
        }
    }
}

/// Where a belt's rank bar and tape go, as desktop's painter lays them out
/// (journeyPaint.ts): the bar from 70 to 86 percent of the belt's length,
/// none on coral or red belts (or no belt), and up to four tapes, six
/// degrees on a black belt, spaced to fit inside the bar. All in fractions
/// of the length.
struct BeltLayout: Equatable {
    static let barStart = 0.7
    static let barEnd = 0.86

    let bar: ClosedRange<Double>?
    let tapes: [Double]
    let tapeWidth: Double

    static func of(belt: String, stripes: Int) -> BeltLayout {
        guard belt != "none", belt != "red", !belt.hasPrefix("coral") else { return BeltLayout(bar: nil, tapes: [], tapeWidth: 0) }
        let cap = belt == "black" ? 6 : 4
        let space = (barEnd - barStart) / Double(cap + 1)
        let tapes = (0..<min(max(stripes, 0), cap)).map { barStart + space * Double($0 + 1) }
        return BeltLayout(bar: barStart...barEnd, tapes: tapes, tapeWidth: space * 0.5)
    }
}

/// A belt drawn plainly, as desktop lays it out: the fabric, the rank bar
/// (red on a black belt, none on coral or red belts), and a strip of cream
/// tape per stripe.
struct BeltSwatch: View {
    let rank: RankSpec
    let rules: JourneyRules

    var body: some View {
        let layout = BeltLayout.of(belt: rank.belt, stripes: rank.stripes)
        Canvas { context, size in
            let w = size.width
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(rules.fabric(rank.belt)))
            if let bar = layout.bar {
                let rect = CGRect(x: w * bar.lowerBound, y: 0, width: w * (bar.upperBound - bar.lowerBound), height: size.height)
                context.fill(Path(rect), with: .color(rank.belt == "black" ? rules.color("red") : Tokens.ink))
                for tape in layout.tapes {
                    let width = max(1, w * layout.tapeWidth)
                    context.fill(Path(CGRect(x: w * tape - width / 2, y: size.height * 0.15, width: width, height: size.height * 0.7)), with: .color(Tokens.text))
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .overlay(RoundedRectangle(cornerRadius: 3).stroke(Tokens.panelEdge))
        .accessibilityHidden(true)
    }
}

/// Home's row into the Journey: the belt and where it stands.
struct JourneyRow: View {
    let history: History
    let rules: JourneyRules

    var body: some View {
        let report = Journey.report(history.entries, rules: rules)
        NavigationLink {
            JourneyScreen(history: history, rules: rules)
        } label: {
            HStack(spacing: 12) {
                BeltSwatch(rank: report.rank, rules: rules)
                    .frame(width: 72, height: 10)
                VStack(alignment: .leading, spacing: 2) {
                    Text(JourneyCopy.title)
                    Text(report.rank.label)
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                }
            }
            .frame(minHeight: 44)
        }
    }
}

#if DEBUG
/// A history in a scratch file with this many words a day, one take a day.
@MainActor private func previewHistory(_ name: String, words: [Int]) -> History {
    let store = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "journey-preview-\(name).jsonl"))
    try? store.clear()
    let start = Date.now.addingTimeInterval(-Double(words.count) * 86_400)
    for (day, count) in words.enumerated() {
        try? store.append(HistoryEntry(at: start.addingTimeInterval(Double(day) * 86_400), durationMs: 60_000, words: Array(repeating: "word", count: count).joined(separator: " ")))
    }
    return History(store: store)
}

#Preview("No belt") {
    NavigationStack {
        if let rules = JourneyRules.live { JourneyScreen(history: previewHistory("none", words: []), rules: rules) }
    }
    .preferredColorScheme(.dark)
}

#Preview("White, two stripes") {
    NavigationStack {
        if let rules = JourneyRules.live { JourneyScreen(history: previewHistory("white2", words: [180, 900, 1500, 600, 2100, 1300, 800]), rules: rules) }
    }
    .preferredColorScheme(.dark)
}

#Preview("Belts on the Home row") {
    if let rules = JourneyRules.live {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(["white-4", "blue-2", "brown-4", "black", "black-6", "coral-7", "red-9"], id: \.self) { id in
                if let rank = rules.ranks.ranks.first(where: { $0.id == id }) {
                    HStack {
                        BeltSwatch(rank: rank, rules: rules).frame(width: 72, height: 10)
                        Text(rank.label).font(.footnote)
                    }
                }
            }
        }
        .padding()
        .background(Tokens.panel)
        .foregroundStyle(Tokens.text)
        .preferredColorScheme(.dark)
    }
}
#endif
```

- [ ] **Step 4: Run them to see them pass, and read the screens**

Run: `npm run ios:test`, then read the result bundle.
Expected: `JourneyArtTests` passes (4), and the app total is 276.

Then render and read three screens, with a scratch history that is never committed:
- the Journey for a white belt with two stripes;
- the fourteen stamps;
- the blue belt ceremony.

Expected:
- the belt, the road scrolled to you, the gates, and the inked stamps are painted, with every word native;
- the ceremony shows its stroke and splatter under the rank.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Journey/JourneyArt.swift ios/App/Journey/Ceremony.swift ios/App/Journey/JourneyScreen.swift ios/AppTests/JourneyPaintedTests.swift
git commit -m "IOS-018: the Journey painted by desktop's brush, with the ceremony and the tape drop"
```

### Task 8: The smoke earns achievements and paints

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`.

The smoke checks are the tests here:
- Achievement histories go through the history store and back, and must earn what desktop earned, when it earned it.
- The painter page must load in its web view, say it is ready, and paint a stamp and the road.

- [ ] **Step 1: Add the checks**

In `SmokeRunner.runAndExit`'s list, after `("journey", checkJourney),`, add `("achievements", checkAchievements),` and `("journeyPage", checkJourneyPage),`. Before `/// Runs main-actor work to the end from the smoke's synchronous start`, add:

```swift
    /// Achievements (IOS-018): histories from shared/achievement-vectors.json
    /// go through the history store and back, then the achievements, and
    /// earn what desktop's achievements earned, when they earned it.
    static func checkAchievements() throws {
        guard let rules = try? BundledRules.journey(),
              let directory = Bundle.main.url(forResource: "shared", withExtension: nil),
              let vectors = try? SharedData(directory: directory).decode(SmokeAchievementVectors.self, from: "achievement-vectors.json")
        else { throw SmokeFailure("the achievements or their vectors did not load") }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let wanted = ["seven days in a row", "a five minute take is a marathon", "a week away and back is a comeback"]
        let cases = vectors.cases.filter { wanted.contains($0.name) }
        guard cases.count == wanted.count else { throw SmokeFailure("the achievement vectors lack a case the smoke runs") }
        for vector in cases {
            let file = FileManager.default.temporaryDirectory.appending(path: "smoke-achievements-\(UUID().uuidString).jsonl")
            defer { try? FileManager.default.removeItem(at: file) }
            let store = HistoryStore(file: file)
            for event in vector.events {
                let words = Array(repeating: "word", count: event.words).joined(separator: " ")
                try store.append(HistoryEntry(at: Date(timeIntervalSince1970: TimeInterval(event.at) / 1000), durationMs: event.durationMs, words: words, calendar: utc))
            }
            let earned = Journey.earned(store.list(), rules: rules)
            guard earned.map(\.id) == vector.expect.map(\.id), earned.map(\.at) == vector.expect.map(\.at)
            else { throw SmokeFailure("\(vector.name): the iPhone earned \(earned.map(\.id)), desktop \(vector.expect.map(\.id))") }
        }
    }

    /// The painted Journey (IOS-018): the painter page in the app bundle
    /// loads in its web view, says it is ready, and paints a stamp and the
    /// road.
    static func checkJourneyPage() throws {
        if let failure = onMain({ await journeyPageFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func journeyPageFailure() async -> String? {
        let painter = JourneyPainter()
        do {
            try await painter.waitUntilReady(seconds: 30)
        } catch {
            return "the painter page never said it was ready"
        }
        guard let stamp = try? await painter.picture(.stamp(id: "first-words", got: true, seed: Journey.stampSeed(0), size: 76), scale: 2),
              stamp.image.size == CGSize(width: 76, height: 76)
        else { return "the page painted no stamp" }
        let standing = JourneyStanding(rank: "white", next: "white-1", words: 300, days: 1)
        guard let road = try? await painter.picture(.road(standing), scale: 1), road.groups.first?.name == "white", road.you != nil
        else { return "the page painted no road" }
        return nil
    }
```

At the end of the file, add:

```swift
/// The parts of shared/achievement-vectors.json the smoke reads.
private struct SmokeAchievementVectors: Decodable {
    struct Case: Decodable {
        let name: String
        let events: [Event]
        let expect: [Earned]
    }

    struct Event: Decodable {
        let at: Int64
        let words: Int
        let durationMs: Int
    }

    struct Earned: Decodable {
        let id: String
        let at: Int64
    }

    let cases: [Case]
}
```

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT` lists twenty checks, all true, `achievements` and `journeyPage` among them.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-018: the smoke earns achievements through the store and checks the painter page is ready"
```

### Task 9: The docs, the live check, and the notes

**Files:** Modify `ios/docs/iphone.md`, `ios/README.md`, `HANDOFF.md`, and `ios/prd.json`.

- [ ] **Step 1: The docs**

In `ios/docs/iphone.md`, after the section `## How do belts work on iPhone?`, add:

```markdown
## What is the Journey on iPhone?

The Journey is where your practice shows, painted the way it is on the Mac, by the same brush code. Tap the Journey row on Home to open it. It shows:

- **Your belt,** painted with its stripes, with its name, its title, and your level.
- **The road:** every rank from white belt to red, left to right, painted as far as your words and days have taken you, with your words over your spot. Swipe it sideways to see the whole ladder. The gold ring is your next promotion.
- **The two gates** toward the next belt: a brush stroke for your words, and tally marks for the days you dictated. Both must close.
- **Achievements,** as ink stamps: the first take, three, seven, thirty, and a hundred days in a row, a thousand, five thousand, and ten thousand words in one day, a hundred and a thousand takes, a take past five minutes, dictating after midnight or before six in the morning, and coming back after a week away. Earned stamps are inked; the rest show what earns them.
- **Your promotions,** each with the day you earned it.

When you earn a new belt, the Journey holds the ceremony the next time you open it: one big stroke in the new belt's color, splatter, and your new rank set large. Tap to continue. A new stripe slaps its tape onto your belt instead. Each promotion plays once.

With Reduce Motion on (Settings, Accessibility, Motion), every painting appears finished at once, with no strokes drawing on. Every word on the Journey is ordinary text, so it follows your text size, and VoiceOver reads your belt, where you stand on the road, each gate, and each achievement.

The paintings are made on your iPhone by a small page inside murmur that can load nothing else and reach nothing on the internet.
```

In `ios/README.md`:
- Make the `project.yml` line read `the app (\`murmur\`), the keyboard (\`murmurKeyboard\`), the widgets (\`murmurWidgets\`), and the tests (\`murmurTests\`)`.
- Make the generated-files sentence end `\`shared/\`, and the Journey's painter page (\`ios/Web\`, bundled with desktop's brush engine).`
- After the `Shared/` line, add:

```markdown
- `Live/`: the Live Activity's shape and the App Intents that start and end a session
- `Widgets/`: the Control Center control and the Lock Screen Live Activity
- `Web/`: the Journey's painter page, which desktop's own brush engine and Journey painter are bundled into at build time
```

- [ ] **Step 2: The live check**

In `HANDOFF.md`, under `## Now`, after the IOS-017 live check, add:

```markdown
- [ ] IOS-018 live check, once a TestFlight build with it is on your iPhone (added 2026-10-13). (1) Open murmur and tap the Journey row on Home. Within a few seconds your belt, the road, the two gates, and the achievement stamps should turn into brush paintings. (2) Swipe the road sideways: it runs from white belt to red, painted up to your spot, with your words over it. (3) Dictate as you normally do. The next time you earn a stripe, open the Journey: the new stripe's tape should drop onto your belt. The next time you earn a new belt, open the Journey: you should see the ceremony, a big brush stroke in the new belt's color with splatter and your new belt's name in big letters. Tap anywhere to close it. (4) Open the Journey again: the ceremony should not play a second time. (5) Tell Claude what you saw.
```

- [ ] **Step 3: The notes**

In `ios/prd.json`, set IOS-018's `notes` to say:
- what was built and verified;
- the Mac and iPhone side-by-side numbers, with what produced them;
- every ruling above;
- that the live check waits for LaBroi (`passes` stays false);
- the gate counts.

Write only the notes field. Then run `npm run roadmap`.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/docs/iphone.md ios/README.md HANDOFF.md ios/prd.json ROADMAP.md
git commit -m "IOS-018: the iPhone docs answer what the Journey is on iPhone"
```
