# A Painting a Day (IOS-019) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every take on the phone adds the next stroke of the day's painting, as on desktop. The painting is made by desktop's own engine, subjects, and light, with its seal, its light, a strip of earlier days, a portrait Save card, and Save the week, saved through the share sheet.

**Architecture:**
- **The painting book in Swift.** Desktop's painting book (`src/shared/painting.ts`: each day's subject, seed, size, tier, level, rank, hour, and words) is ported to MurmurCore as `Paintings.sync`.
  - `shared/painting-vectors.json` holds desktop's own answers, run by both platforms.
  - The app keeps the book in `paintings.json` (its own container, out of backups), with this install's own seed, as desktop does.
  - History syncs it after each take and before any delete, so a painting outlives the takes that made it.
- **The painting in the page.** Desktop's wrap-up helpers (the plan for a record, its progress, seal, light, painter line, the day card, and the week scroll) move from `WrapUpView.tsx` into `paintingDay.ts`, which desktop and the iPhone's painter page both import. Desktop's behavior does not change.
  - The page gains `painting`, `card`, and `week` pictures, and `live`, which paints today's painting on its own canvases with the newest stroke painting in.
- **The display face.** The face desktop fetches at install (`src/renderer/public/fonts`, never committed) is inlined into the page as a data URL. Its license ships beside the page and is shown in About, and a release refuses to build without it.
- **The screens.** Home gains a Today's painting row. Today's painting is shown live on screen, with native words and Save card, above a strip of earlier days (each opening large) and Save the week.
  - Saving goes through the share sheet with a PNG painted when the person picks where it goes.

**Tech Stack:** Swift 6, Swift Testing, SwiftUI (ShareLink, Transferable), WebKit, TypeScript, Vite, vitest.

**Spec:**
- `ios/prd.json` IOS-019, with `conventions`, `CLAUDE.md` (the painting a day rules and the display face), and `DESIGN.md`.
- Desktop's `src/shared/painting.ts`, and `src/renderer/settings/WrapUpView.tsx`, `painting.ts`, `paintSubjects.ts`, `paintLight.ts`, `ShareCard.tsx`, and `scripts/lib/display-face.js`, all murmur's own.

The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** in a throwaway copy of `feature/ios`, kept in step with the branch through the IOS-018 test fixes:
- `npm run typecheck` was clean; `npm run test` passed 981 (957 + 19 vectors + 4 day + 1 page build).
- `swift test` passed 123 (117 + 6).
- `npm run ios:test` passed 301 app tests (286 + 15).
- `npm run ios:smoke` printed twenty-one true checks, `paintingDay` among them.
- Screens rendered and read: today's painting in progress (moon over water, 3 of 6 strokes) and finished (a lotus pond with a dusk sun and its white belt seal), the strip, the portrait card, and the week's scroll with its "a day off" panel.
- **Same takes, same painting.** One day's painting and its card were painted from the same record in Electron (the desktop app's Chromium) and on the simulator (WebKit), then compared pixel by pixel:

| Picture | Ink overlap | Pixels apart by more than 48 of 255 |
|---|---|---|
| Painting | 99.66% | 0.02% |
| Card | 100% | 2.0% |

  The card's difference is the smoothing of its text. Its painting and layout are the same.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The book's rules are ported to Swift with shared vectors;** the painting itself is desktop's code in the page. The book has to keep up with every take, painted or not.
2. **Each install has its own seed, as on desktop.** The spec's "seeded by the date" is desktop's seed: the date mixed with the install's own number.
   - The same takes with the same seed paint what the Mac paints (the side-by-side check). Your iPhone's seed is its own, though, so its subjects differ from your Mac's until one murmur account joins them.
   - If wrong: a date-only seed on both platforms (a desktop change too), or a seed shared through the account.
3. **The book stays when takes go.** History syncs it after each take and before each delete or Clear all, as desktop syncs before its retention trims the log.
4. **Today's painting is drawn live on screen** in the Journey's page, with desktop's 900 ms paint-in. The strip, the viewer, and the Home row are still pictures. The fresh-stroke memory is desktop's key, kept in UserDefaults.
5. **Saving is the share sheet,** with desktop's file names (`murmur-day-…png`, `murmur-week-…png`), painted when asked for. Save Image needs the add-only Photos purpose string, which says murmur never looks at the library.
6. **The display face is inlined into the page** (`font-src data:`), fetched at install as desktop's is. A build without it sets titles in a condensed system face, as desktop does. A release requires it, and its license ships beside the page and in About.
7. **Words on the cards are part of the saved image,** as on desktop; every word on screen is native.
8. **The day's summary, Copy summary, and time back stay with IOS-022** (analytics, time back, and the recap).
9. **Home's Today's painting row sits beside the Journey row.**

## Global Constraints

