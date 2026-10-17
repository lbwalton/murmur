# Achievements, Cosmetics, and the Share Card (IOS-021) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The rest of what practice earns on iPhone, and a card worth posting: desktop's belt share card, painted from your last 30 days, saved or shared as an image.

**Architecture:**
- **What already holds.** Achievements unlock on the phone's own takes with desktop's rules since IOS-018 (MurmurCore's `Achievements`, `shared/achievement-vectors.json`, the Journey's stamps, and the smoke's `achievements` check, which runs three of desktop's histories through a real history store and matches desktop's ids and times). Styles and accents are earned since IOS-020. This story adds no change there.
- **The month in Swift.** Desktop's `dailyTotals` (`src/shared/analytics.ts`: words and takes for each of the last 30 days ending today, zero-filled, by each take's stored day) is ported to MurmurCore as `Analytics.dailyTotals`, held to desktop by a new `shared/analytics-vectors.json` that IOS-022 extends.
- **The card is desktop's code.** The painter page gains a `share` picture that calls desktop's own `paintShareCard` (`src/renderer/settings/cardPaint.ts`) at 840 by 440 points, saved at twice that, as desktop saves it. Its words are part of the picture, as on desktop. The display face is registered at desktop's condensed width (75%), because WebKit's canvas cannot condense a title the way desktop's Chromium does.
- **The screen.** The Journey's belt section gains a gold Share card row. It opens Your share card: the card large, desktop's line about it, and Save card through the share sheet (`murmur-belt.png`). Save card appears only once the card has painted; a card that fails says so and offers Try again.

**Tech Stack:** Swift 6, Swift Testing, SwiftUI (ShareLink, Transferable), WebKit, TypeScript, Vite, vitest.

**Spec:**
- `ios/prd.json` IOS-021, with `conventions` (design, parity, docs) and `decisions.painting` (share cards are painted in the web view).
- `CLAUDE.md` (the display face on the share cards, the brushwork, earned never bought) and `DESIGN.md`.
- Desktop's `src/renderer/settings/cardPaint.ts`, `ShareCard.tsx`, `src/shared/analytics.ts`, `docs/journey.md` (What do unlocks actually give me?, What is the share card?), all murmur's own.

