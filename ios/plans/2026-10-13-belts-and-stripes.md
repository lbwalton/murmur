# Belts and Stripes (IOS-017) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Practice earns rank on the phone too. The same belts, stripes, and two gates as desktop come from `shared/ranks.json`, and the Swift math agrees with desktop's on shared cases. The iPhone counts only its own takes. A Journey screen (plain native views until IOS-018 paints it) shows:
- the belt, its stripes, and the level;
- the words and days toward the next belt;
- the dated promotions.

**Architecture:**
- `MurmurCore/Ranks.swift` ports desktop's `computeProgress` (src/shared/ranks.ts).
- `shared/rank-vectors.json` holds 12 histories with the answers desktop's own `computeProgress` gave. A desktop test and a MurmurCore test run them both, so a change on either platform breaks one suite until the other agrees.
- `HistoryEntry` now stores the local day it was spoken on, as desktop stores it, so a timezone change never re-buckets a take. Older takes fall back to their date now.
- The app computes the report from history, the takes this iPhone keeps.
- Home gains a Journey row, which opens `JourneyScreen`.

**Tech Stack:** Swift 6, Swift Testing, SwiftUI (List, ProgressView), vitest.

**Spec:**
- `ios/prd.json` IOS-017, with `conventions` (design, parity, docs), `CLAUDE.md`, and `DESIGN.md`.
- Desktop's src/shared/ranks.ts and src/shared/history.ts (eventDay, dayKey), murmur's own.
- docs/journey.md for the words used to describe belts.

The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** in a throwaway copy of `feature/ios` at 7f22eb9:
- `npm run test` passed 922 (910 plus the 12 vector cases).
- `swift test` passed 112: 110, plus one load test, plus the 12 vectors run as one parameterized test.
- `npm run ios:test` passed 239 app tests (233 there plus 6 new).
- `npm run ios:smoke` printed eighteen true checks, `journey` among them.
- The Journey screen (a white belt, two stripes) and the fresh no-belt state were rendered and read, along with the Home row. That read caught and fixed a doubled "Toward" line and a met gate reading "7 of 6 days".

On this branch's head (381a903, after IOS-016's review fixes) the app suite starts at 241. None of the files this plan replaces whole changed there.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The belt math is ported to MurmurCore, with parity kept by shared vectors.** Their answers came from desktop's own code, and both suites run them.
2. **History stores the local day each take was spoken on,** desktop's rule, so an earned belt never moves with a timezone. Takes kept before this story fall back to their date in today's timezone.
3. **No founder on iPhone yet.** The math supports the founder (a vector covers it), but the app passes `founder: false`. On his phone, LaBroi sees the belt his practice has earned; founder identity on iPhone comes with the murmur account (IOS-029). If wrong: one flag from a setting.
4. **Deleting or clearing takes lowers the count,** as clearing history does on desktop.
5. **The Journey opens from a row on Home, under the session,** in plain native views until IOS-018 paints it.
6. **Belt colors come from `shared/cosmetics.json`,** since the design lint forbids raw colors outside tokens. The black belt's bar uses the red belt's color, as the real belt does.
7. **An open gate says "7,380 of 12,000 words".** A met gate says "7 days you dictated, 6 needed", never "7 of 6".
8. **The live check waits for TestFlight.**

## Global Constraints