- Swift 6, iOS 26, compiling on Swift 6.3 (CI's Xcode 26.6).
- `shared/` stays the single source of shared rules; both platforms test the same vector files.
- No binary assets in the repo: the font is fetched at install and never committed.
- Design: night studio tokens, no raw colors in code (the design lint checks).
  - Gold for Save card, Save the week, and labels.
  - Paint only where something happened (the painting and its strip).
  - Reduce Motion shows the finished painting.
- Every source file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-019:`, then `git pull --rebase`.
  - Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
  - Also `npm run smoke` for the desktop task.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **The two platforms painting a different book** (seeds, subjects, sizes, the hour, kept days, the cutoff). Pinned by `painting-vectors.test.ts` (Task 1), `PaintingVectorTests` (Task 2), and `PaintingStoreTests.theBookIsDesktops` (Task 5).
2. **Deleting takes erasing their painting.** Pinned by `PaintingStoreTests.deletedTakesKeepTheirPainting` (Task 5).
3. **A book that cannot be read losing every day.** Pinned by `PaintingStoreTests.aDayThatCannotBeReadIsLeftOut` (Task 5) and `PaintingVectorTests.aRecordReadBackIsChecked` (Task 2).
4. **The card or the week saving the wrong size, or without its face when the build has one.** Pinned by `PaintingPictureTests.theCardAndTheWeekAreDesktops` (Task 6), `PaintingShareTests.theShareIsTheCard` (Task 7), and `PaintingFontTests` (Task 8).
5. **The newest stroke painting in again on every open, or never.** Pinned by `PaintingWordsTests.theNewestStrokePaintsInOnce` (Task 7) and `PaintingPictureTests.todayPaintsLive` (Task 6).

---

### Task 1: The shared painting vectors

**Files:** Create `shared/painting-vectors.json` and `src/shared/painting-vectors.test.ts`.

Desktop is the oracle. Each answer came from desktop's own code, so the test passes on arrival; it pins desktop for the Swift port in Task 2.

- [ ] **Step 1: Add the vectors and their desktop test**

`shared/painting-vectors.json`, whole (17 histories, plus seeds, subjects, sizes, typical days, week lines, captions, and lines):

```json
{
  "note": "Desktop's own painting a day (src/shared/painting.ts, and the captions in src/renderer/settings/painting.ts), run on fixed takes: each take's time, its stored day and hour, and its words. Both platforms run these (IOS-019).",
  "cases": [
    {
      "name": "nothing yet paints nothing",
      "install": 12345,
      "book": {},
      "takes": [],
      "expect": {}
    },
    {
      "name": "the first take starts a small painting",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 150 }
      ],
      "expect": {
        "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [150] }
      }
    },
    {
      "name": "a typical day sizes the painting",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788274860000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788274920000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788274980000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788275040000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788275100000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788275160000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788275220000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361260000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361320000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361380000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361440000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361500000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361560000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361620000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361680000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788361740000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788447600000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788447660000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788447720000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788447780000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788447840000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788447900000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788447960000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788448020000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788448080000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788448140000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788448200000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788448260000, "day": "2026-09-03", "hour": 10, "words": 40 },
        { "at": 1788534000000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534060000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534120000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534180000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534240000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534300000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534360000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534420000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534480000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534540000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534600000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534660000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534720000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788534780000, "day": "2026-09-04", "hour": 10, "words": 40 },
        { "at": 1788706800000, "day": "2026-09-06", "hour": 10, "words": 60 },
        { "at": 1788706860000, "day": "2026-09-06", "hour": 10, "words": 60 },
        { "at": 1788706920000, "day": "2026-09-06", "hour": 10, "words": 60 }
      ],
      "expect": {
        "2026-09-01": {
          "subject": "mountains",
          "seed": 1759609308,
          "target": 6,
          "tier": 0,
          "level": 1,
          "rank": "none",
          "words": [40, 40, 40, 40, 40, 40, 40, 40],
          "hour": 10
        },
        "2026-09-02": {
          "subject": "chrysanthemum",
          "seed": 4122700270,
          "target": 6,
          "tier": 0,
          "level": 1,
          "rank": "white",
          "words": [40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
          "hour": 10
        },
        "2026-09-03": {
          "subject": "boat",
          "seed": 2890680354,
          "target": 6,
          "tier": 0,
          "level": 1,
          "rank": "white",
          "words": [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
          "hour": 10
        },
        "2026-09-04": {
          "subject": "mountains",
          "seed": 3567752374,
          "target": 10,
          "tier": 0,
          "level": 1,
          "rank": "white",
          "words": [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
          "hour": 10
        },
        "2026-09-06": { "subject": "lotus", "seed": 1602384833, "target": 11, "tier": 0, "level": 1, "rank": "white", "words": [60, 60, 60] }
      }
    },
    {
      "name": "neighbouring days never share a subject",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 120 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 120 },
        { "at": 1788447600000, "day": "2026-09-03", "hour": 10, "words": 120 },
        { "at": 1788534000000, "day": "2026-09-04", "hour": 10, "words": 120 },
        { "at": 1788620400000, "day": "2026-09-05", "hour": 10, "words": 120 },
        { "at": 1788706800000, "day": "2026-09-06", "hour": 10, "words": 120 },
        { "at": 1788793200000, "day": "2026-09-07", "hour": 10, "words": 120 },
        { "at": 1788879600000, "day": "2026-09-08", "hour": 10, "words": 120 },
        { "at": 1788966000000, "day": "2026-09-09", "hour": 10, "words": 120 },
        { "at": 1789052400000, "day": "2026-09-10", "hour": 10, "words": 120 }
      ],
      "expect": {
        "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-02": { "subject": "chrysanthemum", "seed": 4122700270, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-03": { "subject": "boat", "seed": 2890680354, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-04": { "subject": "plum", "seed": 3567752374, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-05": { "subject": "snow", "seed": 2969575384, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-06": { "subject": "willow", "seed": 1602384833, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-07": { "subject": "pine", "seed": 1787535109, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-08": { "subject": "boat", "seed": 1043108896, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-09": { "subject": "moon", "seed": 1227993510, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
        "2026-09-10": { "subject": "maple", "seed": 4058452884, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] }
      }
    },
    {
      "name": "a big typical day caps at the largest size",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788274860000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788274920000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788274980000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275040000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275100000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275160000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275220000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275280000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275340000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275400000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275460000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275520000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275580000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275640000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275700000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275760000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275820000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275880000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788275940000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276000000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276060000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276120000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276180000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276240000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276300000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276360000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276420000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276480000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276540000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276600000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276660000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276720000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276780000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276840000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276900000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788276960000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277020000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277080000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277140000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277200000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277260000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277320000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277380000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277440000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277500000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277560000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277620000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277680000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788277740000, "day": "2026-09-01", "hour": 10, "words": 5 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361260000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361320000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361380000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361440000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361500000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361560000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361620000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361680000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361740000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361800000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361860000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361920000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788361980000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362040000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362100000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362160000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362220000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362280000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362340000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362400000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362460000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362520000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362580000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362640000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362700000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362760000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362820000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362880000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788362940000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363000000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363060000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363120000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363180000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363240000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363300000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363360000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363420000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363480000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363540000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363600000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363660000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363720000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363780000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363840000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363900000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788363960000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788364020000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788364080000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788364140000, "day": "2026-09-02", "hour": 10, "words": 5 },
        { "at": 1788447600000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788447660000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788447720000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788447780000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788447840000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788447900000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788447960000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448020000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448080000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448140000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448200000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448260000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448320000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448380000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448440000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448500000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448560000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448620000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448680000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448740000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448800000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448860000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448920000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788448980000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449040000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449100000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449160000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449220000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449280000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449340000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449400000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449460000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449520000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449580000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449640000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449700000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449760000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449820000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449880000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788449940000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450000000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450060000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450120000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450180000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450240000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450300000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450360000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450420000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450480000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788450540000, "day": "2026-09-03", "hour": 10, "words": 5 },
        { "at": 1788534000000, "day": "2026-09-04", "hour": 10, "words": 5 }
      ],
      "expect": {
        "2026-09-01": {
          "subject": "mountains",
          "seed": 1759609308,
          "target": 6,
          "tier": 0,
          "level": 1,
          "rank": "none",
          "words": [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
          "hour": 10
        },
        "2026-09-02": {
          "subject": "chrysanthemum",
          "seed": 4122700270,
          "target": 6,
          "tier": 0,
          "level": 1,
          "rank": "white",
          "words": [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
          "hour": 10
        },
        "2026-09-03": {
          "subject": "boat",
          "seed": 2890680354,
          "target": 6,
          "tier": 0,
          "level": 1,
          "rank": "white",
          "words": [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
          "hour": 10
        },
        "2026-09-04": { "subject": "waterfall", "seed": 3567752374, "target": 36, "tier": 0, "level": 1, "rank": "white", "words": [5] }
      }
    },
    {
      "name": "the light comes once the painting finishes, from the middle hour",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 3, "words": 30 },
        { "at": 1788274860000, "day": "2026-09-01", "hour": 6, "words": 30 },
        { "at": 1788274920000, "day": "2026-09-01", "hour": 9, "words": 30 },
        { "at": 1788274980000, "day": "2026-09-01", "hour": 12, "words": 30 },
        { "at": 1788275040000, "day": "2026-09-01", "hour": 15, "words": 30 },
        { "at": 1788275100000, "day": "2026-09-01", "hour": 18, "words": 30 },
        { "at": 1788275160000, "day": "2026-09-01", "hour": 21, "words": 30 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 22, "words": 30 },
        { "at": 1788361260000, "day": "2026-09-02", "hour": 23, "words": 30 }
      ],
      "expect": {
        "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [30, 30, 30, 30, 30, 30, 30], "hour": 9 },
        "2026-09-02": { "subject": "chrysanthemum", "seed": 4122700270, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [30, 30] }
      }
    },
    {
      "name": "a transform paints by its spoken words and never counts toward the belt",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 80 },
        { "at": 1788274920000, "day": "2026-09-01", "hour": 10, "words": 900, "kind": "transform", "rawText": "make this more formal please" }
      ],
      "expect": {
        "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [80, 5] }
      }
    },
    {
      "name": "blue belt practice paints with washes",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 1800 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 1800 },
        { "at": 1788447600000, "day": "2026-09-03", "hour": 10, "words": 1800 },
        { "at": 1788534000000, "day": "2026-09-04", "hour": 10, "words": 1800 },
        { "at": 1788620400000, "day": "2026-09-05", "hour": 10, "words": 1800 },
        { "at": 1788706800000, "day": "2026-09-06", "hour": 10, "words": 1800 },
        { "at": 1788793200000, "day": "2026-09-07", "hour": 10, "words": 1800 },
        { "at": 1788879600000, "day": "2026-09-08", "hour": 10, "words": 1800 },
        { "at": 1788966000000, "day": "2026-09-09", "hour": 10, "words": 1800 },
        { "at": 1789052400000, "day": "2026-09-10", "hour": 10, "words": 1800 },
        { "at": 1789138800000, "day": "2026-09-11", "hour": 10, "words": 1800 },
        { "at": 1789225200000, "day": "2026-09-12", "hour": 10, "words": 1800 },
        { "at": 1789311600000, "day": "2026-09-13", "hour": 10, "words": 1800 },
        { "at": 1789398000000, "day": "2026-09-14", "hour": 10, "words": 1800 },
        { "at": 1789484400000, "day": "2026-09-15", "hour": 10, "words": 100 }
      ],
      "expect": {
        "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [1800] },
        "2026-09-02": { "subject": "chrysanthemum", "seed": 4122700270, "target": 6, "tier": 0, "level": 1, "rank": "white-1", "words": [1800] },
        "2026-09-03": { "subject": "boat", "seed": 2890680354, "target": 6, "tier": 0, "level": 1, "rank": "white-1", "words": [1800] },
        "2026-09-04": { "subject": "plum", "seed": 3567752374, "target": 6, "tier": 0, "level": 1, "rank": "white-2", "words": [1800] },
        "2026-09-05": { "subject": "snow", "seed": 2969575384, "target": 6, "tier": 0, "level": 1, "rank": "white-2", "words": [1800] },
        "2026-09-06": { "subject": "willow", "seed": 1602384833, "target": 6, "tier": 0, "level": 1, "rank": "white-2", "words": [1800] },
        "2026-09-07": { "subject": "pine", "seed": 1787535109, "target": 6, "tier": 0, "level": 1, "rank": "white-3", "words": [1800] },
        "2026-09-08": { "subject": "boat", "seed": 1043108896, "target": 6, "tier": 0, "level": 1, "rank": "white-3", "words": [1800] },
        "2026-09-09": { "subject": "moon", "seed": 1227993510, "target": 6, "tier": 0, "level": 1, "rank": "white-3", "words": [1800] },
        "2026-09-10": { "subject": "maple", "seed": 4058452884, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [1800] },
        "2026-09-11": { "subject": "pine", "seed": 4262673254, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [1800] },
        "2026-09-12": { "subject": "snow", "seed": 47689915, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [1800] },
        "2026-09-13": { "subject": "bamboo", "seed": 995007371, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [1800] },
        "2026-09-14": { "subject": "orchid", "seed": 2508751909, "target": 6, "tier": 1, "level": 1, "rank": "blue", "words": [1800] },
        "2026-09-15": { "subject": "willow", "seed": 3455824569, "target": 6, "tier": 1, "level": 1, "rank": "blue", "words": [100] }
      }
    },
    {
      "name": "a hundred thousand words paints at level two",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 5200 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 5200 },
        { "at": 1788447600000, "day": "2026-09-03", "hour": 10, "words": 5200 },
        { "at": 1788534000000, "day": "2026-09-04", "hour": 10, "words": 5200 },
        { "at": 1788620400000, "day": "2026-09-05", "hour": 10, "words": 5200 },
        { "at": 1788706800000, "day": "2026-09-06", "hour": 10, "words": 5200 },
        { "at": 1788793200000, "day": "2026-09-07", "hour": 10, "words": 5200 },
        { "at": 1788879600000, "day": "2026-09-08", "hour": 10, "words": 5200 },
        { "at": 1788966000000, "day": "2026-09-09", "hour": 10, "words": 5200 },
        { "at": 1789052400000, "day": "2026-09-10", "hour": 10, "words": 5200 },
        { "at": 1789138800000, "day": "2026-09-11", "hour": 10, "words": 5200 },
        { "at": 1789225200000, "day": "2026-09-12", "hour": 10, "words": 5200 },
        { "at": 1789311600000, "day": "2026-09-13", "hour": 10, "words": 5200 },
        { "at": 1789398000000, "day": "2026-09-14", "hour": 10, "words": 5200 },
        { "at": 1789484400000, "day": "2026-09-15", "hour": 10, "words": 5200 },
        { "at": 1789570800000, "day": "2026-09-16", "hour": 10, "words": 5200 },
        { "at": 1789657200000, "day": "2026-09-17", "hour": 10, "words": 5200 },
        { "at": 1789743600000, "day": "2026-09-18", "hour": 10, "words": 5200 },
        { "at": 1789830000000, "day": "2026-09-19", "hour": 10, "words": 5200 },
        { "at": 1789916400000, "day": "2026-09-20", "hour": 10, "words": 5200 },
        { "at": 1790002800000, "day": "2026-09-21", "hour": 10, "words": 50 }
      ],
      "expect": {
        "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [5200] },
        "2026-09-02": { "subject": "chrysanthemum", "seed": 4122700270, "target": 6, "tier": 0, "level": 1, "rank": "white-1", "words": [5200] },
        "2026-09-03": { "subject": "boat", "seed": 2890680354, "target": 6, "tier": 0, "level": 1, "rank": "white-1", "words": [5200] },
        "2026-09-04": { "subject": "plum", "seed": 3567752374, "target": 6, "tier": 0, "level": 1, "rank": "white-2", "words": [5200] },
        "2026-09-05": { "subject": "snow", "seed": 2969575384, "target": 6, "tier": 0, "level": 1, "rank": "white-2", "words": [5200] },
        "2026-09-06": { "subject": "willow", "seed": 1602384833, "target": 6, "tier": 0, "level": 1, "rank": "white-3", "words": [5200] },
        "2026-09-07": { "subject": "pine", "seed": 1787535109, "target": 6, "tier": 0, "level": 1, "rank": "white-3", "words": [5200] },
        "2026-09-08": { "subject": "boat", "seed": 1043108896, "target": 6, "tier": 0, "level": 1, "rank": "white-3", "words": [5200] },
        "2026-09-09": { "subject": "moon", "seed": 1227993510, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [5200] },
        "2026-09-10": { "subject": "maple", "seed": 4058452884, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [5200] },
        "2026-09-11": { "subject": "pine", "seed": 4262673254, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [5200] },
        "2026-09-12": { "subject": "snow", "seed": 47689915, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [5200] },
        "2026-09-13": { "subject": "bamboo", "seed": 995007371, "target": 6, "tier": 0, "level": 1, "rank": "white-4", "words": [5200] },
        "2026-09-14": { "subject": "orchid", "seed": 2508751909, "target": 6, "tier": 1, "level": 1, "rank": "blue", "words": [5200] },
        "2026-09-15": { "subject": "willow", "seed": 3455824569, "target": 6, "tier": 1, "level": 1, "rank": "blue", "words": [5200] },
        "2026-09-16": { "subject": "wave", "seed": 1935246989, "target": 6, "tier": 1, "level": 1, "rank": "blue", "words": [5200] },
        "2026-09-17": { "subject": "maple", "seed": 1283723121, "target": 6, "tier": 1, "level": 1, "rank": "blue", "words": [5200] },
        "2026-09-18": { "subject": "lotus", "seed": 3972314363, "target": 6, "tier": 1, "level": 1, "rank": "blue", "words": [5200] },
        "2026-09-19": { "subject": "mountains", "seed": 1174196859, "target": 6, "tier": 1, "level": 1, "rank": "blue", "words": [5200] },
        "2026-09-20": { "subject": "chrysanthemum", "seed": 3659679406, "target": 6, "tier": 1, "level": 2, "rank": "blue-1", "words": [5200] },
        "2026-09-21": { "subject": "moon", "seed": 3497480930, "target": 6, "tier": 1, "level": 2, "rank": "blue-1", "words": [50] }
      }
    },
    {
      "name": "a different install paints different subjects",
      "install": 987654321,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 100 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 100 },
        { "at": 1788447600000, "day": "2026-09-03", "hour": 10, "words": 100 },
        { "at": 1788534000000, "day": "2026-09-04", "hour": 10, "words": 100 },
        { "at": 1788620400000, "day": "2026-09-05", "hour": 10, "words": 100 }
      ],
      "expect": {
        "2026-09-01": { "subject": "bamboo", "seed": 2682745321, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [100] },
        "2026-09-02": { "subject": "boat", "seed": 1098054214, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [100] },
        "2026-09-03": { "subject": "maple", "seed": 672669206, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [100] },
        "2026-09-04": { "subject": "willow", "seed": 4200506758, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [100] },
        "2026-09-05": { "subject": "maple", "seed": 2720587378, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [100] }
      }
    },
    {
      "name": "takes out of order are walked in time order",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788447600000, "day": "2026-09-03", "hour": 10, "words": 30 },
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 30 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 30 }
      ],
      "expect": {
        "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [30] },
        "2026-09-02": { "subject": "chrysanthemum", "seed": 4122700270, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [30] },
        "2026-09-03": { "subject": "boat", "seed": 2890680354, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [30] }
      }
    },
    {
      "name": "a day key that is not one is left out",
      "install": 12345,
      "book": {},
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 50 },
        { "at": 1788361200000, "day": "yesterday", "hour": 9, "words": 20 }
      ],
      "expect": {
        "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [50] }
      }
    },
    {
      "name": "kept days keep their records and refresh their words",
      "install": 777,
      "book": {
        "2026-09-01": { "subject": "plum", "seed": 1774630952, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [50, 60] },
        "2026-09-02": { "subject": "mountains", "seed": 2512009461, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [70] }
      },
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 50 },
        { "at": 1788274860000, "day": "2026-09-01", "hour": 10, "words": 60 },
        { "at": 1788274920000, "day": "2026-09-01", "hour": 10, "words": 65 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 70 }
      ],
      "expect": {
        "2026-09-01": { "subject": "plum", "seed": 1774630952, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [50, 60, 65] },
        "2026-09-02": { "subject": "mountains", "seed": 2512009461, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [70] }
      }
    },
    {
      "name": "a day the log has trimmed keeps the words it had",
      "install": 777,
      "book": {
        "2026-09-01": { "subject": "plum", "seed": 1774630952, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [50, 60] },
        "2026-09-02": { "subject": "mountains", "seed": 2512009461, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [70] }
      },
      "takes": [
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 70 }
      ],
      "expect": {
        "2026-09-01": { "subject": "plum", "seed": 1774630952, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [50, 60] },
        "2026-09-02": { "subject": "mountains", "seed": 2512009461, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [70] }
      }
    },
    {
      "name": "a kept record from before ranks were kept gets one while the log has its day",
      "install": 777,
      "book": {
        "2026-09-01": { "subject": "plum", "seed": 1774630952, "target": 6, "tier": 0, "level": 1, "words": [50, 60] }
      },
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 50 }
      ],
      "expect": {
        "2026-09-01": { "subject": "plum", "seed": 1774630952, "target": 6, "tier": 0, "level": 1, "words": [50, 60], "rank": "none" }
      }
    },
    {
      "name": "a day filled in between kept days is unlike both",
      "install": 31,
      "book": {
        "2026-09-01": { "subject": "lotus", "seed": 3711947572, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [40] },
        "2026-09-03": { "subject": "plum", "seed": 3921332567, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [40] }
      },
      "takes": [
        { "at": 1788274800000, "day": "2026-09-01", "hour": 10, "words": 40 },
        { "at": 1788361200000, "day": "2026-09-02", "hour": 10, "words": 40 },
        { "at": 1788447600000, "day": "2026-09-03", "hour": 10, "words": 40 }
      ],
      "expect": {
        "2026-09-01": { "subject": "lotus", "seed": 3711947572, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [40] },
        "2026-09-02": { "subject": "chrysanthemum", "seed": 573292855, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [40] },
        "2026-09-03": { "subject": "plum", "seed": 3921332567, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [40] }
      }
    },
    {
      "name": "days more than four hundred before the newest are dropped",
      "install": 5,
      "book": {
        "2026-09-01": { "subject": "pine", "seed": 4258914953, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [40] }
      },
      "takes": [
        { "at": 1822921200000, "day": "2027-10-07", "hour": 10, "words": 40 }
      ],
      "expect": {
        "2027-10-07": { "subject": "lotus", "seed": 744950260, "target": 6, "tier": 0, "level": 1, "rank": "none", "words": [40] }
      }
    }
  ],
  "seeds": [
    { "install": 0, "day": "2026-01-01", "seed": 2192910317 },
    { "install": 12345, "day": "2026-10-13", "seed": 957307889 },
    { "install": 4294967295, "day": "2026-12-31", "seed": 2681607026 },
    { "install": 987654321, "day": "2027-02-28", "seed": 2151520438 }
  ],
  "subjects": [
    { "seed": 0, "neighbours": [], "size": 6, "subject": "moon" },
    { "seed": 4242, "neighbours": ["moon", null], "size": 6, "subject": "mountains" },
    { "seed": 99999, "neighbours": ["bamboo", "plum"], "size": 30, "subject": "snow" },
    { "seed": 123456789, "neighbours": [], "size": 36, "subject": "maple" },
    { "seed": 7, "neighbours": ["waterfall", "snow"], "size": 7, "subject": "moon" },
    { "seed": 4294967295, "neighbours": [null, null], "size": 24, "subject": "mountains" }
  ],
  "sizes": [
    { "typical": null, "size": 6 },
    { "typical": 2, "size": 6 },
    { "typical": 6, "size": 6 },
    { "typical": 12.5, "size": 13 },
    { "typical": 13.4, "size": 13 },
    { "typical": 36, "size": 36 },
    { "typical": 140, "size": 36 }
  ],
  "typical": [
    {
      "day": "2026-10-02",
      "counts": { "2026-09-28": [1, 2], "2026-09-29": [1, 2, 3, 4], "2026-09-30": [5], "2026-10-01": [1, 1, 1, 1, 1, 1] },
      "typical": 3
    },
    {
      "day": "2026-10-29",
      "counts": { "2026-09-28": [1, 2], "2026-09-29": [1, 2, 3, 4], "2026-09-30": [5], "2026-10-01": [1, 1, 1, 1, 1, 1] },
      "typical": null
    },
    {
      "day": "2026-10-30",
      "counts": { "2026-09-28": [1, 2], "2026-09-29": [1, 2, 3, 4], "2026-09-30": [5], "2026-10-01": [1, 1, 1, 1, 1, 1] },
      "typical": null
    }
  ],
  "weeks": {
    "book": {
      "2026-09-01": { "subject": "mountains", "seed": 1759609308, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-02": { "subject": "chrysanthemum", "seed": 4122700270, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-03": { "subject": "boat", "seed": 2890680354, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-04": { "subject": "plum", "seed": 3567752374, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-05": { "subject": "snow", "seed": 2969575384, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-06": { "subject": "willow", "seed": 1602384833, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-07": { "subject": "pine", "seed": 1787535109, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-08": { "subject": "boat", "seed": 1043108896, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-09": { "subject": "moon", "seed": 1227993510, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] },
      "2026-09-10": { "subject": "maple", "seed": 4058452884, "target": 6, "tier": 0, "level": 1, "rank": "white", "words": [120] }
    },
    "lines": [
      { "last": "2026-09-07", "line": "7 takes and 840 words" },
      { "last": "2026-09-10", "line": "7 takes and 840 words" },
      { "last": "2026-10-01", "line": "0 takes and 0 words" }
    ]
  },
  "captions": [
    { "subject": "moon", "done": 0, "target": 6, "caption": "a painting, 0 of 6 strokes" },
    { "subject": "moon", "done": 2, "target": 6, "caption": "a painting, 2 of 6 strokes" },
    { "subject": "bamboo", "done": 3, "target": 6, "caption": "bamboo, 3 of 6 strokes" },
    { "subject": "pine", "done": 6, "target": 6, "caption": "pine on a cliff, finished" },
    { "subject": "lotus", "done": 7, "target": 6, "caption": "lotus pond, finished, and 1 stroke more" },
    { "subject": "snow", "done": 9, "target": 6, "caption": "snowfall, finished, and 3 strokes more" }
  ],
  "lines": [
    { "words": [1], "longestMs": null, "line": "1 take, 1 words." },
    { "words": [10, 20, 3000], "longestMs": 125000, "line": "3 takes, 3,030 words. The longest ran 2:05." },
    { "words": [5, 5], "longestMs": 0, "line": "2 takes, 10 words." },
    {
      "words": [
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1
      ],
      "longestMs": 3599000,
      "line": "1,200 takes, 1,200 words. The longest ran 59:59."
    }
  ]
}
```

`src/shared/painting-vectors.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/painting-vectors.json through the painting book and its
// words. MurmurCore runs the same file, so a change to either side breaks
// both platforms or neither (ios/prd.json IOS-019).
import { describe, expect, it } from 'vitest'
import ranks from '../../shared/ranks.json'
import vectors from '../../shared/painting-vectors.json'
import { paintingCaption, paintingLine } from '../renderer/settings/painting'
import type { SessionEvent } from './history'
import { type PaintingBook, type SubjectId, paintingSeed, paintingSize, pickSubject, syncPaintings, typicalTakes, weekLine } from './painting'
import type { RankSpec } from './ranks'

const LADDER = (ranks as { ranks: RankSpec[] }).ranks

interface Take {
  at: number
  day: string
  hour: number
  words: number
  kind?: 'transform'
  rawText?: string
}

const event = (t: Take): SessionEvent =>
  ({ at: t.at, durationMs: 1000, rawText: t.rawText ?? '', finalText: '', words: t.words, wpm: 0, day: t.day, hour: t.hour, ...(t.kind ? { kind: t.kind } : {}) }) as SessionEvent

describe('shared/painting-vectors.json', () => {
  for (const c of vectors.cases as unknown as { name: string; install: number; book: PaintingBook; takes: Take[]; expect: PaintingBook }[]) {
    it(c.name, () => {
      expect(syncPaintings(c.book, c.takes.map(event), c.install, LADDER)).toEqual(c.expect)
    })
  }

  it('seeds, subjects, sizes, and typical days', () => {
    for (const s of vectors.seeds) expect(paintingSeed(s.install, s.day)).toBe(s.seed)
    for (const s of vectors.subjects) expect(pickSubject(s.seed, s.neighbours as (SubjectId | null)[], s.size)).toBe(s.subject)
    for (const s of vectors.sizes) expect(paintingSize(s.typical)).toBe(s.size)
    for (const t of vectors.typical) expect(typicalTakes(new Map(Object.entries(t.counts)), t.day)).toBe(t.typical)
  })

  it('the words', () => {
    for (const w of vectors.weeks.lines) expect(weekLine(vectors.weeks.book as unknown as PaintingBook, w.last)).toBe(w.line)
    for (const c of vectors.captions) expect(paintingCaption(c.subject as SubjectId, c.done, c.target)).toBe(c.caption)
    for (const l of vectors.lines) expect(paintingLine(l.words, l.longestMs)).toBe(l.line)
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/shared/painting-vectors.test.ts`
Expected: 19 pass. Then `npm run test` passes 976.

- [ ] **Step 3: Run the gates and commit**

```bash
git add shared/painting-vectors.json src/shared/painting-vectors.test.ts
git commit -m "IOS-019: desktop's painting a day on shared takes, for both platforms to run"
```

### Task 2: The painting book in MurmurCore

**Files:** Create `ios/MurmurCore/Sources/MurmurCore/Paintings.swift`. Test `ios/MurmurCore/Tests/MurmurCoreTests/PaintingVectorTests.swift`.

**Interfaces:**
- Produces `PaintingSubject` (with `name`), `PaintingRecord` (Codable and Hashable, read back as desktop's asRecord reads), `PaintingBook`, and `PaintingEvent(at:day:hour:strokeWords:counts:words:)`.
- Produces `Paintings`: `minStrokes`, `maxStrokes`, `keepDays`, `maxExtra`, `isDayKey`, `tier(for:)`, `shiftDay`, `takesByDay`, `hoursByDay`, `paintingHour`, `typicalTakes`, `paintingSize`, `seed(install:day:)`, `pickSubject`, `practiceRank`, `sealBelt`, `sync(_:events:install:ladder:)`, `weekOf`, `weekLine`, `progress`, `caption`, `line`, and `duration`.

- [ ] **Step 1: Write the failing test**

`ios/MurmurCore/Tests/MurmurCoreTests/PaintingVectorTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/painting-vectors.json: desktop's painting a day on fixed takes.
struct PaintingVectors: Decodable {
    struct Take: Decodable {
        let at: Int64
        let day: String
        let hour: Int
        let words: Int
        let kind: String?
        let rawText: String?

        /// As desktop weighs it: a transform paints by its spoken words and
        /// never counts toward the belts.
        var event: PaintingEvent {
            let transform = kind == "transform"
            let spoken = (rawText ?? "").split(whereSeparator: \.isWhitespace).count
            return PaintingEvent(at: at, day: day, hour: hour, strokeWords: transform ? spoken : words, counts: !transform, words: words)
        }
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let install: UInt32
        let book: PaintingBook
        let takes: [Take]
        let expect: PaintingBook

        var testDescription: String { name }
    }

    struct Seed: Decodable {
        let install: UInt32
        let day: String
        let seed: UInt32
    }

    struct Subject: Decodable {
        let seed: UInt32
        let neighbours: [PaintingSubject?]
        let size: Int
        let subject: PaintingSubject
    }

    struct Size: Decodable {
        let typical: Double?
        let size: Int
    }

    struct Typical: Decodable {
        let day: String
        let counts: [String: [Int]]
        let typical: Double?
    }

    struct Weeks: Decodable {
        struct Line: Decodable {
            let last: String
            let line: String
        }

        let book: PaintingBook
        let lines: [Line]
    }

    struct Caption: Decodable {
        let subject: PaintingSubject
        let done: Int
        let target: Int
        let caption: String
    }

    struct Line: Decodable {
        let words: [Int]
        let longestMs: Int?
        let line: String
    }

    let cases: [Case]
    let seeds: [Seed]
    let subjects: [Subject]
    let sizes: [Size]
    let typical: [Typical]
    let weeks: Weeks
    let captions: [Caption]
    let lines: [Line]

    static let file: PaintingVectors? = try? SharedData(directory: repoShared).decode(PaintingVectors.self, from: "painting-vectors.json")
    static let ladder: [RankSpec]? = (try? SharedData(directory: repoShared).decode(RanksFile.self, from: "ranks.json"))?.ranks
}

@Suite struct PaintingVectorTests {
    @Test func theVectorsLoad() throws {
        let file = try #require(PaintingVectors.file)
        #expect(file.cases.count >= 15)
    }

    @Test(arguments: PaintingVectors.file?.cases ?? [])
    func eachBookIsDesktops(_ vector: PaintingVectors.Case) throws {
        let ladder = try #require(PaintingVectors.ladder)
        let book = Paintings.sync(vector.book, events: vector.takes.map(\.event), install: vector.install, ladder: ladder)
        #expect(book.keys.sorted() == vector.expect.keys.sorted())
        for (day, record) in vector.expect {
            #expect(book[day] == record, "\(day)")
        }
    }

    @Test func seedsSubjectsAndSizesAreDesktops() throws {
        let file = try #require(PaintingVectors.file)
        for seed in file.seeds {
            #expect(Paintings.seed(install: seed.install, day: seed.day) == seed.seed, "\(seed.install) \(seed.day)")
        }
        for subject in file.subjects {
            #expect(Paintings.pickSubject(subject.seed, neighbours: subject.neighbours, size: subject.size) == subject.subject, "\(subject.seed)")
        }
        for size in file.sizes {
            #expect(Paintings.paintingSize(size.typical) == size.size, "\(String(describing: size.typical))")
        }
        for typical in file.typical {
            #expect(Paintings.typicalTakes(typical.counts, day: typical.day) == typical.typical, "\(typical.day)")
        }
    }

    @Test func theWordsAreDesktops() throws {
        let file = try #require(PaintingVectors.file)
        for week in file.weeks.lines {
            #expect(Paintings.weekLine(file.weeks.book, last: week.last) == week.line)
        }
        for caption in file.captions {
            #expect(Paintings.caption(caption.subject, done: caption.done, target: caption.target) == caption.caption)
        }
        for line in file.lines {
            #expect(Paintings.line(line.words, longestMs: line.longestMs) == line.line)
        }
    }

    /// Days across a month, a year, and a leap day, as desktop shifts them.
    @Test func daysShiftAcrossTheCalendar() {
        #expect(Paintings.shiftDay("2026-01-31", 1) == "2026-02-01")
        #expect(Paintings.shiftDay("2026-12-31", 1) == "2027-01-01")
        #expect(Paintings.shiftDay("2028-03-01", -1) == "2028-02-29")
        #expect(Paintings.shiftDay("2026-10-13", -400) == "2025-09-08")
    }

    /// A record read back keeps what is sound and drops what is not.
    @Test func aRecordReadBackIsChecked() throws {
        let good = #"{"subject":"moon","seed":4294967295,"target":6,"tier":0,"level":1,"rank":"Not A Rank","hour":31,"words":[3,4]}"#
        let record = try JSONDecoder().decode(PaintingRecord.self, from: Data(good.utf8))
        #expect(record.rank == nil && record.hour == nil && record.words == [3, 4])
        for bad in [
            #"{"subject":"sun","seed":1,"target":6,"tier":0,"level":1,"words":[]}"#,
            #"{"subject":"moon","seed":1,"target":5,"tier":0,"level":1,"words":[]}"#,
            #"{"subject":"moon","seed":1,"target":6,"tier":5,"level":1,"words":[]}"#,
            #"{"subject":"moon","seed":-1,"target":6,"tier":0,"level":1,"words":[]}"#,
            #"{"subject":"moon","seed":1,"target":6,"tier":0,"level":1,"words":[-2]}"#
        ] {
            #expect(throws: (any Error).self) { try JSONDecoder().decode(PaintingRecord.self, from: Data(bad.utf8)) }
        }
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore`
Expected: the build fails with `cannot find type 'PaintingBook' in scope`.

- [ ] **Step 3: Port the book**

`ios/MurmurCore/Sources/MurmurCore/Paintings.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// A painting a day (ios/prd.json IOS-019), as data, as desktop's
// src/shared/painting.ts keeps it: each day gets a subject, a seed, and a
// size near a typical day's takes; every take adds the next stroke; the
// tier (how rich the brushwork is) and the level are fixed when the day's
// first take lands, so a promotion never repaints a day already begun.
// The book holds word counts, never text. shared/painting-vectors.json
// keeps both platforms equal.
import Foundation

public enum PaintingSubject: String, Codable, CaseIterable, Sendable {
    // Desktop's order: a seed picks by place in it.
    case moon, bamboo, plum, mountains, pine, orchid, chrysanthemum, lotus, waterfall, willow, boat, wave, maple, snow

    public var name: String {
        switch self {
        case .moon: "moon over water"
        case .bamboo: "bamboo"
        case .plum: "plum branch"
        case .mountains: "mountains"
        case .pine: "pine on a cliff"
        case .orchid: "orchid"
        case .chrysanthemum: "chrysanthemum"
        case .lotus: "lotus pond"
        case .waterfall: "waterfall"
        case .willow: "willow by the water"
        case .boat: "boat on the river"
        case .wave: "breaking wave"
        case .maple: "maple branch"
        case .snow: "snowfall"
        }
    }

    /// The sizes it paints well at: a few quiet subjects stop before their
    /// water or leaves crowd, and the waterfall needs a few strokes.
    var sizes: ClosedRange<Int> {
        switch self {
        case .moon, .boat: 6...24
        case .orchid, .wave: 6...30
        case .waterfall: 8...36
        default: 6...36
        }
    }
}

public struct PaintingRecord: Codable, Hashable, Sendable {
    public var subject: PaintingSubject
    public var seed: UInt32
    /// Strokes to finish, fixed when the day's first take lands.
    public var target: Int
    /// How rich the brushwork is (0 white belt to 4 black belt and up).
    public var tier: Int
    /// The level, which adds a bird or two.
    public var level: Int
    /// The practice rank's id at the day's first take.
    public var rank: String?
    /// The painting's light: the middle local hour of its first `target`
    /// takes, once it has that many.
    public var hour: Int?
    /// Each take's word count, in the order spoken. Never its text.
    public var words: [Int]

    public init(subject: PaintingSubject, seed: UInt32, target: Int, tier: Int, level: Int, rank: String?, hour: Int?, words: [Int]) {
        self.subject = subject
        self.seed = seed
        self.target = target
        self.tier = tier
        self.level = level
        self.rank = rank
        self.hour = hour
        self.words = words
    }

    private enum Keys: String, CodingKey { case subject, seed, target, tier, level, rank, hour, words }

    /// A record read back from disk, as desktop's asRecord reads one: one
    /// that is not a record fails, a rank or hour that is not one is left out.
    public init(from decoder: any Decoder) throws {
        let box = try decoder.container(keyedBy: Keys.self)
        subject = try box.decode(PaintingSubject.self, forKey: .subject)
        seed = try box.decode(UInt32.self, forKey: .seed)
        target = try box.decode(Int.self, forKey: .target)
        tier = try box.decode(Int.self, forKey: .tier)
        level = try box.decode(Int.self, forKey: .level)
        words = try box.decode([Int].self, forKey: .words)
        let bad = DecodingError.dataCorruptedError(forKey: .words, in: box, debugDescription: "not a painting record")
        guard Paintings.minStrokes...Paintings.maxStrokes ~= target, 0...4 ~= tier, 1...100_000 ~= level,
              words.count <= 10_000, words.allSatisfy({ 0...1_000_000 ~= $0 })
        else { throw bad }
        let rank = (try? box.decodeIfPresent(String.self, forKey: .rank)) ?? nil
        self.rank = rank.flatMap { $0.range(of: #"^[a-z0-9-]{1,32}$"#, options: .regularExpression) != nil ? $0 : nil }
        let hour = (try? box.decodeIfPresent(Int.self, forKey: .hour)) ?? nil
        self.hour = hour.flatMap { 0...23 ~= $0 ? $0 : nil }
    }

    public func encode(to encoder: any Encoder) throws {
        var box = encoder.container(keyedBy: Keys.self)
        try box.encode(subject, forKey: .subject)
        try box.encode(seed, forKey: .seed)
        try box.encode(target, forKey: .target)
        try box.encode(tier, forKey: .tier)
        try box.encode(level, forKey: .level)
        try box.encodeIfPresent(rank, forKey: .rank)
        try box.encodeIfPresent(hour, forKey: .hour)
        try box.encode(words, forKey: .words)
    }
}

/// Paintings by day key.
public typealias PaintingBook = [String: PaintingRecord]

/// One take as the painting sees it: its time, its local day and hour, the
/// words it paints with, and whether (and with what words) it counts
/// toward the belts.
public struct PaintingEvent: Sendable, Equatable {
    /// Epoch milliseconds.
    public let at: Int64
    public let day: String
    public let hour: Int
    /// The stroke's weight in words.
    public let strokeWords: Int
    /// Whether it counts toward the belts (desktop's transforms do not).
    public let counts: Bool
    /// Its words toward the belts.
    public let words: Int

    public init(at: Int64, day: String, hour: Int, strokeWords: Int, counts: Bool = true, words: Int? = nil) {
        self.at = at
        self.day = day
        self.hour = hour
        self.strokeWords = strokeWords
        self.counts = counts
        self.words = words ?? strokeWords
    }
}

public enum Paintings {
    /// The smallest painting (also the size before there is a typical day).
    public static let minStrokes = 6
    /// The largest: past this a day's painting is finished.
    public static let maxStrokes = 36
    /// How far back the book keeps paintings, in calendar days.
    public static let keepDays = 400
    /// The strokes a finished painting keeps adding, one per take.
    public static let maxExtra = 60
    /// Home's typical day: the days it looks back over, and the active days
    /// it needs among them (desktop's analytics).
    static let typicalWindowDays = 28
    static let typicalMinDays = 3

    public static func isDayKey(_ day: String) -> Bool {
        day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    /// The brushwork tier a belt paints at.
    public static func tier(for belt: String) -> Int {
        switch belt {
        case "none", "white": 0
        case "blue": 1
        case "purple": 2
        case "brown": 3
        default: 4
        }
    }

    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }()

    /// The day key `offset` days from `day` (negative is earlier).
    public static func shiftDay(_ day: String, _ offset: Int) -> String {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2] + offset)) else { return day }
        let out = utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", out.year ?? 0, out.month ?? 0, out.day ?? 0)
    }

    /// Takes in time order, equal times kept in the order given.
    private static func inOrder(_ events: [PaintingEvent]) -> [PaintingEvent] {
        events.enumerated().sorted { $0.element.at != $1.element.at ? $0.element.at < $1.element.at : $0.offset < $1.offset }.map(\.element)
    }

    /// Each day's takes, as stroke words in the order spoken.
    public static func takesByDay(_ events: [PaintingEvent]) -> [String: [Int]] {
        var byDay: [String: [Int]] = [:]
        for event in inOrder(events) where isDayKey(event.day) {
            byDay[event.day, default: []].append(max(0, event.strokeWords))
        }
        return byDay
    }

    /// Each day's takes as local hours, in the order spoken.
    public static func hoursByDay(_ events: [PaintingEvent]) -> [String: [Int]] {
        var byDay: [String: [Int]] = [:]
        for event in inOrder(events) where isDayKey(event.day) {
            byDay[event.day, default: []].append(event.hour)
        }
        return byDay
    }

    /// The middle hour of the first `target` takes (the lower of the two
    /// middles on an even count), or nil with fewer takes than that.
    public static func paintingHour(_ hours: [Int], target: Int) -> Int? {
        guard target >= 1, hours.count >= target else { return nil }
        return hours.prefix(target).sorted()[(target - 1) >> 1]
    }

    /// The median number of takes on the active days in the window before
    /// `day`, or nil with fewer active days than a typical day needs.
    public static func typicalTakes(_ byDay: [String: [Int]], day: String) -> Double? {
        var counts: [Int] = []
        for back in 1...typicalWindowDays {
            let n = byDay[shiftDay(day, -back)]?.count ?? 0
            if n > 0 { counts.append(n) }
        }
        guard counts.count >= typicalMinDays else { return nil }
        counts.sort()
        let mid = counts.count >> 1
        return counts.count % 2 == 1 ? Double(counts[mid]) : Double(counts[mid - 1] + counts[mid]) / 2
    }

    /// A day's size: a typical day's takes, within the smallest and largest.
    public static func paintingSize(_ typical: Double?) -> Int {
        guard let typical else { return minStrokes }
        // JavaScript's Math.round: halves round up.
        let rounded = Int((typical + 0.5).rounded(.down))
        return max(minStrokes, min(maxStrokes, rounded))
    }

    /// A day's seed, mixed with this install's own, as desktop mixes it.
    public static func seed(install: UInt32, day: String) -> UInt32 {
        var h = install ^ 0x9e37_79b9
        for unit in day.utf16 {
            h = (h ^ UInt32(unit)) &* 0x0100_0193
        }
        h ^= h >> 15
        h = h &* 0x2c1b_3c6d
        return h ^ (h >> 12)
    }

    /// The day's subject: picked by its seed among those that suit its
    /// size, never the subject of the painted day on either side of it.
    public static func pickSubject(_ seed: UInt32, neighbours: [PaintingSubject?], size: Int = minStrokes) -> PaintingSubject {
        let fits = PaintingSubject.allCases.filter { $0.sizes ~= size }
        let fresh = fits.filter { subject in !neighbours.contains(subject) }
        let pool = !fresh.isEmpty ? fresh : !fits.isEmpty ? fits : PaintingSubject.allCases
        return pool[Int(seed >> 3) % pool.count]
    }

    /// The rank words and days alone have earned (the founder's included).
    public static func practiceRank(_ ladder: [RankSpec], words: Int, days: Int) -> RankSpec? {
        var best: RankSpec?
        for rank in ladder {
            guard rank.founderOnly != true, let need = rank.words, let needDays = rank.activeDays else { continue }
            if words >= need, days >= needDays { best = rank }
        }
        return best
    }

    /// The belt a painting's seal is colored in: the belt of the rank its
    /// first take was made at; nil before the first belt (the ember seal).
    public static func sealBelt(_ rank: String?, ladder: [RankSpec]) -> String? {
        guard let rank, rank != "none", let belt = ladder.first(where: { $0.id == rank })?.belt, belt != "none" else { return nil }
        return belt
    }

    /// Brings the book up to date with the takes, as desktop's
    /// syncPaintings does: every day gets a record, made in date order, with
    /// the size, tier, and level as of its first take, and a subject unlike
    /// the painted days on either side. A day's words are refreshed from
    /// the takes unless they hold fewer than the record. Days more than
    /// keepDays before the newest are dropped.
    public static func sync(_ book: PaintingBook, events: [PaintingEvent], install: UInt32, ladder: [RankSpec]) -> PaintingBook {
        func own(_ day: String) -> PaintingRecord? { isDayKey(day) ? book[day] : nil }
        let byDay = takesByDay(events)
        let hours = hoursByDay(events)
        func withHour(_ record: PaintingRecord, _ day: String) -> PaintingRecord {
            var record = record
            record.hour = paintingHour(hours[day] ?? [], target: record.target)
            return record
        }
        var rankWords: [String: Int] = [:]
        var firstWords: [String: Int] = [:]
        for event in inOrder(events) where isDayKey(event.day) && event.counts {
            let words = max(0, event.words)
            if firstWords[event.day] == nil { firstWords[event.day] = words }
            rankWords[event.day, default: 0] += words
        }
        let days = Set(book.keys.filter { own($0) != nil }).union(byDay.keys).sorted()
        var words = 0
        var activeDays = 0
        var next: PaintingBook = [:]
        var before: PaintingSubject?
        for (index, day) in days.enumerated() {
            let logged = byDay[day]
            let first = firstWords[day] ?? 0
            let rankThen = practiceRank(ladder, words: words + first, days: activeDays + (rankWords[day] != nil ? 1 : 0))
            if var kept = own(day) {
                // A record from before ranks were kept gets one while the
                // takes still have its day.
                if kept.rank == nil, logged != nil { kept.rank = rankThen?.id ?? "none" }
                if let logged, logged.count >= kept.words.count {
                    kept.words = logged
                    next[day] = withHour(kept, day)
                } else {
                    next[day] = kept
                }
            } else if let logged {
                let seed = seed(install: install, day: day)
                let target = paintingSize(typicalTakes(byDay, day: day))
                // A day filled in between kept days is unlike both.
                let after = days[(index + 1)...].lazy.compactMap(own).first?.subject
                let record = PaintingRecord(
                    subject: pickSubject(seed, neighbours: [before, after], size: target),
                    seed: seed,
                    target: target,
                    tier: tier(for: rankThen?.belt ?? "none"),
                    level: Ranks.level(for: words + first),
                    rank: rankThen?.id ?? "none",
                    hour: nil,
                    words: logged
                )
                next[day] = withHour(record, day)
            }
            before = next[day]?.subject ?? before
            if let dayWords = rankWords[day] {
                words += dayWords
                activeDays += 1
            }
        }
        guard let newest = days.last else { return [:] }
        let cutoff = shiftDay(newest, -keepDays)
        return next.filter { $0.key > cutoff }
    }

    /// The seven days ending on `last`, oldest first: a week's scroll.
    public static func weekOf(_ last: String) -> [String] {
        (0..<7).map { shiftDay(last, $0 - 6) }
    }

    /// A week's numbers for its scroll: the paintings it finished, from how
    /// many takes and words.
    public static func weekLine(_ book: PaintingBook, last: String) -> String {
        let records = weekOf(last).compactMap { book[$0] }
        let takes = records.reduce(0) { $0 + $1.words.count }
        let words = records.reduce(0) { $0 + $1.words.reduce(0, +) }
        let finished = records.filter { $0.words.count >= $0.target }.count
        let said = "\(takes.formatted()) \(takes == 1 ? "take" : "takes") and \(words.formatted()) \(words == 1 ? "word" : "words")"
        return finished > 0 ? "\(finished) \(finished == 1 ? "painting" : "paintings") finished from \(said)" : said
    }

    /// How far a painting has got: its strokes so far (past its size, the
    /// strokes a finished painting keeps adding) and whether it is finished.
    public static func progress(_ record: PaintingRecord) -> (done: Int, finished: Bool) {
        (min(record.words.count, record.target + maxExtra), record.words.count >= record.target)
    }

    /// The painting's caption, as desktop words it.
    public static func caption(_ subject: PaintingSubject, done: Int, target: Int) -> String {
        let more = done - target
        if more > 0 { return "\(subject.name), finished, and \(more) \(more == 1 ? "stroke" : "strokes") more" }
        if done >= target { return "\(subject.name), finished" }
        let so = "\(done) of \(target) strokes"
        return done < 3 ? "a painting, \(so)" : "\(subject.name), \(so)"
    }

    /// The line under a finished painting, from the day's own numbers.
    public static func line(_ words: [Int], longestMs: Int?) -> String {
        let total = words.reduce(0, +)
        let said = "\(words.count.formatted()) \(words.count == 1 ? "take" : "takes"), \(total.formatted()) words."
        guard let longestMs, longestMs > 0 else { return said }
        return "\(said) The longest ran \(duration(longestMs))."
    }

    /// Minutes and seconds, as desktop's formatDuration writes them.
    public static func duration(_ ms: Int) -> String {
        let seconds = max(0, ms / 1000)
        return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: 123 tests pass (1 known issue on purpose).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/Paintings.swift ios/MurmurCore/Tests/MurmurCoreTests/PaintingVectorTests.swift
git commit -m "IOS-019: MurmurCore keeps the painting book as desktop does, on every shared case"
```

### Task 3: Desktop's day helpers in one module

**Files:** Create `src/renderer/settings/paintingDay.ts` and `paintingDay.test.ts`. Modify `src/renderer/settings/WrapUpView.tsx`.

**Interfaces:** Produces, from `paintingDay.ts`:
- `dayColors()`, `progressOf(record)`, `planFor(record)`, `painterOf(record)`, `lightOf(record, plan)`, and `sealOf(record)`;
- `longDate(day)`, `shortDay(day)`, and `cardFonts(display | null)`;
- `drawDayCard(ctx, day, record, colors, longestMs, fonts)` and `drawWeekScroll(ctx, last, book, colors, fonts)`.

Desktop's behavior does not change: the wrap-up imports what it defined itself.

- [ ] **Step 1: Write the failing test**

`src/renderer/settings/paintingDay.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { PaintingRecord } from '../../shared/painting'
import { MAX_EXTRA } from './painting'
import { lightOf, painterOf, planFor, progressOf, sealOf } from './paintingDay'

// A day's painting as both platforms show it (ios/prd.json IOS-019): the
// wrap-up and the iPhone's painter page draw from these.
describe('a day as both platforms show it', () => {
  const record: PaintingRecord = { subject: 'lotus', seed: 99, target: 6, tier: 0, level: 1, rank: 'white-1', hour: 20, words: [10, 20, 30, 40, 50, 60, 70] }

  it('counts its strokes, finishing at its size and keeping a few past it', () => {
    expect(progressOf(record)).toEqual({ done: 7, finished: true })
    expect(progressOf({ ...record, words: [1, 2] })).toEqual({ done: 2, finished: false })
    expect(progressOf({ ...record, words: Array(200).fill(1) }).done).toBe(6 + MAX_EXTRA)
  })

  it('names who painted it, and its light once it is finished', () => {
    expect(painterOf(record)).toBe('painted at white belt, one stripe, level 1, at dusk')
    expect(painterOf({ ...record, words: [1] })).toBe('painted at white belt, one stripe, level 1')
    expect(painterOf({ ...record, rank: 'none' })).toBe('painted before the first belt, level 1, at dusk')
  })

  it('plans more for each take past its size', () => {
    expect(planFor(record).length).toBeGreaterThan(planFor({ ...record, words: record.words.slice(0, 6) }).length)
  })

  it('takes its light and its seal once finished, the seal in its belt', () => {
    expect(lightOf(record, planFor(record))).toBeDefined()
    expect(lightOf({ ...record, words: [1] }, planFor(record))).toBeUndefined()
    expect(sealOf(record)).toBeDefined()
    expect(sealOf({ ...record, rank: 'none' })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/renderer/settings/paintingDay.test.ts`
Expected: it fails to load: `./paintingDay` does not exist.

- [ ] **Step 3: Move the helpers**

`src/renderer/settings/paintingDay.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// A day's painting as both platforms show it (US-098; ios/prd.json
// IOS-019): its plan, how far it got, its seal, its light, who painted it,
// and the saved card and week scroll drawn onto a canvas. Desktop's
// wrap-up and the iPhone's painter page both draw from here.
import cosmeticsFile from '../../../shared/cosmetics.json'
import ranksFile from '../../../shared/ranks.json'
import { type PaintingBook, type PaintingRecord, SUBJECT_NAMES, sealBelt, weekLine, weekOf } from '../../shared/painting'
import type { RankSpec } from '../../shared/ranks'
import { tokenColor } from '../brush'
import { journeyColors, sealPaint } from './journeyPaint'
import { LIGHT_WORDS, lightFor, planLight } from './paintLight'
import {
  type Gesture,
  MAX_EXTRA,
  type PaintingColors,
  type ScrollDay,
  type SealColor,
  paintPaintingCard,
  paintingColors,
  paintingLine,
  paintWeekScroll,
  planPainting
} from './painting'

const BELT_HEX = (cosmeticsFile as { beltColors: Record<string, string> }).beltColors
const LADDER = (ranksFile as { ranks: RankSpec[] }).ranks

/** The colors a day's painting paints with, on the panel. */
export function dayColors(): PaintingColors {
  const c = journeyColors(BELT_HEX)
  return paintingColors(tokenColor('--panel', [23, 22, 27]), c.rice, c.ember, c.gold)
}

/** How far a painting has got: its strokes so far (past its size, the
 *  strokes a finished painting keeps adding) and whether it is finished. */
export function progressOf(record: PaintingRecord): { done: number; finished: boolean } {
  return { done: Math.min(record.words.length, record.target + MAX_EXTRA), finished: record.words.length >= record.target }
}

/** A day's whole plan: its strokes, then what each take past its size
 *  added, from that take's words. */
export function planFor(record: PaintingRecord): Gesture[] {
  const { subject, seed, target, tier, level } = record
  return planPainting({ subject, seed, target, tier, level }, record.words.slice(target, target + MAX_EXTRA))
}

/** The rank and level a day was painted at, for its card, and its light
 *  once it has one: white belt, one stripe, level 1, by moonlight.
 *  Records from before ranks were kept name the level. */
export function painterOf(record: PaintingRecord): string {
  const light = record.hour !== undefined && record.words.length >= record.target ? `, ${LIGHT_WORDS[lightFor(record.hour)]}` : ''
  if (record.rank === 'none') return `painted before the first belt, level ${record.level}${light}`
  const rank = LADDER.find((r) => r.id === record.rank)
  return `${rank ? `painted at ${rank.label}, level` : 'painted at level'} ${record.level}${light}`
}

/** A finished painting's light (US-100), from the hour its takes were
 *  made in; none before it finishes. */
export function lightOf(record: PaintingRecord, plan: readonly Gesture[]): Gesture | undefined {
  if (record.hour === undefined || record.words.length < record.target) return undefined
  return planLight(plan, record.target, record.seed, record.tier, record.hour)
}

/** The seal's color (US-101): the belt the day was painted at, as paint
 *  on the night ground, the coral belts in their two colors; undefined
 *  keeps the ember seal (before the first belt, or a record from before
 *  ranks were kept). */
export function sealOf(record: PaintingRecord): SealColor | undefined {
  const belt = sealBelt(record.rank, LADDER)
  return belt ? sealPaint(belt, journeyColors(BELT_HEX)) : undefined
}

/** A day's key as words: Friday, October 9. */
export function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

/** A day's key as its short weekday: Fri. */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short' })
}

/** The fonts a saved card draws with: the display face (its family name)
 *  when it loaded, else a condensed system face. */
export function cardFonts(display: string | null): { display: string; body: string; mono: string } {
  const css = getComputedStyle(document.documentElement)
  const body = css.getPropertyValue('--font-body').trim() || 'sans-serif'
  return {
    display: display ? `"${display}", ${body}` : `"Arial Narrow", "Helvetica Neue", ${body}`,
    body,
    mono: css.getPropertyValue('--font-mono').trim() || 'monospace'
  }
}

/**
 * A day's portrait card (CARD, saved at twice its size): the painting as
 * it stands, its name, how far it got, the date, and the wordmark, drawn
 * on `ctx`, already scaled.
 */
export function drawDayCard(
  ctx: CanvasRenderingContext2D,
  day: string,
  record: PaintingRecord,
  colors: PaintingColors,
  longestMs: number | null,
  fonts: { display: string; body: string; mono: string }
): void {
  const { subject, seed, target } = record
  const plan = planFor(record)
  const { done, finished } = progressOf(record)
  const c = journeyColors(BELT_HEX)
  const more = done - target
  paintPaintingCard(
    ctx,
    plan,
    record.words,
    colors,
    { text: c.text, dim: c.dim },
    fonts,
    {
      date: longDate(day),
      // The subject stays a surprise until its third stroke here too.
      title: done < 3 ? 'a painting' : SUBJECT_NAMES[subject],
      caption: finished ? `finished in ${target} strokes${more > 0 ? `, and ${more} more` : ''}` : `${done} of ${target} strokes so far`,
      line: finished ? paintingLine(record.words, longestMs) : null,
      painter: painterOf(record)
    },
    { done, finished, seed, sealColor: sealOf(record), light: lightOf(record, plan) }
  )
}

/**
 * The week's scroll (US-102, SCROLL, saved at twice its size): the seven
 * days ending on `last` side by side, each painting as it stands with its
 * seal and light, a day without takes as one dry mark, and the week's
 * numbers, drawn on `ctx`, already scaled.
 */
export function drawWeekScroll(
  ctx: CanvasRenderingContext2D,
  last: string,
  book: PaintingBook,
  colors: PaintingColors,
  fonts: { display: string; body: string; mono: string }
): void {
  const week = weekOf(last)
  const days: ScrollDay[] = week.map((day) => {
    const record = Object.hasOwn(book, day) ? book[day] : null
    if (!record) return { day: shortDay(day), caption: 'a day off', painting: null }
    const plan = planFor(record)
    const { done, finished } = progressOf(record)
    return {
      day: shortDay(day),
      caption: finished ? SUBJECT_NAMES[record.subject] : `${done} of ${record.target}`,
      painting: { plan, words: record.words, opts: { done, seal: finished ? 1 : 0, seed: record.seed, sealColor: sealOf(record), light: lightOf(record, plan) } }
    }
  })
  const [y, m, d] = week[0].split('-').map(Number)
  const title = `the week of ${new Date(y, m - 1, d).toLocaleDateString([], { month: 'long', day: 'numeric' })}`
  const c = journeyColors(BELT_HEX)
  paintWeekScroll(ctx, days, colors, { text: c.text, dim: c.dim }, fonts, { title, numbers: weekLine(book, last) })
}
```

In `WrapUpView.tsx`, replace everything from the first `import` line through the end of `saveWeekScroll` (just before `/** An earlier day's painting, opened large from the strip`) with:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalyticsSummary } from '../../shared/analytics'
import { countsTowardStats, dayKey, eventDay, type SessionEvent } from '../../shared/history'
import { type PaintingBook, type PaintingRecord, SUBJECT_NAMES, shiftDay, weekOf } from '../../shared/painting'
import { formatMinutesBack } from '../../shared/timeback'
import type { SettingsApi } from '../../preload/settings'
import { PageTitle, useToday } from './PageTitle'
import { PaintCanvas } from './PaintCanvas'
import { daySummary } from './dayPaint'
import { EmptyState } from './EmptyState'
import { DISPLAY, loadDisplayFace } from './ShareCard'
import { CARD, SCROLL, MAX_EXTRA, type PaintingColors, paintPainting, paintingCaption, paintingLine } from './painting'
import { cardFonts, dayColors, drawDayCard, drawWeekScroll, lightOf, longDate, planFor, progressOf, sealOf } from './paintingDay'

const bridge = (): SettingsApi => window.murmur

/** The stroke count the wrap-up last showed for a day: the newest stroke
 *  paints itself in only when it is new since then. */
const SEEN_KEY = 'murmur-painting-seen'
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}
function rememberSeen(value: string): void {
  try {
    localStorage.setItem(SEEN_KEY, value)
  } catch {
    // Without storage the newest stroke simply paints in on each open.
  }
}

/**
 * Saves a day's portrait card (1080 by 1350): the painting as it stands,
 * its name, how far it got, the date, and the wordmark. Drawn and saved
 * here, nothing sent. True when it was saved.
 */
async function saveDayCard(day: string, record: PaintingRecord, colors: PaintingColors, longestMs: number | null): Promise<boolean> {
  const hasFace = await loadDisplayFace()
  const canvas = document.createElement('canvas')
  canvas.width = CARD.W * 2
  canvas.height = CARD.H * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.setTransform(2, 0, 0, 2, 0, 0)
  drawDayCard(ctx, day, record, colors, longestMs, cardFonts(hasFace ? DISPLAY : null))
  return bridge().saveShareCard(canvas.toDataURL('image/png'), 'day', day)
}

/**
 * Saves the week's scroll (US-102, 3968 by 864): the seven days ending on
 * `last` side by side, each painting as it stands with its seal and
 * light, a day without takes as one dry mark, and the week's numbers.
 * Drawn and saved here, nothing sent. True when it was saved.
 */
async function saveWeekScroll(last: string, book: PaintingBook, colors: PaintingColors): Promise<boolean> {
  const hasFace = await loadDisplayFace()
  const canvas = document.createElement('canvas')
  canvas.width = SCROLL.W * 2
  canvas.height = SCROLL.H * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.setTransform(2, 0, 0, 2, 0, 0)
  drawWeekScroll(ctx, last, book, colors, cardFonts(hasFace ? DISPLAY : null))
  return bridge().saveShareCard(canvas.toDataURL('image/png'), 'week', last)
}
```

Then change `const colors = useMemo(colorsNow, [])` to `const colors = useMemo(dayColors, [])`.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/renderer/settings/paintingDay.test.ts`
Expected: 4 pass. Then `npm run typecheck` is clean and `npm run test` passes 980.

- [ ] **Step 5: Run the gates, the desktop smoke too, and commit**

Run: `npm run smoke` as well. Expected: `"ok":true`. Rerun alone if an audio check flakes under load.

```bash
git add src/renderer/settings/paintingDay.ts src/renderer/settings/paintingDay.test.ts src/renderer/settings/WrapUpView.tsx
git commit -m "IOS-019: desktop's day card, week scroll, and painting helpers move into one module for both platforms"
```

### Task 4: The page paints a day, and carries the display face

**Files:**
- Modify `ios/Web/journey.ts`, `ios/Web/journey.html`, `scripts/lib/ios.js`, and `scripts/ios.js`.
- Test `scripts/lib/ios.test.js`.

**Interfaces:**
- Consumes Task 3.
- Produces these page calls:
  - `picture` (now async) with kinds `painting`, `card`, and `week`;
  - `live({ record, width, height, fresh, doneBefore, reduced })`, which returns `boolean`;
  - `ceremony` and `live` each stop the other's strokes.
- Produces `displayFaceRule(woff2)` and `fillJourneyPage(template, tokens, script, font = '')` (the template now needs `/*FONT*/`), plus `generateAll({ requireFont })`.
- Produces `Generated/web/OFL.txt` when the face was fetched.

- [ ] **Step 1: Write the failing tests**

In `scripts/lib/ios.test.js`:
- Add `displayFaceRule,` after `copySharedJson,` in the import list.
- In `describe('the Journey page (IOS-018)'`, make the template `'<style>/*TOKENS*/\n/*FONT*/</style><script>/*SCRIPT*/</script>'`.
- Replace the test `sets the tokens and the script into the page, as written` with:

```js
  it('sets the tokens, the font, and the script into the page, as written', () => {
    const page = fillJourneyPage(template, ':root { --ink: #0f0e11; }', 'a.replace(/x/, "$&")', '@font-face { src: url($&) }')
    expect(page).toBe('<style>:root { --ink: #0f0e11; }\n@font-face { src: url($&) }</style><script>a.replace(/x/, "$&")</script>')
    expect(fillJourneyPage(template, '', 'x')).toBe('<style>\n</style><script>x</script>')
  })

  it('inlines the display face (IOS-019), so the page loads no file for it', () => {
    const rule = displayFaceRule(Buffer.from('wOF2 face'))
    expect(rule).toContain('font-family: "murmur display"')
    expect(rule).toContain(`url(data:font/woff2;base64,${Buffer.from('wOF2 face').toString('base64')}) format("woff2")`)
    expect(rule).toContain('font-weight: 800')
    expect(rule).toContain('font-stretch: 75% 85%')
  })
```

Then, in `refuses a script that could close its own tag, and a page without its marks`, add after the TOKENS line:

```js
    expect(() => fillJourneyPage('<style>/*TOKENS*/</style><script>/*SCRIPT*/</script>', '', 'x')).toThrow(/FONT/)
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run scripts/lib/ios.test.js`
Expected: the new tests fail (`displayFaceRule is not a function`, and the font is not set in).

- [ ] **Step 3: Write the page and the build**

In `scripts/lib/ios.js`, replace `fillJourneyPage` (and its comment) with the following, then add `displayFaceRule` to the exports after `fillJourneyPage`:

```js
/** The page with the tokens, the display face's rule (empty without it),
 *  and the script set in. A script that could close its own tag, or a
 *  page missing a mark, stops the build. */
function fillJourneyPage(template, tokens, script, font = '') {
  for (const mark of ['/*TOKENS*/', '/*FONT*/', '/*SCRIPT*/']) {
    if (template.split(mark).length !== 2) throw new Error(`the Journey page needs exactly one ${mark}`)
  }
  if (/<\/script/i.test(script)) throw new Error('the Journey script contains a closing script tag')
  return template.replace('/*TOKENS*/', () => tokens).replace('/*FONT*/', () => font).replace('/*SCRIPT*/', () => script)
}

/** The display face's @font-face rule (IOS-019), the woff2 inlined, so the
 *  page loads no file for it: the family, the weight, and the condensed
 *  widths desktop fetches. */
function displayFaceRule(woff2) {
  return `@font-face { font-family: "murmur display"; src: url(data:font/woff2;base64,${woff2.toString('base64')}) format("woff2"); font-weight: 800; font-stretch: 75% 85%; font-display: block; }`
}
```

In `scripts/ios.js`:
- Add `existsSync` to the `node:fs` import.
- Add `const { DISPLAY_FACE_FILE } = require('./lib/display-face')` before the `./lib/enso` line.
- Add `displayFaceRule,` before `fillJourneyPage,` in the `./lib/ios` require list.
- Replace `buildJourneyPage` (and its comment) with:

```js
/** The Journey's painter page (IOS-018): desktop's brush engine and
 *  Journey painter, bundled by Vite into one script and set into the page
 *  with the tokens, so the app's web view loads one file and nothing else.
 *  The cards' display face (IOS-019), fetched at install like desktop's
 *  and never committed, goes in too, its license beside it; a release
 *  must have it. */
async function buildJourneyPage({ requireFont = false } = {}) {
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
  const fonts = join(root, 'src', 'renderer', 'public', 'fonts')
  const face = join(fonts, DISPLAY_FACE_FILE)
  const license = join(fonts, 'OFL.txt')
  const hasFace = existsSync(face) && existsSync(license)
  if (requireFont && !hasFace) throw new Error('the display face is missing: run node scripts/fetch-display-face.js --require')
  const font = hasFace ? displayFaceRule(readFileSync(face)) : ''
  const page = fillJourneyPage(readFileSync(join(iosDir, 'Web', 'journey.html'), 'utf8'), tokens, script, font)
  mkdirSync(join(generated, 'web'), { recursive: true })
  writeFileSync(join(generated, 'web', 'journey.html'), page)
  const shipped = join(generated, 'web', 'OFL.txt')
  if (hasFace) copyFileSync(license, shipped)
  else rmSync(shipped, { force: true })
}
```

- Change `async function generateAll() {` to `async function generateAll({ requireFont = false } = {}) {`, and its `await buildJourneyPage()` to `await buildJourneyPage({ requireFont })`.
- In `release()`, change `await generateAll()` to:

```js
  // A release carries the cards' display face, as desktop's does.
  await generateAll({ requireFont: true })
```

`ios/Web/journey.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// The iPhone Journey's painter page (ios/prd.json IOS-018): desktop's own
// brush engine and Journey painter (src/renderer/brush.ts and
// settings/journeyPaint.ts), bundled into the app at build time and run in
// a web view that loads nothing else. murmur asks it for pictures (the
// belt, the road, the gates, the stamps) and for the promotion ceremony;
// every word stays a native view beside or over the painting. A painting a
// day (IOS-019) paints here too, with desktop's painting engine, subjects,
// and light (settings/painting.ts, paintSubjects.ts, paintLight.ts): the
// day's painting, its newest stroke painting in, and the saved card and
// week scroll, whose words are part of the picture, as on desktop.
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
import type { PaintingBook, PaintingRecord } from '../../src/shared/painting'
import type { ProgressReport, RankSpec } from '../../src/shared/ranks'
import { CARD, SCROLL, paintPainting } from '../../src/renderer/settings/painting'
import { cardFonts, dayColors, drawDayCard, drawWeekScroll, lightOf, planFor, progressOf, sealOf } from '../../src/renderer/settings/paintingDay'

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
  | { kind: 'painting'; width: number; height: number; scale: number; record: PaintingRecord }
  | { kind: 'card'; scale: number; day: string; record: PaintingRecord; longestMs: number | null }
  | { kind: 'week'; scale: number; last: string; book: PaintingBook }
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

/** The display face, inlined into the page at build time, for the saved
 *  cards' titles. Absent (a build without it), the cards set their titles
 *  in a condensed system face, as desktop's do. */
const DISPLAY = 'murmur display'

async function displayFace(): Promise<string | null> {
  try {
    await document.fonts.load(`800 46px "${DISPLAY}"`)
  } catch {
    return null
  }
  const loaded = Array.from(document.fonts).some((face) => face.family.replace(/["']/g, '') === DISPLAY && face.status === 'loaded')
  return loaded ? DISPLAY : null
}

/** A day's painting at rest: its strokes, its seal once finished, and its
 *  light, on no ground (the screen's panel shows through). */
function paintDay(ctx: CanvasRenderingContext2D, w: number, h: number, record: PaintingRecord): void {
  const plan = planFor(record)
  const { done, finished } = progressOf(record)
  paintPainting(ctx, w, h, plan, record.words, dayColors(), {
    done,
    seal: finished ? 1 : 0,
    seed: record.seed,
    ground: false,
    sealColor: sealOf(record),
    light: lightOf(record, plan)
  })
}

/** One picture, as a PNG data URL. */
export async function picture(req: PictureRequest): Promise<Picture> {
  const colors = journeyColors(BELT_HEX)
  switch (req.kind) {
    case 'painting': {
      const { el, ctx } = canvas(req.width, req.height, req.scale)
      paintDay(ctx, req.width, req.height, req.record)
      return { png: el.toDataURL('image/png') }
    }
    case 'card': {
      const fonts = cardFonts(await displayFace())
      const { el, ctx } = canvas(CARD.W, CARD.H, req.scale)
      drawDayCard(ctx, req.day, req.record, dayColors(), req.longestMs, fonts)
      return { png: el.toDataURL('image/png') }
    }
    case 'week': {
      const fonts = cardFonts(await displayFace())
      const { el, ctx } = canvas(SCROLL.W, SCROLL.H, req.scale)
      drawWeekScroll(ctx, req.last, req.book, dayColors(), fonts)
      return { png: el.toDataURL('image/png') }
    }
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

/** Stops the ceremony's strokes still going, as desktop's ceremony does
 *  before it paints again. */
let stopCeremony = (): void => undefined
/** Stops the live painting's newest stroke still painting in. */
let stopLive = (): void => undefined

/** How long the newest stroke takes to paint in, as on desktop. */
const LIVE_MS = 900

/**
 * Today's painting on the page's own canvases (IOS-019), as desktop's
 * wrap-up paints it: the newest stroke paints itself in when it is new
 * since the last look, and the seal stamps in with the stroke that
 * finished the painting; at rest, or with Reduce Motion, it is drawn
 * finished at once.
 */
export function live(req: { record: PaintingRecord; width: number; height: number; fresh: boolean; doneBefore: number; reduced: boolean }): boolean {
  stopCeremony()
  stopLive()
  stopLive = () => undefined
  const { record, width, height } = req
  const base = surface('base', width, height)
  const fx = surface('fx', width, height)
  if (!base || !fx) return false
  const plan = planFor(record)
  const { done, finished } = progressOf(record)
  const colors = dayColors()
  const sealColor = sealOf(record)
  const light = lightOf(record, plan)
  const fresh = req.fresh && !req.reduced
  const draw = (k: number): void => {
    base.ctx.clearRect(0, 0, width, height)
    paintPainting(base.ctx, width, height, plan, record.words, colors, {
      done,
      live: fresh ? Math.min(1, k * 1.25) : undefined,
      // The seal stamps in with the stroke that finishes it.
      seal: finished ? (fresh && req.doneBefore < record.target ? Math.max(0, k * 4 - 3) : 1) : 0,
      seed: record.seed,
      ground: false,
      sealColor,
      light
    })
  }
  if (!fresh) {
    draw(1)
    return true
  }
  const t0 = performance.now()
  let frame = 0
  const tick = (now: number): void => {
    const k = Math.min(1, (now - t0) / LIVE_MS)
    draw(k)
    if (k < 1) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  stopLive = () => cancelAnimationFrame(frame)
  return true
}

/** The ceremony on the page's own canvases: animated, or the finished
 *  painting with Reduce Motion or at a new size. A new call stops the
 *  last one's strokes first, so an old size never paints over the new. */
export function ceremony(req: { rank: string; width: number; height: number; reduced: boolean }): boolean {
  stopLive()
  stopLive = () => undefined
  stopCeremony()
  stopCeremony = () => undefined
  const at = rank(req.rank)
  const { width, height } = req
  const base = surface('base', width, height)
  const fx = surface('fx', width, height)
  if (!at || !base || !fx) return false
  const items = ceremonyScene(at, width, height, journeyColors(BELT_HEX))
  if (req.reduced) paintScene(base.ctx, items)
  else stopCeremony = animateScene(base, fx, items)
  return true
}

declare global {
  interface Window {
    murmurJourney?: { picture: typeof picture; ceremony: typeof ceremony; live: typeof live }
    webkit?: { messageHandlers?: { journey?: { postMessage: (message: unknown) => void } } }
  }
}

if (typeof window !== 'undefined') {
  window.murmurJourney = { picture, ceremony, live }
  window.webkit?.messageHandlers?.journey?.postMessage({ type: 'ready' })
}
```

`ios/Web/journey.html`, whole:

```html
<!doctype html>
<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- The iPhone Journey's painter page (ios/prd.json IOS-018, and the
     painting a day, IOS-019). npm run ios:generate fills in the tokens, the
     display face (when it was fetched), and the bundled script; the page
     loads nothing else and may fetch nothing. -->
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
/*TOKENS*/
/*FONT*/
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

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run scripts/lib/ios.test.js`, then `npm run typecheck`, then `npm run ios:generate`.
Expected:
- the tests pass, and typecheck is clean;
- `ios/Generated/web/journey.html` is about 158 KB, with `font-src data:` and one `@font-face`, and `ios/Generated/web/OFL.txt` exists;
- `npm run test` passes 981.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Web scripts/lib/ios.js scripts/lib/ios.test.js scripts/ios.js
git commit -m "IOS-019: the page paints a day, its card, and the week, with the display face inlined"
```

### Task 5: The painting book on iPhone

**Files:**
- Create `ios/App/Painting/PaintingStore.swift`.
- Modify `ios/App/History/History.swift`.
- Test: create `ios/AppTests/PaintingTests.swift`.

**Interfaces:**
- Consumes Task 2.
- Produces `HistoryEntry.paintingEvent`.
- Produces `History(store:forget:keep:)`: `keep` is told after a take lands and before takes are deleted.
- Produces `PaintingFile` and `PaintingStore` (`book`, `install`, `init(file:ladder:)`, `sync(_:)`, `standardFile`, `live()`).
- Produces the test helper `paintingTakes(_:words:)`.

- [ ] **Step 1: Write the failing tests**

`ios/AppTests/PaintingTests.swift`, starting with:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
import UIKit
@testable import murmur

/// Takes on fixed days, in UTC, so the tests never depend on the time zone.
@MainActor func paintingTakes(_ days: [(day: Int, count: Int)], words: Int = 60) throws -> [HistoryEntry] {
    var utc = Calendar(identifier: .gregorian)
    utc.timeZone = try #require(TimeZone(identifier: "UTC"))
    let start = Date(timeIntervalSince1970: 1_790_000_000)
    return days.flatMap { day, count in
        (0..<count).map { i in
            HistoryEntry(at: start.addingTimeInterval(Double(day) * 86_400 + Double(i) * 600), durationMs: 30_000, words: Array(repeating: "word", count: words).joined(separator: " "), calendar: utc)
        }
    }
}

/// The painting book on iPhone (IOS-019).
@MainActor @Suite(.serialized) struct PaintingStoreTests {
    func scratch() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "paintings-\(UUID().uuidString)", directoryHint: .isDirectory).appending(path: "paintings.json")
    }

    func ladder() throws -> [RankSpec] {
        try BundledRules.journey().ranks.ranks
    }

    /// Takes paint their days, and the book keeps its own seed across launches.
    @Test func takesPaintTheirDaysAndTheBookIsKept() throws {
        let file = scratch()
        defer { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        let store = PaintingStore(file: file, ladder: try ladder())
        store.sync(try paintingTakes([(0, 3), (1, 2)]))
        #expect(store.book.count == 2)
        #expect(store.book.values.map(\.words.count).sorted() == [2, 3])
        let again = PaintingStore(file: file, ladder: try ladder())
        #expect(again.install == store.install)
        #expect(again.book == store.book)
        let values = try file.deletingLastPathComponent().resourceValues(forKeys: [.isExcludedFromBackupKey])
        #expect(values.isExcludedFromBackup == true)
    }

    /// The same takes paint the same book as desktop's code would, with
    /// this install's seed.
    @Test func theBookIsDesktops() throws {
        let store = PaintingStore(file: scratch(), ladder: try ladder())
        let takes = try paintingTakes([(0, 4), (1, 6), (2, 1)])
        store.sync(takes)
        #expect(store.book == Paintings.sync([:], events: takes.map(\.paintingEvent), install: store.install, ladder: try ladder()))
    }

    /// Deleting takes, or clearing them all, keeps what they painted, as
    /// desktop's book outlives its log.
    @Test func deletedTakesKeepTheirPainting() throws {
        let historyFile = FileManager.default.temporaryDirectory.appending(path: "paintings-history-\(UUID().uuidString).jsonl")
        defer { try? FileManager.default.removeItem(at: historyFile) }
        let store = PaintingStore(file: scratch(), ladder: try ladder())
        let history = History(store: HistoryStore(file: historyFile), keep: { store.sync($0) })
        for take in try paintingTakes([(0, 3)]) { history.add(take) }
        let day = try #require(store.book.keys.first)
        #expect(store.book[day]?.words.count == 3)
        let first = try #require(history.entries.first)
        history.delete(first.id)
        #expect(store.book[day]?.words.count == 3)
        history.clear()
        #expect(store.book[day]?.words.count == 3)
    }

    /// A day that cannot be read is left out; the rest of the book stands.
    @Test func aDayThatCannotBeReadIsLeftOut() throws {
        let file = scratch()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        try #"""
        {"install": 77, "days": {
          "2026-10-01": {"subject": "moon", "seed": 5, "target": 6, "tier": 0, "level": 1, "words": [12]},
          "2026-10-02": {"subject": "sun", "seed": 5, "target": 6, "tier": 0, "level": 1, "words": [12]},
          "not a day": {"subject": "moon", "seed": 5, "target": 6, "tier": 0, "level": 1, "words": [12]}
        }}
        """#.write(to: file, atomically: true, encoding: .utf8)
        let store = PaintingStore(file: file, ladder: try ladder())
        #expect(store.install == 77)
        #expect(store.book.keys.sorted() == ["2026-10-01"])
    }

    /// A take as the painting sees it: its words, day, and hour, as kept.
    @Test func aTakeAsThePaintingSeesIt() throws {
        let takes = try paintingTakes([(0, 1)], words: 42)
        let take = try #require(takes.first)
        let event = take.paintingEvent
        #expect(event.strokeWords == 42 && event.words == 42 && event.counts)
        #expect(event.day == take.day && event.hour == take.hour)
        #expect(event.at == take.rankEvent.at)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:generate && npm run ios:test`
Expected: the app test build fails with `cannot find 'PaintingStore' in scope`.

- [ ] **Step 3: Keep the book**

`ios/App/Painting/PaintingStore.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The painting book on iPhone (ios/prd.json IOS-019): a record per day,
// kept in the app's own container and out of backups, so the paintings
// outlive deleted takes, as desktop's paintings.json does. Word counts
// only, never text. It is brought up to date when a take lands, and before
// takes are deleted.
import Foundation
import MurmurCore
import Observation

/// The book on disk: this install's own seed and the paintings by day.
struct PaintingFile: Codable {
    var install: UInt32
    var days: PaintingBook

    private enum Keys: String, CodingKey { case install, days }

    init(install: UInt32, days: PaintingBook) {
        self.install = install
        self.days = days
    }

    /// A day that cannot be read is left out; the rest stand, as desktop
    /// reads its book.
    init(from decoder: any Decoder) throws {
        let box = try decoder.container(keyedBy: Keys.self)
        install = try box.decode(UInt32.self, forKey: .install)
        let days = (try? box.decode([String: Lenient].self, forKey: .days)) ?? [:]
        self.days = days.compactMapValues(\.record).filter { Paintings.isDayKey($0.key) }
    }

    func encode(to encoder: any Encoder) throws {
        var box = encoder.container(keyedBy: Keys.self)
        try box.encode(install, forKey: .install)
        try box.encode(days, forKey: .days)
    }

    private struct Lenient: Decodable {
        let record: PaintingRecord?

        init(from decoder: any Decoder) throws {
            record = try? PaintingRecord(from: decoder)
        }
    }
}

@Observable @MainActor final class PaintingStore {
    private(set) var book: PaintingBook
    @ObservationIgnored let install: UInt32
    @ObservationIgnored private let file: URL
    @ObservationIgnored private let ladder: [RankSpec]

    static let standardFile = URL.applicationSupportDirectory.appending(path: "paintings", directoryHint: .isDirectory).appending(path: "paintings.json")

    init(file: URL, ladder: [RankSpec]) {
        self.file = file
        self.ladder = ladder
        let kept = (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(PaintingFile.self, from: $0) }
        install = kept?.install ?? UInt32.random(in: .min ... .max)
        book = kept?.days ?? [:]
    }

    /// Brings the book up to date with these takes, and keeps it.
    func sync(_ entries: [HistoryEntry]) {
        let next = Paintings.sync(book, events: entries.map(\.paintingEvent), install: install, ladder: ladder)
        guard next != book || !FileManager.default.fileExists(atPath: file.path) else { return }
        book = next
        try? save()
    }

    private func save() throws {
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = folder
        try url.setResourceValues(values)
        let data = try JSONEncoder().encode(PaintingFile(install: install, days: book))
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}

extension PaintingStore {
    private static var shared: PaintingStore?

    /// The app's one book; nil only if the app's own ladder could not be read.
    static func live() -> PaintingStore? {
        if let shared { return shared }
        guard let ladder = JourneyRules.live?.ranks.ranks else { return nil }
        let store = PaintingStore(file: standardFile, ladder: ladder)
        shared = store
        return store
    }
}
```

In `ios/App/History/History.swift`, before `/// The take as the belt math sees it.`, add:

```swift
    /// The take as the painting a day sees it (IOS-019): its words paint
    /// the stroke and count toward the belts.
    var paintingEvent: PaintingEvent {
        PaintingEvent(at: rankEvent.at, day: day ?? Self.dayKey(at), hour: hour ?? Self.hourOf(at), strokeWords: wordCount)
    }
```

Replace the `History` class's `forget` property, its `init`, and `add`, `delete`, and `clear` with:

```swift
    /// Forgets deleted words wherever else they wait: the given words, or
    /// all with nil.
    @ObservationIgnored private let forget: @MainActor (Set<String>?) -> Void
    /// Keeps what the takes made (the painting a day, IOS-019): told after
    /// a take lands and before takes are deleted, so what they painted stays.
    @ObservationIgnored private let keep: @MainActor ([HistoryEntry]) -> Void

    init(store: HistoryStore, forget: @escaping @MainActor (Set<String>?) -> Void = { _ in }, keep: @escaping @MainActor ([HistoryEntry]) -> Void = { _ in }) {
        self.store = store
        self.forget = forget
        self.keep = keep
        entries = store.list()
    }

    /// A take that came back as words. If the disk refuses it, it still
    /// shows until murmur closes.
    func add(_ entry: HistoryEntry) {
        try? store.append(entry)
        entries.insert(entry, at: 0)
        keep(entries)
    }

    func delete(_ id: UUID) {
        keep(entries)
        let words = entries.first { $0.id == id }?.words
        try? store.remove(id)
        entries = store.list()
        if let words { forget([words]) }
    }

    func clear() {
        keep(entries)
        try? store.clear()
        entries = []
        forget(nil)
    }
```

In `History.live()`, replace the lines from `let history = History(store: .standard) { words in` through `return history` with:

```swift
        let history = History(store: .standard) { words in
            TakeModel.live()?.forget(words)
            Mailbox.shared?.forget(words)
        } keep: { entries in
            PaintingStore.live()?.sync(entries)
        }
        // Takes kept before the painting a day paint their days too.
        PaintingStore.live()?.sync(history.entries)
        shared = history
        return history
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `PaintingStoreTests` passes (5), and the app total is 291.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Painting/PaintingStore.swift ios/App/History/History.swift ios/AppTests/PaintingTests.swift
git commit -m "IOS-019: the iPhone keeps its painting book, made by every take and kept when takes go"
```

### Task 6: The painter paints a day

**Files:** Replace `ios/App/Journey/JourneyPainter.swift`. Test: add to `ios/AppTests/PaintingTests.swift`.

**Interfaces:**
- Consumes Tasks 4 and 5.
- Produces `JourneyPainter.png(_:scale:)`, which returns `(data, body)`, and `JourneyPainter.live(_:size:fresh:doneBefore:reduced:)`.
- Produces `JourneyArtwork.painting`, `.card`, and `.week`, with `JourneyArtwork` now Sendable.
- Produces `PaintingRecord.fields`, and the test helper `pageHasDisplayFace()`.

- [ ] **Step 1: Write the failing tests**

At the end of `ios/AppTests/PaintingTests.swift`, add:

```swift
/// Whether this build carries the cards' display face: it is fetched at
/// install, so a build made offline goes without it (IOS-019).
func pageHasDisplayFace() -> Bool {
    guard let url = JourneyPage.url, let page = try? String(contentsOf: url, encoding: .utf8) else { return false }
    return page.contains(#"font-family: "murmur display""#)
}

/// A painting a day from the painter page (IOS-019).
@MainActor @Suite(.serialized) struct PaintingPictureTests {
    func book() throws -> PaintingBook {
        let ladder = try BundledRules.journey().ranks.ranks
        return Paintings.sync([:], events: try paintingTakes([(0, 7), (1, 3), (3, 6)]).map(\.paintingEvent), install: 4242, ladder: ladder)
    }

    /// A day's painting at rest is painted at its size, and is not blank.
    @Test func aDayIsPainted() async throws {
        let book = try book()
        let record = try #require(book.values.first)
        let picture = try await JourneyPainter.started().picture(.painting(record, width: 120, height: 90), scale: 2)
        #expect(picture.image.size == CGSize(width: 120, height: 90))
        let alpha = PaintingDifference.bytes(picture.image).enumerated().filter { $0.offset % 4 == 3 && $0.element > 20 }.count
        #expect(alpha > 100)
    }

    /// The card is desktop's 1080 by 1350 and the week's scroll its 3968
    /// by 864, with the titles in the display face when the build has it.
    @Test func theCardAndTheWeekAreDesktops() async throws {
        let book = try book()
        let last = try #require(book.keys.sorted().last)
        let record = try #require(book[last])
        let painter = try await JourneyPainter.started()
        let cardData = try await painter.png(.card(day: last, record: record, longestMs: 90_000), scale: 2).data
        let card = try #require(UIImage(data: cardData))
        #expect(card.size == CGSize(width: 1080, height: 1350))
        let weekData = try await painter.png(.week(last: last, book: book), scale: 2).data
        let week = try #require(UIImage(data: weekData))
        #expect(week.size == CGSize(width: 3968, height: 864))
        let face = try await painter.web.callAsyncJavaScript(
            "return Array.from(document.fonts).some((f) => f.family.replace(/[\"']/g, '') === 'murmur display' && f.status === 'loaded')", arguments: [:], contentWorld: .page
        )
        #expect(face as? Bool == pageHasDisplayFace())
    }

    /// Today's painting on the page's canvases: at rest, or with its newest
    /// stroke painting in, it ends painted.
    @Test func todayPaintsLive() async throws {
        let book = try book()
        let record = try #require(book.values.first)
        let painter = try await JourneyPainter.started()
        try await painter.onScreen(CGSize(width: 360, height: 270))
        defer { painter.web.removeFromSuperview() }
        func ink() async throws -> Int {
            let sum = try await painter.web.evaluateJavaScript(
                "(() => { const c = document.getElementById('base'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 20 ? 1 : 0; return n })()"
            )
            return (sum as? Int) ?? -1
        }
        try await painter.live(record, size: CGSize(width: 360, height: 270), fresh: false, doneBefore: 0, reduced: false)
        let rest = try await ink()
        #expect(rest > 100)
        try await painter.live(record, size: CGSize(width: 360, height: 270), fresh: true, doneBefore: 0, reduced: false)
        try await Task.sleep(for: .seconds(1.3))
        #expect(abs(try await ink() - rest) <= rest / 50)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `type 'JourneyArtwork' has no member 'painting'`.

- [ ] **Step 3: Teach the painter**

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
import MurmurCore
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
            do {
                try await Task.sleep(for: .seconds(seconds))
            } catch {
                return
            }
            guard let self, !self.ready else { return }
            self.gaveUp = true
            for continuation in self.waiting { continuation.resume() }
            self.waiting = []
        }
        await withCheckedContinuation { waiting.append($0) }
        deadline.cancel()
        guard ready else { throw Failure.notReady }
    }

    /// One picture from the page, as the page painted it: PNG bytes at
    /// `scale` pixels to the point, and the page's answer.
    func png(_ request: JourneyArtwork, scale: CGFloat) async throws -> (data: Data, body: [String: Any]) {
        try await waitUntilReady()
        var asked = request.fields
        asked["scale"] = scale
        let answer = try await web.callAsyncJavaScript("return window.murmurJourney.picture(request)", arguments: ["request": asked], contentWorld: .page)
        guard let body = answer as? [String: Any], let png = body["png"] as? String,
              let comma = png.firstIndex(of: ","), let data = Data(base64Encoded: String(png[png.index(after: comma)...]))
        else { throw Failure.badPicture }
        return (data, body)
    }

    /// One picture from the page.
    func picture(_ request: JourneyArtwork, scale: CGFloat) async throws -> JourneyPicture {
        let (data, body) = try await png(request, scale: scale)
        guard let image = UIImage(data: data, scale: scale) else { throw Failure.badPicture }
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

    /// Today's painting on this web view's own canvases (IOS-019): the
    /// newest stroke paints in when it is fresh, and the seal stamps in with
    /// the stroke that finished it; at rest, or with Reduce Motion, it is
    /// drawn finished at once.
    func live(_ record: PaintingRecord, size: CGSize, fresh: Bool, doneBefore: Int, reduced: Bool) async throws {
        try await waitUntilReady()
        let request: [String: Any] = [
            "record": record.fields, "width": size.width, "height": size.height,
            "fresh": fresh, "doneBefore": doneBefore, "reduced": reduced
        ]
        let answer = try await web.callAsyncJavaScript("return window.murmurJourney.live(request)", arguments: ["request": request], contentWorld: .page)
        guard answer as? Bool == true else { throw Failure.badPicture }
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
enum JourneyArtwork: Hashable, Sendable {
    /// A day's painting at rest (IOS-019).
    case painting(PaintingRecord, width: Double, height: Double)
    /// A day's portrait card, at desktop's 540 by 675 points.
    case card(day: String, record: PaintingRecord, longestMs: Int?)
    /// The week's scroll ending on `last`, at desktop's 1984 by 432 points.
    case week(last: String, book: PaintingBook)
    /// drop runs 0 to 1 while the newest stripe's tape slaps on.
    case belt(belt: String, stripes: Int, width: Double, height: Double, drop: Double?)
    case road(JourneyStanding)
    case words(JourneyStanding, width: Double, height: Double)
    case tallies(JourneyStanding, width: Double, height: Double)
    case stamp(id: String, got: Bool, seed: Int, size: Double)

    var fields: [String: Any] {
        switch self {
        case let .painting(record, width, height):
            return ["kind": "painting", "record": record.fields, "width": width, "height": height]
        case let .card(day, record, longestMs):
            return ["kind": "card", "day": day, "record": record.fields, "longestMs": longestMs.map { $0 as Any } ?? NSNull()]
        case let .week(last, book):
            return ["kind": "week", "last": last, "book": book.mapValues(\.fields)]
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

extension PaintingRecord {
    /// The record as the page reads it, desktop's PaintingRecord.
    var fields: [String: Any] {
        var fields: [String: Any] = ["subject": subject.rawValue, "seed": Int(seed), "target": target, "tier": tier, "level": level, "words": words]
        if let rank { fields["rank"] = rank }
        if let hour { fields["hour"] = hour }
        return fields
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `PaintingPictureTests` passes (3), and the app total is 294.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Journey/JourneyPainter.swift ios/AppTests/PaintingTests.swift
git commit -m "IOS-019: the painter paints a day, its card, the week, and today live"
```

### Task 7: Today's painting, the strip, and saving

**Files:**
- Create `ios/App/Painting/PaintingScreen.swift`.
- Modify `ios/App/Home/HomeScreen.swift` and `ios/project.yml`.
- Test: add to `ios/AppTests/PaintingTests.swift`.

**Interfaces:**
- Consumes Tasks 5 and 6.
- Produces `PaintingCopy`, `PaintingDays`, `PaintingSeen` (`look(day:done:)` and `remember(day:done:)`), and `PaintingShare` (Transferable, with `png()`).
- Produces `PaintingRow(store:history:)`, `PaintingScreen(store:seen:longestMs:)`, `ViewedDay`, and `PaintingViewer`.
- Produces the `HomeScreen` property `paintings: PaintingStore? = PaintingStore.live()`.

- [ ] **Step 1: Write the failing tests**

At the end of `ios/AppTests/PaintingTests.swift`, add:

```swift
/// What the painting screens remember and say (IOS-019).
@Suite struct PaintingWordsTests {
    func seen() -> (PaintingSeen, UserDefaults, String) {
        let name = "painting-seen-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name) ?? .standard
        return (PaintingSeen(defaults: defaults), defaults, name)
    }

    /// The newest stroke paints in only when it is new since the last look;
    /// the strokes done when last seen today say whether it just finished.
    @Test func theNewestStrokePaintsInOnce() {
        let (seen, defaults, name) = seen()
        defer { defaults.removePersistentDomain(forName: name) }
        #expect(seen.look(day: "2026-10-13", done: 3) == (true, 0))
        seen.remember(day: "2026-10-13", done: 3)
        #expect(seen.look(day: "2026-10-13", done: 3) == (false, 3))
        #expect(seen.look(day: "2026-10-13", done: 4) == (true, 3))
        #expect(seen.look(day: "2026-10-14", done: 1) == (true, 0))
    }

    @Test func theLinesAreDesktops() {
        var record = PaintingRecord(subject: .lotus, seed: 1, target: 6, tier: 0, level: 1, rank: "white", hour: 20, words: [10, 20, 30])
        #expect(PaintingCopy.line(record, longestMs: nil) == "Every take adds the next stroke. 3 more to finish it.")
        record.words = Array(repeating: 10, count: 8)
        #expect(PaintingCopy.line(record, longestMs: 125_000) == "8 takes, 80 words. The longest ran 2:05. Every take from here adds to it.")
        record.words = Array(repeating: 1, count: 6 + Paintings.maxExtra)
        #expect(!PaintingCopy.line(record, longestMs: nil).hasSuffix("adds to it."))
        #expect(PaintingCopy.stripCaption(record) == "lotus pond")
        record.words = [1, 1]
        #expect(PaintingCopy.stripCaption(record) == "2 of 6")
    }

    /// The strip names the last week's days by weekday, older ones by date.
    @Test func theStripNamesItsDays() {
        #expect(PaintingCopy.stripDay("2026-10-12", today: "2026-10-13") == "Mon")
        #expect(PaintingCopy.stripDay("2026-10-07", today: "2026-10-13") == "Wed")
        #expect(PaintingCopy.stripDay("2026-10-06", today: "2026-10-13") == "Oct 6")
        #expect(PaintingCopy.cardName("2026-10-13") == "murmur-day-2026-10-13.png")
        #expect(PaintingCopy.weekName("2026-10-13") == "murmur-week-2026-10-13.png")
    }

    @Test func everyLineFollowsTheWritingRules() {
        for line in [PaintingCopy.title, PaintingCopy.past, PaintingCopy.saveCard, PaintingCopy.saveWeek, PaintingCopy.firstTake, PaintingCopy.kept, PaintingCopy.fromHere, PaintingCopy.toFinish(2)] {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}

/// The share sheet's pictures (IOS-019).
@MainActor @Suite(.serialized) struct PaintingShareTests {
    func book() throws -> PaintingBook {
        let ladder = try BundledRules.journey().ranks.ranks
        return Paintings.sync([:], events: try paintingTakes([(0, 7), (1, 3), (3, 6)]).map(\.paintingEvent), install: 4242, ladder: ladder)
    }

    /// The share sheet's picture is the card, painted when it is asked for.
    @Test func theShareIsTheCard() async throws {
        let book = try book()
        let last = try #require(book.keys.sorted().last)
        let record = try #require(book[last])
        let share = PaintingShare(name: PaintingCopy.cardName(last), artwork: .card(day: last, record: record, longestMs: nil))
        let data = try await share.png()
        #expect(UIImage(data: data)?.size == CGSize(width: 1080, height: 1350))
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'PaintingSeen' in scope`.

- [ ] **Step 3: Write the screens**

`ios/App/Painting/PaintingScreen.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// A painting a day on iPhone (ios/prd.json IOS-019), as desktop's wrap-up
// shows it: every take adds the next stroke of the day's painting, the
// newest painting itself in; the seal stamps in with the stroke that
// finishes it, in the color of the belt it was painted at, with the light
// of the hours it was painted in. Earlier days wait in a strip, each
// opening large. Save card and Save the week go through the share sheet.
// The paintings come from desktop's own painter (JourneyPainter); every
// word here is a native view.
import MurmurCore
import SwiftUI
import UniformTypeIdentifiers
import WebKit

/// What the painting screens say.
enum PaintingCopy {
    static let title = "Today's painting"
    static let past = "Your paintings"
    static let saveCard = "Save card"
    static let saveWeek = "Save the week"
    static let firstTake = "Your first take today starts today's painting."
    static let kept = "Kept as it stood that day."
    static let fromHere = " Every take from here adds to it."

    static func toFinish(_ left: Int) -> String {
        "Every take adds the next stroke. \(left) more to finish it."
    }

    /// The line under today's painting, as desktop's wrap-up words it.
    static func line(_ record: PaintingRecord, longestMs: Int?) -> String {
        let (done, finished) = Paintings.progress(record)
        guard finished else { return toFinish(record.target - done) }
        return Paintings.line(record.words, longestMs: longestMs) + (done < record.target + Paintings.maxExtra ? fromHere : "")
    }

    /// An earlier day's name in the strip: its weekday within the last
    /// week, its date before that, so two Mondays never look alike.
    static func stripDay(_ day: String, today: String) -> String {
        guard let date = PaintingDays.date(day) else { return day }
        let recent = day >= Paintings.shiftDay(today, -6)
        return recent ? date.formatted(.dateTime.weekday(.abbreviated)) : date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// An earlier day's caption in the strip: its subject once finished.
    static func stripCaption(_ record: PaintingRecord) -> String {
        let (done, finished) = Paintings.progress(record)
        return finished ? record.subject.name : "\(done) of \(record.target)"
    }

    static func longDate(_ day: String) -> String {
        PaintingDays.date(day)?.formatted(.dateTime.weekday(.wide).month(.wide).day()) ?? day
    }

    static func cardName(_ day: String) -> String { "murmur-day-\(day).png" }
    static func weekName(_ day: String) -> String { "murmur-week-\(day).png" }
}

/// Day keys as dates, in this phone's own calendar day.
enum PaintingDays {
    static func date(_ day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar(identifier: .gregorian).date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func today() -> String { HistoryEntry.dayKey(.now) }
}

/// The strokes the screen last showed for a day, kept across launches as
/// desktop keeps it: the newest stroke paints itself in only when it is
/// new since then, and the seal stamps in when the painting finished since.
struct PaintingSeen {
    static let key = "murmur-painting-seen"
    let defaults: UserDefaults

    /// Whether this showing is fresh, and the strokes done when last seen today.
    func look(day: String, done: Int) -> (fresh: Bool, doneBefore: Int) {
        let before = defaults.string(forKey: Self.key)
        let now = "\(day)|\(done)"
        let doneBefore = before.flatMap { $0.hasPrefix("\(day)|") ? Int($0.dropFirst(day.count + 1)) : nil } ?? 0
        return (before != now, doneBefore)
    }

    func remember(day: String, done: Int) {
        defaults.set("\(day)|\(done)", forKey: Self.key)
    }
}

/// A picture the share sheet saves: a day's card or the week's scroll,
/// painted when the person picks where it goes.
struct PaintingShare: Transferable {
    let name: String
    let artwork: JourneyArtwork

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { share in
            try await share.png()
        }
        .suggestedFileName { $0.name }
    }

    /// Desktop saves its cards at twice their size: 1080 by 1350, and the
    /// week at 3968 by 864.
    @MainActor func png() async throws -> Data {
        try await JourneyPainter.shared.png(artwork, scale: 2).data
    }
}

/// The page's web view, as a view, for today's live painting.
private struct PaintingStage: UIViewRepresentable {
    let painter: JourneyPainter

    func makeUIView(context: Context) -> WKWebView { painter.web }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

/// Home's row into the painting: today's painting small and how far it got.
struct PaintingRow: View {
    let store: PaintingStore
    let history: History
    @Environment(\.displayScale) private var scale
    @State private var thumbnail: UIImage?

    var body: some View {
        let today = PaintingDays.today()
        let record = store.book[today]
        NavigationLink {
            PaintingScreen(store: store, longestMs: Self.longest(history.entries, day: today))
        } label: {
            HStack(spacing: 12) {
                Group {
                    if let thumbnail, record != nil {
                        Image(uiImage: thumbnail).resizable()
                    } else {
                        RoundedRectangle(cornerRadius: 3).strokeBorder(Tokens.panelEdge)
                    }
                }
                .frame(width: 72, height: 54)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(PaintingCopy.title)
                    Text(record.map { Paintings.caption($0.subject, done: Paintings.progress($0).done, target: $0.target) } ?? PaintingCopy.firstTake)
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                }
            }
            .frame(minHeight: 44)
        }
        .task(id: record) {
            guard let record else { return }
            thumbnail = try? await JourneyPainter.shared.picture(.painting(record, width: 72, height: 54), scale: scale).image
        }
    }

    /// The day's longest take, for the finished painting's line.
    static func longest(_ entries: [HistoryEntry], day: String) -> Int? {
        entries.filter { ($0.day ?? HistoryEntry.dayKey($0.at)) == day }.map(\.durationMs).max()
    }
}

struct PaintingScreen: View {
    let store: PaintingStore
    var seen = PaintingSeen(defaults: .standard)
    /// The day's longest take, for the finished painting's line.
    var longestMs: Int?

    @Environment(\.displayScale) private var scale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var width: Double = 0
    @State private var strip: [String: UIImage] = [:]
    @State private var viewing: ViewedDay?

    var body: some View {
        let today = PaintingDays.today()
        let record = store.book[today]
        let past = store.book.keys.filter { $0 < today }.sorted().suffix(6)
        let week = Paintings.weekOf(today).filter { store.book[$0] != nil }.count
        List {
            Section {
                if let record {
                    let (done, _) = Paintings.progress(record)
                    PaintingStage(painter: JourneyPainter.shared)
                        .allowsHitTesting(false)
                        .frame(height: width * 0.75)
                        .accessibilityHidden(true)
                        .onGeometryChange(for: Double.self) { $0.size.width } action: { width = $0 }
                        .task(id: LiveKey(record: record, width: width)) {
                            await paintLive(record, day: today)
                        }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Paintings.caption(record.subject, done: done, target: record.target))
                            .font(.headline)
                        Text(PaintingCopy.line(record, longestMs: longestMs))
                            .foregroundStyle(Tokens.textDim)
                    }
                    .accessibilityElement(children: .combine)
                    ShareLink(item: PaintingShare(name: PaintingCopy.cardName(today), artwork: .card(day: today, record: record, longestMs: longestMs)), preview: SharePreview(PaintingCopy.title)) {
                        Text(PaintingCopy.saveCard)
                            .foregroundStyle(Tokens.brand)
                            .frame(minHeight: 44)
                    }
                } else {
                    Text(PaintingCopy.firstTake)
                        .foregroundStyle(Tokens.textDim)
                }
            }
            .listRowBackground(Tokens.panel)

            if !past.isEmpty {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(Array(past), id: \.self) { day in
                                if let kept = store.book[day] {
                                    PastPainting(day: day, today: today, record: kept, image: strip[day]) {
                                        viewing = ViewedDay(day: day, record: kept)
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    }
                    if week >= 2 {
                        ShareLink(item: PaintingShare(name: PaintingCopy.weekName(today), artwork: .week(last: today, book: store.book)), preview: SharePreview(PaintingCopy.saveWeek)) {
                            Text(PaintingCopy.saveWeek)
                                .foregroundStyle(Tokens.brand)
                                .frame(minHeight: 44)
                        }
                    }
                } header: {
                    SectionTitle(PaintingCopy.past)
                }
                .listRowBackground(Tokens.panel)
                .task(id: Array(past).map { store.book[$0] }) {
                    for day in past {
                        guard let kept = store.book[day] else { continue }
                        if let image = try? await JourneyPainter.shared.picture(.painting(kept, width: 120, height: 90), scale: scale).image {
                            strip[day] = image
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(PaintingCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $viewing) { shown in
            PaintingViewer(day: shown.day, record: shown.record)
        }
    }

    /// Paints today's painting on the stage, the newest stroke painting in
    /// when it is new since the last look, and remembers this look.
    private func paintLive(_ record: PaintingRecord, day: String) async {
        guard width > 0 else { return }
        let (done, _) = Paintings.progress(record)
        let look = seen.look(day: day, done: done)
        do {
            try await JourneyPainter.shared.live(record, size: CGSize(width: width, height: width * 0.75), fresh: look.fresh, doneBefore: look.doneBefore, reduced: reduceMotion)
            seen.remember(day: day, done: done)
        } catch {
            return
        }
    }
}

/// What the live painting depends on: a change repaints it.
private struct LiveKey: Hashable {
    let record: PaintingRecord
    let width: Double
}

/// An earlier day opened large.
struct ViewedDay: Identifiable {
    let day: String
    let record: PaintingRecord
    var id: String { day }
}

/// An earlier day's painting in the strip, still: a button that opens it.
private struct PastPainting: View {
    let day: String
    let today: String
    let record: PaintingRecord
    let image: UIImage?
    let open: () -> Void

    var body: some View {
        let (done, _) = Paintings.progress(record)
        Button(action: open) {
            VStack(alignment: .leading, spacing: 4) {
                Group {
                    if let image {
                        Image(uiImage: image).resizable()
                    } else {
                        RoundedRectangle(cornerRadius: 3).strokeBorder(Tokens.panelEdge)
                    }
                }
                .frame(width: 120, height: 90)
                Text(PaintingCopy.stripDay(day, today: today))
                    .font(.footnote.weight(.semibold))
                Text(PaintingCopy.stripCaption(record))
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(Tokens.textDim)
                    .lineLimit(2)
            }
            .frame(width: 120, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(PaintingCopy.stripDay(day, today: today)): \(Paintings.caption(record.subject, done: done, target: record.target))")
        .accessibilityHint("Opens it large")
    }
}

/// An earlier day's painting, large, with its own Save card.
struct PaintingViewer: View {
    let day: String
    let record: PaintingRecord
    @Environment(\.displayScale) private var scale
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var width: Double = 0

    var body: some View {
        let (done, finished) = Paintings.progress(record)
        NavigationStack {
            List {
                Section {
                    Group {
                        if let image {
                            Image(uiImage: image).resizable()
                        } else {
                            Color.clear
                        }
                    }
                    .frame(height: width * 0.75)
                    .accessibilityHidden(true)
                    .onGeometryChange(for: Double.self) { $0.size.width } action: { width = $0 }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Paintings.caption(record.subject, done: done, target: record.target))
                            .font(.headline)
                        Text(finished ? Paintings.line(record.words, longestMs: nil) : PaintingCopy.kept)
                            .foregroundStyle(Tokens.textDim)
                    }
                    .accessibilityElement(children: .combine)
                    ShareLink(item: PaintingShare(name: PaintingCopy.cardName(day), artwork: .card(day: day, record: record, longestMs: nil)), preview: SharePreview(PaintingCopy.longDate(day))) {
                        Text(PaintingCopy.saveCard)
                            .foregroundStyle(Tokens.brand)
                            .frame(minHeight: 44)
                    }
                }
                .listRowBackground(Tokens.panel)
            }
            .scrollContentBackground(.hidden)
            .background(Tokens.ink)
            .foregroundStyle(Tokens.text)
            .navigationTitle(PaintingCopy.longDate(day))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Tokens.brand)
                }
            }
            .task(id: width) {
                guard width > 0 else { return }
                image = try? await JourneyPainter.shared.picture(.painting(record, width: width, height: width * 0.75), scale: scale).image
            }
        }
        .preferredColorScheme(.dark)
    }
}
```

In `ios/App/Home/HomeScreen.swift`:

1. End the file's opening comment with `// Journey row shows the belt this iPhone's takes have earned (IOS-017),` then `// and the painting row today's painting (IOS-019).`
2. After the `journey` property, add:

```swift
    /// The painting book; nil only if the app's own files could not be read.
    var paintings: PaintingStore? = PaintingStore.live()
```

3. Replace the Journey section (`if let journey { Section { JourneyRow(...) } ... }`) with:

```swift
            if journey != nil || paintings != nil {
                Section {
                    if let paintings {
                        PaintingRow(store: paintings, history: history)
                    }
                    if let journey {
                        JourneyRow(history: history, rules: journey)
                    }
                }
                .listRowBackground(Tokens.panel)
            }
```

In `ios/project.yml`, after the app's `NSMicrophoneUsageDescription`, add:

```yaml
        NSPhotoLibraryAddUsageDescription: murmur adds the painting cards you choose to save to your photos, and never looks at your library.
```

- [ ] **Step 4: Run them to see them pass, and read the screens**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `PaintingWordsTests` (4) and `PaintingShareTests` (1) pass, and the app total is 299.

Then render and read two screens from a scratch book that is never committed:
- today in progress, with three earlier days;
- today finished, with a week of days.

Expected: the live painting, the native caption and line, gold Save card, and the strip of earlier days with their light. Save the week shows once two of the last seven days have paintings.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Painting/PaintingScreen.swift ios/App/Home/HomeScreen.swift ios/project.yml ios/AppTests/PaintingTests.swift
git commit -m "IOS-019: Home's painting row opens today's painting, the strip of earlier days, and Save card and Save the week"
```

### Task 8: The display face's license in About

**Files:** Modify `ios/App/Home/SettingsScreen.swift`. Test: add to `ios/AppTests/PaintingTests.swift`.

**Interfaces:** Produces `AboutCopy.font`, `readFontLicense`, `fontLicenseTitle`, and `fontLicense()`.

- [ ] **Step 1: Write the failing tests**

At the end of `ios/AppTests/PaintingTests.swift`, add:

```swift
/// The cards' display face and its license (IOS-019).
@Suite struct PaintingFontTests {
    /// The license travels with the font, or neither ships.
    @Test func theLicenseShipsWithTheFont() {
        #expect((AboutCopy.fontLicense() != nil) == pageHasDisplayFace())
        if let license = AboutCopy.fontLicense() {
            #expect(license.contains("SIL OPEN FONT LICENSE"))
        }
    }

    @Test func theCreditFollowsTheWritingRules() {
        for line in [AboutCopy.font, AboutCopy.readFontLicense, AboutCopy.fontLicenseTitle] {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `type 'AboutCopy' has no member 'fontLicense'`.

- [ ] **Step 3: Credit the face**

In `ios/App/Home/SettingsScreen.swift`, replace the Licenses section of `AboutScreen` with:

```swift
            Section {
                Text(AboutCopy.bundled)
                if let license = AboutCopy.fontLicense() {
                    Text(AboutCopy.font)
                    NavigationLink(AboutCopy.readFontLicense) {
                        ScrollView {
                            Text(license)
                                .font(.system(.footnote, design: .monospaced))
                                .padding(16)
                        }
                        .background(Tokens.ink)
                        .foregroundStyle(Tokens.text)
                        .navigationTitle(AboutCopy.fontLicenseTitle)
                        .navigationBarTitleDisplayMode(.inline)
                    }
                    .foregroundStyle(Tokens.brand)
                }
            } header: {
                SectionTitle("Licenses")
            }
```

After `AboutCopy.bundled`, add:

```swift
    static let font = "The painting cards set their titles in Bricolage Grotesque, a font under the SIL Open Font License, version 1.1, which comes with it."
    static let readFontLicense = "Read the font's license"
    static let fontLicenseTitle = "SIL Open Font License"

    /// The display face's license, shipped beside the painter page with the
    /// font (IOS-019); nil in a build without the font.
    static func fontLicense() -> String? {
        Bundle.main.url(forResource: "OFL", withExtension: "txt", subdirectory: "web").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    }
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `PaintingFontTests` passes (2), and the app total is 301.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Home/SettingsScreen.swift ios/AppTests/PaintingTests.swift
git commit -m "IOS-019: About credits the cards' display face and shows its license"
```

### Task 9: The smoke paints a day

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`.

The smoke check is the test here. A seeded history goes into a scratch book, and the painter page paints the day and its card, neither blank.

- [ ] **Step 1: Add the check**

In `SmokeRunner.swift`:
- Add `import UIKit` after `import Foundation`.
- In `runAndExit`'s list, after `("journeyPage", checkJourneyPage),`, add `("paintingDay", checkPaintingDay),`.
- Before `/// Runs main-actor work to the end from the smoke's synchronous start`, add:

```swift
    /// A painting a day (IOS-019): a seeded history goes into a scratch
    /// book, and the painter page paints the day and its card, neither blank.
    static func checkPaintingDay() throws {
        if let failure = onMain({ await paintingDayFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func paintingDayFailure() async -> String? {
        guard let ladder = JourneyRules.live?.ranks.ranks else { return "the ladder did not load" }
        let folder = FileManager.default.temporaryDirectory.appending(path: "smoke-paintings-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = PaintingStore(file: folder.appending(path: "paintings.json"), ladder: ladder)
        let start = Date.now.addingTimeInterval(-3 * 86_400)
        let takes = (0..<12).map { i in
            HistoryEntry(at: start.addingTimeInterval(Double(i / 4) * 86_400 + Double(i % 4) * 900), durationMs: 20_000, words: Array(repeating: "word", count: 40 + i * 5).joined(separator: " "))
        }
        store.sync(takes)
        guard store.book.count == 3, let day = store.book.keys.sorted().last, let record = store.book[day] else { return "the book has \(store.book.count) days, not 3" }
        let painter = JourneyPainter()
        do {
            try await painter.waitUntilReady(seconds: 30)
        } catch {
            return "the painter page never said it was ready"
        }
        guard let picture = try? await painter.picture(.painting(record, width: 120, height: 90), scale: 2) else { return "the page painted no day" }
        guard inked(picture.image) > 100 else { return "the day's painting is blank" }
        guard let card = try? await painter.png(.card(day: day, record: record, longestMs: 20_000), scale: 2), let image = UIImage(data: card.data),
              image.size == CGSize(width: 1080, height: 1350), inked(image) > 10_000
        else { return "the card is missing or blank" }
        return nil
    }

    /// How many pixels hold paint.
    @MainActor private static func inked(_ image: UIImage) -> Int {
        guard let cg = image.cgImage else { return 0 }
        var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            return true
        }
        guard drawn else { return 0 }
        return stride(from: 3, to: bytes.count, by: 4).reduce(0) { $0 + (bytes[$1] > 20 ? 1 : 0) }
    }
```

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT` lists twenty-one checks, all true, `paintingDay` among them.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-019: the smoke paints a day from a seeded history, and its card"
```

### Task 10: The docs, the live check, and the notes

**Files:** Modify `ios/docs/iphone.md`, `ios/README.md`, `HANDOFF.md`, and `ios/prd.json`.

- [ ] **Step 1: The docs**

At the end of `ios/docs/iphone.md`, add:

```markdown
## How does the painting a day work on iPhone?

The same way as on the Mac, painted by the same code. Each day gets one ink painting, and every take you dictate that day adds its next stroke. Tap the painting row on Home to open today's painting; the newest stroke paints itself in.

- **Its subject** is new each day, picked from fourteen (a moon over water, bamboo, a plum branch, mountains, a pine on a cliff, an orchid, a chrysanthemum, a lotus pond, a waterfall, a willow by the water, a boat on the river, a breaking wave, a maple branch, and snowfall), never the same as the day before or after.
- **Its size** is about the number of takes on a typical day for you, from 6 to 36 strokes. Once it has that many it is finished, and takes after that keep adding small marks.
- **Its seal** stamps on when it finishes, in the color of the belt you held when the day's first take landed.
- **Its light** comes with the seal: a dawn sun, a pale day sun, a setting sun, or a crescent moon and stars, from the hours you dictated in.
- **Its detail** grows with your belt: washes from blue, splatter from purple, a second motif from brown, the heaviest from black. Levels add a bird or two.

Earlier days wait under it in a strip; tap one to open it large. Save card saves a portrait card of the day (1080 by 1350) with its name, how far it got, and who painted it. Save the week, there once two of the last seven days have paintings, saves the seven days as one long scroll. Both open the share sheet, where Save Image puts them in Photos; murmur only adds to your photos and never looks at your library.

Your iPhone keeps its own paintings, made from the takes it keeps, and they stay when you delete takes. Its seed is its own too, so the same takes on your iPhone and your Mac paint different subjects until one murmur account joins them. With Reduce Motion on (Settings, Accessibility, Motion), the painting appears finished at once.
```

In `ios/README.md`, make the generated-files sentence end `\`shared/\`, and the Journey's painter page (\`ios/Web\`, bundled with desktop's brush engine and the cards' display face, which is fetched at install and never committed).`

- [ ] **Step 2: The live check**

In `HANDOFF.md`, under `## Now`, after the IOS-018 live check, add:

```markdown
- [ ] IOS-019 live check, once a TestFlight build with it is on your iPhone (added 2026-10-13). (1) Dictate a take with murmur, then open murmur. On Home, the Today's painting row should show a small painting. (2) Tap it. The newest stroke should paint itself in, with the painting's name and how many strokes are left under it. (3) Keep dictating through the day. When the painting finishes, opening it again should stamp its seal on and add the light of the hours you dictated in. (4) Tap Save card. The share sheet opens; tap Save Image. The first time, iPhone asks to let murmur add to your photos: allow it. The card should be in Photos. (5) After two days with paintings, Save the week appears under the strip; try it too. (6) Tell Claude what you saw.
```

- [ ] **Step 3: The notes**

In `ios/prd.json`, set IOS-019's `notes` to say:
- what was built and verified;
- the side-by-side numbers, with what produced them;
- every ruling above;
- that the live check waits for LaBroi (`passes` stays false);
- the gate counts.

Write only the notes field. Then run `npm run roadmap`.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/docs/iphone.md ios/README.md HANDOFF.md ios/prd.json
git commit -m "IOS-019: the iPhone docs answer how the painting a day works on iPhone"
```