The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** in a throwaway copy of `feature/ios` at 247d0f3:
- `npm run typecheck` was clean; `npm run test` passed 1006 (1001 + 5 month vectors).
- `swift test` passed 137 (134 + 3).
- `npm run ios:test` passed 333 app tests (328 + 5).
- `npm run ios:smoke` printed twenty-three true checks, `shareCard` among them.
- **Same month, same card.** One fixed month (a blue belt, two stripes, level 3, 21 days on the mat) was painted by the bundled page in Electron (the desktop app's Chromium) and on the simulator (WebKit), both 1680 by 880. The strokes, the belt, and the splatter are the same. Before the face fix the WebKit title ran wider (ink overlap 83.16%). After it, the titles match (91.45% ink overlap, 1.13% of pixels apart by more than 48 of 255); what remains is the monospace lines' glyph smoothing.
- **Screens rendered and read:** the Journey with its Share card row, Your share card at a white belt with 20 days, and an empty month (no belt, 0 words, still painted with its words).

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The card is desktop's code in the page;** the screen around it is native. Its words are part of the saved image, as on desktop, and VoiceOver reads them from the screen.
2. **Desktop's month is ported to MurmurCore** with shared vectors, which IOS-022's analytics extend.
3. **The display face is registered at 75% only.** WebKit's canvas lacks the `fontStretch` desktop uses to condense its titles, so the face matched at 85% and every card title ran wider than desktop's. Every use of the face on the page is a condensed title, so this sets the day card's and week scroll's titles at desktop's width too. If wrong: back to the range, and the titles run wide again.
4. **No founder on iPhone yet:** the card shows the rank practice has earned (IOS-029 joins the platforms).
5. **The Mac's window themes stay on the Mac.** Morning mist recolors the Mac's settings window; the iPhone's colors are generated once for the app, the keyboard, and the widgets. If wrong: themed tokens across all three, a story of its own.
6. **A new achievement shows on the Journey; the iPhone sends no notification for it.** IOS-022 asks for notification permission only for the recap.
7. **Achievements stand as IOS-018 built them** (criteria 1 and 5).
8. **The Photos purpose string names the belt card too.**
9. **Save card appears only once the card has painted;** a card that fails to paint says so with Try again, so saving never fails quietly.
10. **The Share card row sits in the Journey's belt section,** where desktop's button sits in its Journey head.

## Global Constraints

- Swift 6, iOS 26, compiling on Swift 6.3 (CI's Xcode 26.6): typed lets for long arithmetic, in tests too, no `Binding(get:set:)` closures.
- `shared/` stays the single source of shared rules; both platforms run the same vector files.
- No binary assets in the repo: the display face is fetched at install and never committed.
- Design: night studio tokens, no raw colors in code (the design lint checks Swift too); gold for Save card, Try again, and the Share card row; designed painting and failed states; text follows Dynamic Type; VoiceOver reads the card.
- Every source file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-021:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **The iPhone painting a different month than desktop** (the window's edges, takes outside it, two takes on a day, a new year, a leap day, a clock change). Pinned by `analytics-vectors.test.ts` (Task 1), `AnalyticsVectorTests` (Task 2), and `ShareCardTests.theCardReadsTheMonth` (Task 4).
2. **The card's titles set at a different width than desktop's.** Pinned by `scripts/lib/ios.test.js` (Task 3) and the side by side above.
3. **Save card failing quietly, or a card that never paints leaving an empty box.** Pinned by the painting and failed states in `ShareCardScreen` (Task 4); `ShareCardTests.anEmptyMonthStillPaints` keeps an empty month painted.
4. **A card at the wrong size, blank, or the same for two months.** Pinned by `ShareCardTests.theCardIsDesktops` and `aMonthPaintsItsOwnCard` (Task 4) and the smoke's `shareCard` check (Task 5).
5. **Copy promising more than the iPhone does** (notifications, themes). Pinned by reading the docs answer against rulings 5 and 6 (Task 5).

---

### Task 1: Desktop's month on shared takes

**Files:** Create `shared/analytics-vectors.json` and `src/shared/analytics-vectors.test.ts`.

Desktop is the oracle: each answer came from desktop's own `dailyTotals`, with its clock at local noon on each case's today, so the test passes on arrival; it pins desktop for the Swift port in Task 2.

- [ ] **Step 1: Add the vectors and their desktop test**

`shared/analytics-vectors.json`, whole (five months: nothing yet, gaps with two takes on a day and takes outside the window, a new year, a leap day, and a clock change):

```json
{
  "note": "Desktop's analytics (src/shared/analytics.ts) on fixed takes. dailyTotals: words and takes for each of the last count days ending today, oldest first, zero-filled, by each take's stored day, the share card's month (US-078). Desktop runs each case with its clock at local noon on today. Both platforms run these (IOS-021); IOS-022 adds the rest of the analytics.",
  "dailyTotals": [
    {
      "name": "nothing yet",
      "today": "2026-10-13",
      "count": 30,
      "takes": [],
      "expect": [
        { "day": "2026-09-14", "words": 0, "sessions": 0 },
        { "day": "2026-09-15", "words": 0, "sessions": 0 },
        { "day": "2026-09-16", "words": 0, "sessions": 0 },
        { "day": "2026-09-17", "words": 0, "sessions": 0 },
        { "day": "2026-09-18", "words": 0, "sessions": 0 },
        { "day": "2026-09-19", "words": 0, "sessions": 0 },
        { "day": "2026-09-20", "words": 0, "sessions": 0 },
        { "day": "2026-09-21", "words": 0, "sessions": 0 },
        { "day": "2026-09-22", "words": 0, "sessions": 0 },
        { "day": "2026-09-23", "words": 0, "sessions": 0 },
        { "day": "2026-09-24", "words": 0, "sessions": 0 },
        { "day": "2026-09-25", "words": 0, "sessions": 0 },
        { "day": "2026-09-26", "words": 0, "sessions": 0 },
        { "day": "2026-09-27", "words": 0, "sessions": 0 },
        { "day": "2026-09-28", "words": 0, "sessions": 0 },
        { "day": "2026-09-29", "words": 0, "sessions": 0 },
        { "day": "2026-09-30", "words": 0, "sessions": 0 },
        { "day": "2026-10-01", "words": 0, "sessions": 0 },
        { "day": "2026-10-02", "words": 0, "sessions": 0 },
        { "day": "2026-10-03", "words": 0, "sessions": 0 },
        { "day": "2026-10-04", "words": 0, "sessions": 0 },
        { "day": "2026-10-05", "words": 0, "sessions": 0 },
        { "day": "2026-10-06", "words": 0, "sessions": 0 },
        { "day": "2026-10-07", "words": 0, "sessions": 0 },
        { "day": "2026-10-08", "words": 0, "sessions": 0 },
        { "day": "2026-10-09", "words": 0, "sessions": 0 },
        { "day": "2026-10-10", "words": 0, "sessions": 0 },
        { "day": "2026-10-11", "words": 0, "sessions": 0 },
        { "day": "2026-10-12", "words": 0, "sessions": 0 },
        { "day": "2026-10-13", "words": 0, "sessions": 0 }
      ]
    },
    {
      "name": "a month with gaps, two takes on one day, one too old, one tomorrow",
      "today": "2026-10-13",
      "count": 30,
      "takes": [
        { "day": "2026-09-13", "words": 999 },
        { "day": "2026-09-14", "words": 120 },
        { "day": "2026-09-20", "words": 40 },
        { "day": "2026-10-01", "words": 300 },
        { "day": "2026-10-01", "words": 45 },
        { "day": "2026-10-13", "words": 7 },
        { "day": "2026-10-14", "words": 500 }
      ],
      "expect": [
        { "day": "2026-09-14", "words": 120, "sessions": 1 },
        { "day": "2026-09-15", "words": 0, "sessions": 0 },
        { "day": "2026-09-16", "words": 0, "sessions": 0 },
        { "day": "2026-09-17", "words": 0, "sessions": 0 },
        { "day": "2026-09-18", "words": 0, "sessions": 0 },
        { "day": "2026-09-19", "words": 0, "sessions": 0 },
        { "day": "2026-09-20", "words": 40, "sessions": 1 },
        { "day": "2026-09-21", "words": 0, "sessions": 0 },
        { "day": "2026-09-22", "words": 0, "sessions": 0 },
        { "day": "2026-09-23", "words": 0, "sessions": 0 },
        { "day": "2026-09-24", "words": 0, "sessions": 0 },
        { "day": "2026-09-25", "words": 0, "sessions": 0 },
        { "day": "2026-09-26", "words": 0, "sessions": 0 },
        { "day": "2026-09-27", "words": 0, "sessions": 0 },
        { "day": "2026-09-28", "words": 0, "sessions": 0 },
        { "day": "2026-09-29", "words": 0, "sessions": 0 },
        { "day": "2026-09-30", "words": 0, "sessions": 0 },
        { "day": "2026-10-01", "words": 345, "sessions": 2 },
        { "day": "2026-10-02", "words": 0, "sessions": 0 },
        { "day": "2026-10-03", "words": 0, "sessions": 0 },
        { "day": "2026-10-04", "words": 0, "sessions": 0 },
        { "day": "2026-10-05", "words": 0, "sessions": 0 },
        { "day": "2026-10-06", "words": 0, "sessions": 0 },
        { "day": "2026-10-07", "words": 0, "sessions": 0 },
        { "day": "2026-10-08", "words": 0, "sessions": 0 },
        { "day": "2026-10-09", "words": 0, "sessions": 0 },
        { "day": "2026-10-10", "words": 0, "sessions": 0 },
        { "day": "2026-10-11", "words": 0, "sessions": 0 },
        { "day": "2026-10-12", "words": 0, "sessions": 0 },
        { "day": "2026-10-13", "words": 7, "sessions": 1 }
      ]
    },
    {
      "name": "across a new year",
      "today": "2027-01-05",
      "count": 30,
      "takes": [
        { "day": "2026-12-07", "words": 10 },
        { "day": "2026-12-31", "words": 250 },
        { "day": "2027-01-01", "words": 80 },
        { "day": "2027-01-05", "words": 1200 },
        { "day": "2026-12-06", "words": 3 }
      ],
      "expect": [
        { "day": "2026-12-07", "words": 10, "sessions": 1 },
        { "day": "2026-12-08", "words": 0, "sessions": 0 },
        { "day": "2026-12-09", "words": 0, "sessions": 0 },
        { "day": "2026-12-10", "words": 0, "sessions": 0 },
        { "day": "2026-12-11", "words": 0, "sessions": 0 },
        { "day": "2026-12-12", "words": 0, "sessions": 0 },
        { "day": "2026-12-13", "words": 0, "sessions": 0 },
        { "day": "2026-12-14", "words": 0, "sessions": 0 },
        { "day": "2026-12-15", "words": 0, "sessions": 0 },
        { "day": "2026-12-16", "words": 0, "sessions": 0 },
        { "day": "2026-12-17", "words": 0, "sessions": 0 },
        { "day": "2026-12-18", "words": 0, "sessions": 0 },
        { "day": "2026-12-19", "words": 0, "sessions": 0 },
        { "day": "2026-12-20", "words": 0, "sessions": 0 },
        { "day": "2026-12-21", "words": 0, "sessions": 0 },
        { "day": "2026-12-22", "words": 0, "sessions": 0 },
        { "day": "2026-12-23", "words": 0, "sessions": 0 },
        { "day": "2026-12-24", "words": 0, "sessions": 0 },
        { "day": "2026-12-25", "words": 0, "sessions": 0 },
        { "day": "2026-12-26", "words": 0, "sessions": 0 },
        { "day": "2026-12-27", "words": 0, "sessions": 0 },
        { "day": "2026-12-28", "words": 0, "sessions": 0 },
        { "day": "2026-12-29", "words": 0, "sessions": 0 },
        { "day": "2026-12-30", "words": 0, "sessions": 0 },
        { "day": "2026-12-31", "words": 250, "sessions": 1 },
        { "day": "2027-01-01", "words": 80, "sessions": 1 },
        { "day": "2027-01-02", "words": 0, "sessions": 0 },
        { "day": "2027-01-03", "words": 0, "sessions": 0 },
        { "day": "2027-01-04", "words": 0, "sessions": 0 },
        { "day": "2027-01-05", "words": 1200, "sessions": 1 }
      ]
    },
    {
      "name": "a leap day, two weeks",
      "today": "2028-03-10",
      "count": 14,
      "takes": [
        { "day": "2028-02-26", "words": 5 },
        { "day": "2028-02-29", "words": 64 },
        { "day": "2028-03-01", "words": 32 },
        { "day": "2028-02-25", "words": 9 }
      ],
      "expect": [
        { "day": "2028-02-26", "words": 5, "sessions": 1 },
        { "day": "2028-02-27", "words": 0, "sessions": 0 },
        { "day": "2028-02-28", "words": 0, "sessions": 0 },
        { "day": "2028-02-29", "words": 64, "sessions": 1 },
        { "day": "2028-03-01", "words": 32, "sessions": 1 },
        { "day": "2028-03-02", "words": 0, "sessions": 0 },
        { "day": "2028-03-03", "words": 0, "sessions": 0 },
        { "day": "2028-03-04", "words": 0, "sessions": 0 },
        { "day": "2028-03-05", "words": 0, "sessions": 0 },
        { "day": "2028-03-06", "words": 0, "sessions": 0 },
        { "day": "2028-03-07", "words": 0, "sessions": 0 },
        { "day": "2028-03-08", "words": 0, "sessions": 0 },
        { "day": "2028-03-09", "words": 0, "sessions": 0 },
        { "day": "2028-03-10", "words": 0, "sessions": 0 }
      ]
    },
    {
      "name": "the spring clock change",
      "today": "2027-03-20",
      "count": 30,
      "takes": [
        { "day": "2027-03-13", "words": 21 },
        { "day": "2027-03-14", "words": 34 },
        { "day": "2027-03-15", "words": 55 },
        { "day": "2027-02-19", "words": 89 }
      ],
      "expect": [
        { "day": "2027-02-19", "words": 89, "sessions": 1 },
        { "day": "2027-02-20", "words": 0, "sessions": 0 },
        { "day": "2027-02-21", "words": 0, "sessions": 0 },
        { "day": "2027-02-22", "words": 0, "sessions": 0 },
        { "day": "2027-02-23", "words": 0, "sessions": 0 },
        { "day": "2027-02-24", "words": 0, "sessions": 0 },
        { "day": "2027-02-25", "words": 0, "sessions": 0 },
        { "day": "2027-02-26", "words": 0, "sessions": 0 },
        { "day": "2027-02-27", "words": 0, "sessions": 0 },
        { "day": "2027-02-28", "words": 0, "sessions": 0 },
        { "day": "2027-03-01", "words": 0, "sessions": 0 },
        { "day": "2027-03-02", "words": 0, "sessions": 0 },
        { "day": "2027-03-03", "words": 0, "sessions": 0 },
        { "day": "2027-03-04", "words": 0, "sessions": 0 },
        { "day": "2027-03-05", "words": 0, "sessions": 0 },
        { "day": "2027-03-06", "words": 0, "sessions": 0 },
        { "day": "2027-03-07", "words": 0, "sessions": 0 },
        { "day": "2027-03-08", "words": 0, "sessions": 0 },
        { "day": "2027-03-09", "words": 0, "sessions": 0 },
        { "day": "2027-03-10", "words": 0, "sessions": 0 },
        { "day": "2027-03-11", "words": 0, "sessions": 0 },
        { "day": "2027-03-12", "words": 0, "sessions": 0 },
        { "day": "2027-03-13", "words": 21, "sessions": 1 },
        { "day": "2027-03-14", "words": 34, "sessions": 1 },
        { "day": "2027-03-15", "words": 55, "sessions": 1 },
        { "day": "2027-03-16", "words": 0, "sessions": 0 },
        { "day": "2027-03-17", "words": 0, "sessions": 0 },
        { "day": "2027-03-18", "words": 0, "sessions": 0 },
        { "day": "2027-03-19", "words": 0, "sessions": 0 },
        { "day": "2027-03-20", "words": 0, "sessions": 0 }
      ]
    }
  ]
}
```

`src/shared/analytics-vectors.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/analytics-vectors.json through the analytics. MurmurCore runs
// the same file, so the iPhone's share card paints from the month desktop's
// would (ios/prd.json IOS-021).
import { describe, expect, it } from 'vitest'
import vectors from '../../shared/analytics-vectors.json'
import { dailyTotals } from './analytics'
import type { SessionEvent } from './history'

interface Take {
  day: string
  words: number
}

/** Local noon on a day, as desktop's clock would read it that day. */
const noonOf = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

const event = (t: Take): SessionEvent => ({ at: noonOf(t.day), durationMs: 1000, rawText: '', finalText: '', words: t.words, wpm: 0, day: t.day, hour: 12 })

describe('shared/analytics-vectors.json', () => {
  for (const c of vectors.dailyTotals) {
    it(`daily totals: ${c.name}`, () => {
      expect(dailyTotals(c.takes.map(event), c.count, () => noonOf(c.today))).toEqual(c.expect)
    })
  }
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/shared/analytics-vectors.test.ts`
Expected: 5 pass. Then `npm run test` passes 1006.

- [ ] **Step 3: Run the gates and commit**

```bash
git add shared/analytics-vectors.json src/shared/analytics-vectors.test.ts
git commit -m "IOS-021: desktop's month of words and takes on shared cases, for both platforms to run"
```

### Task 2: The month in MurmurCore

**Files:** Create `ios/MurmurCore/Sources/MurmurCore/Analytics.swift`. Test `ios/MurmurCore/Tests/MurmurCoreTests/AnalyticsVectorTests.swift`.

**Interfaces:** Produces `DayTotal` (`day`, `words`, `sessions`; Sendable, Hashable) and `Analytics.cardDays` (30) and `Analytics.dailyTotals(_ events: [RankEvent], count:today:) -> [DayTotal]`.

- [ ] **Step 1: Write the failing test**

`ios/MurmurCore/Tests/MurmurCoreTests/AnalyticsVectorTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/analytics-vectors.json: desktop's analytics on fixed takes.
struct AnalyticsVectors: Decodable {
    struct Take: Decodable {
        let day: String
        let words: Int
    }

    struct Day: Decodable, Equatable {
        let day: String
        let words: Int
        let sessions: Int
    }

    struct DailyCase: Decodable, CustomTestStringConvertible {
        let name: String
        let today: String
        let count: Int
        let takes: [Take]
        let expect: [Day]

        var testDescription: String { name }
    }

    let dailyTotals: [DailyCase]

    static let file: AnalyticsVectors? = try? SharedData(directory: repoShared).decode(AnalyticsVectors.self, from: "analytics-vectors.json")
}

@Suite struct AnalyticsVectorTests {
    @Test func theVectorsLoad() throws {
        #expect(try #require(AnalyticsVectors.file).dailyTotals.count >= 5)
    }

    @Test(arguments: AnalyticsVectors.file?.dailyTotals ?? [])
    func eachMonthTotalsAsOnDesktop(_ vector: AnalyticsVectors.DailyCase) {
        let events = vector.takes.map { RankEvent(at: 0, words: $0.words, day: $0.day) }
        let days = Analytics.dailyTotals(events, count: vector.count, today: vector.today)
        #expect(days.map { AnalyticsVectors.Day(day: $0.day, words: $0.words, sessions: $0.sessions) } == vector.expect)
    }

    /// No days asked for is no days, and a take with no day key is left out.
    @Test func edges() {
        #expect(Analytics.dailyTotals([], count: 0, today: "2026-10-13").isEmpty)
        let odd = [RankEvent(at: 0, words: 9, day: "")]
        #expect(Analytics.dailyTotals(odd, count: 2, today: "2026-10-13").map(\.words) == [0, 0])
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore`
Expected: the build fails with `cannot find 'Analytics' in scope`.

- [ ] **Step 3: Port the month**

`ios/MurmurCore/Sources/MurmurCore/Analytics.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The analytics (ios/prd.json IOS-021, more with IOS-022): desktop's
// src/shared/analytics.ts over the iPhone's takes, held to it by
// shared/analytics-vectors.json. For now, the share card's month.
import Foundation

/// One day's words and takes.
public struct DayTotal: Sendable, Hashable {
    public let day: String
    public let words: Int
    public let sessions: Int

    public init(day: String, words: Int, sessions: Int) {
        self.day = day
        self.words = words
        self.sessions = sessions
    }
}

public enum Analytics {
    /// The days the share card paints (desktop's CARD_DAYS).
    public static let cardDays = 30

    /// Words and takes for each of the last `count` days ending `today`
    /// (a yyyy-MM-dd key), oldest first, zero-filled, by each take's stored
    /// day, as desktop's dailyTotals counts them.
    public static func dailyTotals(_ events: [RankEvent], count: Int, today: String) -> [DayTotal] {
        guard count > 0 else { return [] }
        let keys = (0..<count).map { Paintings.shiftDay(today, $0 - (count - 1)) }
        var words: [String: Int] = [:]
        var sessions: [String: Int] = [:]
        let wanted = Set(keys)
        for event in events where wanted.contains(event.day) {
            words[event.day, default: 0] += event.words
            sessions[event.day, default: 0] += 1
        }
        return keys.map { DayTotal(day: $0, words: words[$0] ?? 0, sessions: sessions[$0] ?? 0) }
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: 137 tests pass (1 known issue on purpose).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/Analytics.swift ios/MurmurCore/Tests/MurmurCoreTests/AnalyticsVectorTests.swift
git commit -m "IOS-021: MurmurCore totals the month as desktop does, on every shared case"
```

### Task 3: The page paints the belt card at desktop's width

**Files:** Modify `ios/Web/journey.ts`, `scripts/lib/ios.js`. Test `scripts/lib/ios.test.js`.

**Interfaces:** Produces the page's `share` picture: `{ kind: 'share', scale, days: CardDay[], rank: string, level: number }`, painted by desktop's `paintShareCard` at `CARD_W` by `CARD_H` (840 by 440).

- [ ] **Step 1: Write the failing test**

In `scripts/lib/ios.test.js`, the display face test's last expectation becomes:

```js
    // Condensed as desktop sets its titles, even where the canvas cannot
    // condense (WebKit, IOS-021).
    expect(rule).toContain('font-stretch: 75%;')
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run scripts/lib/ios.test.js`
Expected: `inlines the display face` fails: the rule says `font-stretch: 75% 85%`.

- [ ] **Step 3: Register the face condensed, and paint the card**

In `scripts/lib/ios.js`, `displayFaceRule` becomes:

```js
function displayFaceRule(woff2) {
  // Desktop sets its card titles condensed (75%) with the canvas's
  // fontStretch, which WebKit's canvas lacks; registered at 75% alone, the
  // face is set at desktop's width there too (IOS-021).
  return `@font-face { font-family: "murmur display"; src: url(data:font/woff2;base64,${woff2.toString('base64')}) format("woff2"); font-weight: 800; font-stretch: 75%; font-display: block; }`
}
```

In `ios/Web/journey.ts`, the header comment gains its last sentence, the card's import joins the painting imports, the `share` request joins `PictureRequest`, and its case closes `picture`'s switch:

```ts
// day's painting, its newest stroke painting in, and the saved card and
// week scroll, whose words are part of the picture, as on desktop. The belt
// share card (IOS-021) is desktop's too (settings/cardPaint.ts): the last
// thirty days as strokes, the rank in the display face.
```

```ts
import { CARD_H, CARD_W, type CardDay, paintShareCard } from '../../src/renderer/settings/cardPaint'
```

```ts
  | { kind: 'share'; scale: number; days: CardDay[]; rank: string; level: number }
```

```ts
    case 'share': {
      const fonts = cardFonts(await displayFace())
      const { el, ctx } = canvas(CARD_W, CARD_H, req.scale)
      // No founder on the iPhone yet: practice is the rank (IOS-029 joins them).
      paintShareCard(ctx, { days: req.days, rank: rank(req.rank) ?? LADDER[0], level: req.level, founder: false }, colors, fonts)
      return { png: el.toDataURL('image/png') }
    }
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run scripts/lib/ios.test.js`, then `npm run typecheck`.
Expected: all pass; typecheck clean.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Web/journey.ts scripts/lib/ios.js scripts/lib/ios.test.js
git commit -m "IOS-021: the painter page paints desktop's belt card, its titles at desktop's width"
```

### Task 4: Your share card on the Journey

**Files:**
- Create `ios/App/Journey/ShareCard.swift`.
- Modify `ios/App/Journey/JourneyPainter.swift`, `ios/App/Journey/JourneyScreen.swift`, and `ios/project.yml`.
- Test `ios/AppTests/ShareCardTests.swift`.

**Interfaces:**
- Consumes `Analytics.dailyTotals` and `DayTotal` (Task 2), the page's `share` picture (Task 3), `Journey.report`, `JourneyPainter`, and `PaintingShare` (IOS-019).
- Produces `JourneyArtwork.share(days:rank:level:)`, `ShareCard` (`from(_:rules:today:)`, `artwork`, `words`, `activeDays`), `ShareCardCopy`, and `ShareCardScreen(history:rules:)`.

- [ ] **Step 1: Write the failing test**

`ios/AppTests/ShareCardTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
import UIKit
@testable import murmur

/// The belt share card (IOS-021): desktop's card, from your last 30 days.
@MainActor @Suite(.serialized) struct ShareCardTests {
    /// UTC days, so no clock change or midnight moves a take.
    static let utc: Calendar = {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return utc
    }()

    /// `days` days of takes ending on `last` (a UTC day), `words` words each,
    /// two takes on every third day.
    func takes(days: Int, words: Int, last: Date = .now) -> [HistoryEntry] {
        (0..<days).flatMap { i -> [HistoryEntry] in
            let at = last.addingTimeInterval(Double(i - days + 1) * 86_400)
            let text = Array(repeating: "word", count: words).joined(separator: " ")
            let one = HistoryEntry(at: at, durationMs: 60_000, words: text, calendar: Self.utc)
            return i % 3 == 0 ? [one, HistoryEntry(at: at.addingTimeInterval(60), durationMs: 30_000, words: text, calendar: Self.utc)] : [one]
        }
    }

    func rules() throws -> JourneyRules {
        try #require(JourneyRules.live)
    }

    /// How many pixels hold paint or words, on the card's ink.
    func painted(_ image: UIImage) -> Int {
        let bytes = PaintingDifference.bytes(image)
        var count = 0
        for i in stride(from: 0, to: bytes.count, by: 4) {
            let red = Int(bytes[i])
            let green = Int(bytes[i + 1])
            let blue = Int(bytes[i + 2])
            let lift: Int = red + green + blue
            if lift > 46 + 90 { count += 1 }
        }
        return count
    }

    /// The month as desktop's card reads it: thirty days ending today, the
    /// words added up, the days with words, the rank, and the level.
    @Test func theCardReadsTheMonth() throws {
        let rules = try rules()
        let today = HistoryEntry.dayKey(.now, calendar: Self.utc)
        let entries = takes(days: 40, words: 50)
        let card = ShareCard.from(entries, rules: rules, today: today)
        #expect(card.days.count == 30)
        #expect(card.days.last?.day == today)
        #expect(card.days.first?.day == Paintings.shiftDay(today, -29))
        #expect(card.activeDays == 30)
        let inMonth = entries.filter { $0.day.map { $0 >= Paintings.shiftDay(today, -29) && $0 <= today } ?? false }
        #expect(card.words == inMonth.reduce(0) { $0 + $1.wordCount })
        #expect(card.days.contains { $0.sessions == 2 })
        let report = Journey.report(entries, rules: rules)
        #expect(card.rank == report.rank.id && card.label == report.rank.label && card.level == report.level)
    }

    /// The card is desktop's size, 840 by 440 saved at twice that, and it is
    /// painted, words and strokes.
    @Test func theCardIsDesktops() async throws {
        let painter = try await JourneyPainter.started()
        let card = ShareCard.from(takes(days: 20, words: 120), rules: try rules())
        let png = try await painter.png(card.artwork, scale: 2)
        let image = try #require(UIImage(data: png.data))
        #expect(image.size == CGSize(width: 1680, height: 880))
        #expect(painted(image) > 20_000)
    }

    /// The same month paints the same card; another month paints another.
    @Test func aMonthPaintsItsOwnCard() async throws {
        let painter = try await JourneyPainter.started()
        let rules = try rules()
        let one = ShareCard.from(takes(days: 20, words: 120), rules: rules)
        let other = ShareCard.from(takes(days: 9, words: 900), rules: rules)
        let first = try await painter.picture(one.artwork, scale: 1).image
        let again = try await painter.picture(one.artwork, scale: 1).image
        let second = try await painter.picture(other.artwork, scale: 1).image
        #expect(PaintingDifference(first, again).same)
        #expect(!PaintingDifference(first, second).same)
    }

    /// A month with no takes still paints the card's words: never blank.
    @Test func anEmptyMonthStillPaints() async throws {
        let painter = try await JourneyPainter.started()
        let card = ShareCard.from([], rules: try rules())
        #expect(card.words == 0 && card.activeDays == 0)
        let image = try await painter.picture(card.artwork, scale: 1).image
        #expect(painted(image) > 1_000)
    }

    @Test func theWordsArePlain() throws {
        let card = ShareCard(days: [DayTotal(day: "2026-10-13", words: 1234, sessions: 2), DayTotal(day: "2026-10-12", words: 0, sessions: 0)], rank: "white", label: "White belt", level: 1)
        #expect(ShareCardCopy.spoken(card) == "Share card: White belt, 1,234 words in the last 30 days, 1 day on the mat, level 1.")
        #expect(ShareCardCopy.fileName == "murmur-belt.png")
        for line in [ShareCardCopy.row, ShareCardCopy.title, ShareCardCopy.about, ShareCardCopy.save, ShareCardCopy.painting, ShareCardCopy.failed, ShareCardCopy.tryAgain] {
            #expect(!line.contains("Murmur") && !line.contains("\u{2014}") && !line.contains(" - "))
        }
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: the app's tests fail to build: `cannot find 'ShareCard' in scope`.

- [ ] **Step 3: Build the card's screen**

`ios/App/Journey/ShareCard.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The belt share card (ios/prd.json IOS-021): desktop's card, painted from
// your last thirty days by desktop's own code in the painter page (a stroke
// for each day you dictated, longer for more words, heavier for more takes,
// ember on your three biggest), with your rank set in the display face. The
// screen shows it and saves it through the share sheet; nothing is sent
// anywhere.
import MurmurCore
import SwiftUI

/// What the card paints: the last thirty days and where practice stands.
struct ShareCard: Hashable, Sendable {
    let days: [DayTotal]
    let rank: String
    let label: String
    let level: Int

    /// The card for these takes, with `today` the last of its days.
    static func from(_ entries: [HistoryEntry], rules: JourneyRules, today: String = HistoryEntry.dayKey(.now)) -> ShareCard {
        let report = Journey.report(entries, rules: rules)
        let days = Analytics.dailyTotals(entries.map(\.rankEvent), count: Analytics.cardDays, today: today)
        return ShareCard(days: days, rank: report.rank.id, label: report.rank.label, level: report.level)
    }

    var artwork: JourneyArtwork { .share(days: days, rank: rank, level: level) }

    /// The month's words, as the card adds them.
    var words: Int { days.reduce(0) { $0 + $1.words } }

    /// Days with words, the card's days on the mat.
    var activeDays: Int { days.filter { $0.words > 0 }.count }
}

/// The share card's words.
enum ShareCardCopy {
    static let row = "Share card"
    static let title = "Your share card"
    static let about = "Painted from your last 30 days: a stroke for each day you dictated, ember on your three biggest."
    static let save = "Save card"
    static let painting = "Painting your card"
    static let failed = "The card did not paint."
    static let tryAgain = "Try again"
    /// Desktop's file name for the belt card.
    static let fileName = "murmur-belt.png"

    /// What VoiceOver reads for the card: its words, which are part of the
    /// picture.
    static func spoken(_ card: ShareCard) -> String {
        let words = card.words.formatted(.number)
        let days = card.activeDays == 1 ? "1 day" : "\(card.activeDays) days"
        return "Share card: \(card.label), \(words) words in the last 30 days, \(days) on the mat, level \(card.level)."
    }
}

/// The card, shown large, with Save card.
struct ShareCardScreen: View {
    let history: History
    let rules: JourneyRules
    @Environment(\.displayScale) private var scale
    @State private var shown: Shown = .painting
    @State private var attempt = 0

    enum Shown: Equatable {
        case painting
        case painted(UIImage)
        case failed
    }

    /// The card's size in points, desktop's.
    static let size = CGSize(width: 840, height: 440)

    var body: some View {
        // Made here, so the card is read only while the screen is open.
        let card = ShareCard.from(history.entries, rules: rules)
        List {
            Section {
                preview(card)
                    .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
                Text(ShareCardCopy.about)
                    .foregroundStyle(Tokens.textDim)
                switch shown {
                case let .painted(image):
                    ShareLink(item: PaintingShare(name: ShareCardCopy.fileName, artwork: card.artwork), preview: SharePreview(ShareCardCopy.title, image: Image(uiImage: image))) {
                        Text(ShareCardCopy.save)
                            .foregroundStyle(Tokens.brand)
                            .frame(minHeight: 44)
                    }
                case .failed:
                    Button(ShareCardCopy.tryAgain) { attempt += 1 }
                        .buttonStyle(RowAction())
                        .frame(minHeight: 44)
                case .painting:
                    EmptyView()
                }
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(ShareCardCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: Paint(card: card, scale: scale, attempt: attempt)) {
            shown = .painting
            do {
                shown = .painted(try await JourneyPainter.shared.picture(card.artwork, scale: scale).image)
            } catch {
                shown = .failed
            }
        }
    }

    private struct Paint: Hashable {
        let card: ShareCard
        let scale: CGFloat
        let attempt: Int
    }

    @ViewBuilder private func preview(_ card: ShareCard) -> some View {
        let ratio = Self.size.width / Self.size.height
        switch shown {
        case let .painted(image):
            Image(uiImage: image)
                .resizable()
                .aspectRatio(ratio, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .accessibilityLabel(ShareCardCopy.spoken(card))
                .accessibilityAddTraits(.isImage)
        case .painting, .failed:
            RoundedRectangle(cornerRadius: 10)
                .fill(Tokens.panelLift)
                .aspectRatio(ratio, contentMode: .fit)
                .overlay {
                    Text(shown == .failed ? ShareCardCopy.failed : ShareCardCopy.painting)
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                        .padding()
                }
                .accessibilityElement(children: .combine)
        }
    }
}
```

In `ios/App/Journey/JourneyPainter.swift`, `JourneyArtwork` gains the card and its fields:

```swift
    /// The belt share card, at desktop's 840 by 440 points (IOS-021).
    case share(days: [DayTotal], rank: String, level: Int)
```

```swift
        case let .share(days, rank, level):
            let painted = days.map { ["day": $0.day, "words": $0.words, "sessions": $0.sessions] as [String: Any] }
            return ["kind": "share", "days": painted, "rank": rank, "level": level]
```

In `ios/App/Journey/JourneyScreen.swift`, the belt section gains the row after its `VStack`:

```swift
                NavigationLink {
                    ShareCardScreen(history: history, rules: rules)
                } label: {
                    Text(ShareCardCopy.row)
                        .foregroundStyle(Tokens.brand)
                        .frame(minHeight: 44)
                }
```

In `ios/project.yml`:

```yaml
        NSPhotoLibraryAddUsageDescription: murmur adds the cards you choose to save, your paintings and your belt card, to your photos, and never looks at your library.
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm run ios:test`
Expected: MurmurCore 137; 333 app tests pass, `ShareCardTests` among them.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Journey/ShareCard.swift ios/App/Journey/JourneyPainter.swift ios/App/Journey/JourneyScreen.swift ios/project.yml ios/AppTests/ShareCardTests.swift
git commit -m "IOS-021: the Journey's Share card paints desktop's belt card from your month and saves it"
```

### Task 5: The smoke, the words, and the live check

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`, `ios/App/Look/Look.swift`, `ios/AppTests/LookTests.swift`, `ios/docs/iphone.md`, `HANDOFF.md`, and `ios/prd.json`.

- [ ] **Step 1: Write the failing test**

In `LookTests.theWordsAreThePlainOnes`, before its footer loop:

```swift
        #expect(LookCopy.accentFooter.contains("earned by practice, never bought, and changes only how the pill looks"))
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: `theWordsAreThePlainOnes` fails: the accent footer does not say it.

- [ ] **Step 3: Say it, and add the smoke check**

In `ios/App/Look/Look.swift`:

```swift
    static let accentFooter = "The paint the pill draws with while you speak. It dries to a darker shade of itself when the brush lifts; signal amber dries to gold. Every style and accent is earned by practice, never bought, and changes only how the pill looks."
```

In `SmokeRunner`'s list, after `("look", checkLook),`:

```swift
            ("shareCard", checkShareCard),
```

Before `/// Runs main-actor work to the end from the smoke's synchronous start`:

```swift
    /// The belt share card (IOS-021): a seeded month (in UTC, so no clock
    /// change moves a take) is totaled as desktop totals it, and the painter
    /// page paints desktop's card from it at 1680 by 880, not blank.
    static func checkShareCard() throws {
        if let failure = onMain({ await shareCardFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func shareCardFailure() async -> String? {
        guard let rules = JourneyRules.live else { return "the ladder did not load" }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let today = HistoryEntry.dayKey(.now, calendar: utc)
        let takes = (0..<12).map { i in
            HistoryEntry(at: Date.now.addingTimeInterval(Double(-i * 2) * 86_400), durationMs: 30_000, words: Array(repeating: "word", count: 60 + i * 40).joined(separator: " "), calendar: utc)
        }
        let card = ShareCard.from(takes, rules: rules, today: today)
        guard card.days.count == 30, card.days.last?.day == today, card.activeDays == 12, card.words == takes.reduce(0, { $0 + $1.wordCount }) else {
            return "the month totaled \(card.activeDays) days and \(card.words) words"
        }
        let painter = JourneyPainter()
        do {
            try await painter.waitUntilReady(seconds: 30)
        } catch {
            return "the painter page never said it was ready"
        }
        guard let png = try? await painter.png(card.artwork, scale: 2), let image = UIImage(data: png.data) else { return "the page painted no card" }
        guard image.size == CGSize(width: 1680, height: 880) else { return "the card is \(image.size), not 1680 by 880" }
        guard lit(image) > 20_000 else { return "the card is blank" }
        return nil
    }

    /// How many pixels stand clear of the ink: paint and words.
    @MainActor private static func lit(_ image: UIImage) -> Int {
        guard let cg = image.cgImage else { return 0 }
        var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            return true
        }
        guard drawn else { return 0 }
        var count = 0
        for i in stride(from: 0, to: bytes.count, by: 4) {
            let red = Int(bytes[i])
            let green = Int(bytes[i + 1])
            let blue = Int(bytes[i + 2])
            let lift: Int = red + green + blue
            if lift > 136 { count += 1 }
        }
        return count
    }
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then `npm run ios:smoke`.
Expected: 333 app tests pass; twenty-three true checks, `shareCard` among them.

- [ ] **Step 5: Write the docs and the live check**

In `ios/docs/iphone.md`, before `## How does the painting a day work on iPhone?`:

```markdown
## What can I earn on iPhone?

Everything murmur gives for practice is earned by dictating and never bought, and none of it changes what murmur does: your words, cleanup, and the keyboard work the same at every belt. On iPhone you earn:

- **Belts, stripes, and levels,** from the words and days you dictate (see How do belts work on iPhone?).
- **Fourteen achievements,** inked as stamps on the Journey: your first take; three, seven, thirty, and a hundred days in a row; a thousand, five thousand, and ten thousand words in one day; a hundred and a thousand takes; a take past five minutes; dictating between midnight and four; dictating before six in the morning; and coming back after a week away. A new one shows on the Journey the next time you open it; the iPhone sends no notification for it.
- **Waveform styles** for the pill: pulse and ink dabs at white belt, ink flecks at blue, ink rings at purple, and the ink ribbon at brown (see How do I change the waveform on iPhone?).
- **Accent colors** for the pill: your belt color and each belt's own color with that belt, and ember red, moonlight, and dawn with the take past five minutes, dictating after midnight, and dictating before six (see How do I change the pill's color on iPhone?).
- **Your belt card,** painted from your last 30 days (see How do I share my belt card on iPhone?), and **a painting a day.**

Locked styles and accents stay on the Look screen with what earns them, and locked achievements on the Journey. The Mac's window themes, like morning mist at blue belt, color the Mac's settings window; the iPhone keeps murmur's night studio look. Your iPhone counts only the takes it keeps; one Journey across your devices comes with the murmur account.

## How do I share my belt card on iPhone?

Open the Journey from Home and tap Share card. murmur paints a card from your last 30 days, the same card the Mac paints from the same days: one brush stroke for each day you dictated, longer for more words and heavier for more takes, with your three biggest days in ember, over your painted belt, your rank, its title, your words and days on the mat for those 30 days, and your level.

Tap Save card and the share sheet opens. Save Image puts it in Photos; the first time, iPhone asks to let murmur add to your photos, and murmur never looks at your library. Or send it anywhere the share sheet reaches. The card is painted on your iPhone, and nothing is sent anywhere unless you send it. VoiceOver reads the card's rank, words, days on the mat, and level.
```

In `HANDOFF.md`, after the IOS-020 live check:

```markdown
- [ ] IOS-021 live check, once a TestFlight build with it is on your iPhone (added 2026-10-13). (1) In murmur, open the Journey from Home and tap Share card. A card painted from your last 30 days should appear: your painted belt, your rank in big letters, your words and days on the mat, and a burst of brush strokes on the right, the biggest days in orange. (2) Tap Save card, then Save Image. The first time, iPhone asks to let murmur add to your photos: allow it. The card should be in Photos. (3) Share it once, for real or to yourself in Messages. (4) Tell Claude what you saw.
```

In `ios/prd.json`, IOS-021's `notes` say how each criterion was verified: the vectors and test counts, the smoke, the side by side against desktop's Chromium, the screens, these rulings, and the live check that waits on LaBroi (`passes` stays false). Run `npm run roadmap`.

- [ ] **Step 6: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift ios/App/Look/Look.swift ios/AppTests/LookTests.swift ios/docs/iphone.md HANDOFF.md ios/prd.json ROADMAP.md
git commit -m "IOS-021: the smoke paints the belt card from a seeded month; the docs answer what you can earn on iPhone"
```