- Swift 6, iOS 26, compiling on Swift 6.3 (CI's Xcode 26.6).
- `shared/` stays the single source of shared rules; both platforms test the same vector file.
- Design: night studio tokens.
  - No raw colors in code (the design lint checks).
  - Gold for labels and a met gate; no red but the black belt's own bar.
  - 44 point rows, and VoiceOver reads the belt and each gate as one element.
- Every source file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-017:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **The two platforms disagreeing on a history.** Watch for:
   - takes out of order, or several in one day;
   - several promotions in one take;
   - the stored day against the clock;
   - levels, and the founder.
   Pinned by `rank-vectors.test.ts` (Task 1) and `RankVectorTests` (Task 2).
2. **A timezone change moving a take to another day.** Pinned by `JourneyTests.aTakeKeepsTheDayItWasSpokenOn` (Task 3).
3. **Takes kept before this story losing their count.** Pinned by `JourneyTests.anOlderTakeWithoutADayStillCounts` (Task 3).
4. **The iPhone's math drifting from history after a store round trip.** Pinned by the smoke's `journey` check (Task 5).
5. **Gate lines that read wrong at the edges** (met, singular). Pinned by `JourneyCopyTests.gatesSayTheirNumbers` (Task 4).

---

### Task 1: The shared rank vectors

**Files:** Create `shared/rank-vectors.json` and `src/shared/rank-vectors.test.ts`.

Desktop is the oracle here. Each case's answers came from its own `computeProgress`, so this test passes on arrival; it pins desktop's behavior for the Swift port in Task 2.

- [ ] **Step 1: Add the vectors and their desktop test**

`shared/rank-vectors.json`, whole (12 cases):

```json
{
  "comment": "Shared cases for the belt math (ios/prd.json IOS-017): each runs a history through computeProgress (src/shared/ranks.ts) and through MurmurCore's Ranks, which must agree. Events carry the local day they were recorded on, as both platforms store it. Expected values came from desktop's own computeProgress; change the math in one place and both test suites fail until the other agrees.",
  "cases": [
    {
      "name": "a fresh log has no belt",
      "events": [],
      "expect": {
        "rank": "none",
        "index": 0,
        "next": "white",
        "words": {
          "have": 0,
          "need": 100,
          "pct": 0
        },
        "activeDays": {
          "have": 0,
          "need": 1,
          "pct": 0
        },
        "totals": {
          "words": 0,
          "activeDays": 0
        },
        "promotions": [],
        "level": 1,
        "practice": {
          "rank": "none",
          "next": "white",
          "words": {
            "have": 0,
            "need": 100,
            "pct": 0
          },
          "activeDays": {
            "have": 0,
            "need": 1,
            "pct": 0
          }
        }
      }
    },
    {
      "name": "the first real take earns the white belt",
      "events": [
        {
          "at": 1767625200000,
          "words": 150,
          "day": "2026-01-05"
        }
      ],
      "expect": {
        "rank": "white",
        "index": 1,
        "next": "white-1",
        "words": {
          "have": 150,
          "need": 2500,
          "pct": 0.06
        },
        "activeDays": {
          "have": 1,
          "need": 2,
          "pct": 0.5
        },
        "totals": {
          "words": 150,
          "activeDays": 1
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          }
        ],
        "level": 1,
        "practice": {
          "rank": "white",
          "next": "white-1",
          "words": {
            "have": 150,
            "need": 2500,
            "pct": 0.06
          },
          "activeDays": {
            "have": 1,
            "need": 2,
            "pct": 0.5
          }
        }
      }
    },
    {
      "name": "below the first gate stays at no belt",
      "events": [
        {
          "at": 1767625200000,
          "words": 99,
          "day": "2026-01-05"
        }
      ],
      "expect": {
        "rank": "none",
        "index": 0,
        "next": "white",
        "words": {
          "have": 99,
          "need": 100,
          "pct": 0.99
        },
        "activeDays": {
          "have": 1,
          "need": 1,
          "pct": 1
        },
        "totals": {
          "words": 99,
          "activeDays": 1
        },
        "promotions": [],
        "level": 1,
        "practice": {
          "rank": "none",
          "next": "white",
          "words": {
            "have": 99,
            "need": 100,
            "pct": 0.99
          },
          "activeDays": {
            "have": 1,
            "need": 1,
            "pct": 1
          }
        }
      }
    },
    {
      "name": "words alone cannot skip the day gate",
      "events": [
        {
          "at": 1767625200000,
          "words": 500000,
          "day": "2026-01-05"
        },
        {
          "at": 1767711600000,
          "words": 500000,
          "day": "2026-01-06"
        }
      ],
      "expect": {
        "rank": "white-1",
        "index": 2,
        "next": "white-2",
        "words": {
          "have": 1000000,
          "need": 6000,
          "pct": 1
        },
        "activeDays": {
          "have": 2,
          "need": 4,
          "pct": 0.5
        },
        "totals": {
          "words": 1000000,
          "activeDays": 2
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          },
          {
            "id": "white-1",
            "at": 1767711600000
          }
        ],
        "level": 11,
        "practice": {
          "rank": "white-1",
          "next": "white-2",
          "words": {
            "have": 1000000,
            "need": 6000,
            "pct": 1
          },
          "activeDays": {
            "have": 2,
            "need": 4,
            "pct": 0.5
          }
        }
      }
    },
    {
      "name": "days alone cannot skip the word gate",
      "events": [
        {
          "at": 1767625200000,
          "words": 25,
          "day": "2026-01-05"
        },
        {
          "at": 1767711600000,
          "words": 25,
          "day": "2026-01-06"
        },
        {
          "at": 1767798000000,
          "words": 25,
          "day": "2026-01-07"
        },
        {
          "at": 1767884400000,
          "words": 25,
          "day": "2026-01-08"
        },
        {
          "at": 1767970800000,
          "words": 25,
          "day": "2026-01-09"
        },
        {
          "at": 1768057200000,
          "words": 25,
          "day": "2026-01-10"
        },
        {
          "at": 1768143600000,
          "words": 25,
          "day": "2026-01-11"
        },
        {
          "at": 1768230000000,
          "words": 25,
          "day": "2026-01-12"
        },
        {
          "at": 1768316400000,
          "words": 25,
          "day": "2026-01-13"
        },
        {
          "at": 1768402800000,
          "words": 25,
          "day": "2026-01-14"
        },
        {
          "at": 1768489200000,
          "words": 25,
          "day": "2026-01-15"
        },
        {
          "at": 1768575600000,
          "words": 25,
          "day": "2026-01-16"
        },
        {
          "at": 1768662000000,
          "words": 25,
          "day": "2026-01-17"
        },
        {
          "at": 1768748400000,
          "words": 25,
          "day": "2026-01-18"
        },
        {
          "at": 1768834800000,
          "words": 25,
          "day": "2026-01-19"
        },
        {
          "at": 1768921200000,
          "words": 25,
          "day": "2026-01-20"
        },
        {
          "at": 1769007600000,
          "words": 25,
          "day": "2026-01-21"
        },
        {
          "at": 1769094000000,
          "words": 25,
          "day": "2026-01-22"
        },
        {
          "at": 1769180400000,
          "words": 25,
          "day": "2026-01-23"
        },
        {
          "at": 1769266800000,
          "words": 25,
          "day": "2026-01-24"
        },
        {
          "at": 1769353200000,
          "words": 25,
          "day": "2026-01-25"
        },
        {
          "at": 1769439600000,
          "words": 25,
          "day": "2026-01-26"
        },
        {
          "at": 1769526000000,
          "words": 25,
          "day": "2026-01-27"
        },
        {
          "at": 1769612400000,
          "words": 25,
          "day": "2026-01-28"
        },
        {
          "at": 1769698800000,
          "words": 25,
          "day": "2026-01-29"
        },
        {
          "at": 1769785200000,
          "words": 25,
          "day": "2026-01-30"
        },
        {
          "at": 1769871600000,
          "words": 25,
          "day": "2026-01-31"
        },
        {
          "at": 1769958000000,
          "words": 25,
          "day": "2026-02-01"
        },
        {
          "at": 1770044400000,
          "words": 25,
          "day": "2026-02-02"
        },
        {
          "at": 1770130800000,
          "words": 25,
          "day": "2026-02-03"
        },
        {
          "at": 1770217200000,
          "words": 25,
          "day": "2026-02-04"
        },
        {
          "at": 1770303600000,
          "words": 25,
          "day": "2026-02-05"
        },
        {
          "at": 1770390000000,
          "words": 25,
          "day": "2026-02-06"
        },
        {
          "at": 1770476400000,
          "words": 25,
          "day": "2026-02-07"
        },
        {
          "at": 1770562800000,
          "words": 25,
          "day": "2026-02-08"
        },
        {
          "at": 1770649200000,
          "words": 25,
          "day": "2026-02-09"
        },
        {
          "at": 1770735600000,
          "words": 25,
          "day": "2026-02-10"
        },
        {
          "at": 1770822000000,
          "words": 25,
          "day": "2026-02-11"
        },
        {
          "at": 1770908400000,
          "words": 25,
          "day": "2026-02-12"
        },
        {
          "at": 1770994800000,
          "words": 25,
          "day": "2026-02-13"
        },
        {
          "at": 1771081200000,
          "words": 25,
          "day": "2026-02-14"
        },
        {
          "at": 1771167600000,
          "words": 25,
          "day": "2026-02-15"
        },
        {
          "at": 1771254000000,
          "words": 25,
          "day": "2026-02-16"
        },
        {
          "at": 1771340400000,
          "words": 25,
          "day": "2026-02-17"
        },
        {
          "at": 1771426800000,
          "words": 25,
          "day": "2026-02-18"
        },
        {
          "at": 1771513200000,
          "words": 25,
          "day": "2026-02-19"
        },
        {
          "at": 1771599600000,
          "words": 25,
          "day": "2026-02-20"
        },
        {
          "at": 1771686000000,
          "words": 25,
          "day": "2026-02-21"
        },
        {
          "at": 1771772400000,
          "words": 25,
          "day": "2026-02-22"
        },
        {
          "at": 1771858800000,
          "words": 25,
          "day": "2026-02-23"
        },
        {
          "at": 1771945200000,
          "words": 25,
          "day": "2026-02-24"
        },
        {
          "at": 1772031600000,
          "words": 25,
          "day": "2026-02-25"
        },
        {
          "at": 1772118000000,
          "words": 25,
          "day": "2026-02-26"
        },
        {
          "at": 1772204400000,
          "words": 25,
          "day": "2026-02-27"
        },
        {
          "at": 1772290800000,
          "words": 25,
          "day": "2026-02-28"
        },
        {
          "at": 1772377200000,
          "words": 25,
          "day": "2026-03-01"
        },
        {
          "at": 1772463600000,
          "words": 25,
          "day": "2026-03-02"
        },
        {
          "at": 1772550000000,
          "words": 25,
          "day": "2026-03-03"
        },
        {
          "at": 1772636400000,
          "words": 25,
          "day": "2026-03-04"
        },
        {
          "at": 1772722800000,
          "words": 25,
          "day": "2026-03-05"
        },
        {
          "at": 1772809200000,
          "words": 25,
          "day": "2026-03-06"
        },
        {
          "at": 1772895600000,
          "words": 25,
          "day": "2026-03-07"
        },
        {
          "at": 1772982000000,
          "words": 25,
          "day": "2026-03-08"
        },
        {
          "at": 1773068400000,
          "words": 25,
          "day": "2026-03-09"
        },
        {
          "at": 1773154800000,
          "words": 25,
          "day": "2026-03-10"
        },
        {
          "at": 1773241200000,
          "words": 25,
          "day": "2026-03-11"
        },
        {
          "at": 1773327600000,
          "words": 25,
          "day": "2026-03-12"
        },
        {
          "at": 1773414000000,
          "words": 25,
          "day": "2026-03-13"
        },
        {
          "at": 1773500400000,
          "words": 25,
          "day": "2026-03-14"
        },
        {
          "at": 1773586800000,
          "words": 25,
          "day": "2026-03-15"
        },
        {
          "at": 1773673200000,
          "words": 25,
          "day": "2026-03-16"
        },
        {
          "at": 1773759600000,
          "words": 25,
          "day": "2026-03-17"
        },
        {
          "at": 1773846000000,
          "words": 25,
          "day": "2026-03-18"
        },
        {
          "at": 1773932400000,
          "words": 25,
          "day": "2026-03-19"
        },
        {
          "at": 1774018800000,
          "words": 25,
          "day": "2026-03-20"
        },
        {
          "at": 1774105200000,
          "words": 25,
          "day": "2026-03-21"
        },
        {
          "at": 1774191600000,
          "words": 25,
          "day": "2026-03-22"
        },
        {
          "at": 1774278000000,
          "words": 25,
          "day": "2026-03-23"
        },
        {
          "at": 1774364400000,
          "words": 25,
          "day": "2026-03-24"
        },
        {
          "at": 1774450800000,
          "words": 25,
          "day": "2026-03-25"
        },
        {
          "at": 1774537200000,
          "words": 25,
          "day": "2026-03-26"
        },
        {
          "at": 1774623600000,
          "words": 25,
          "day": "2026-03-27"
        },
        {
          "at": 1774710000000,
          "words": 25,
          "day": "2026-03-28"
        },
        {
          "at": 1774796400000,
          "words": 25,
          "day": "2026-03-29"
        },
        {
          "at": 1774882800000,
          "words": 25,
          "day": "2026-03-30"
        },
        {
          "at": 1774969200000,
          "words": 25,
          "day": "2026-03-31"
        },
        {
          "at": 1775055600000,
          "words": 25,
          "day": "2026-04-01"
        },
        {
          "at": 1775142000000,
          "words": 25,
          "day": "2026-04-02"
        },
        {
          "at": 1775228400000,
          "words": 25,
          "day": "2026-04-03"
        },
        {
          "at": 1775314800000,
          "words": 25,
          "day": "2026-04-04"
        },
        {
          "at": 1775401200000,
          "words": 25,
          "day": "2026-04-05"
        },
        {
          "at": 1775487600000,
          "words": 25,
          "day": "2026-04-06"
        },
        {
          "at": 1775574000000,
          "words": 25,
          "day": "2026-04-07"
        },
        {
          "at": 1775660400000,
          "words": 25,
          "day": "2026-04-08"
        },
        {
          "at": 1775746800000,
          "words": 25,
          "day": "2026-04-09"
        },
        {
          "at": 1775833200000,
          "words": 25,
          "day": "2026-04-10"
        },
        {
          "at": 1775919600000,
          "words": 25,
          "day": "2026-04-11"
        },
        {
          "at": 1776006000000,
          "words": 25,
          "day": "2026-04-12"
        },
        {
          "at": 1776092400000,
          "words": 25,
          "day": "2026-04-13"
        },
        {
          "at": 1776178800000,
          "words": 25,
          "day": "2026-04-14"
        }
      ],
      "expect": {
        "rank": "white-1",
        "index": 2,
        "next": "white-2",
        "words": {
          "have": 2500,
          "need": 6000,
          "pct": 0.4166666666666667
        },
        "activeDays": {
          "have": 100,
          "need": 4,
          "pct": 1
        },
        "totals": {
          "words": 2500,
          "activeDays": 100
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767884400000
          },
          {
            "id": "white-1",
            "at": 1776178800000
          }
        ],
        "level": 1,
        "practice": {
          "rank": "white-1",
          "next": "white-2",
          "words": {
            "have": 2500,
            "need": 6000,
            "pct": 0.4166666666666667
          },
          "activeDays": {
            "have": 100,
            "need": 4,
            "pct": 1
          }
        }
      }
    },
    {
      "name": "steady practice earns blue with a dated trail",
      "events": [
        {
          "at": 1767625200000,
          "words": 2000,
          "day": "2026-01-05"
        },
        {
          "at": 1767711600000,
          "words": 2000,
          "day": "2026-01-06"
        },
        {
          "at": 1767798000000,
          "words": 2000,
          "day": "2026-01-07"
        },
        {
          "at": 1767884400000,
          "words": 2000,
          "day": "2026-01-08"
        },
        {
          "at": 1767970800000,
          "words": 2000,
          "day": "2026-01-09"
        },
        {
          "at": 1768057200000,
          "words": 2000,
          "day": "2026-01-10"
        },
        {
          "at": 1768143600000,
          "words": 2000,
          "day": "2026-01-11"
        },
        {
          "at": 1768230000000,
          "words": 2000,
          "day": "2026-01-12"
        },
        {
          "at": 1768316400000,
          "words": 2000,
          "day": "2026-01-13"
        },
        {
          "at": 1768402800000,
          "words": 2000,
          "day": "2026-01-14"
        },
        {
          "at": 1768489200000,
          "words": 2000,
          "day": "2026-01-15"
        },
        {
          "at": 1768575600000,
          "words": 2000,
          "day": "2026-01-16"
        },
        {
          "at": 1768662000000,
          "words": 2000,
          "day": "2026-01-17"
        },
        {
          "at": 1768748400000,
          "words": 2000,
          "day": "2026-01-18"
        }
      ],
      "expect": {
        "rank": "blue",
        "index": 6,
        "next": "blue-1",
        "words": {
          "have": 28000,
          "need": 35000,
          "pct": 0.8
        },
        "activeDays": {
          "have": 14,
          "need": 20,
          "pct": 0.7
        },
        "totals": {
          "words": 28000,
          "activeDays": 14
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          },
          {
            "id": "white-1",
            "at": 1767711600000
          },
          {
            "id": "white-2",
            "at": 1767884400000
          },
          {
            "id": "white-3",
            "at": 1768057200000
          },
          {
            "id": "white-4",
            "at": 1768316400000
          },
          {
            "id": "blue",
            "at": 1768748400000
          }
        ],
        "level": 1,
        "practice": {
          "rank": "blue",
          "next": "blue-1",
          "words": {
            "have": 28000,
            "need": 35000,
            "pct": 0.8
          },
          "activeDays": {
            "have": 14,
            "need": 20,
            "pct": 0.7
          }
        }
      }
    },
    {
      "name": "several takes in one day count one day",
      "events": [
        {
          "at": 1767625200000,
          "words": 1500,
          "day": "2026-01-05"
        },
        {
          "at": 1767627000000,
          "words": 1500,
          "day": "2026-01-05"
        },
        {
          "at": 1767628800000,
          "words": 1500,
          "day": "2026-01-05"
        },
        {
          "at": 1767711600000,
          "words": 10,
          "day": "2026-01-06"
        }
      ],
      "expect": {
        "rank": "white-1",
        "index": 2,
        "next": "white-2",
        "words": {
          "have": 4510,
          "need": 6000,
          "pct": 0.7516666666666667
        },
        "activeDays": {
          "have": 2,
          "need": 4,
          "pct": 0.5
        },
        "totals": {
          "words": 4510,
          "activeDays": 2
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          },
          {
            "id": "white-1",
            "at": 1767711600000
          }
        ],
        "level": 1,
        "practice": {
          "rank": "white-1",
          "next": "white-2",
          "words": {
            "have": 4510,
            "need": 6000,
            "pct": 0.7516666666666667
          },
          "activeDays": {
            "have": 2,
            "need": 4,
            "pct": 0.5
          }
        }
      }
    },
    {
      "name": "takes out of order are walked in time order",
      "events": [
        {
          "at": 1767884400000,
          "words": 3000,
          "day": "2026-01-08"
        },
        {
          "at": 1767625200000,
          "words": 200,
          "day": "2026-01-05"
        },
        {
          "at": 1767798000000,
          "words": 3000,
          "day": "2026-01-07"
        },
        {
          "at": 1767711600000,
          "words": 3000,
          "day": "2026-01-06"
        }
      ],
      "expect": {
        "rank": "white-2",
        "index": 3,
        "next": "white-3",
        "words": {
          "have": 9200,
          "need": 12000,
          "pct": 0.7666666666666667
        },
        "activeDays": {
          "have": 4,
          "need": 6,
          "pct": 0.6666666666666666
        },
        "totals": {
          "words": 9200,
          "activeDays": 4
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          },
          {
            "id": "white-1",
            "at": 1767711600000
          },
          {
            "id": "white-2",
            "at": 1767884400000
          }
        ],
        "level": 1,
        "practice": {
          "rank": "white-2",
          "next": "white-3",
          "words": {
            "have": 9200,
            "need": 12000,
            "pct": 0.7666666666666667
          },
          "activeDays": {
            "have": 4,
            "need": 6,
            "pct": 0.6666666666666666
          }
        }
      }
    },
    {
      "name": "one take can earn several ranks at once",
      "events": [
        {
          "at": 1767625200000,
          "words": 100,
          "day": "2026-01-05"
        },
        {
          "at": 1767711600000,
          "words": 100,
          "day": "2026-01-06"
        },
        {
          "at": 1767798000000,
          "words": 100,
          "day": "2026-01-07"
        },
        {
          "at": 1767884400000,
          "words": 100,
          "day": "2026-01-08"
        },
        {
          "at": 1767970800000,
          "words": 100,
          "day": "2026-01-09"
        },
        {
          "at": 1768057200000,
          "words": 13000,
          "day": "2026-01-10"
        }
      ],
      "expect": {
        "rank": "white-3",
        "index": 4,
        "next": "white-4",
        "words": {
          "have": 13500,
          "need": 18000,
          "pct": 0.75
        },
        "activeDays": {
          "have": 6,
          "need": 9,
          "pct": 0.6666666666666666
        },
        "totals": {
          "words": 13500,
          "activeDays": 6
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          },
          {
            "id": "white-1",
            "at": 1768057200000
          },
          {
            "id": "white-2",
            "at": 1768057200000
          },
          {
            "id": "white-3",
            "at": 1768057200000
          }
        ],
        "level": 1,
        "practice": {
          "rank": "white-3",
          "next": "white-4",
          "words": {
            "have": 13500,
            "need": 18000,
            "pct": 0.75
          },
          "activeDays": {
            "have": 6,
            "need": 9,
            "pct": 0.6666666666666666
          }
        }
      }
    },
    {
      "name": "the stored day counts, not the clock (a timezone change never re-buckets)",
      "events": [
        {
          "at": 1767625200000,
          "words": 1000,
          "day": "2026-01-05"
        },
        {
          "at": 1767625260000,
          "words": 1600,
          "day": "2026-01-06"
        }
      ],
      "expect": {
        "rank": "white-1",
        "index": 2,
        "next": "white-2",
        "words": {
          "have": 2600,
          "need": 6000,
          "pct": 0.43333333333333335
        },
        "activeDays": {
          "have": 2,
          "need": 4,
          "pct": 0.5
        },
        "totals": {
          "words": 2600,
          "activeDays": 2
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          },
          {
            "id": "white-1",
            "at": 1767625260000
          }
        ],
        "level": 1,
        "practice": {
          "rank": "white-1",
          "next": "white-2",
          "words": {
            "have": 2600,
            "need": 6000,
            "pct": 0.43333333333333335
          },
          "activeDays": {
            "have": 2,
            "need": 4,
            "pct": 0.5
          }
        }
      }
    },
    {
      "name": "levels climb every hundred thousand words",
      "events": [
        {
          "at": 1767625200000,
          "words": 8500,
          "day": "2026-01-05"
        },
        {
          "at": 1767711600000,
          "words": 8500,
          "day": "2026-01-06"
        },
        {
          "at": 1767798000000,
          "words": 8500,
          "day": "2026-01-07"
        },
        {
          "at": 1767884400000,
          "words": 8500,
          "day": "2026-01-08"
        },
        {
          "at": 1767970800000,
          "words": 8500,
          "day": "2026-01-09"
        },
        {
          "at": 1768057200000,
          "words": 8500,
          "day": "2026-01-10"
        },
        {
          "at": 1768143600000,
          "words": 8500,
          "day": "2026-01-11"
        },
        {
          "at": 1768230000000,
          "words": 8500,
          "day": "2026-01-12"
        },
        {
          "at": 1768316400000,
          "words": 8500,
          "day": "2026-01-13"
        },
        {
          "at": 1768402800000,
          "words": 8500,
          "day": "2026-01-14"
        },
        {
          "at": 1768489200000,
          "words": 8500,
          "day": "2026-01-15"
        },
        {
          "at": 1768575600000,
          "words": 8500,
          "day": "2026-01-16"
        },
        {
          "at": 1768662000000,
          "words": 8500,
          "day": "2026-01-17"
        },
        {
          "at": 1768748400000,
          "words": 8500,
          "day": "2026-01-18"
        },
        {
          "at": 1768834800000,
          "words": 8500,
          "day": "2026-01-19"
        },
        {
          "at": 1768921200000,
          "words": 8500,
          "day": "2026-01-20"
        },
        {
          "at": 1769007600000,
          "words": 8500,
          "day": "2026-01-21"
        },
        {
          "at": 1769094000000,
          "words": 8500,
          "day": "2026-01-22"
        },
        {
          "at": 1769180400000,
          "words": 8500,
          "day": "2026-01-23"
        },
        {
          "at": 1769266800000,
          "words": 8500,
          "day": "2026-01-24"
        },
        {
          "at": 1769353200000,
          "words": 8500,
          "day": "2026-01-25"
        },
        {
          "at": 1769439600000,
          "words": 8500,
          "day": "2026-01-26"
        },
        {
          "at": 1769526000000,
          "words": 8500,
          "day": "2026-01-27"
        },
        {
          "at": 1769612400000,
          "words": 8500,
          "day": "2026-01-28"
        },
        {
          "at": 1769698800000,
          "words": 8500,
          "day": "2026-01-29"
        },
        {
          "at": 1769785200000,
          "words": 8500,
          "day": "2026-01-30"
        },
        {
          "at": 1769871600000,
          "words": 8500,
          "day": "2026-01-31"
        },
        {
          "at": 1769958000000,
          "words": 8500,
          "day": "2026-02-01"
        },
        {
          "at": 1770044400000,
          "words": 8500,
          "day": "2026-02-02"
        },
        {
          "at": 1770130800000,
          "words": 8500,
          "day": "2026-02-03"
        }
      ],
      "expect": {
        "rank": "blue-2",
        "index": 8,
        "next": "blue-3",
        "words": {
          "have": 255000,
          "need": 55000,
          "pct": 1
        },
        "activeDays": {
          "have": 30,
          "need": 32,
          "pct": 0.9375
        },
        "totals": {
          "words": 255000,
          "activeDays": 30
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          },
          {
            "id": "white-1",
            "at": 1767711600000
          },
          {
            "id": "white-2",
            "at": 1767884400000
          },
          {
            "id": "white-3",
            "at": 1768057200000
          },
          {
            "id": "white-4",
            "at": 1768316400000
          },
          {
            "id": "blue",
            "at": 1768748400000
          },
          {
            "id": "blue-1",
            "at": 1769266800000
          },
          {
            "id": "blue-2",
            "at": 1769785200000
          }
        ],
        "level": 3,
        "practice": {
          "rank": "blue-2",
          "next": "blue-3",
          "words": {
            "have": 255000,
            "need": 55000,
            "pct": 1
          },
          "activeDays": {
            "have": 30,
            "need": 32,
            "pct": 0.9375
          }
        }
      }
    },
    {
      "name": "the founder holds the tenth degree and still practices",
      "founder": true,
      "events": [
        {
          "at": 1767625200000,
          "words": 2500,
          "day": "2026-01-05"
        },
        {
          "at": 1767711600000,
          "words": 2500,
          "day": "2026-01-06"
        },
        {
          "at": 1767798000000,
          "words": 2500,
          "day": "2026-01-07"
        },
        {
          "at": 1767884400000,
          "words": 2500,
          "day": "2026-01-08"
        },
        {
          "at": 1767970800000,
          "words": 2500,
          "day": "2026-01-09"
        },
        {
          "at": 1768057200000,
          "words": 2500,
          "day": "2026-01-10"
        }
      ],
      "expect": {
        "rank": "red-10",
        "index": 31,
        "next": null,
        "words": null,
        "activeDays": null,
        "totals": {
          "words": 15000,
          "activeDays": 6
        },
        "promotions": [
          {
            "id": "white",
            "at": 1767625200000
          },
          {
            "id": "white-1",
            "at": 1767711600000
          },
          {
            "id": "white-2",
            "at": 1767884400000
          },
          {
            "id": "white-3",
            "at": 1768057200000
          }
        ],
        "level": 1,
        "practice": {
          "rank": "white-3",
          "next": "white-4",
          "words": {
            "have": 15000,
            "need": 18000,
            "pct": 0.8333333333333334
          },
          "activeDays": {
            "have": 6,
            "need": 9,
            "pct": 0.6666666666666666
          }
        }
      }
    }
  ]
}
```

`src/shared/rank-vectors.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/rank-vectors.json through the belt math. MurmurCore runs the
// same file, so a change to the math breaks both platforms or neither
// (ios/prd.json IOS-017).
import { describe, expect, it } from 'vitest'
import ranks from '../../shared/ranks.json'
import vectors from '../../shared/rank-vectors.json'
import type { SessionEvent } from './history'
import { type GateProgress, type RanksFile, computeProgress } from './ranks'

interface Case {
  name: string
  founder?: boolean
  events: { at: number; words: number; day: string }[]
  expect: {
    rank: string
    index: number
    next: string | null
    words: GateProgress | null
    activeDays: GateProgress | null
    totals: { words: number; activeDays: number }
    promotions: { id: string; at: number }[]
    level: number
    practice: { rank: string; next: string | null; words: GateProgress | null; activeDays: GateProgress | null }
  }
}

describe('shared/rank-vectors.json', () => {
  for (const c of vectors.cases as Case[]) {
    it(c.name, () => {
      const events: SessionEvent[] = c.events.map((e) => ({ at: e.at, durationMs: 60_000, rawText: '', finalText: '', words: e.words, wpm: 0, day: e.day }))
      const r = computeProgress(events, ranks as unknown as RanksFile, { founder: c.founder })
      expect({
        rank: r.rank.id,
        index: r.index,
        next: r.next?.id ?? null,
        words: r.words,
        activeDays: r.activeDays,
        totals: r.totals,
        promotions: r.promotions,
        level: r.level,
        practice: { rank: r.practice.rank.id, next: r.practice.next?.id ?? null, words: r.practice.words, activeDays: r.practice.activeDays }
      }).toEqual(c.expect)
    })
  }
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/shared/rank-vectors.test.ts`
Expected: 12 pass. Then `npm run test` passes 922.

- [ ] **Step 3: Run the gates and commit**

```bash
git add shared/rank-vectors.json src/shared/rank-vectors.test.ts
git commit -m "IOS-017: twelve histories with desktop's belt math answers, for both platforms to run"
```

### Task 2: The belt math in MurmurCore

**Files:** Create `ios/MurmurCore/Sources/MurmurCore/Ranks.swift`. Test `ios/MurmurCore/Tests/MurmurCoreTests/RankVectorTests.swift`.

**Interfaces:**
- Produces `RankSpec`, `RanksFile`, `RankEvent(at:words:day:)`, `GateProgress(have:need:pct:)`, `Promotion`, `RankTotals`, `PracticeReport`, and `ProgressReport`.
- Produces `Ranks.progress(_:spec:founder:)`, `Ranks.level(for:)`, and `Ranks.wordsPerLevel`.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/rank-vectors.json: histories desktop ran through its belt math.
struct RankVectors: Decodable {
    struct Gate: Decodable, Equatable {
        let have: Int
        let need: Int
        let pct: Double
    }

    struct Practice: Decodable {
        let rank: String
        let next: String?
        let words: Gate?
        let activeDays: Gate?
    }

    struct Expect: Decodable {
        let rank: String
        let index: Int
        let next: String?
        let words: Gate?
        let activeDays: Gate?
        let totals: Totals
        let promotions: [Step]
        let level: Int
        let practice: Practice
    }

    struct Totals: Decodable {
        let words: Int
        let activeDays: Int
    }

    struct Step: Decodable {
        let id: String
        let at: Int64
    }

    struct Event: Decodable {
        let at: Int64
        let words: Int
        let day: String
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let founder: Bool?
        let events: [Event]
        let expect: Expect

        var testDescription: String { name }
    }

    let cases: [Case]

    static let file: RankVectors? = try? SharedData(directory: repoShared).decode(RankVectors.self, from: "rank-vectors.json")
    static let ranks: RanksFile? = try? SharedData(directory: repoShared).decode(RanksFile.self, from: "ranks.json")
}

@Suite struct RankVectorTests {
    @Test func theVectorsAndTheLadderLoad() throws {
        #expect(try #require(RankVectors.file).cases.count >= 10)
        #expect(try #require(RankVectors.ranks).ranks.first?.id == "none")
    }

    @Test(arguments: RankVectors.file?.cases ?? [])
    func eachHistoryRanksAsOnDesktop(_ vector: RankVectors.Case) throws {
        let spec = try #require(RankVectors.ranks)
        let events = vector.events.map { RankEvent(at: $0.at, words: $0.words, day: $0.day) }
        let report = Ranks.progress(events, spec: spec, founder: vector.founder ?? false)
        func gate(_ g: GateProgress?) -> RankVectors.Gate? { g.map { RankVectors.Gate(have: $0.have, need: $0.need, pct: $0.pct) } }
        let want = vector.expect
        #expect(report.rank.id == want.rank)
        #expect(report.index == want.index)
        #expect(report.next?.id == want.next)
        #expect(gate(report.words) == want.words)
        #expect(gate(report.activeDays) == want.activeDays)
        #expect(report.totals.words == want.totals.words && report.totals.activeDays == want.totals.activeDays)
        #expect(report.promotions.map(\.id) == want.promotions.map(\.id))
        #expect(report.promotions.map(\.at) == want.promotions.map(\.at))
        #expect(report.level == want.level)
        #expect(report.practice.rank.id == want.practice.rank)
        #expect(report.practice.next?.id == want.practice.next)
        #expect(gate(report.practice.words) == want.practice.words)
        #expect(gate(report.practice.activeDays) == want.practice.activeDays)
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore`
Expected: the build fails with `cannot find type 'RanksFile' in scope`.

- [ ] **Step 3: Port the math**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The belt math (ios/prd.json IOS-017), as desktop's src/shared/ranks.ts
// does it, on the ladder in shared/ranks.json: a rank needs BOTH its
// lifetime words and its distinct active days, promotions are dated by the
// take that closed a rank's second gate, and one level comes with every
// hundred thousand words. The tenth degree is the founder's alone, never
// earned by practice. shared/rank-vectors.json keeps both platforms equal.
import Foundation

public struct RankSpec: Decodable, Sendable, Equatable {
    public let id: String
    public let belt: String
    public let stripes: Int
    public let label: String
    public let title: String
    /// Nil only for the founder's rank, which practice never earns.
    public let words: Int?
    public let activeDays: Int?
    public let founderOnly: Bool?

    var earnable: Bool { founderOnly != true && words != nil && activeDays != nil }
}

public struct RanksFile: Decodable, Sendable {
    public let ranks: [RankSpec]
}

/// One take as the belt math sees it: when, how many words, and the local
/// day it was recorded on (stored, so a timezone change never re-buckets).
public struct RankEvent: Sendable, Equatable {
    /// Epoch milliseconds.
    public let at: Int64
    public let words: Int
    public let day: String

    public init(at: Int64, words: Int, day: String) {
        self.at = at
        self.words = words
        self.day = day
    }
}

public struct GateProgress: Sendable, Equatable {
    public let have: Int
    public let need: Int
    /// 0 to 1; 1 once the gate holds.
    public let pct: Double

    public init(have: Int, need: Int, pct: Double) {
        self.have = have
        self.need = need
        self.pct = pct
    }
}

public struct Promotion: Sendable, Equatable {
    public let id: String
    public let at: Int64
}

/// The rank words and days alone have earned, with the gates to the next.
public struct PracticeReport: Sendable, Equatable {
    public let rank: RankSpec
    public let index: Int
    /// Nil at the top of the earnable ladder.
    public let next: RankSpec?
    public let words: GateProgress?
    public let activeDays: GateProgress?
}

public struct RankTotals: Sendable, Equatable {
    public let words: Int
    public let activeDays: Int
}

public struct ProgressReport: Sendable, Equatable {
    public let rank: RankSpec
    public let index: Int
    /// Nil at the top of the earnable ladder, and for the founder.
    public let next: RankSpec?
    public let words: GateProgress?
    public let activeDays: GateProgress?
    public let totals: RankTotals
    public let promotions: [Promotion]
    public let founder: Bool
    /// The rank and gates practice has earned (the founder's included).
    public let practice: PracticeReport
    public let level: Int
}

public enum Ranks {
    public static let wordsPerLevel = 100_000

    /// 1 at zero words, one more for every hundred thousand.
    public static func level(for words: Int) -> Int {
        max(0, words) / wordsPerLevel + 1
    }

    /// The highest rank whose two gates both hold.
    static func rank(in ladder: [RankSpec], words: Int, activeDays: Int) -> Int {
        var index = 0
        for (i, rank) in ladder.enumerated() where rank.earnable {
            if let need = rank.words, let days = rank.activeDays, words >= need, activeDays >= days { index = i }
        }
        return index
    }

    public static func progress(_ events: [RankEvent], spec: RanksFile, founder: Bool = false) -> ProgressReport {
        let ladder = spec.ranks
        var words = 0
        var days = Set<String>()
        var promotions: [Promotion] = []
        var reached = 0
        for event in events.sorted(by: { $0.at < $1.at }) {
            words += event.words
            days.insert(event.day)
            let now = rank(in: ladder, words: words, activeDays: days.count)
            while reached < now {
                reached += 1
                if ladder[reached].earnable { promotions.append(Promotion(id: ladder[reached].id, at: event.at)) }
            }
        }
        let activeDays = days.count
        let index = rank(in: ladder, words: words, activeDays: activeDays)
        let next = ladder[(index + 1)...].first(where: \.earnable)
        func gate(_ have: Int, _ need: Int?) -> GateProgress? {
            guard let need else { return nil }
            let pct = need == 0 ? 1 : min(1, Double(have) / Double(need))
            return GateProgress(have: have, need: need, pct: pct)
        }
        let practice = PracticeReport(
            rank: ladder[index], index: index, next: next,
            words: next.flatMap { gate(words, $0.words) }, activeDays: next.flatMap { gate(activeDays, $0.activeDays) }
        )
        let level = level(for: words)
        if founder {
            let founderRank = ladder.first { $0.founderOnly == true } ?? ladder[ladder.count - 1]
            return ProgressReport(
                rank: founderRank, index: ladder.firstIndex(of: founderRank) ?? ladder.count - 1, next: nil, words: nil, activeDays: nil,
                totals: RankTotals(words: words, activeDays: activeDays), promotions: promotions, founder: true, practice: practice, level: level
            )
        }
        return ProgressReport(
            rank: practice.rank, index: index, next: next, words: practice.words, activeDays: practice.activeDays,
            totals: RankTotals(words: words, activeDays: activeDays), promotions: promotions, founder: false, practice: practice, level: level
        )
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: 112 tests pass (1 known issue on purpose).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/Ranks.swift ios/MurmurCore/Tests/MurmurCoreTests/RankVectorTests.swift
git commit -m "IOS-017: MurmurCore ranks a history as desktop does, on every shared case"
```

### Task 3: Takes keep their day, and the app reads the ladder

**Files:**
- Create: `ios/App/Journey/JourneyRules.swift`.
- Modify: `ios/App/History/History.swift`, `ios/App/Settings/ConnectionStore.swift`.
- Test: `ios/AppTests/JourneyTests.swift`.

**Interfaces:**
- Consumes `RankEvent` and `RanksFile` (Task 2).
- Produces:
  - the stored `HistoryEntry.day: String?` and `HistoryEntry.init(...calendar:)`;
  - `HistoryEntry.dayKey(_:calendar:)` and `HistoryEntry.rankEvent`;
  - `JourneyRules` (`ranks`, `beltColors`, `live`, and `color(_:)`), `BeltColors`, and `Color(hex:)`;
  - `BundledRules.journey()`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// Belts and stripes on iPhone (IOS-017).
@Suite struct JourneyTests {
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    func calendar(_ zone: String) throws -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: zone))
        return calendar
    }

    /// A take keeps the local day it was spoken on, so moving to another
    /// timezone later never moves it to another day.
    @Test func aTakeKeepsTheDayItWasSpokenOn() throws {
        // 2026-09-21 14:13 UTC is still the 21st in Los Angeles, already the
        // 22nd in Tokyo.
        let tokyo = HistoryEntry(at: at.addingTimeInterval(11 * 3600), durationMs: 1000, words: "one two", calendar: try calendar("Asia/Tokyo"))
        #expect(tokyo.day == "2026-09-22")
        #expect(tokyo.rankEvent.day == "2026-09-22")
        #expect(tokyo.rankEvent.words == 2)
        #expect(tokyo.rankEvent.at == 1_790_039_600_000)
        let encoded = try JSONEncoder().encode(tokyo)
        #expect(try JSONDecoder().decode(HistoryEntry.self, from: encoded).day == "2026-09-22")
    }

    /// A take kept before days were stored still counts, on the day it falls
    /// on now.
    @Test func anOlderTakeWithoutADayStillCounts() throws {
        let old = #"{"id":"6F9619FF-8B86-D011-B42D-00C04FC964FF","at":780000000,"durationMs":1000,"words":"one two three","wordCount":3,"retried":false}"#
        let entry = try JSONDecoder().decode(HistoryEntry.self, from: Data(old.utf8))
        #expect(entry.day == nil)
        #expect(entry.rankEvent.day == HistoryEntry.dayKey(entry.at))
        #expect(entry.rankEvent.words == 3)
    }

    @Test func theLadderAndTheBeltColorsLoad() throws {
        let rules = try BundledRules.journey()
        #expect(rules.ranks.ranks.first?.id == "none")
        #expect(rules.ranks.ranks.contains { $0.id == "blue" })
        #expect(rules.beltColors["white"]?.count == 7)
        #expect(rules.beltColors["red"] != nil)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:generate && npm run ios:test`
Expected: the app test build fails with `extra argument 'calendar' in call` and `type 'BundledRules' has no member 'journey'`.

- [ ] **Step 3: Store the day and load the ladder**

`ios/App/History/History.swift`: add `import MurmurCore` after `import Foundation`, then replace the `HistoryEntry` struct with:

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

    init(id: UUID = UUID(), at: Date, durationMs: Int, words: String, retried: Bool = false, calendar: Calendar = .current) {
        self.id = id
        self.at = at
        self.durationMs = max(0, durationMs)
        self.words = words
        wordCount = words.split(whereSeparator: \.isWhitespace).count
        self.retried = retried
        day = Self.dayKey(at, calendar: calendar)
    }

    /// A local day as yyyy-MM-dd, the form desktop's dayKey writes.
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// The take as the belt math sees it.
    var rankEvent: RankEvent {
        RankEvent(at: Int64((at.timeIntervalSince1970 * 1000).rounded()), words: wordCount, day: day ?? Self.dayKey(at))
    }
}
```

In `ios/App/Settings/ConnectionStore.swift`, in `BundledRules`, before `static func catalog()`, add:

```swift
    /// The belt ladder and the belts' colors (IOS-017).
    static func journey() throws -> JourneyRules {
        let shared = try shared()
        return JourneyRules(
            ranks: try shared.decode(RanksFile.self, from: "ranks.json"),
            beltColors: try shared.decode(BeltColors.self, from: "cosmetics.json").beltColors
        )
    }
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The belt ladder and the belts' colors (ios/prd.json IOS-017), from the
// shared data both platforms read: shared/ranks.json and the belt colors in
// shared/cosmetics.json.
import Foundation
import MurmurCore
import SwiftUI

/// The ladder and the belts' colors, read once from the app bundle.
struct JourneyRules: Sendable {
    let ranks: RanksFile
    /// Belt name to its color, from shared/cosmetics.json.
    let beltColors: [String: String]

    /// The app's own, read once.
    static let live: JourneyRules? = try? BundledRules.journey()

    func color(_ belt: String) -> Color {
        (beltColors[belt] ?? beltColors["none"]).map { Color(hex: $0) } ?? Tokens.textDim
    }
}

struct BeltColors: Decodable {
    let beltColors: [String: String]
}

extension Color {
    /// A color from #rrggbb.
    init(hex: String) {
        let digits = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        let red = Double((digits >> 16) & 0xFF) / 255
        let green = Double((digits >> 8) & 0xFF) / 255
        let blue = Double(digits & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: 1)
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `JourneyTests` passes (3 tests), and the app total is 244.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/History/History.swift ios/App/Settings/ConnectionStore.swift ios/App/Journey/JourneyRules.swift ios/AppTests/JourneyTests.swift
git commit -m "IOS-017: each take keeps the day it was spoken on, and the app reads the belt ladder"
```

### Task 4: The Journey

**Files:**
- Create: `ios/App/Journey/Journey.swift`, `ios/App/Journey/JourneyScreen.swift`.
- Modify: `ios/App/Home/HomeScreen.swift`, `ios/AppTests/JourneyTests.swift`.

**Interfaces:**
- Consumes `HistoryEntry.rankEvent`, `JourneyRules` (Task 3), and `Ranks.progress` (Task 2).
- Produces `Journey.report(_:rules:)`, `JourneyCopy`, `JourneyScreen(history:rules:)`, `JourneyRow`, and `BeltSwatch`.
- Produces the `HomeScreen` property `journey: JourneyRules? = JourneyRules.live`.

- [ ] **Step 1: Write the failing tests**

At the end of `ios/AppTests/JourneyTests.swift`, add:

```swift
/// The belt this iPhone's takes have earned (IOS-017).
@Suite struct JourneyReportTests {
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    /// The belt comes from this iPhone's takes: words and days both count,
    /// and deleting takes lowers it, as clearing history does on desktop.
    @Test func theBeltComesFromThisIPhonesTakes() throws {
        let rules = try BundledRules.journey()
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = try #require(TimeZone(identifier: "UTC"))
        let words = Array(repeating: "word", count: 1300).joined(separator: " ")
        let entries = (0..<2).map { HistoryEntry(at: at.addingTimeInterval(Double($0) * 86_400), durationMs: 1000, words: words, calendar: utc) }
        let report = Journey.report(entries, rules: rules)
        #expect(report.rank.id == "white-1")
        #expect(report.totals.words == 2600 && report.totals.activeDays == 2)
        #expect(report.promotions.map(\.id) == ["white", "white-1"])
        #expect(report.next?.id == "white-2")
        #expect(Journey.report(Array(entries.prefix(1)), rules: rules).rank.id == "white")
        #expect(Journey.report([], rules: rules).rank.id == "none")
    }
}

@Suite struct JourneyCopyTests {
    /// A gate still open says how far along it is; one that holds says what
    /// you have and what it needed, never "7 of 6".
    @Test func gatesSayTheirNumbers() {
        #expect(JourneyCopy.words(GateProgress(have: 450, need: 600, pct: 0.75)) == "450 of 600 words")
        #expect(JourneyCopy.words(GateProgress(have: 700, need: 600, pct: 1)) == "700 words, 600 needed")
        #expect(JourneyCopy.days(GateProgress(have: 0, need: 1, pct: 0)) == "0 of 1 day you dictated")
        #expect(JourneyCopy.days(GateProgress(have: 2, need: 4, pct: 0.5)) == "2 of 4 days you dictated")
        #expect(JourneyCopy.days(GateProgress(have: 7, need: 6, pct: 1)) == "7 days you dictated, 6 needed")
        #expect(JourneyCopy.days(GateProgress(have: 1, need: 1, pct: 1)) == "1 day you dictated, 1 needed")
        #expect(JourneyCopy.level(3) == "Level 3")
    }

    @Test func everyLineFollowsTheWritingRules() throws {
        let rules = try BundledRules.journey()
        let lines = [JourneyCopy.top, JourneyCopy.devices, JourneyCopy.firstBelt(rules.ranks.ranks[1]), JourneyCopy.firstBelt(nil)]
        for line in lines {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
        #expect(JourneyCopy.firstBelt(rules.ranks.ranks[1]) == "Dictate 100 words to earn the white belt.")
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'Journey' in scope` and `cannot find 'JourneyCopy' in scope`.

- [ ] **Step 3: Write the Journey and its row on Home**

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
        return "Dictate \(words.formatted()) words to earn the \(next.label)."
    }

    static func promoted(_ at: Date) -> String {
        at.formatted(date: .abbreviated, time: .omitted)
    }
}
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Journey on iPhone (ios/prd.json IOS-017), in plain native views until
// IOS-018 paints it: the belt with its stripes, the words and days toward
// the next one, and the dated promotions.
import MurmurCore
import SwiftUI

struct JourneyScreen: View {
    let history: History
    let rules: JourneyRules

    var body: some View {
        let report = Journey.report(history.entries, rules: rules)
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    BeltSwatch(rank: report.rank, rules: rules)
                        .frame(width: 168, height: 18)
                    Text(report.rank.label)
                        .font(.title3.weight(.semibold))
                    Text(report.rank.title)
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
                if let words = report.words, let days = report.activeDays {
                    Gate(text: JourneyCopy.words(words), pct: words.pct)
                    Gate(text: JourneyCopy.days(days), pct: days.pct)
                } else {
                    Text(JourneyCopy.top)
                }
            } header: {
                SectionTitle(report.next.map { "\(JourneyCopy.toward) \($0.label)" } ?? JourneyCopy.title)
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
    }
}

/// One gate: a line of numbers over a quiet bar, gold once it holds.
private struct Gate: View {
    let text: String
    let pct: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text)
            ProgressView(value: pct)
                .tint(pct >= 1 ? Tokens.brand : Tokens.textDim)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// A belt drawn plainly: its color, and at the tip a dark bar (red on a
/// black belt) with one white mark per stripe.
struct BeltSwatch: View {
    let rank: RankSpec
    let rules: JourneyRules

    var body: some View {
        GeometryReader { box in
            let tip = box.size.width * 0.3
            HStack(spacing: 0) {
                Rectangle().fill(rules.color(rank.belt))
                ZStack {
                    Rectangle().fill(rank.belt == "black" ? rules.color("red") : Color.black)
                    HStack(spacing: 3) {
                        ForEach(0..<rank.stripes, id: \.self) { _ in
                            Rectangle().fill(Color.white).frame(width: 3)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .frame(width: rank.belt == "none" ? 0 : tip)
            }
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Tokens.panelEdge))
        }
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
                    .frame(width: 56, height: 10)
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
```

In `ios/App/Home/HomeScreen.swift`, make three changes:

1. At the end of the file's opening comment, add the line `// Journey row shows the belt this iPhone's takes have earned (IOS-017).`, after changing the line before it to end with `the real count. The`.
2. After `let setup: Setup`, add:

```swift
    /// The belt ladder; nil only if the app's own files could not be read.
    var journey: JourneyRules? = JourneyRules.live
```

3. After the `SessionCard` block (`if let session { SessionCard(session: session) }`), add:

```swift
            if let journey {
                Section {
                    JourneyRow(history: history, rules: journey)
                }
                .listRowBackground(Tokens.panel)
            }
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `JourneyReportTests` (1) and `JourneyCopyTests` (2) pass, and the app total is 247.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Journey/Journey.swift ios/App/Journey/JourneyScreen.swift ios/App/Home/HomeScreen.swift ios/AppTests/JourneyTests.swift
git commit -m "IOS-017: Home's Journey row opens the belt, its stripes, the gates to the next, and the promotions"
```

### Task 5: The smoke ranks histories through the store

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`.

The smoke check is the test here. Histories from the shared vectors go through the history store and back, then the belt math, and must land where desktop's math put them.

- [ ] **Step 1: Add the check**

In `SmokeRunner.runAndExit`'s list, after `("sessionIntents", checkSessionIntents),`, add `("journey", checkJourney),`. Before `/// Runs main-actor work to the end from the smoke's synchronous start`, add:

```swift
    /// Belts and stripes (IOS-017): histories from shared/rank-vectors.json
    /// go through the history store and back, then the belt math, and come
    /// out where desktop's math put them.
    static func checkJourney() throws {
        guard let rules = try? BundledRules.journey(),
              let directory = Bundle.main.url(forResource: "shared", withExtension: nil),
              let vectors = try? SharedData(directory: directory).decode(SmokeRankVectors.self, from: "rank-vectors.json")
        else { throw SmokeFailure("the ladder or the rank vectors did not load") }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let wanted = ["steady practice earns blue with a dated trail", "takes out of order are walked in time order", "several takes in one day count one day"]
        let cases = vectors.cases.filter { wanted.contains($0.name) }
        guard cases.count == wanted.count else { throw SmokeFailure("the rank vectors lack a case the smoke runs") }
        for vector in cases {
            let file = FileManager.default.temporaryDirectory.appending(path: "smoke-journey-\(UUID().uuidString).jsonl")
            defer { try? FileManager.default.removeItem(at: file) }
            let store = HistoryStore(file: file)
            for event in vector.events {
                let words = Array(repeating: "word", count: event.words).joined(separator: " ")
                try store.append(HistoryEntry(at: Date(timeIntervalSince1970: TimeInterval(event.at) / 1000), durationMs: 1000, words: words, calendar: utc))
            }
            let report = Journey.report(store.list(), rules: rules)
            guard report.rank.id == vector.expect.rank, report.totals.words == vector.expect.totals.words,
                  report.totals.activeDays == vector.expect.totals.activeDays,
                  report.promotions.map(\.id) == vector.expect.promotions.map(\.id),
                  report.promotions.map(\.at) == vector.expect.promotions.map(\.at)
            else { throw SmokeFailure("\(vector.name): the iPhone reached \(report.rank.id), desktop \(vector.expect.rank)") }
        }
    }
```

At the end of the file, add:

```swift
/// The parts of shared/rank-vectors.json the smoke reads.
private struct SmokeRankVectors: Decodable {
    struct Case: Decodable {
        let name: String
        let events: [Event]
        let expect: Expect
    }

    struct Event: Decodable {
        let at: Int64
        let words: Int
    }

    struct Expect: Decodable {
        let rank: String
        let totals: Totals
        let promotions: [Step]
    }

    struct Totals: Decodable {
        let words: Int
        let activeDays: Int
    }

    struct Step: Decodable {
        let id: String
        let at: Int64
    }

    let cases: [Case]
}
```

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT` lists eighteen checks, all true, `journey` among them.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-017: the smoke ranks shared histories through the store and gets desktop's belts"
```

### Task 6: The docs, the live check, and the notes

**Files:** Modify `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json`.

- [ ] **Step 1: The docs**

At the end of `ios/docs/iphone.md`, add:

```markdown
## How do belts work on iPhone?

The same way as on the Mac: the same ladder of belts and stripes (white, blue, purple, brown, and black, each with four stripes, then the black belt degrees and the coral belts), with the same two gates for each. A belt needs both enough words dictated and enough different days you dictated on, so one long day never skips a belt. The table of what every belt and stripe takes is in the Journey guide, under What are the exact requirements for each belt and stripe?

On iPhone, the Journey row on Home shows your belt. Tap it to see your stripes, the words and the days you still need for the next belt, your level (one more for every hundred thousand words), and the day you earned each belt.

Your iPhone counts only the takes it keeps in its own history. Deleting takes there lowers your count, as clearing history does on the Mac. For now your iPhone and your Mac each keep their own belt; one Journey across your devices comes with the murmur account.
```

- [ ] **Step 2: The live check**

In `HANDOFF.md`, under `## Now`, after the IOS-016 live check, add:

```markdown
- [ ] IOS-017 live check, once a TestFlight build with it is on your iPhone (added 2026-10-13). (1) Dictate with murmur on at least two different days. (2) Open murmur. Under the session on Home, the Journey row should show a belt (white belt after your first 100 words) with its stripes. (3) Tap it. You should see the belt, its title, your level, the words and the days you still need for the next belt, and each belt you earned with its date. (4) Back on Home, delete one long take: the words on the Journey should drop by that take's words. (5) Tell Claude what you saw; your belt on the Mac is separate for now.
```

- [ ] **Step 3: The notes**

In `ios/prd.json`, set IOS-017's `notes` to say what was built and verified, every ruling above, that the live check waits for LaBroi (`passes` stays false), and the gate counts. Write only the notes field.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json
git commit -m "IOS-017: the iPhone docs answer how belts work on iPhone"
```
