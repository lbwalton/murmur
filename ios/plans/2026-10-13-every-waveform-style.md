# Every Waveform Style (IOS-020) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All seven pill styles and the accents on iPhone, earned by belt as on desktop, chosen from a grid of live pills, and drawn by the keyboard itself.

**Architecture:**
- **Desktop's brush in Swift.** `src/renderer/brush.ts` (seeded random numbers, noise, paths, bristles, pressure, and strokes) is ported to MurmurCore as `Brush`, so the keyboard paints without a web view. `shared/brush-vectors.json` holds desktop's own answers, down to every bristle's pen-down runs, and both platforms run it.
- **Desktop's cosmetics in Swift.** `src/shared/cosmetics.ts` (what a rank and its achievements unlock, and the color an accent resolves to) is ported to MurmurCore as `Cosmetics`, with `shared/cosmetics-vectors.json`.
- **The ink scene.** `ios/Shared/Ink.swift` is desktop's `InkWave.tsx` (dabs, flecks, rings, ribbon) and `PulseWave.tsx` as a scene that steps through time: columns every 66 ms, desktop's frame by frame updates at 60 a second whatever the screen's rate, and DESIGN.md's stage table. The pill (`Pill.swift`, `PillView.swift`) gains the five styles and the accent's wet and dry paint; bars and speckle paint in the accent too.
- **The look in the app group.** `pill.json` carries the style, the accent's id, and the color it resolves to now. The app writes the color, and rewrites it after takes land, one is deleted, or all are cleared, because the keyboard never reads the history. The keyboard reads the look when it appears and when the pill is touched.
- **The Look screen.** Settings gains Look: a two column grid of live mini pills (locked ones dimmed, naming the belt that earns them) and the accents (locked ones dimmed, naming what earns them). The Keyboard screen links to it.

**Tech Stack:** Swift 6, Swift Testing, SwiftUI, UIKit, Core Graphics, Synchronization, TypeScript, vitest.

**Spec:**
- `ios/prd.json` IOS-020, with `conventions`, `CLAUDE.md` (night studio, brushwork, and the ink overlay styles), and `DESIGN.md` (the ink waveforms' stage table).
- Desktop's `src/renderer/brush.ts`, `src/renderer/overlay/InkWave.tsx`, `PulseWave.tsx`, `sheen.ts`, `src/renderer/settings/WaveTiles.tsx`, `fakeVoice.ts`, `src/shared/cosmetics.ts`, and `shared/cosmetics.json`, all murmur's own.

The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** in a throwaway copy of `feature/ios` at d36599b:
- `npm run typecheck` was clean; `npm run test` passed 1001 (983 + 18 vectors).
- `swift test` passed 134 (124 + 8 brush + 2 cosmetics). Every Swift brush answer matched desktop's on the first run: random numbers and noise exactly, paths and strokes within a billionth.
- `npm run ios:test` passed 325 app tests (306 + 19).
- `npm run ios:smoke` printed twenty-two true checks, `look` among them.
- **Side by side with desktop.** Desktop's own ink shots (`MURMUR_INK_SHOTS=<dir> npm run smoke`: recording, drying, and error for each ink style) were set beside the iPhone's pill shots (`npm run ios:pill-shots`) of the same stages. The marks are the same: brushed dabs, stretched flecks with their drops, brushed rings from a dot, the ribbon with its wet head and thinning tail, and plain red errors with no bristles. Desktop's overlay wave is about 80 pixels wide and the phone's about 180 points, so the phone's marks sit farther apart at the same size.
- **Fast enough for the keyboard.** One frame stepped and painted at 3x on the simulator: ribbon 6.2 to 6.9 ms, dabs 3.4 to 4.1, rings 1.1, flecks 1.1, speckle 0.8, bars 0.3, pulse 0.1 to 0.3, all inside the 33 ms a 30 a second pill has.
- **Screens rendered and read:** the Look screen at a purple belt (Ink dabs in use, Ink ribbon locked with Earn your brown belt), with nothing earned (only Bars and Speckle open), the accents (Your belt color in purple, locked ones with what earns them), and the Keyboard screen's Look row. The first capture showed a belt accent painting amber until a pick; the Look now resolves the color as it opens (pinned by `LookTests.theLookOpensResolved`).

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The brush is ported to Swift; the keyboard draws no web page.** A keyboard has a small memory budget and paints 30 times a second. The vectors hold the port to desktop. If wrong: two engines to keep in step (the vectors fail on drift).
2. **The ink paints in points as desktop paints in CSS pixels.** Each mark is desktop's size; what desktop sizes by the wave (a dab's height, the ribbon's width, how far rings travel) follows the phone's pill, which is wider than desktop's, so marks sit farther apart. If wrong: a per style spacing change.
3. **Desktop's frame by frame updates run at 60 a second whatever the screen's rate** (the smoothed voice, rings born, drops thrown), so the phone's 30 a second display link paints desktop's rhythm.
4. **Pulse follows the stage table on iPhone:** a cream heart at rest and a red one on an error, where desktop's pulse stays in the accent. The iPhone pill never shows amber at rest (IOS-010). If wrong: pulse at rest in the accent, a two line change.
5. **Flecks throw seeded drops** where desktop uses Math.random, so shots and tests repeat.
6. **Every tile moves to desktop's made-up voice** (`fakeVoice.ts`), bars and speckle included, replacing IOS-010's own voice.
7. **The Look is its own screen in Settings;** the Keyboard screen's The pill section links to it.
8. **A chosen style stays when its belt goes** (desktop keeps it), and a locked accent paints signal amber (desktop's resolveAccentColor).
9. **On iPhone the accent colors the pill.** Desktop's accent also colors progress fills; the iPhone's Journey paints its own.
10. **The keyboard reads the look when it appears and when the pill is touched,** so a pick made while the keyboard stayed up reaches the take it starts.
11. **The app writes the accent's color beside the choice** and rewrites it after takes land, one is deleted, or all are cleared, and as the Look opens.
12. **The widget extension links MurmurCore and `Ink.swift`,** because the shared pill file paints ink.
13. **The pill tests tell amber from gold only on clear paint.** The faintest bristles' 8 bit color wobbles across the line between them.
14. **Only the pill look ships on iPhone,** as the story says.

## Global Constraints

- Swift 6, iOS 26, compiling on Swift 6.3 (CI's Xcode 26.6): typed lets for long float math, no `Binding(get:set:)` closures.
- `shared/` stays the single source of shared rules; both platforms run the same vector files.
- No binary assets in the repo; every mark is drawn by code.
- Design: night studio tokens, no raw colors in code (the design lint checks Swift too); gold for labels, the chosen tile, and the checkmark; amber only for live paint; red only for errors; errors never splatter; Reduce Motion gets a still, finished painting.
- The keyboard stays light: no web view, no history.
- Every source file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-020:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **The keyboard painting a different mark than desktop for the same inputs.** Pinned by `brush-vectors.test.ts` (Task 1) and `BrushVectorTests` (Task 2).
2. **A locked style or accent reaching the keyboard, or an accent's color going stale after a promotion or Clear all.** Pinned by `LookTests.aPickReachesTheKeyboard`, `takesRepaintTheAccent`, and `theLookOpensResolved` (Task 5), and the smoke's `look` check (Task 6).
3. **Amber at rest or at an ending, bristles on an error, or a blank still under Reduce Motion, in any style.** Pinned by `PillTests` over all seven styles and `InkSceneTests.aStillIsNeverBlank` and `theInkPaintsInTheAccent` (Task 4).
4. **The pill animating forever, or freezing after time off screen.** Pinned by `InkSceneTests.theSceneRestsOnceSettled`, `processingRunsUntilTheSheenStops`, and `aLongGapJumpsAhead` (Task 4).
5. **An older `pill.json` (IOS-010's), or a style this build does not know, losing the look.** Pinned by `PillTests.anOlderOrNewerLookKeepsWhatItCan` (Task 4).

---

### Task 1: Desktop's answers for the brush and the cosmetics

**Files:** Create `shared/brush-vectors.json`, `shared/cosmetics-vectors.json`, `src/renderer/brush-vectors.test.ts`, and `src/shared/cosmetics-vectors.test.ts`.

Desktop is the oracle: a generator runs desktop's own code on fixed inputs, writes the two files, and is deleted. The two tests keep desktop honest to them.

- [ ] **Step 1: Write the failing tests**

`src/renderer/brush-vectors.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/brush-vectors.json through the brush. MurmurCore's Brush
// runs the same file, so the keyboard's ink and desktop's paint the same
// marks (ios/prd.json IOS-020).
import { describe, expect, it } from 'vitest'
import vectors from '../../shared/brush-vectors.json'
import { type BrushPath, type StrokeOptions, brush, mulberry, noise1, path, pressure, stroke } from './brush'

interface PathCase {
  name: string
  pts: [number, number][]
  step: number
  raw: boolean
  out: { total: number; points: number[][] }
}

interface StrokeCase {
  name: string
  path: number
  seed: number
  n: number
  options: Record<string, unknown>
  ops: unknown[]
}

/** Named pressure functions, as the file names them. */
const PRESSURES: Record<string, (t: number) => number> = { sine: (t) => 0.5 + 0.5 * Math.sin(t * Math.PI) }

/** A canvas that writes down what a stroke paints: each fill's color and
 *  shape, and each bristle's color, width, and pen-down runs. */
function recorder(): { ctx: CanvasRenderingContext2D; ops: unknown[] } {
  const ops: unknown[] = []
  let fillStyle = ''
  let strokeStyle = ''
  let lineWidth = 1
  let lines: number[][][] = []
  const parse = (s: string): number[] => {
    const m = /^rgba\(([^)]*)\)$/.exec(s)
    if (!m) throw new Error(`not rgba: ${s}`)
    return m[1].split(',').map(Number)
  }
  const ctx = {
    set fillStyle(v: string) {
      fillStyle = v
    },
    set strokeStyle(v: string) {
      strokeStyle = v
    },
    set lineWidth(v: number) {
      lineWidth = v
    },
    lineCap: 'butt',
    lineJoin: 'round',
    beginPath: () => {
      lines = []
    },
    moveTo: (x: number, y: number) => {
      lines.push([[x, y]])
    },
    lineTo: (x: number, y: number) => {
      lines[lines.length - 1].push([x, y])
    },
    closePath: () => undefined,
    fill: () => {
      ops.push({ fill: parse(fillStyle), points: lines.flat() })
    },
    stroke: () => {
      ops.push({ stroke: parse(strokeStyle), width: lineWidth, lines })
    }
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

const pathOf = (c: PathCase): BrushPath => path(c.pts, c.step, c.raw)

describe('shared/brush-vectors.json', () => {
  it('random numbers and noise', () => {
    for (const m of vectors.mulberries) {
      const r = mulberry(m.seed)
      expect(m.values.map(() => r())).toEqual(m.values)
    }
    for (const n of vectors.noises) {
      const f = noise1(n.seed)
      expect(n.xs.map(f)).toEqual(n.values)
    }
  })

  for (const c of vectors.paths as unknown as PathCase[]) {
    it(`path: ${c.name}`, () => {
      const P = pathOf(c)
      expect({ total: P.total, points: P.map((p) => [p.x, p.y, p.s, p.nx, p.ny]) }).toEqual(c.out)
    })
  }

  it('brushes and pressure', () => {
    for (const b of vectors.brushes) {
      const made = brush(b.seed, b.n).map((x) => ({ off: x.off, w: x.w, a: x.a, load: x.load, tone: x.tone, lam: x.lam, jit: x.jit, nz: [0.5, 3.2, 40.7, 300.1].map((v) => x.nz(v)) }))
      expect(made).toEqual(b.bristles)
    }
    for (const p of vectors.pressures) {
      expect([0, 0.03, 0.1, 0.5, 0.8, 0.95, 1].map((t) => pressure(t, p.ts, p.te))).toEqual(p.values)
    }
  })

  for (const c of vectors.strokes as unknown as StrokeCase[]) {
    it(`stroke: ${c.name}`, () => {
      const { ctx, ops } = recorder()
      const options = { ...c.options }
      if (typeof options.pfn === 'string') options.pfn = PRESSURES[options.pfn]
      stroke(ctx, pathOf((vectors.paths as unknown as PathCase[])[c.path]), brush(c.seed, c.n), options as unknown as StrokeOptions)
      expect(ops).toEqual(c.ops)
    })
  }
})
```

`src/shared/cosmetics-vectors.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/cosmetics-vectors.json through the cosmetics: what fixed
// takes unlock and the color each accent resolves to. MurmurCore runs the
// same file, so the iPhone's Look unlocks what desktop's does (ios/prd.json
// IOS-020).
import { describe, expect, it } from 'vitest'
import achievements from '../../shared/achievements.json'
import cosmetics from '../../shared/cosmetics.json'
import ranks from '../../shared/ranks.json'
import vectors from '../../shared/cosmetics-vectors.json'
import { type AchievementsFile, evaluateAchievements } from './achievements'
import { type CosmeticsFile, computeCosmetics, resolveAccentColor } from './cosmetics'
import type { SessionEvent } from './history'
import { type RanksFile, computeProgress } from './ranks'

interface Take {
  at: number
  words: number
  durationMs: number
  day: string
  hour: number
}

const event = (t: Take): SessionEvent => ({ at: t.at, durationMs: t.durationMs, rawText: '', finalText: '', words: t.words, wpm: 0, day: t.day, hour: t.hour })

describe('shared/cosmetics-vectors.json', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const spec = cosmetics as unknown as CosmeticsFile
      const events = (c.takes as Take[]).map(event)
      const progress = computeProgress(events, ranks as unknown as RanksFile)
      const earned = evaluateAchievements(events, achievements as unknown as AchievementsFile)
      const report = computeCosmetics(spec, progress, earned)
      expect({
        rank: progress.rank.id,
        earned: earned.map((e) => e.id),
        styles: report.overlayStyles.filter((s) => s.unlocked).map((s) => s.id),
        accents: report.accents.filter((a) => a.unlocked).map((a) => a.id),
        beltColor: report.beltColor,
        colors: Object.fromEntries(Object.keys(c.expect.colors).map((id) => [id, resolveAccentColor(id, spec, progress, earned)]))
      }).toEqual(c.expect)
    })
  }
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/renderer/brush-vectors.test.ts src/shared/cosmetics-vectors.test.ts`
Expected: both fail to load: `shared/brush-vectors.json` and `shared/cosmetics-vectors.json` do not exist.

- [ ] **Step 3: Generate the vectors from desktop's code**

Write this generator to `src/shared/gen-ink-vectors.test.ts` (temporary):

```ts
// Temporary (IOS-020 Task 1): writes shared/brush-vectors.json and
// shared/cosmetics-vectors.json from desktop's own code, then is deleted.
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import achievements from '../../shared/achievements.json'
import cosmetics from '../../shared/cosmetics.json'
import ranks from '../../shared/ranks.json'
import { type BrushPath, type StrokeOptions, brush, mulberry, noise1, path, pressure, stroke } from '../renderer/brush'
import { type AchievementsFile, evaluateAchievements } from './achievements'
import { type CosmeticsFile, computeCosmetics, resolveAccentColor } from './cosmetics'
import type { SessionEvent } from './history'
import { type RanksFile, computeProgress } from './ranks'

// A canvas that records what a stroke paints: each fill as its color and
// polygon, each stroke as its color, width, and pen-down runs.
function recorder(): { ctx: CanvasRenderingContext2D; ops: unknown[] } {
  const ops: unknown[] = []
  let fillStyle = ''
  let strokeStyle = ''
  let lineWidth = 1
  let lines: number[][][] = []
  const parse = (s: string): number[] => {
    const m = /^rgba\(([^)]*)\)$/.exec(s)
    if (!m) throw new Error(`not rgba: ${s}`)
    return m[1].split(',').map(Number)
  }
  const ctx = {
    set fillStyle(v: string) { fillStyle = v },
    set strokeStyle(v: string) { strokeStyle = v },
    set lineWidth(v: number) { lineWidth = v },
    lineCap: 'butt',
    lineJoin: 'round',
    beginPath() { lines = [] },
    moveTo(x: number, y: number) { lines.push([[x, y]]) },
    lineTo(x: number, y: number) { lines[lines.length - 1].push([x, y]) },
    closePath() {},
    fill() { ops.push({ fill: parse(fillStyle), points: lines.flat() }) },
    stroke() { ops.push({ stroke: parse(strokeStyle), width: lineWidth, lines }) }
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

const PFNS: Record<string, (t: number) => number> = { sine: (t) => 0.5 + 0.5 * Math.sin(t * Math.PI) }

function pathOut(P: BrushPath): unknown {
  return { total: P.total, points: P.map((p) => [p.x, p.y, p.s, p.nx, p.ny]) }
}

it('writes the brush vectors', () => {
  const seeds = [0, 1, 4040, 777 * 7919 + 13, -5, 2147483647]
  const mulberries = seeds.map((seed) => {
    const r = mulberry(seed)
    return { seed, values: Array.from({ length: 8 }, () => r()) }
  })
  const xs = [0, 0.3, 1.7, 255.5, 300.25, -2.5, 77.9]
  const noises = [0, 131, 99 * 131 + 5 * 17].map((seed) => {
    const n = noise1(seed)
    return { seed, xs, values: xs.map((x) => n(x)) }
  })
  const pathCases = [
    { name: 'a dab', pts: [[10.4, 20], [9.6, 4]], step: 1.3, raw: false },
    { name: 'a curve', pts: [[0, 10], [30, 2], [60, 14]], step: 2, raw: false },
    { name: 'a ring arc', pts: Array.from({ length: 13 }, (_, j) => { const a = -1 + (2 * j) / 12; return [6 + Math.cos(a) * 30, 12 + Math.sin(a) * 30] }), step: 1.4, raw: false },
    { name: 'a raw ribbon', pts: Array.from({ length: 12 }, (_, i) => [i * 9.3 - 2.1, 12 + Math.sin(i * 0.45) * 1.1]), step: 1.2, raw: true }
  ].map((c) => ({ ...c, out: pathOut(path(c.pts as [number, number][], c.step, c.raw)) }))
  const brushes = [[5, 9], [612, 7], [777, 18], [778, 14], [990, 16]].map(([seed, n]) => ({
    seed,
    n,
    bristles: brush(seed, n).map((b) => ({ off: b.off, w: b.w, a: b.a, load: b.load, tone: b.tone, lam: b.lam, jit: b.jit, nz: [0.5, 3.2, 40.7, 300.1].map((x) => b.nz(x)) }))
  }))
  const pressures = [[0.07, 0.3], [0.18, 0.3], [0.01, 0.01]].map(([ts, te]) => ({ ts, te, values: [0, 0.03, 0.1, 0.5, 0.8, 0.95, 1].map((t) => pressure(t, ts, te)) }))
  const strokeCases: { name: string; path: number; seed: number; n: number; options: Record<string, unknown> }[] = [
    { name: 'a dab of wet amber', path: 0, seed: 5, n: 9, options: { width: 5.6, rgb: [240, 164, 75], alpha: 1, dry: 0.32, ts: 0.18, te: 0.3, core: 0.35 } },
    { name: 'a fading ring', path: 2, seed: 612, n: 7, options: { width: 4.4, rgb: [217.3, 164.8, 65.5], alpha: 0.61, dry: 0.62, core: 0.3, ts: 0.2, te: 0.35 } },
    { name: 'part of a scrolling ribbon', path: 3, seed: 777, n: 18, options: { width: 22.8, rgb: [217, 164, 65], alpha: 1, dry: 0.35, core: 0.4, sOff: 33.5, ts: 0.01, te: 0.01, i0: 10, i1: 40, pfn: 'sine' } },
    { name: 'no core, its own light and dark', path: 1, seed: 990, n: 16, options: { width: 30, rgb: [232, 88, 43], alpha: 0.8, dry: 0.1, noCore: true, light: 0.2, dark: 0.4 } },
    { name: 'the defaults', path: 1, seed: 778, n: 14, options: { width: 12, rgb: [90, 120, 200] } }
  ]
  const strokes = strokeCases.map((c) => {
    const pc = pathCases[c.path]
    const P = path(pc.pts as [number, number][], pc.step, pc.raw)
    const { ctx, ops } = recorder()
    const o = { ...c.options } as Record<string, unknown>
    if (typeof o.pfn === 'string') o.pfn = PFNS[o.pfn]
    stroke(ctx, P, brush(c.seed, c.n), o as unknown as StrokeOptions)
    return { ...c, ops }
  })
  const file = {
    note: "Desktop's brush engine (src/renderer/brush.ts) on fixed inputs: its random numbers, noise, paths, brushes, pressure, and what a stroke paints (each fill's color and polygon, each bristle's color, width, and pen-down runs). MurmurCore's Brush must match (IOS-020). Named pressure functions: sine is 0.5 + 0.5 sin(pi t).",
    mulberries,
    noises,
    paths: pathCases,
    brushes,
    pressures,
    strokes
  }
  writeFileSync('shared/brush-vectors.json', `${JSON.stringify(file, null, 2)}\n`)
})

it('writes the cosmetics vectors', () => {
  const LADDER = ranks as unknown as RanksFile
  const spec = cosmetics as unknown as CosmeticsFile
  const T0 = Date.UTC(2026, 8, 1, 14, 0, 0)
  const DAY = 86_400_000
  const day = (n: number): string => new Date(T0 + n * DAY).toISOString().slice(0, 10)
  interface Take { at: number; words: number; durationMs: number; day: string; hour: number }
  const take = (n: number, words: number, hour = 14, durationMs = 60_000): Take => ({ at: T0 + n * DAY + (hour - 14) * 3_600_000, words, durationMs, day: day(n), hour })
  const cases: { name: string; takes: Take[] }[] = [
    { name: 'nothing yet', takes: [] },
    { name: 'a white belt', takes: [take(0, 150)] },
    { name: 'a blue belt', takes: Array.from({ length: 14 }, (_, n) => take(n, 1800)) },
    { name: 'a purple belt', takes: Array.from({ length: 45 }, (_, n) => take(n, 1700)) },
    { name: 'a brown belt', takes: Array.from({ length: 90 }, (_, n) => take(n, 2400)) },
    { name: 'a marathon take', takes: [take(0, 900, 14, 320_000)] },
    { name: 'a night owl and an early bird', takes: [take(0, 60, 1), take(1, 60, 5)] }
  ]
  const ids = [...spec.accents.map((a) => a.id), 'not-an-accent']
  const out = cases.map((c) => {
    const events: SessionEvent[] = c.takes.map((t) => ({ at: t.at, durationMs: t.durationMs, rawText: '', finalText: '', words: t.words, wpm: 0, day: t.day, hour: t.hour }))
    const progress = computeProgress(events, LADDER)
    const earned = evaluateAchievements(events, achievements as unknown as AchievementsFile)
    const report = computeCosmetics(spec, progress, earned)
    return {
      ...c,
      expect: {
        rank: progress.rank.id,
        earned: earned.map((e) => e.id),
        styles: report.overlayStyles.filter((s) => s.unlocked).map((s) => s.id),
        accents: report.accents.filter((a) => a.unlocked).map((a) => a.id),
        beltColor: report.beltColor,
        colors: Object.fromEntries(ids.map((id) => [id, resolveAccentColor(id, spec, progress, earned)]))
      }
    }
  })
  const file = {
    note: "Desktop's cosmetics (src/shared/cosmetics.ts) on fixed takes: the rank and achievements they earn, which waveform styles and accents that unlocks, the belt color, and the color each accent id resolves to (a locked or unknown one falls back to signal amber). Both platforms run these (IOS-020).",
    cases: out
  }
  writeFileSync('shared/cosmetics-vectors.json', `${JSON.stringify(file, null, 2)}\n`)
})
```

And this formatter to `compact-vectors.tmp.js` at the repo root (temporary; it keeps every list of numbers on one line and changes no value):

```js
// Rewrites JSON files with every flat value (a list of plain values, or an
// object of plain values and such lists) on one line, everything else
// indented two spaces. The data itself never changes.
const { readFileSync, writeFileSync } = require('node:fs')

const plain = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
const numeric = (v) => typeof v === 'number' || (Array.isArray(v) && v.every(numeric))
const flat = (v) => {
  if (numeric(v)) return true
  if (plain(v)) return true
  if (Array.isArray(v)) return v.every(plain)
  if (typeof v === 'object') return Object.values(v).every((x) => plain(x) || (Array.isArray(x) && x.every(plain)))
  return false
}
const one = (v) => {
  if (plain(v)) return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(one).join(', ')}]`
  const keys = Object.keys(v)
  if (keys.length === 0) return '{}'
  return `{ ${keys.map((k) => `${JSON.stringify(k)}: ${one(v[k])}`).join(', ')} }`
}

function write(v, indent) {
  if (plain(v)) return JSON.stringify(v)
  if (numeric(v) || (flat(v) && one(v).length <= 150)) return one(v)
  const pad = '  '.repeat(indent + 1)
  const end = '  '.repeat(indent)
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    return `[\n${v.map((x) => pad + write(x, indent + 1)).join(',\n')}\n${end}]`
  }
  const keys = Object.keys(v)
  if (keys.length === 0) return '{}'
  return `{\n${keys.map((k) => `${pad}${JSON.stringify(k)}: ${write(v[k], indent + 1)}`).join(',\n')}\n${end}}`
}

for (const path of process.argv.slice(2)) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const text = write(data, 0) + '\n'
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(data)) throw new Error(`${path} changed in the rewrite`)
  writeFileSync(path, text)
  console.log(path, text.split('\n').length, 'lines,', text.length, 'bytes')
}
```

Run, in order:

```bash
npx vitest run src/shared/gen-ink-vectors.test.ts
node compact-vectors.tmp.js shared/brush-vectors.json shared/cosmetics-vectors.json
shasum -a 256 shared/brush-vectors.json shared/cosmetics-vectors.json
rm src/shared/gen-ink-vectors.test.ts compact-vectors.tmp.js
```

Expected: 2 pass; the formatter prints `shared/brush-vectors.json 1153 lines, 139040 bytes` and `shared/cosmetics-vectors.json 361 lines, 22048 bytes`; the hashes are:

```
20295b06712ee6694b77250f1eb3c2ebf5295ef051ad7ceccf3bcb84a22a3048  shared/brush-vectors.json
6078f4425fc6364b72eac222f6c38e5635ad1c251d5db3541abf3ea894d5b17b  shared/cosmetics-vectors.json
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/renderer/brush-vectors.test.ts src/shared/cosmetics-vectors.test.ts`
Expected: 18 pass. Then `npm run typecheck` is clean and `npm run test` passes 1001.

- [ ] **Step 5: Run the gates and commit**

```bash
git add shared/brush-vectors.json shared/cosmetics-vectors.json src/renderer/brush-vectors.test.ts src/shared/cosmetics-vectors.test.ts
git commit -m "IOS-020: desktop's brush and cosmetics on shared inputs, for both platforms to run"
```

### Task 2: The brush in MurmurCore

**Files:** Create `ios/MurmurCore/Sources/MurmurCore/Brush.swift`. Test `ios/MurmurCore/Tests/MurmurCoreTests/BrushVectorTests.swift`.

**Interfaces:** Produces `Brush` with `RGB` (and `init?(hex:)`), `Paint`, `XY`, `Mark` (`.fill`, `.lines`), `Random(seed:)`, `Noise(seed:)`, `clamp`, `lerp`, `easeOut`, `mix`, `PathPoint`, `Path`, `path(_:step:raw:)`, `Bristle`, `brush(seed:count:)`, `cachedBrush(seed:count:)`, `pressure(_:ts:te:)`, `StrokeOptions`, and `stroke(_:_:_:) -> [Mark]`.

- [ ] **Step 1: Write the failing test**

`ios/MurmurCore/Tests/MurmurCoreTests/BrushVectorTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/brush-vectors.json: desktop's brush engine on fixed inputs.
struct BrushVectors: Decodable {
    struct Randoms: Decodable {
        let seed: Int
        let values: [Double]
    }

    struct Noises: Decodable {
        let seed: Int
        let xs: [Double]
        let values: [Double]
    }

    struct PathCase: Decodable, CustomTestStringConvertible {
        struct Out: Decodable {
            let total: Double
            let points: [[Double]]
        }

        let name: String
        let pts: [[Double]]
        let step: Double
        let raw: Bool
        let out: Out

        var testDescription: String { name }
        var path: Brush.Path { Brush.path(pts.map { Brush.XY($0[0], $0[1]) }, step: step, raw: raw) }
    }

    struct BrushCase: Decodable {
        struct Bristle: Decodable {
            let off, w, a, load, tone, lam, jit: Double
            let nz: [Double]
        }

        let seed: Int
        let n: Int
        let bristles: [Bristle]
    }

    struct Pressures: Decodable {
        let ts: Double
        let te: Double
        let values: [Double]
    }

    struct StrokeCase: Decodable, CustomTestStringConvertible {
        struct Options: Decodable {
            let width: Double
            let rgb: [Double]
            let alpha, dry, core, ts, te, sOff, light, dark: Double?
            let noCore: Bool?
            let i0, i1: Int?
            let pfn: String?
        }

        struct Op: Decodable {
            let fill: [Double]?
            let points: [[Double]]?
            let stroke: [Double]?
            let width: Double?
            let lines: [[[Double]]]?
        }

        let name: String
        let path: Int
        let seed: Int
        let n: Int
        let options: Options
        let ops: [Op]

        var testDescription: String { name }
    }

    let mulberries: [Randoms]
    let noises: [Noises]
    let paths: [PathCase]
    let brushes: [BrushCase]
    let pressures: [Pressures]
    let strokes: [StrokeCase]

    static let file: BrushVectors? = try? SharedData(directory: repoShared).decode(BrushVectors.self, from: "brush-vectors.json")
}

/// Near enough: libm and V8 may differ in the last bit or so.
private func near(_ a: Double, _ b: Double, _ tolerance: Double = 1e-9) -> Bool {
    abs(a - b) <= tolerance * max(1, abs(a), abs(b))
}

@Suite struct BrushVectorTests {
    @Test func theVectorsLoad() throws {
        let file = try #require(BrushVectors.file)
        #expect(file.mulberries.count >= 5)
        #expect(file.strokes.count >= 5)
    }

    @Test func randomNumbersMatchDesktop() throws {
        for vector in try #require(BrushVectors.file).mulberries {
            var random = Brush.Random(seed: vector.seed)
            #expect(vector.values.map { _ in random.next() } == vector.values, "seed \(vector.seed)")
        }
    }

    @Test func noiseMatchesDesktop() throws {
        for vector in try #require(BrushVectors.file).noises {
            let noise = Brush.Noise(seed: vector.seed)
            #expect(vector.xs.map { noise($0) } == vector.values, "seed \(vector.seed)")
        }
    }

    @Test(arguments: BrushVectors.file?.paths ?? [])
    func pathsMatchDesktop(_ vector: BrushVectors.PathCase) {
        let path = vector.path
        #expect(near(path.total, vector.out.total))
        #expect(path.points.count == vector.out.points.count)
        for (point, expected) in zip(path.points, vector.out.points) {
            let got = [point.x, point.y, point.s, point.nx, point.ny]
            #expect(zip(got, expected).allSatisfy { near($0, $1) }, "\(got) against \(expected)")
        }
    }

    @Test func brushesMatchDesktop() throws {
        for vector in try #require(BrushVectors.file).brushes {
            let bristles = Brush.brush(seed: vector.seed, count: vector.n)
            #expect(bristles.count == vector.bristles.count)
            for (b, e) in zip(bristles, vector.bristles) {
                #expect([b.off, b.w, b.a, b.load, b.tone, b.lam, b.jit] == [e.off, e.w, e.a, e.load, e.tone, e.lam, e.jit], "seed \(vector.seed)")
                #expect([0.5, 3.2, 40.7, 300.1].map { b.nz($0) } == e.nz, "seed \(vector.seed)")
            }
        }
    }

    /// A kept brush is the brush its seed makes, every time it is asked for.
    @Test func aKeptBrushIsTheSameBrush() {
        let made = Brush.brush(seed: 612, count: 7)
        for kept in [Brush.cachedBrush(seed: 612, count: 7), Brush.cachedBrush(seed: 612, count: 7)] {
            #expect(kept.map(\.off) == made.map(\.off) && kept.map(\.lam) == made.map(\.lam))
            #expect(kept.map { $0.nz(12.5) } == made.map { $0.nz(12.5) })
        }
        #expect(Brush.cachedBrush(seed: 612, count: 9).count == 9)
    }

    @Test func pressureMatchesDesktop() throws {
        for vector in try #require(BrushVectors.file).pressures {
            let got = [0, 0.03, 0.1, 0.5, 0.8, 0.95, 1].map { Brush.pressure($0, ts: vector.ts, te: vector.te) }
            #expect(zip(got, vector.values).allSatisfy { near($0, $1) }, "\(vector.ts) \(vector.te)")
        }
    }

    @Test(arguments: BrushVectors.file?.strokes ?? [])
    func strokesPaintAsOnDesktop(_ vector: BrushVectors.StrokeCase) throws {
        let file = try #require(BrushVectors.file)
        let o = vector.options
        var options = Brush.StrokeOptions(width: o.width, rgb: Brush.RGB(o.rgb[0], o.rgb[1], o.rgb[2]))
        if let v = o.alpha { options.alpha = v }
        if let v = o.dry { options.dry = v }
        options.core = o.core
        if let v = o.ts { options.ts = v }
        if let v = o.te { options.te = v }
        if let v = o.sOff { options.sOff = v }
        if let v = o.light { options.light = v }
        if let v = o.dark { options.dark = v }
        if let v = o.noCore { options.noCore = v }
        options.i0 = o.i0
        options.i1 = o.i1
        if o.pfn == "sine" { options.pressure = { 0.5 + 0.5 * sin($0 * .pi) } }
        let marks = Brush.stroke(file.paths[vector.path].path, Brush.brush(seed: vector.seed, count: vector.n), options)
        #expect(marks.count == vector.ops.count)
        for (mark, op) in zip(marks, vector.ops) {
            switch mark {
            case let .fill(paint, shape):
                let color = try #require(op.fill)
                #expect([Double(paint.r), Double(paint.g), Double(paint.b)] == Array(color.prefix(3)))
                #expect(near(paint.a, color[3]))
                let points = try #require(op.points)
                #expect(shape.count == points.count)
                #expect(zip(shape, points).allSatisfy { near($0.x, $1[0]) && near($0.y, $1[1]) })
            case let .lines(paint, width, runs):
                let color = try #require(op.stroke)
                #expect([Double(paint.r), Double(paint.g), Double(paint.b)] == Array(color.prefix(3)))
                #expect(near(paint.a, color[3]))
                #expect(near(width, try #require(op.width)))
                let lines = try #require(op.lines)
                #expect(runs.map(\.count) == lines.map(\.count))
                for (run, line) in zip(runs, lines) {
                    #expect(zip(run, line).allSatisfy { near($0.x, $1[0]) && near($0.y, $1[1]) })
                }
            }
        }
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore`
Expected: the build fails with `cannot find 'Brush' in scope`.

- [ ] **Step 3: Port the brush**

`ios/MurmurCore/Sources/MurmurCore/Brush.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The brush (ios/prd.json IOS-020): desktop's paint engine
// (src/renderer/brush.ts) in Swift, so the keyboard can paint the ink
// waveforms itself. A stroke is a bundle of bristles dragged along a path;
// each bristle carries its own load of paint, runs dry toward the tail in
// streaks, and wobbles a little. Everything is seeded, so a seed paints the
// same mark here as on desktop (shared/brush-vectors.json). A stroke comes
// back as marks (a wet body to fill, bristle lines to draw), so this file
// never touches a screen.
import Foundation
import Synchronization

public enum Brush {
    /// A color as red, green, and blue from 0 to 255, as desktop mixes paint.
    public struct RGB: Sendable, Equatable {
        public var r, g, b: Double

        public init(_ r: Double, _ g: Double, _ b: Double) {
            (self.r, self.g, self.b) = (r, g, b)
        }

        public static let white = RGB(255, 255, 255)
        public static let black = RGB(0, 0, 0)

        /// From #rrggbb or #rgb; nil for anything else.
        public init?(hex: String) {
            var digits = hex.trimmingCharacters(in: .whitespaces)
            guard digits.hasPrefix("#") else { return nil }
            digits.removeFirst()
            if digits.count == 3 { digits = digits.map { "\($0)\($0)" }.joined() }
            guard digits.count == 6, digits.allSatisfy(\.isHexDigit), let n = UInt32(digits, radix: 16) else { return nil }
            self.init(Double((n >> 16) & 255), Double((n >> 8) & 255), Double(n & 255))
        }
    }

    /// A color as desktop hands it to the canvas: whole channels, cut
    /// toward zero, and an opacity.
    public struct Paint: Sendable, Equatable {
        public let r, g, b: Int
        public let a: Double

        public init(_ rgb: RGB, _ a: Double = 1) {
            (r, g, b) = (Int(rgb.r), Int(rgb.g), Int(rgb.b))
            self.a = a
        }
    }

    public struct XY: Sendable, Equatable {
        public var x, y: Double

        public init(_ x: Double, _ y: Double) {
            (self.x, self.y) = (x, y)
        }
    }

    /// One painted piece of a stroke.
    public enum Mark: Sendable, Equatable {
        /// The wet body under the bristles, a closed shape.
        case fill(Paint, [XY])
        /// One bristle: its pen-down runs, drawn with butt ends and round joins.
        case lines(Paint, width: Double, runs: [[XY]])
    }

    // MARK: Random and noise

    /// A tiny seeded random generator (mulberry32), number for number desktop's.
    public struct Random: Sendable {
        private var a: UInt32

        public init(seed: Int) {
            a = UInt32(truncatingIfNeeded: seed)
        }

        /// The next value, 0 up to 1.
        public mutating func next() -> Double {
            a &+= 0x6D2B_79F5
            var t = (a ^ (a >> 15)) &* (1 | a)
            t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
            return Double(t ^ (t >> 14)) / 4_294_967_296
        }
    }

    /// Smooth 1D value noise in 0 to 1, seeded. Desktop keeps its table in
    /// 32 bit floats, so this one does too.
    public struct Noise: Sendable {
        private let table: [Float]

        public init(seed: Int) {
            var random = Random(seed: seed)
            table = (0..<256).map { _ in Float(random.next()) }
        }

        public func callAsFunction(_ x: Double) -> Double {
            let floor = x.rounded(.down)
            let f = x - floor
            let u = f * f * (3 - 2 * f)
            let i = Int(floor)
            let a = Double(table[i & 255])
            let b = Double(table[(i + 1) & 255])
            return a + (b - a) * u
        }
    }

    // MARK: Helpers

    public static func clamp(_ v: Double, _ a: Double, _ b: Double) -> Double {
        max(a, min(b, v))
    }

    public static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
        a + (b - a) * t
    }

    public static func easeOut(_ t: Double) -> Double {
        1 - pow(1 - t, 3)
    }

    public static func mix(_ a: RGB, _ b: RGB, _ t: Double) -> RGB {
        RGB(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t))
    }

    // MARK: Paths

    public struct PathPoint: Sendable, Equatable {
        public var x, y: Double
        /// Arc length from the start.
        public var s: Double
        /// Unit normal.
        public var nx, ny: Double
    }

    public struct Path: Sendable {
        public let points: [PathPoint]
        public let total: Double
    }

    /// Catmull-Rom through the points, `per` samples a span.
    static func catmullRom(_ pts: [XY], per: Int) -> [XY] {
        var out: [XY] = []
        out.reserveCapacity((pts.count - 1) * per + 1)
        for k in 0..<(pts.count - 1) {
            let p0 = pts[max(k - 1, 0)]
            let p1 = pts[k]
            let p2 = pts[k + 1]
            let p3 = pts[min(k + 2, pts.count - 1)]
            for j in 0..<per {
                let u = Double(j) / Double(per)
                let u2 = u * u
                let u3 = u2 * u
                out.append(XY(spline(p0.x, p1.x, p2.x, p3.x, u, u2, u3), spline(p0.y, p1.y, p2.y, p3.y, u, u2, u3)))
            }
        }
        out.append(pts[pts.count - 1])
        return out
    }

    // Each term is its own typed value, so Swift 6.3 (CI) can check it.
    private static func spline(_ p0: Double, _ p1: Double, _ p2: Double, _ p3: Double, _ u: Double, _ u2: Double, _ u3: Double) -> Double {
        let a: Double = 2 * p1
        let b: Double = (-p0 + p2) * u
        let c: Double = (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
        let d: Double = (-p0 + 3 * p1 - 3 * p2 + p3) * u3
        return 0.5 * (a + b + c + d)
    }

    /// A path through the points, smoothed (unless raw) and resampled every
    /// `step`, with normals and arc length. Raw keeps sharp turns.
    public static func path(_ pts: [XY], step: Double = 2, raw: Bool = false) -> Path {
        guard !pts.isEmpty else { return Path(points: [], total: 0) }
        let dense = raw || pts.count <= 2 ? pts : catmullRom(pts, per: 28)
        var lens: [Double] = [0]
        lens.reserveCapacity(dense.count)
        for i in 1..<max(1, dense.count) {
            lens.append(lens[i - 1] + hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y))
        }
        let total = lens[lens.count - 1]
        let n = max(2, Int((total / step).rounded(.up)) + 1)
        var out: [PathPoint] = []
        out.reserveCapacity(n)
        var j = 1
        for i in 0..<n {
            let s = total * Double(i) / Double(n - 1)
            while j < lens.count - 1, lens[j] < s { j += 1 }
            let a = dense[max(0, min(j - 1, dense.count - 1))]
            let b = dense[min(j, dense.count - 1)]
            let lo = lens[max(0, min(j - 1, lens.count - 1))]
            let span = lens[min(j, lens.count - 1)] - lo
            let seg = span == 0 ? 1 : span
            let t = clamp((s - lo) / seg, 0, 1)
            out.append(PathPoint(x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), s: s, nx: 0, ny: 0))
        }
        for i in 0..<n {
            let a = out[max(0, i - 1)]
            let b = out[min(n - 1, i + 1)]
            let dx = b.x - a.x
            let dy = b.y - a.y
            let length = hypot(dx, dy)
            let d = length == 0 ? 1 : length
            out[i].nx = -dy / d
            out[i].ny = dx / d
        }
        return Path(points: out, total: total)
    }

    // MARK: Bristles

    public struct Bristle: Sendable {
        /// Position across the stroke, -1 to 1.
        public let off: Double
        public let w: Double
        public let a: Double
        /// How much paint it carries; low loads run dry sooner.
        public let load: Double
        public let tone: Double
        public let nz: Noise
        /// Streak length.
        public let lam: Double
        public let jit: Double
    }

    /// A brush of n bristles, spread evenly across its width.
    public static func brush(seed: Int, count n: Int = 30) -> [Bristle] {
        var r = Random(seed: seed &* 7919 &+ 13)
        return (0..<n).map { i in
            let off = (Double(i) + r.next()) / Double(n) * 2 - 1
            let w = 0.55 + r.next() * 0.9
            let a = 0.4 + r.next() * 0.55
            let load = (0.78 + r.next() * 0.6) * (1 - off * off * 0.45)
            let tone = r.next() * 2 - 1
            let nz = Noise(seed: seed &* 131 &+ i &* 17)
            let lam = 28 + r.next() * 120
            return Bristle(off: off, w: w, a: a, load: load, tone: tone, nz: nz, lam: lam, jit: r.next())
        }
    }

    private static let cache = Mutex<[Int: [Bristle]]>([:])

    /// A brush kept for its seed and size, as desktop's cachedBrush keeps
    /// them; callers keep seeds to a small set so this stays small.
    public static func cachedBrush(seed: Int, count n: Int) -> [Bristle] {
        let key = seed &* 1024 &+ n
        if let kept = cache.withLock({ $0[key] }) { return kept }
        let made = brush(seed: seed, count: n)
        cache.withLock { kept in
            if kept.count > 512 { kept.removeAll() }
            kept[key] = made
        }
        return made
    }

    /// Press in quickly, lift off slowly.
    public static func pressure(_ t: Double, ts: Double = 0.07, te: Double = 0.3) -> Double {
        var p = 1.0
        if t < ts { p = 0.35 + 0.65 * easeOut(t / ts) }
        if t > 1 - te { p *= 1 - 0.72 * pow((t - (1 - te)) / te, 1.4) }
        return p
    }

    // MARK: Strokes

    public struct StrokeOptions: Sendable {
        public var width: Double
        public var rgb: RGB
        /// 0 is wet and solid, 1 runs dry fast.
        public var dry: Double = 0.4
        public var alpha: Double = 1
        /// Opacity of the wet body; nil takes it from dryness.
        public var core: Double?
        public var noCore = false
        /// Attack and lift fractions for the default pressure.
        public var ts: Double = 0.07
        public var te: Double = 0.3
        /// A custom pressure along the stroke, 0 to 1 in, 0 to 1 out.
        public var pressure: (@Sendable (Double) -> Double)?
        /// Paint only these point indices.
        public var i0: Int?
        public var i1: Int?
        /// Shifts the bristle texture along the path, so a scrolling stroke keeps its pattern.
        public var sOff: Double = 0
        public var light: Double = 0.07
        public var dark: Double = 0.22

        public init(width: Double, rgb: RGB) {
            self.width = width
            self.rgb = rgb
        }
    }

    /// Paints bristles along a path, as desktop's stroke does.
    public static func stroke(_ path: Path, _ bristles: [Bristle], _ o: StrokeOptions) -> [Mark] {
        let points = path.points
        let n = points.count
        let w = o.width
        let i0 = o.i0 ?? 0
        let i1 = o.i1 ?? n - 1
        guard n > 1, i1 > i0, o.alpha > 0 else { return [] }
        let span = Double(n - 1)
        let pf: (Double) -> Double = o.pressure ?? { pressure($0, ts: o.ts, te: o.te) }
        var marks: [Mark] = []
        marks.reserveCapacity(bristles.count + 1)
        let core = o.core ?? 0.5 * (1 - o.dry)
        if core > 0, !o.noCore {
            var shape: [XY] = []
            shape.reserveCapacity((i1 - i0 + 1) * 2)
            for i in i0...i1 {
                let p = points[i]
                let h = w * 0.3 * pf(Double(i) / span)
                shape.append(XY(p.x + p.nx * h, p.y + p.ny * h))
            }
            for i in stride(from: i1, through: i0, by: -1) {
                let p = points[i]
                let h = w * 0.3 * pf(Double(i) / span)
                shape.append(XY(p.x - p.nx * h, p.y - p.ny * h))
            }
            marks.append(.fill(Paint(o.rgb, core * o.alpha), shape))
        }
        let unit = w * 2.4 / Double(max(1, bristles.count))
        let cap = 2.2 + w * 0.012
        for b in bristles {
            let color = b.tone > 0 ? mix(o.rgb, .white, b.tone * o.light) : mix(o.rgb, .black, -b.tone * o.dark)
            var runs: [[XY]] = []
            var pen = false
            for i in i0...i1 {
                let pt = points[i]
                let t = Double(i) / span
                let ink: Double = b.load * 1.1 - pow(t, 1.6) * o.dry * 1.35 + (1 - o.dry) * 0.2
                if b.nz((pt.s + o.sOff) / b.lam) < ink {
                    let wobble: Double = (b.nz((pt.s + o.sOff) / 90 + 40) - 0.5) * min(w, 36) * 0.18 * b.jit
                    let off = b.off * w * 0.5 * pf(t) + wobble
                    let at = XY(pt.x + pt.nx * off, pt.y + pt.ny * off)
                    if pen {
                        runs[runs.count - 1].append(at)
                    } else {
                        runs.append([at])
                        pen = true
                    }
                } else {
                    pen = false
                }
            }
            marks.append(.lines(Paint(color, b.a * o.alpha), width: max(0.5, min(b.w * unit, cap)), runs: runs))
        }
        return marks
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: 132 tests pass (1 known issue on purpose).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/Brush.swift ios/MurmurCore/Tests/MurmurCoreTests/BrushVectorTests.swift
git commit -m "IOS-020: MurmurCore paints with desktop's brush, mark for mark"
```

### Task 3: The cosmetics in MurmurCore

**Files:** Create `ios/MurmurCore/Sources/MurmurCore/Cosmetics.swift`. Test `ios/MurmurCore/Tests/MurmurCoreTests/CosmeticsVectorTests.swift`.

**Interfaces:**
- Consumes `Ranks.progress`, `ProgressReport`, `Achievements.evaluate`, and `EarnedAchievement` (IOS-017, IOS-018).
- Produces `CosmeticItem` (with `Unlock`), `CosmeticsFile`, and `Cosmetics.isUnlocked(_:progress:earned:)`, `beltColor(_:progress:) -> String?`, and `accentColor(_:spec:progress:earned:) -> String?`.

- [ ] **Step 1: Write the failing test**

`ios/MurmurCore/Tests/MurmurCoreTests/CosmeticsVectorTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/cosmetics-vectors.json: what desktop unlocks for fixed takes, and
/// the color each accent resolves to.
struct CosmeticsVectors: Decodable {
    struct Take: Decodable {
        let at: Int64
        let words: Int
        let durationMs: Int
        let day: String
        let hour: Int
    }

    struct Expect: Decodable {
        let rank: String
        let earned: [String]
        let styles: [String]
        let accents: [String]
        let beltColor: String
        let colors: [String: String]
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let takes: [Take]
        let expect: Expect

        var testDescription: String { name }
    }

    let cases: [Case]

    static let file: CosmeticsVectors? = try? SharedData(directory: repoShared).decode(CosmeticsVectors.self, from: "cosmetics-vectors.json")
    static let cosmetics: CosmeticsFile? = try? SharedData(directory: repoShared).decode(CosmeticsFile.self, from: "cosmetics.json")
    static let ranks: RanksFile? = try? SharedData(directory: repoShared).decode(RanksFile.self, from: "ranks.json")
    static let achievements: AchievementsFile? = try? SharedData(directory: repoShared).decode(AchievementsFile.self, from: "achievements.json")
}

@Suite struct CosmeticsVectorTests {
    @Test func theVectorsAndTheCosmeticsLoad() throws {
        #expect(try #require(CosmeticsVectors.file).cases.count >= 7)
        let spec = try #require(CosmeticsVectors.cosmetics)
        #expect(spec.overlayStyles.map(\.id) == ["bars", "speckle", "pulse", "dabs", "flecks", "rings", "ribbon"])
        #expect(spec.accents.first?.id == "amber")
    }

    @Test(arguments: CosmeticsVectors.file?.cases ?? [])
    func eachHistoryUnlocksAsOnDesktop(_ vector: CosmeticsVectors.Case) throws {
        let spec = try #require(CosmeticsVectors.cosmetics)
        let progress = Ranks.progress(vector.takes.map { RankEvent(at: $0.at, words: $0.words, day: $0.day) }, spec: try #require(CosmeticsVectors.ranks))
        let earned = Achievements.evaluate(vector.takes.map { AchievementEvent(at: $0.at, words: $0.words, durationMs: $0.durationMs, day: $0.day, hour: $0.hour) }, spec: try #require(CosmeticsVectors.achievements))
        #expect(progress.rank.id == vector.expect.rank)
        #expect(earned.map(\.id) == vector.expect.earned)
        #expect(spec.overlayStyles.filter { Cosmetics.isUnlocked($0, progress: progress, earned: earned) }.map(\.id) == vector.expect.styles)
        #expect(spec.accents.filter { Cosmetics.isUnlocked($0, progress: progress, earned: earned) }.map(\.id) == vector.expect.accents)
        #expect(Cosmetics.beltColor(spec, progress: progress) == vector.expect.beltColor)
        for (id, color) in vector.expect.colors {
            #expect(Cosmetics.accentColor(id, spec: spec, progress: progress, earned: earned) == color, "\(id)")
        }
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore`
Expected: the build fails with `cannot find type 'CosmeticsFile' in scope`.

- [ ] **Step 3: Port the cosmetics**

`ios/MurmurCore/Sources/MurmurCore/Cosmetics.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The cosmetics (ios/prd.json IOS-020): which waveform styles and accents
// a rank and its achievements unlock, and the color an accent resolves to,
// the same as desktop's src/shared/cosmetics.ts over shared/cosmetics.json
// (shared/cosmetics-vectors.json). Cosmetics never gate function; a locked
// item stays visible with the hint that earns it.
import Foundation

public struct CosmeticItem: Decodable, Sendable, Equatable, Identifiable {
    public struct Unlock: Decodable, Sendable, Equatable {
        public let rank: String?
        public let achievement: String?
    }

    public let id: String
    public let name: String
    public let hint: String
    /// An accent's color; nil for the belt accent, which follows the rank.
    public let color: String?
    /// Nil means always unlocked.
    public let unlock: Unlock?
}

public struct CosmeticsFile: Decodable, Sendable {
    public let beltColors: [String: String]
    public let founderGold: String
    public let overlayStyles: [CosmeticItem]
    public let accents: [CosmeticItem]
}

public enum Cosmetics {
    /// Is one item unlocked? As desktop's isUnlocked: always with no rule,
    /// always for the founder, a rank when it is held or was promoted
    /// through, an achievement once earned.
    public static func isUnlocked(_ item: CosmeticItem, progress: ProgressReport, earned: [EarnedAchievement]) -> Bool {
        guard let unlock = item.unlock else { return true }
        if progress.founder { return true }
        if let rank = unlock.rank {
            if progress.rank.id == rank { return true }
            return progress.promotions.contains { $0.id == rank } && progress.index >= 0
        }
        if let achievement = unlock.achievement {
            return earned.contains { $0.id == achievement }
        }
        return false
    }

    /// The belt's own color for the rank held, as desktop's beltColor.
    public static func beltColor(_ spec: CosmeticsFile, progress: ProgressReport) -> String? {
        spec.beltColors[progress.rank.belt] ?? spec.beltColors["none"]
    }

    /// The color an accent id resolves to, as desktop's resolveAccentColor:
    /// belt follows the rank; a locked or unknown id falls back to the
    /// first free accent, signal amber. Nil only for a file with no free
    /// accent, which callers paint as signal amber too.
    public static func accentColor(_ id: String, spec: CosmeticsFile, progress: ProgressReport, earned: [EarnedAchievement]) -> String? {
        let fallback = spec.accents.first { $0.unlock == nil }?.color
        guard let item = spec.accents.first(where: { $0.id == id }), isUnlocked(item, progress: progress, earned: earned) else { return fallback }
        if item.id == "belt" || item.color == nil {
            return spec.beltColors[progress.rank.belt] ?? fallback
        }
        return item.color
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: 134 tests pass (1 known issue on purpose).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/Cosmetics.swift ios/MurmurCore/Tests/MurmurCoreTests/CosmeticsVectorTests.swift
git commit -m "IOS-020: MurmurCore unlocks styles and accents as desktop does"
```

### Task 4: The ink in the pill

**Files:**
- Create `ios/Shared/Ink.swift`.
- Modify `ios/Shared/Pill.swift`, `ios/Shared/PillView.swift`, `ios/App/Pill/PillCanvas.swift`, `ios/App/Keyboard/KeyboardScreen.swift`, and `ios/project.yml`.
- Test `ios/AppTests/InkTests.swift`, `ios/AppTests/PillTests.swift`, and `ios/AppTests/KeyboardCopyTests.swift`.

**Interfaces:**
- Consumes `Brush` (Task 2).
- Produces:
  - `PillStyle` with `pulse`, `dabs`, `flecks`, `rings`, and `ribbon`;
  - `PillPalette` (`wet`, `dry`, `standard`, `init(accent:)`);
  - `PillFrame.palette` and `PillFrame.ink`;
  - `PillLook(style:accent:color:)` with `palette`, read leniently;
  - `InkScene` (`init(style:stage:at:reduced:)`, `show(_:palette:)`, `step(to:level:)`, `busy(still:)`, `paint(in:context:palette:)`, `pushes`, `ringCount`, `dropCount`, `paints(_:)`, `scripted(_:_:at:palette:still:)`, and `stillTime(_:)`);
  - `DemoVoice` (moved to `Ink.swift`: `voice(_:)`, `level()`, and `levels`);
  - `BrushCanvas.draw(_:in:)`;
  - `RGBA.ink`, `rgb255`, `isAmber`, `hex`, and `init?(hex:)`;
  - `PillView.palette` and `PillCanvas(style:stage:level:palette:)`.

- [ ] **Step 1: Write the failing tests**

`ios/AppTests/InkTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
@testable import murmur

/// The ink and pulse scene (IOS-020): desktop's InkWave and PulseWave
/// stepping through time.
@MainActor @Suite struct InkSceneTests {
    /// A scene that recorded for `ms`, stepped as a screen at `every` ms
    /// would step it, at a steady level or the made-up voice.
    func recording(_ style: PillStyle, for ms: Double, every: Double = 1000.0 / 30, level: Double? = nil, reduced: Bool = false) -> InkScene {
        var scene = InkScene(style: style, at: 0, reduced: reduced)
        scene.show(.recording, palette: .standard)
        var now = 0.0
        while now < ms {
            now = min(ms, now + every)
            scene.step(to: now, level: level ?? DemoVoice.voice(now / 1000))
        }
        return scene
    }

    @Test func aColumnEvery66Milliseconds() {
        #expect(recording(.dabs, for: 660).pushes == 10)
        #expect(recording(.dabs, for: 659).pushes == 9)
    }

    /// Desktop updates once a frame at 60 a second; a screen stepping at 30
    /// a second gets the same rings, drops, and columns.
    @Test(arguments: [PillStyle.rings, .pulse, .flecks, .dabs])
    func theScreensRateChangesNothing(style: PillStyle) {
        let fast = recording(style, for: 3000, every: 1000.0 / 60, level: 0.6)
        let slow = recording(style, for: 3000, every: 1000.0 / 30, level: 0.6)
        #expect(fast.pushes == slow.pushes)
        #expect(fast.ringCount == slow.ringCount)
        #expect(fast.dropCount == slow.dropCount)
    }

    @Test func aVoiceBearsRingsAndDrops() {
        #expect(recording(.rings, for: 2000, level: 0.6).ringCount > 0)
        #expect(recording(.pulse, for: 2000, level: 0.6).ringCount > 0)
        #expect(recording(.flecks, for: 2000, level: 0.9).dropCount > 0)
    }

    /// Errors and no speech start clean: no ring or drop carries over.
    @Test func errorsAndNoSpeechStartClean() {
        for stage in [PillStage.error, .noSpeech] {
            var rings = recording(.rings, for: 1500, level: 0.6)
            rings.show(stage, palette: .standard)
            #expect(rings.ringCount == 0)
            var flecks = recording(.flecks, for: 1500, level: 0.9)
            flecks.show(stage, palette: .standard)
            #expect(flecks.dropCount == 0)
        }
    }

    /// Reduce Motion: no rings are born and no drops are thrown.
    @Test func reduceMotionBearsNothing() {
        #expect(recording(.rings, for: 2000, level: 0.6, reduced: true).ringCount == 0)
        #expect(recording(.pulse, for: 2000, level: 0.6, reduced: true).ringCount == 0)
        #expect(recording(.flecks, for: 2000, level: 0.9, reduced: true).dropCount == 0)
    }

    /// The pill redraws while recording, settles for 1.6 seconds after a
    /// stage change, then rests; a still pill never redraws.
    @Test func theSceneRestsOnceSettled() {
        var scene = recording(.dabs, for: 1000)
        #expect(scene.busy(still: false))
        #expect(!scene.busy(still: true))
        scene.show(.inserted, palette: .standard)
        scene.step(to: 2500, level: 0)
        #expect(scene.busy(still: false))
        scene.step(to: 2700, level: 0)
        #expect(!scene.busy(still: false))
    }

    /// Processing keeps its sheen coming every 2 seconds until the words
    /// land, and rests after 2 minutes; Reduce Motion has no sheen to wait for.
    @Test func processingRunsUntilTheSheenStops() {
        var scene = recording(.ribbon, for: 1000)
        scene.show(.processing, palette: .standard)
        scene.step(to: 61_000, level: 0)
        #expect(scene.busy(still: false))
        scene.step(to: 122_000, level: 0)
        #expect(!scene.busy(still: false))
        var reduced = recording(.ribbon, for: 1000, reduced: true)
        reduced.show(.processing, palette: .standard)
        reduced.step(to: 3000, level: 0)
        #expect(!reduced.busy(still: false))
    }

    /// The pill off screen for ten minutes catches up at once.
    @Test func aLongGapJumpsAhead() {
        var scene = recording(.dabs, for: 500)
        let started = Date.now
        scene.step(to: 600_000, level: 0.5)
        #expect(Date.now.timeIntervalSince(started) < 0.5)
        #expect(scene.pushes >= 9000)
        #expect(scene.busy(still: false))
    }

    /// The ink paints in the accent: wet in it while recording, a darker
    /// shade of it once dry, and never amber.
    @Test(arguments: [PillStyle.dabs, .flecks, .rings, .ribbon, .pulse])
    func theInkPaintsInTheAccent(style: PillStyle) {
        let blue = RGBA(r: 0.36, g: 0.51, b: 0.85)
        let palette = PillPalette(accent: blue)
        let test = PillTests()
        for (stage, time) in [(PillStage.recording, 0.5), (.processing, 1.5)] {
            let frame = PillFrame(style: style, stage: stage, levels: test.loud, time: time, still: false, palette: palette)
            let bytes = test.pixels(frame)
            var bluish = 0
            for i in stride(from: 0, to: bytes.count, by: 4) where Int(bytes[i + 2]) - Int(bytes[i]) > 25 {
                bluish += 1
            }
            #expect(bluish > 0, "\(stage)")
            #expect(test.paint(frame).amber == 0, "\(stage)")
        }
    }

    /// Reduce Motion: every stage of every ink style is a finished still,
    /// never a blank space.
    @Test(arguments: [PillStyle.dabs, .flecks, .rings, .ribbon, .pulse])
    func aStillIsNeverBlank(style: PillStyle) {
        let test = PillTests()
        for stage in [PillStage.idle, .recording, .processing, .inserted, .noSpeech, .error] {
            let bytes = test.pixels(PillFrame(style: style, stage: stage, levels: test.loud, time: 0, still: true))
            // Any paint at all on the ink, however faint.
            let painted = stride(from: 0, to: bytes.count, by: 4).filter { Int(bytes[$0]) + Int(bytes[$0 + 1]) + Int(bytes[$0 + 2]) > 46 + 48 }.count
            #expect(painted > 20, "\(stage)")
        }
    }

    /// The made-up voice is desktop's: phrases with a breath between them.
    @Test func theMadeUpVoiceBreathes() {
        #expect(DemoVoice.voice(2.6) < 0.05)
        let spoken = stride(from: 0.0, to: 2.4, by: 0.05).map(DemoVoice.voice)
        #expect(spoken.max() ?? 0 > 0.5)
        #expect(spoken.allSatisfy { $0 >= 0 && $0 <= 1 })
        #expect(DemoVoice.levels.count == Pill.barCount)
    }
}
```

`ios/AppTests/PillTests.swift`, whole (the hue rule for faint paint, and the look's accent, color, and lenient read):

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
@testable import murmur

@MainActor @Suite struct PillTests {
    let size = CGSize(width: 360, height: 56)
    let loud = [Float](repeating: 0.9, count: Pill.barCount)

    /// Paint in an image of the pill, counted by color over the pixels
    /// clearly painted on the ink.
    struct Paint {
        var amber = 0, gold = 0, red = 0, neutral = 0
    }

    func pixels(_ frame: PillFrame) -> [UInt8] {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            renderer.cgContext.setFillColor(UIColor(Tokens.ink).cgColor)
            renderer.cgContext.fill(CGRect(origin: .zero, size: size))
            Pill.paint(frame, in: CGRect(origin: .zero, size: size), context: renderer.cgContext)
        }
        let width = Int(size.width * 2), height = Int(size.height * 2)
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        bytes.withUnsafeMutableBytes { raw in
            let context = CGContext(
                data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
            context?.draw(image.cgImage!, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return bytes
    }

    func paint(_ frame: PillFrame) -> Paint {
        let bytes = pixels(frame)
        var paint = Paint()
        for i in stride(from: 0, to: bytes.count, by: 4) {
            // How far each channel rose above the ink (15, 14, 17).
            let r = Double(bytes[i]) - 15, g = Double(bytes[i + 1]) - 14, b = Double(bytes[i + 2]) - 17
            guard max(r, g, b) >= 40, r > 0 else { continue }
            let green = g / r, blue = b / r
            if green < 0.45 { paint.red += 1 }
            // Fainter paint's 8 bit ratio wobbles across the line between
            // amber and gold (the ink's faintest bristles), so only clear
            // paint is told apart by hue (IOS-020).
            else if max(r, g, b) < 64, green < 0.88 { continue }
            else if green >= 0.58, green <= 0.705, blue < 0.4 { paint.amber += 1 }
            else if green > 0.715, green <= 0.82, blue < 0.4 { paint.gold += 1 }
            else if green > 0.88 { paint.neutral += 1 }
        }
        return paint
    }

    func frame(_ style: PillStyle, _ stage: PillStage, at time: TimeInterval = 0.5, still: Bool = false) -> PillFrame {
        PillFrame(style: style, stage: stage, levels: loud, time: time, still: still)
    }

    @Test(arguments: PillStyle.allCases)
    func idleIsDryAndNeverAmber(style: PillStyle) {
        let idle = paint(frame(style, .idle))
        #expect(idle.amber == 0)
        #expect(idle.gold == 0)
        #expect(idle.red == 0)
        #expect(idle.neutral > 0)
    }

    @Test(arguments: PillStyle.allCases)
    func recordingIsWetAmber(style: PillStyle) {
        #expect(paint(frame(style, .recording)).amber > 0)
    }

    /// The bars stand at the voice's level: louder draws more paint.
    @Test func barsFollowTheVoice() {
        let quiet = paint(PillFrame(style: .bars, stage: .recording, levels: [Float](repeating: 0.1, count: Pill.barCount), time: 0.5, still: false))
        let loudPaint = paint(frame(.bars, .recording))
        #expect(loudPaint.amber + loudPaint.gold > 2 * (quiet.amber + quiet.gold))
    }

    @Test(arguments: PillStyle.allCases)
    func processingDriesToGold(style: PillStyle) {
        let dry = paint(frame(style, .processing, at: 1.5))
        #expect(dry.amber == 0)
        #expect(dry.gold > 0)
    }

    @Test(arguments: PillStyle.allCases)
    func theEndsAreNeverAmber(style: PillStyle) {
        let inserted = paint(frame(style, .inserted, at: 1))
        #expect(inserted.amber == 0 && inserted.red == 0)
        let nothing = paint(frame(style, .noSpeech))
        #expect(nothing.amber == 0 && nothing.gold == 0 && nothing.red == 0)
        #expect(nothing.neutral > 0)
        let error = paint(frame(style, .error))
        #expect(error.red > 0)
        #expect(error.amber == 0 && error.gold == 0)
    }

    /// Reduce Motion shows each stage as one still frame: time and the
    /// voice change nothing.
    @Test(arguments: PillStyle.allCases)
    func stillFramesNeverMove(style: PillStyle) {
        for stage in [PillStage.idle, .recording, .processing, .inserted, .noSpeech, .error] {
            let early = PillFrame(style: style, stage: stage, levels: loud, time: 0.1, still: true)
            let late = PillFrame(style: style, stage: stage, levels: [Float](repeating: 0.2, count: Pill.barCount), time: 7.3, still: true)
            #expect(pixels(early) == pixels(late))
            #expect(!Pill.moves(stage, at: 0.1, still: true))
        }
    }

    /// The same frame draws the same pill, for previews, tests, and shots.
    @Test func framesAreDeterministic() {
        let frame = frame(.speckle, .recording, at: 1.234)
        #expect(pixels(frame) == pixels(frame))
    }

    @Test func onlyMovingStagesRedraw() {
        #expect(Pill.moves(.recording, at: 30, still: false))
        #expect(Pill.moves(.processing, at: 60, still: false))
        #expect(!Pill.moves(.processing, at: 200, still: false))
        #expect(Pill.moves(.inserted, at: 0.1, still: false))
        #expect(!Pill.moves(.inserted, at: 1, still: false))
        for stage in [PillStage.idle, .noSpeech, .error] {
            #expect(!Pill.moves(stage, at: 0, still: false))
        }
    }

    /// One sheen as the paint dries, a softer one every 2 seconds after, and
    /// none after 2 minutes, as on desktop.
    @Test func theSheenComesOnceThenEveryTwoSeconds() throws {
        let first = try #require(Sheen.at(0.3))
        #expect(abs(first.center - 0.343) < 0.01 && first.alpha == 0.4)
        #expect(Sheen.at(1.5) == nil)
        let again = try #require(Sheen.at(2.35))
        #expect(abs(again.center - 0.45) < 0.01 && again.alpha == 0.22)
        #expect(Sheen.at(118.3)?.alpha == 0.22)
        #expect(Sheen.at(121) == nil)
    }

    /// VoiceOver reads the pill as a button with its stage.
    @Test func voiceOverReadsTheStage() {
        let stages: [PillStage] = [.idle, .recording, .processing, .inserted, .noSpeech, .error]
        #expect(stages.map(Pill.label) == ["Start dictation", "Recording", "Working", "Words added", "Heard nothing", "Failed, retry in murmur"])
    }

    @Test func theLookIsRememberedForTheKeyboard() {
        let file = FileManager.default.temporaryDirectory.appending(path: "pill-\(UUID().uuidString).json")
        #expect(PillLook.read(from: file) == PillLook(style: .bars, accent: "amber", color: nil))
        let blue = RGBA(r: 0.36, g: 0.51, b: 0.85)
        let look = PillLook(style: .ribbon, accent: "belt", color: blue.hex)
        look.write(to: file)
        #expect(PillLook.read(from: file) == look)
        #expect(PillLook.read(from: file).palette == PillPalette(accent: RGBA(hex: blue.hex)))
    }

    /// A look written before the accents keeps its style; one with a style
    /// this build does not draw keeps its accent.
    @Test func anOlderOrNewerLookKeepsWhatItCan() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "pill-\(UUID().uuidString).json")
        try Data(#"{"style":"speckle"}"#.utf8).write(to: file)
        #expect(PillLook.read(from: file) == PillLook(style: .speckle, accent: "amber", color: nil))
        try Data(#"{"style":"sparkles","accent":"ember"}"#.utf8).write(to: file)
        #expect(PillLook.read(from: file) == PillLook(style: .bars, accent: "ember", color: nil))
        try Data("not json".utf8).write(to: file)
        #expect(PillLook.read(from: file) == PillLook(style: .bars))
    }

    /// Signal amber, or no color, dries to brand gold; any other accent
    /// dries to a darker shade of itself, as on desktop.
    @Test func theAccentDriesAsOnDesktop() {
        let blue = RGBA(r: 0.36, g: 0.51, b: 0.85)
        #expect(PillPalette(accent: blue) == PillPalette(wet: blue, dry: blue.mix(.ink, 0.35)))
        #expect(PillPalette(accent: nil) == .standard)
        #expect(PillPalette(accent: .amber) == .standard)
        #expect(PillPalette(accent: RGBA.amber.mix(.text, 0.004)) == .standard)
        #expect(PillPalette(accent: RGBA.amber.mix(.text, 0.05)) != .standard)
        #expect(PillLook(style: .bars, accent: "x", color: "not a color").palette == .standard)
    }

    @Test func theKeyboardFollowsTheMailbox() {
        let phases: [MailboxEntry.Phase?] = [nil, .listening, .working, .ready, .nothing, .failed]
        #expect(phases.map(PillStage.init) == [.idle, .recording, .processing, .inserted, .noSpeech, .error])
    }

    /// The level file carries the level and a count, and nothing else.
    @Test func theLevelFileCarriesOnlyTheLevel() throws {
        let file = LevelFile(url: FileManager.default.temporaryDirectory.appending(path: "level-\(UUID().uuidString)"))
        #expect(file.read() == nil)
        file.write(0.42, count: 7)
        let read = try #require(file.read())
        #expect(read.level == 0.42 && read.count == 7)
        #expect(try Data(contentsOf: try #require(file.url)).count == 8)
    }

    @Test func theAppFollowsTheTake() {
        let states: [TakeModel.State] = [.idle, .recording(since: .now), .transcribing, .words("hi"), .heardNothing(sent: true), .micOff]
        #expect(states.map(PillStage.init) == [.idle, .recording, .processing, .inserted, .noSpeech, .error])
    }

    /// The capture script draws every stage of both styles.
    @Test func theShotsCoverEveryStage() {
        let covered = Set(PillShots.shots.map { "\($0.frame.style) \($0.frame.stage)" })
        #expect(covered.count == PillStyle.allCases.count * 6)
        #expect(Set(PillShots.shots.map(\.name)).count == PillShots.shots.count)
        #expect(PillShots.image(PillShots.shots[0].frame).size == CGSize(width: 236, height: 56))
    }
}
```

In `ios/AppTests/KeyboardCopyTests.swift`, the names test becomes:

```swift
    @Test func theLooksAreNamedPlainly() {
        #expect(PillStyle.allCases.map(KeyboardCopy.name) == ["Bars", "Speckle", "Pulse", "Ink dabs", "Ink flecks", "Ink rings", "Ink ribbon"])
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app's tests fail to build: `cannot find 'InkScene' in scope`.

- [ ] **Step 3: Paint the ink**

`ios/Shared/Ink.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The ink waveforms and pulse (ios/prd.json IOS-020): desktop's InkWave
// (src/renderer/overlay/InkWave.tsx: dabs, flecks, rings, ribbon) and
// PulseWave, as a scene that steps through time and paints with
// MurmurCore's Brush. One set of rules for every style, DESIGN.md's stage
// table: wet accent while live, drying to its dry color when the brush
// lifts, a sheen while processing, flat when inserted, a dry grey scrape
// for no speech, and clean red with no bristles for an error. The scene
// paints in points as desktop paints in CSS pixels: marks keep desktop's
// sizes, and what desktop sizes by the wave follows the pill they are in.
import CoreGraphics
import Foundation
import MurmurCore
import UIKit

/// The pill's paint: wet while live, dry once the brush lifts.
struct PillPalette: Equatable, Sendable {
    var wet: RGBA
    var dry: RGBA

    static let standard = PillPalette(wet: .amber, dry: .brand)

    /// As desktop: signal amber (or no accent) dries to brand gold; any
    /// other accent dries to a darker shade of itself, the same pigment
    /// once it sets.
    init(accent: RGBA?) {
        guard let accent, !accent.isAmber else {
            self = .standard
            return
        }
        self.init(wet: accent, dry: accent.mix(.ink, 0.35))
    }

    init(wet: RGBA, dry: RGBA) {
        self.wet = wet
        self.dry = dry
    }
}

struct InkScene {
    enum Mode: Equatable {
        case idle, rec, proc, ins, err, nospeech

        init(_ stage: PillStage) {
            switch stage {
            case .idle: self = .idle
            case .recording: self = .rec
            case .processing: self = .proc
            case .inserted: self = .ins
            case .noSpeech: self = .nospeech
            case .error: self = .err
            }
        }
    }

    /// A new level column every 66 ms, the rhythm of the bars.
    static let pushMs = 66.0
    static let columnCount = 21
    static let ribbonSamples = 48
    /// How long a stage change keeps animating before the pill rests.
    static let settleMs = 1600.0
    /// Desktop runs these updates once a frame at 60 a second.
    private static let frameMs = 1000.0 / 60

    private struct Column {
        var lv: Double
        var seed: Int
        var born: Double
    }

    private struct Ring {
        let born: Double
        let s: Double
        let seed: Int
    }

    private struct Fling {
        let dot: Int
        let vx, vy: Double
        let born: Double
        let r: Double
    }

    /// A fleck, its place as a fraction of the field.
    private struct Dot {
        let x, y, r, ph, sp, a: Double
        let warm: Bool
    }

    private static let dots: [Dot] = {
        var random = Brush.Random(seed: 4040)
        let cols = 14
        let rows = 6
        return (0..<(cols * rows)).map { i in
            let x = (Double(i % cols) + 0.2 + random.next() * 0.6) / Double(cols)
            let y = (Double(i / cols) + 0.2 + random.next() * 0.6) / Double(rows)
            let r = 0.6 + random.next() * 1.0
            let ph = random.next() * .pi * 2
            let sp = 0.4 + random.next() * 1.1
            let a = 0.22 + random.next() * 0.45
            return Dot(x: x, y: y, r: r, ph: ph, sp: sp, a: a, warm: random.next() < 0.16)
        }
    }()

    let style: PillStyle
    /// Reduce Motion: no flecks jitter, no rings or drops are born, no sheen.
    var reduced: Bool
    /// The scene's clock, in milliseconds.
    private(set) var now: Double
    private(set) var mode: Mode
    private var modeAt: Double
    private var seedN = 0
    private var cols: [Column]
    private var ribbon: [Double]
    /// Columns pushed since the scene began.
    private(set) var pushes = 0
    private var lastPush: Double
    private var snap: [RGBA] = []
    /// Where the columns sat when the brush lifted, so release never jumps.
    private var frozen = 0.0
    private var smoothed = 0.0
    private var rings: [Ring] = []
    private var lastBirth = 0.0
    private var flung: [Fling] = []
    private var lastFrame: Double
    /// Desktop throws drops with Math.random; here they are seeded.
    private var chance = Brush.Random(seed: 9091)

    init(style: PillStyle, stage: PillStage = .idle, at now: Double, reduced: Bool = false) {
        self.style = style
        self.reduced = reduced
        self.now = now
        mode = Mode(stage)
        modeAt = now
        lastPush = now
        lastFrame = now
        cols = (0..<Self.columnCount).map { Column(lv: 0, seed: $0, born: -1e9) }
        seedN = Self.columnCount
        ribbon = Array(repeating: 0, count: Self.ribbonSamples)
    }

    /// The styles this scene paints.
    static func paints(_ style: PillStyle) -> Bool {
        switch style {
        case .bars, .speckle: false
        case .pulse, .dabs, .flecks, .rings, .ribbon: true
        }
    }

    // MARK: Time

    /// Moves to a new stage now, as desktop's setMode does.
    mutating func show(_ stage: PillStage, palette: PillPalette) {
        let m = Mode(stage)
        guard m != mode else { return }
        snap = cols.map { colorRec($0, palette) }
        if mode == .rec { frozen = Brush.clamp((now - lastPush) / Self.pushMs, 0, 1) }
        mode = m
        modeAt = now
        // Errors and no speech start clean: no ring or flung drop carries over.
        if m == .err || m == .nospeech {
            rings.removeAll()
            flung.removeAll()
        }
        if m == .rec || m == .idle {
            frozen = 0
            for i in cols.indices {
                cols[i].lv = 0
                cols[i].born = -1e9
            }
            ribbon = Array(repeating: 0, count: Self.ribbonSamples)
            rings.removeAll()
            flung.removeAll()
            smoothed = 0
            lastPush = now
        }
    }

    /// Steps the clock to `time` with the voice at `level` (0 to 1): columns
    /// push every 66 ms while recording, and the frame by frame updates run
    /// at desktop's 60 a second whatever the screen's rate.
    mutating func step(to time: Double, level: Double) {
        guard time > now else { return }
        let level = min(1, max(0, level))
        if mode == .rec {
            // A long gap pushes no more than the wave can hold.
            let behind = ((time - lastPush) / Self.pushMs).rounded(.down) - Double(Self.ribbonSamples)
            if behind > 0 {
                lastPush += behind * Self.pushMs
                pushes += Int(behind)
                seedN += Int(behind)
            }
            while time - lastPush >= Self.pushMs {
                lastPush += Self.pushMs
                push(level, at: lastPush)
            }
        }
        // A long gap (the pill was off screen) jumps ahead instead of
        // replaying every frame it missed.
        if time - lastFrame > 1000 { lastFrame = time - Self.frameMs }
        while lastFrame + Self.frameMs <= time {
            lastFrame += Self.frameMs
            frame(at: lastFrame, level: level)
        }
        now = time
        rings.removeAll { (now - $0.born) / 1400 >= 1 }
        flung.removeAll { now - $0.born > 420 }
    }

    private mutating func push(_ lv: Double, at time: Double) {
        cols.removeFirst()
        cols.append(Column(lv: lv, seed: seedN % 64, born: time))
        seedN += 1
        ribbon.removeFirst()
        ribbon.append(lv)
        pushes += 1
    }

    /// One of desktop's frames: the smoothed voice, rings born, drops thrown.
    private mutating func frame(at time: Double, level: Double) {
        let live = mode == .rec
        switch style {
        case .flecks:
            smoothed += ((live ? level : 0) - smoothed) * 0.25
            let e = min(1, smoothed * 1.3)
            if live, !reduced, chance.next() < e * 0.35 {
                let dot = min(Self.dots.count - 1, Int(chance.next() * Double(Self.dots.count)))
                let ang = chance.next() * .pi * 2
                let v = 0.05 + e * 0.12
                flung.append(Fling(dot: dot, vx: cos(ang) * v, vy: sin(ang) * v * 0.5, born: time, r: 0.8 + chance.next() * 1.2))
            }
        case .rings:
            smoothed += ((live ? level : 0) - smoothed) * 0.3
            let e = min(1, smoothed * 1.2)
            if live, !reduced, e > 0.08, time - lastBirth > 340 - e * 240 {
                rings.append(Ring(born: time, s: e, seed: pushes % 32))
                lastBirth = time
            }
        case .pulse:
            // Desktop's pulse reads the voice as it is, unsmoothed.
            let e = live ? level : 0
            smoothed = e
            if !reduced, e > 0.04, time - lastBirth > 340 - e * 240 {
                rings.append(Ring(born: time, s: e, seed: 0))
                lastBirth = time
            }
        case .bars, .speckle, .dabs, .ribbon:
            break
        }
    }

    /// Rings and pulse rings still spreading.
    var ringCount: Int { rings.count }
    /// Drops thrown off the flecks, still flying.
    var dropCount: Int { flung.count }

    /// Whether the scene still changes from frame to frame.
    func busy(still: Bool) -> Bool {
        guard !still else { return false }
        let t = now - modeAt
        return mode == .rec || (mode == .proc && !reduced && t < Sheen.limit * 1000) || t < Self.settleMs || !rings.isEmpty || !flung.isEmpty
    }

    // MARK: Scripted

    /// How far into a stage a still frame is kept: recording after its
    /// first stretch of voice, the others once they have settled.
    static func stillTime(_ stage: PillStage) -> TimeInterval {
        stage == .recording ? 0 : settleMs / 1000
    }

    /// A scene that recorded the made-up voice for 1.6 seconds, then moved
    /// to the stage and ran `time` seconds into it: the same scene every
    /// time, for shots, tests, and still frames.
    static func scripted(_ style: PillStyle, _ stage: PillStage, at time: TimeInterval, palette: PillPalette, still: Bool = false) -> InkScene {
        var scene = InkScene(style: style, at: 0)
        scene.show(.recording, palette: palette)
        let recorded = settleMs + (stage == .recording ? time * 1000 : 0)
        scene.run(to: recorded) { DemoVoice.voice($0 / 1000) }
        if stage != .recording {
            scene.show(stage, palette: palette)
            scene.run(to: recorded + time * 1000) { _ in 0 }
        }
        // A still holds every fleck where it lies; the rings and drops
        // born while it recorded stay painted.
        scene.reduced = still
        return scene
    }

    private mutating func run(to end: Double, voice: (Double) -> Double) {
        while now < end {
            let next = min(end, now + Self.frameMs)
            step(to: next, level: voice(next))
        }
    }

    // MARK: Paint

    private func colorRec(_ c: Column, _ p: PillPalette) -> RGBA {
        let age = now - c.born
        return age < 260 ? p.wet : p.wet.mix(p.dry, Brush.clamp((age - 260) / 900, 0, 1))
    }

    private func tint(_ base: RGBA, _ p: PillPalette) -> RGBA {
        switch mode {
        case .rec: base
        case .proc: base.mix(p.dry, Brush.easeOut(Brush.clamp((now - modeAt) / 600, 0, 1)))
        case .ins: p.dry
        case .err: .red
        case .nospeech: .grey
        case .idle: .text
        }
    }

    /// Paints the scene at its clock into the rect.
    func paint(in rect: CGRect, context: CGContext, palette p: PillPalette) {
        guard rect.width > 0, rect.height > 0 else { return }
        let field = rect.size
        context.saveGState()
        defer { context.restoreGState() }
        context.translateBy(x: rect.minX, y: rect.minY)
        // Desktop's canvas ends at the wave's edges; so does the scene.
        context.clip(to: CGRect(origin: .zero, size: field))
        let sheen = mode == .proc && !reduced ? Sheen.at((now - modeAt) / 1000) : nil
        // The sheen and the ribbon's tail work on the paint alone, so those
        // frames paint in a layer of their own first.
        let layered = sheen != nil || style == .ribbon
        if layered { context.beginTransparencyLayer(auxiliaryInfo: nil) }
        switch style {
        case .dabs: paintDabs(field, context, p)
        case .flecks: paintFlecks(field, context, p)
        case .rings: paintRings(field, context, p, brushed: true)
        case .pulse: paintRings(field, context, p, brushed: false)
        case .ribbon: paintRibbon(field, context, p)
        case .bars, .speckle: break
        }
        // A sheen crosses the paint as it dries, and again every 2 seconds
        // while processing runs long.
        if let sheen {
            let x = sheen.center * field.width
            let reach = field.width * 0.18
            let colors = [RGBA.text.with(alpha: 0).cgColor, RGBA.text.with(alpha: sheen.alpha).cgColor, RGBA.text.with(alpha: 0).cgColor] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors, locations: [0, 0.5, 1]) {
                context.setBlendMode(.sourceAtop)
                context.drawLinearGradient(gradient, start: CGPoint(x: x - reach, y: 0), end: CGPoint(x: x + reach, y: 0), options: [])
                context.setBlendMode(.normal)
            }
        }
        if layered { context.endTransparencyLayer() }
    }

    private func paintDabs(_ field: CGSize, _ ctx: CGContext, _ p: PillPalette) {
        let fw = field.width
        let fh = field.height
        let cy = fh / 2
        let gap = fw / Double(Self.columnCount)
        let maxH = fh * 0.94
        let mt = now - modeAt
        let phase = mode == .rec ? Brush.clamp((now - lastPush) / Self.pushMs, 0, 1) : frozen
        for i in 0..<Self.columnCount {
            let c = cols[i]
            var lv = c.lv
            var rgb = RGBA.text
            var alpha = 1.0
            let dry = mode == .nospeech ? 0.95 : 0.32
            switch mode {
            case .rec:
                rgb = colorRec(c, p)
                if lv < 0.05 { (rgb, alpha) = (.text, 0.3) }
            case .proc:
                rgb = (i < snap.count ? snap[i] : p.dry).mix(p.dry, Brush.easeOut(Brush.clamp(mt / 600, 0, 1)))
                if lv < 0.05 { (rgb, alpha) = (.text, 0.3) }
            case .ins:
                let k = Brush.easeOut(Brush.clamp(mt / 420, 0, 1))
                rgb = p.dry
                lv = Brush.lerp(lv, 0.05, k)
                alpha = 1 - 0.55 * k
            case .err:
                rgb = .red
                lv = 0.1 + (i % 4 == 0 ? 0.12 : 0)
            case .nospeech:
                rgb = .grey
                lv = 0.05 + 0.08 * abs(sin(Double(i) * 1.3))
                alpha = 0.9
            case .idle:
                lv = 0.05
                alpha = 0.32
            }
            let hh = max(3, 3 + lv * (maxH - 3))
            let x = (Double(i) + 0.5 - phase) * gap
            if x < 1 || x > fw - 1 { continue }
            if mode == .err {
                // Clean red: a plain rounded bar, no bristles.
                ctx.setStrokeColor(rgb.with(alpha: alpha).cgColor)
                ctx.setLineWidth(gap * 0.5)
                ctx.setLineCap(.round)
                ctx.strokeLineSegments(between: [CGPoint(x: x, y: cy + hh / 2), CGPoint(x: x, y: cy - hh / 2)])
                continue
            }
            let tilt = Double((c.seed * 37) % 7 - 3) * 0.22
            let path = Brush.path([Brush.XY(x + tilt, cy + hh / 2), Brush.XY(x - tilt, cy - hh / 2)], step: 1.3)
            var o = Brush.StrokeOptions(width: gap * 0.7, rgb: rgb.rgb255)
            o.alpha = alpha
            o.dry = dry
            o.ts = 0.18
            o.te = 0.3
            o.core = 0.35
            BrushCanvas.draw(Brush.stroke(path, Brush.cachedBrush(seed: c.seed % 64, count: 9), o), in: ctx)
        }
    }

    private func paintFlecks(_ field: CGSize, _ ctx: CGContext, _ p: PillPalette) {
        let fw = field.width
        let fh = field.height
        let live = mode == .rec
        let mt = now - modeAt
        let e = min(1, smoothed * 1.3)
        func fade(_ x: Double, _ y: Double) -> Double {
            let f = Brush.clamp(min(x, fw - x) / 7, 0, 1) * Brush.clamp(min(y, fh - y) / 6, 0, 1)
            return f * f * (3 - 2 * f)
        }
        for d in Self.dots {
            let warm = d.warm || d.r > 1.45
            var col = warm ? p.wet : RGBA.text
            var a = d.a
            var jit = 0.0
            switch mode {
            case .rec: jit = 1 + e * 6
            case .proc: col = col.mix(p.dry, Brush.easeOut(Brush.clamp(mt / 600, 0, 1)))
            case .ins:
                col = p.dry
                a *= 1 - 0.6 * Brush.easeOut(Brush.clamp(mt / 420, 0, 1))
            case .err:
                col = .red
                a = warm ? 0.9 : 0.35
            case .nospeech:
                col = .grey
                a *= 0.6
            case .idle:
                // At rest every fleck is plain: amber is for live paint only.
                col = .text
                a *= 0.5
            }
            if reduced { jit = 0 }
            let a1 = now / 190 * d.sp + d.ph
            let a2 = now / 160 * d.sp + d.ph * 1.7
            let x = d.x * fw + sin(a1) * jit
            let y = d.y * fh + cos(a2) * jit
            let f = fade(x, y)
            if f <= 0 { continue }
            ctx.setFillColor(col.with(alpha: min(1, a) * f).cgColor)
            if mode == .err {
                // Clean red: plain round dots, never paint flecks.
                let r = d.r * 0.8
                ctx.fillEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
                continue
            }
            // A fleck of paint: stretched along its motion, a satellite drop
            // trailing the bigger ones.
            let ang = reduced ? d.ph : atan2(-sin(a2) / 160, cos(a1) / 190)
            let st = 1 + e * 1.8
            let shape = CGMutablePath()
            shape.addEllipse(in: CGRect(x: -d.r * st * 1.45, y: -d.r * 0.95, width: d.r * st * 2.9, height: d.r * 1.9), transform: CGAffineTransform(translationX: x, y: y).rotated(by: ang))
            if warm {
                let back = d.r * st * 2.2
                let r = d.r * 0.4
                shape.addEllipse(in: CGRect(x: x - cos(ang) * back - r, y: y - sin(ang) * back - r, width: r * 2, height: r * 2))
            }
            ctx.addPath(shape)
            ctx.fillPath()
        }
        guard live || !flung.isEmpty else { return }
        for fl in flung {
            let age = now - fl.born
            guard age <= 420 else { continue }
            let d = Self.dots[fl.dot]
            let x = d.x * fw + fl.vx * age
            let y = d.y * fh + fl.vy * age
            let a = 1 - age / 420
            ctx.setStrokeColor(p.wet.with(alpha: 0.5 * a).cgColor)
            ctx.setLineWidth(fl.r)
            ctx.setLineCap(.round)
            ctx.strokeLineSegments(between: [CGPoint(x: x - fl.vx * 60, y: y - fl.vy * 60), CGPoint(x: x, y: y)])
            ctx.setFillColor(p.wet.with(alpha: a).cgColor)
            ctx.fillEllipse(in: CGRect(x: x - fl.r, y: y - fl.r, width: fl.r * 2, height: fl.r * 2))
        }
    }

    /// Ink rings (brushed) and pulse (plain arcs, desktop's PulseWave), on
    /// the stage table both.
    private func paintRings(_ field: CGSize, _ ctx: CGContext, _ p: PillPalette, brushed: Bool) {
        let fw = field.width
        let fh = field.height
        let cy = fh / 2
        let e = brushed ? min(1, smoothed * 1.2) : smoothed
        let col = tint(p.wet, p)
        let ox = 6.0
        // Only the part of an arc that can show gets painted.
        let halfH = fh / 2 + 3
        for r in rings.reversed() {
            let age = (now - r.born) / 1400
            guard age < 1 else { continue }
            if brushed {
                let rad = 4 + age * fw * 0.92
                let a = (1 - age) * 0.9 * (0.4 + r.s * 0.6)
                let amax = min(.pi / 2.6, asin(min(1, halfH / rad)))
                let pts = (0...12).map { j -> Brush.XY in
                    let ang = Brush.lerp(-amax, amax, Double(j) / 12)
                    return Brush.XY(ox + cos(ang) * rad, cy + sin(ang) * rad)
                }
                var o = Brush.StrokeOptions(width: 2 + r.s * 3.2, rgb: col.rgb255)
                o.alpha = a
                o.dry = 0.4 + age * 0.5
                o.core = 0.3
                o.ts = 0.2
                o.te = 0.35
                BrushCanvas.draw(Brush.stroke(Brush.path(pts, step: 1.4), Brush.cachedBrush(seed: 600 + r.seed, count: 7), o), in: ctx)
            } else {
                let radius = 4 + age * fw * 0.92
                let a = (1 - age) * 0.55 * (0.4 + r.s * 0.6)
                ctx.setStrokeColor(col.with(alpha: a).cgColor)
                ctx.setLineWidth(1.5 + r.s * 1.5)
                ctx.setLineCap(.butt)
                ctx.addArc(center: CGPoint(x: ox, y: cy), radius: radius, startAngle: -.pi / 2.6, endAngle: .pi / 2.6, clockwise: false)
                ctx.strokePath()
            }
        }
        // A steady heart at the origin, so the quiet stages are never empty.
        let heart = mode == .idle ? 0.35 : 0.5 + e * 0.5
        let radius = 2.5 + e * 2
        ctx.setFillColor(col.with(alpha: heart).cgColor)
        ctx.fillEllipse(in: CGRect(x: ox - radius, y: cy - radius, width: radius * 2, height: radius * 2))
    }

    private func paintRibbon(_ field: CGSize, _ ctx: CGContext, _ p: PillPalette) {
        let fw = field.width
        let fh = field.height
        let cy = fh / 2
        let mt = now - modeAt
        let live = mode == .rec
        let samples = Self.ribbonSamples
        let sp = fw / Double(samples - 2)
        let phase = live ? Brush.clamp((now - lastPush) / Self.pushMs, 0, 1) : frozen
        if mode == .err {
            // Clean red: one plain line, no bristles.
            ctx.setStrokeColor(RGBA.red.cgColor)
            ctx.setLineWidth(max(2, fh * 0.22))
            ctx.setLineCap(.round)
            ctx.strokeLineSegments(between: [CGPoint(x: fw * 0.08, y: cy), CGPoint(x: fw * 0.97, y: cy)])
            return
        }
        let flat = mode == .ins ? 1 - Brush.easeOut(Brush.clamp(mt / 420, 0, 1)) * 0.85 : 1
        let levels = ribbon
        let quiet = mode == .idle || mode == .nospeech
        let pts = (0..<samples).map { i in
            Brush.XY((Double(i) - phase) * sp, cy + sin(Double(pushes + i) * 0.45) * 1.1)
        }
        let path = Brush.path(pts, step: 1.2, raw: true)
        let pressure: @Sendable (Double) -> Double = { u in
            let x = u * Double(samples - 1)
            let i = Int(x.rounded(.down))
            let lv = Brush.lerp(levels[min(max(i, 0), samples - 1)], levels[min(max(i + 1, 0), samples - 1)], x - Double(i))
            let base = quiet ? 0.12 : 0.1 + 0.9 * lv * flat
            return base * Brush.clamp(u / 0.08, 0, 1) * (1 - 0.6 * Brush.clamp((u - 0.97) / 0.03, 0, 1))
        }
        let wet = live || mode == .proc || mode == .ins
        let body = wet ? p.dry : tint(p.dry, p)
        let sOff = Double(pushes) * sp
        var o = Brush.StrokeOptions(width: fh * 0.95, rgb: body.rgb255)
        o.alpha = mode == .idle ? 0.35 : 1
        o.dry = mode == .nospeech ? 0.95 : 0.35
        o.core = 0.4
        o.pressure = pressure
        o.sOff = sOff
        o.ts = 0.01
        o.te = 0.01
        BrushCanvas.draw(Brush.stroke(path, Brush.cachedBrush(seed: 777, count: 18), o), in: ctx)
        let headA = live ? 1 : mode == .proc ? 1 - Brush.easeOut(Brush.clamp(mt / 600, 0, 1)) : 0
        if headA > 0 {
            var head = Brush.StrokeOptions(width: fh * 0.95, rgb: p.wet.rgb255)
            head.alpha = headA
            head.dry = 0.3
            head.core = 0.35
            head.pressure = pressure
            head.sOff = sOff
            head.i0 = Int((Double(path.points.count) * 0.72).rounded(.down))
            head.ts = 0.01
            head.te = 0.01
            BrushCanvas.draw(Brush.stroke(path, Brush.cachedBrush(seed: 778, count: 14), head), in: ctx)
        }
        // The tail thins out to nothing on the left.
        let colors = [RGBA.ink.cgColor, RGBA.ink.with(alpha: 0).cgColor] as CFArray
        if let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors, locations: [0, 1]) {
            ctx.saveGState()
            ctx.setBlendMode(.destinationOut)
            ctx.clip(to: CGRect(x: -1, y: -fh, width: fw * 0.3 + 1, height: fh * 3))
            ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: fw * 0.3, y: 0), options: [])
            ctx.restoreGState()
        }
    }
}

/// A made-up voice where there is none to hear (the Look tiles, shots, and
/// still frames), desktop's (src/renderer/settings/fakeVoice.ts) at the
/// level the pill reads: syllables at about four a second, grouped into
/// words and phrases with real pauses between them.
enum DemoVoice {
    static func voice(_ t: Double) -> Double {
        let tau = Double.pi * 2
        // Phrases of about two and a half seconds, then a breath.
        let phrase = t.truncatingRemainder(dividingBy: 3.4) / 3.4
        if phrase > 0.74 { return 0.004 * 3.2 }
        // Words: short dips between them.
        let word: Double = sin(tau * 0.9 * t + 0.6)
        let wordGate: Double = word > -0.82 ? 1 : 0.15
        // Syllables, sharpened so each reads as a push of air.
        let syllable: Double = pow(0.5 + 0.5 * sin(tau * 4.1 * t), 1.6)
        let swell: Double = 0.62 + 0.38 * sin(tau * 0.31 * t + 1.1)
        let level: Double = 0.012 + 0.28 * syllable * wordGate * swell
        return min(1, level * 3.2)
    }

    /// The voice now, for live tiles.
    @MainActor static func level() -> Float {
        Float(voice(CACurrentMediaTime()))
    }

    /// A take's worth of levels, the same every time: desktop's still
    /// frame, the voice at fixed moments.
    static let levels: [Float] = (0..<Pill.barCount).map { i in
        Float(min(1, voice(0.4 + Double(i) * 0.061) / 3.2 * 3))
    }
}

/// Draws a stroke's marks into a context.
enum BrushCanvas {
    static func draw(_ marks: [Brush.Mark], in ctx: CGContext) {
        for mark in marks {
            switch mark {
            case let .fill(paint, shape):
                guard let first = shape.first else { continue }
                ctx.setFillColor(paint.cgColor)
                ctx.move(to: CGPoint(x: first.x, y: first.y))
                for point in shape.dropFirst() { ctx.addLine(to: CGPoint(x: point.x, y: point.y)) }
                ctx.closePath()
                ctx.fillPath()
            case let .lines(paint, width, runs):
                ctx.setStrokeColor(paint.cgColor)
                ctx.setLineWidth(width)
                ctx.setLineCap(.butt)
                ctx.setLineJoin(.round)
                for run in runs where run.count > 1 {
                    ctx.move(to: CGPoint(x: run[0].x, y: run[0].y))
                    for point in run.dropFirst() { ctx.addLine(to: CGPoint(x: point.x, y: point.y)) }
                }
                ctx.strokePath()
            }
        }
    }
}

extension Brush.Paint {
    var cgColor: CGColor {
        CGColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: a)
    }
}

extension RGBA {
    static let ink = RGBA(UIColor(Tokens.ink))

    /// As the brush mixes it, 0 to 255.
    var rgb255: Brush.RGB {
        Brush.RGB((r * 255).rounded(), (g * 255).rounded(), (b * 255).rounded())
    }

    /// Signal amber, or near enough that it is the default, as desktop
    /// tells them apart.
    var isAmber: Bool {
        let amber = RGBA.amber
        return abs(r - amber.r) * 255 + abs(g - amber.g) * 255 + abs(b - amber.b) * 255 < 6
    }

    /// As the shared data writes a color, #rrggbb.
    var hex: String {
        let rgb = rgb255
        return "#" + [rgb.r, rgb.g, rgb.b].map { String(format: "%02x", Int($0)) }.joined()
    }

    /// From the shared data's #rrggbb.
    init?(hex: String) {
        guard let rgb = Brush.RGB(hex: hex) else { return nil }
        self.init(r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255)
    }
}
```

`ios/Shared/Pill.swift`, whole (the seven styles, the palette in bars and speckle, ink frames handed to the scene, and the look's accent):

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The pill (ios/prd.json IOS-010): one drawing for everywhere it appears,
// the keyboard, the screen murmur opens to, first-run practice, and later
// the Look grid. It follows DESIGN.md's stage table. Idle is small, dry,
// and still, and never amber, even while a session keeps the microphone
// warm. Recording is wet amber at the voice's level, cooling to brand gold
// as it ages. Processing cools with one sheen, then a softer sheen every 2
// seconds. Inserted sinks flat; no speech is a dry grey scrape; an error is
// plain red. Every frame is a pure function of its inputs, so previews,
// tests, and the capture script all see the same pill.
import CoreGraphics
import Foundation
import UIKit

enum PillStage: Equatable, Sendable {
    case idle, recording, processing, inserted, noSpeech, error
}

/// The styles, in shared/cosmetics.json's order: two free, and five
/// earned by belt (IOS-020).
enum PillStyle: String, CaseIterable, Codable, Sendable {
    case bars, speckle, pulse, dabs, flecks, rings, ribbon
}

/// One frame of the pill.
struct PillFrame {
    var style: PillStyle
    var stage: PillStage
    /// Recent loudness, oldest first, 0 to 1.
    var levels: [Float]
    /// Seconds since the stage began.
    var time: TimeInterval
    /// Reduce Motion: each stage as a still frame.
    var still: Bool
    /// The accent's wet and dry paint (IOS-020).
    var palette: PillPalette = .standard
    /// The ink and pulse styles' scene, stepped to now; nil paints a
    /// scripted one, for shots and stills.
    var ink: InkScene?
}

enum Pill {
    static let barCount = 21
    /// How long wet paint takes to dry to gold, and the pill to sink flat.
    static let dry: TimeInterval = 0.6
    static let sink: TimeInterval = 0.35

    /// What VoiceOver reads for the pill in each stage.
    static func label(_ stage: PillStage) -> String {
        switch stage {
        case .idle: "Start dictation"
        case .recording: "Recording"
        case .processing: "Working"
        case .inserted: "Words added"
        case .noSpeech: "Heard nothing"
        case .error: "Failed, retry in murmur"
        }
    }

    /// Whether the stage changes from frame to frame, so the view redraws
    /// only while it does.
    static func moves(_ stage: PillStage, at time: TimeInterval, still: Bool) -> Bool {
        guard !still else { return false }
        switch stage {
        case .recording: return true
        case .processing: return time < Sheen.limit + 1
        case .inserted: return time < sink
        case .idle, .noSpeech, .error: return false
        }
    }

    // MARK: Paint

    static func paint(_ frame: PillFrame, in rect: CGRect, context: CGContext) {
        guard rect.width > 0, rect.height > 0 else { return }
        context.saveGState()
        defer { context.restoreGState() }
        switch frame.style {
        case .bars: paintBars(frame, in: rect, context: context)
        case .speckle: paintSpeckle(frame, in: rect, context: context)
        case .pulse, .dabs, .flecks, .rings, .ribbon:
            let scene = frame.ink.flatMap { frame.still ? nil : $0 } ?? InkScene.scripted(frame.style, frame.stage, at: frame.still ? InkScene.stillTime(frame.stage) : frame.time, palette: frame.palette, still: frame.still)
            scene.paint(in: rect, context: context, palette: frame.palette)
        }
    }

    /// The levels a still pill shows: a steady voice's shape.
    static let stillLevels: [Float] = (0..<barCount).map { 0.25 + 0.45 * Float(abs(sin(Double($0) * 0.55))) }

    /// The last barCount levels, oldest first, padded with silence.
    static func recent(_ levels: [Float]) -> [Float] {
        let tail = levels.suffix(barCount).map { min(1, max(0, $0)) }
        return Array(repeating: 0, count: barCount - tail.count) + tail
    }

    private static func paintBars(_ frame: PillFrame, in rect: CGRect, context: CGContext) {
        let n = barCount
        let width = rect.width / (CGFloat(n) + 0.7 * CGFloat(n - 1))
        let gap = width * 0.7
        let low = max(width, rect.height * 0.12)
        let high = rect.height * 0.9
        // A still pill never gathers levels, so it shows a steady voice's
        // finished shape: never a blank space.
        let levels = frame.still ? stillLevels : recent(frame.levels)
        let dried = frame.still ? 1 : ease(frame.time / dry)
        let sunk = frame.still ? 1 : ease(frame.time / sink)
        let sheen = frame.stage == .processing && !frame.still ? Sheen.at(frame.time) : nil
        var scrape = Seeded(7)
        for i in 0..<n {
            let age = CGFloat(n - 1 - i) / CGFloat(n - 1)
            let level = CGFloat(levels[i])
            let height: CGFloat
            let color: RGBA
            switch frame.stage {
            case .idle:
                height = low
                color = RGBA.cream22
            case .recording:
                height = low + level * (high - low)
                color = frame.palette.wet.mix(frame.palette.dry, age * 0.7)
            case .processing:
                height = low + level * (high - low)
                color = frame.palette.wet.mix(frame.palette.dry, age * 0.7).mix(frame.palette.dry, dried)
            case .inserted:
                height = low + level * (high - low) * (1 - sunk)
                color = frame.palette.dry.mix(RGBA.cream22, sunk)
            case .noSpeech:
                height = low * (0.7 + 0.6 * scrape.next())
                color = RGBA.grey
            case .error:
                height = low
                color = RGBA.red
            }
            let x = rect.minX + CGFloat(i) * (width + gap)
            let bar = CGRect(x: x, y: rect.midY - height / 2, width: width, height: height)
            let path = CGPath(roundedRect: bar, cornerWidth: width / 2, cornerHeight: min(width / 2, height / 2), transform: nil)
            context.setFillColor(color.cgColor)
            context.addPath(path)
            context.fillPath()
            if let sheen {
                let glow = sheen.alpha * gauss((x + width / 2 - rect.minX) / rect.width - sheen.center)
                if glow > 0.01 {
                    context.setFillColor(RGBA.text.with(alpha: glow).cgColor)
                    context.addPath(path)
                    context.fillPath()
                }
            }
        }
    }

    /// The speckle field: 84 dots on a jittered grid, the same dots every
    /// time, a few of them warm sparks that show amber only while live.
    private static let dots: [Dot] = {
        var random = Seeded(31)
        let cols = 14
        let rows = 6
        return (0..<(cols * rows)).map { i in
            Dot(
                x: (CGFloat(i % cols) + 0.2 + 0.6 * random.next()) / CGFloat(cols),
                y: (CGFloat(i / cols) + 0.2 + 0.6 * random.next()) / CGFloat(rows),
                radius: 0.5 + 0.9 * random.next(),
                phase: random.next() * .pi * 2,
                speed: 0.4 + 1.1 * random.next(),
                alpha: 0.16 + 0.42 * random.next(),
                warm: random.next() < 0.16
            )
        }
    }()

    private struct Dot {
        let x, y, radius, phase, speed, alpha: CGFloat
        let warm: Bool
    }

    private static func paintSpeckle(_ frame: PillFrame, in rect: CGRect, context: CGContext) {
        // The phone's pill is smaller than desktop's, so the dust is a touch
        // larger for its size, and the warm sparks carry their full color.
        let scale = rect.height / 24
        let t = CGFloat(frame.time)
        let level = frame.still ? 0.5 : CGFloat(recent(frame.levels).last ?? 0)
        let energy = min(1, level * 1.1)
        let dried = frame.still ? 1 : ease(frame.time / dry)
        let sunk = frame.still ? 1 : ease(frame.time / sink)
        let sheen = frame.stage == .processing && !frame.still ? Sheen.at(frame.time) : nil
        for dot in dots {
            var x = rect.minX + dot.x * rect.width
            var y = rect.minY + dot.y * rect.height
            var radius = dot.radius * scale
            var alpha = dot.alpha
            var color = RGBA.text
            switch frame.stage {
            case .idle:
                alpha *= 0.45
            case .recording:
                let jitter = frame.still ? 0 : (1 + energy * 4) * scale
                x += sin(t / 0.19 * dot.speed + dot.phase) * jitter
                y += cos(t / 0.16 * dot.speed + dot.phase * 1.7) * jitter
                radius *= 1 + energy * 0.8
                if dot.warm {
                    color = frame.palette.wet
                    alpha = 0.55 + 0.45 * energy
                } else {
                    alpha *= 0.4 + energy * 0.6
                }
            case .processing:
                if dot.warm {
                    color = frame.palette.wet.mix(frame.palette.dry, dried)
                    alpha = 0.7
                } else {
                    alpha *= 0.55
                }
            case .inserted:
                y += (rect.midY - y) * sunk
                alpha *= 0.55 * (1 - 0.5 * sunk)
                color = frame.palette.dry.mix(RGBA.text, sunk)
            case .noSpeech:
                y = rect.midY + (y - rect.midY) * 0.15
                alpha *= 0.6
                color = RGBA.grey
            case .error:
                alpha = 0.5 + alpha * 0.5
                color = RGBA.red
            }
            alpha *= fade(x - rect.minX, rect.width, edge: 7 * scale) * fade(y - rect.minY, rect.height, edge: 8 * scale)
            if let sheen {
                alpha = min(1, alpha + sheen.alpha * gauss((x - rect.minX) / rect.width - sheen.center))
            }
            guard alpha > 0.005 else { continue }
            context.setFillColor(color.with(alpha: color.a * alpha).cgColor)
            context.fillEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
        }
    }

    // MARK: Helpers

    /// Ease out, clamped to 0 through 1.
    static func ease(_ progress: TimeInterval) -> CGFloat {
        let p = CGFloat(min(1, max(0, progress)))
        return 1 - (1 - p) * (1 - p) * (1 - p)
    }

    /// A soft band around 0, about a tenth of the pill wide.
    private static func gauss(_ distance: CGFloat) -> CGFloat {
        exp(-(distance / 0.12) * (distance / 0.12))
    }

    /// Fades toward both ends of a span, so a field melts into the pill.
    private static func fade(_ position: CGFloat, _ span: CGFloat, edge: CGFloat) -> CGFloat {
        let f = min(1, max(0, min(position, span - position) / edge))
        return f * f * (3 - 2 * f)
    }
}

/// The drying sheen, as on desktop (src/renderer/overlay/sheen.ts): one pass
/// as the paint dries, then a softer one every 2 seconds until the words
/// land, so a slow provider never looks frozen. None after 2 minutes.
enum Sheen {
    static let every: TimeInterval = 2
    static let limit: TimeInterval = 120

    /// Where the sheen is t seconds into processing, as a fraction of the
    /// pill's width, and how bright; nil between passes.
    static func at(_ t: TimeInterval) -> (center: CGFloat, alpha: CGFloat)? {
        guard t >= 0 else { return nil }
        let first = pass(t)
        if first < 1.4 { return (first, 0.4) }
        guard t >= every, t - t.truncatingRemainder(dividingBy: every) < limit else { return nil }
        let again = pass(t.truncatingRemainder(dividingBy: every))
        return again < 1.4 ? (again, 0.22) : nil
    }

    private static func pass(_ u: TimeInterval) -> CGFloat {
        CGFloat((u / 0.7 - 0.2) * 1.5)
    }
}

/// A color as components, for mixing paint.
struct RGBA: Equatable {
    var r, g, b, a: CGFloat

    init(r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat = 1) {
        (self.r, self.g, self.b, self.a) = (r, g, b, a)
    }

    init(_ color: UIColor) {
        var (r, g, b, a): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        self.init(r: r, g: g, b: b, a: a)
    }

    static let amber = RGBA(UIColor(Tokens.amber))
    static let brand = RGBA(UIColor(Tokens.brand))
    static let red = RGBA(UIColor(Tokens.red))
    static let text = RGBA(UIColor(Tokens.text))
    static let cream22 = RGBA(UIColor(Tokens.cream22))
    static let grey = RGBA(UIColor(Tokens.textDim))

    func mix(_ other: RGBA, _ amount: CGFloat) -> RGBA {
        let k = min(1, max(0, amount))
        return RGBA(r: r + (other.r - r) * k, g: g + (other.g - g) * k, b: b + (other.b - b) * k, a: a + (other.a - a) * k)
    }

    func with(alpha: CGFloat) -> RGBA {
        RGBA(r: r, g: g, b: b, a: alpha)
    }

    var cgColor: CGColor {
        CGColor(srgbRed: r, green: g, blue: b, alpha: a)
    }
}

/// A small seeded random source, so the same seed draws the same marks.
struct Seeded {
    private var state: UInt64

    init(_ seed: UInt64) {
        state = seed &+ 0x9E37_79B9_7F4A_7C15
    }

    /// The next value, 0 up to 1.
    mutating func next() -> CGFloat {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        z ^= z >> 31
        return CGFloat(z >> 11) / CGFloat(1 << 53)
    }
}

/// The pill's look, chosen in murmur and read by the keyboard, in the app
/// group beside the session's state: the style, the accent chosen, and the
/// color that accent resolves to now, which the app keeps current as belts
/// and achievements come (IOS-020). The keyboard never reads the history.
struct PillLook: Codable, Equatable, Sendable {
    var style: PillStyle
    /// The accent's id in shared/cosmetics.json.
    var accent = "amber"
    /// The accent's color as #rrggbb; nil is signal amber.
    var color: String?

    init(style: PillStyle, accent: String = "amber", color: String? = nil) {
        self.style = style
        self.accent = accent
        self.color = color
    }

    /// Each field on its own, so a file from before the accents, or a
    /// style this build does not know, keeps what it can.
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        style = (try? container.decodeIfPresent(PillStyle.self, forKey: .style)) ?? .bars
        accent = (try? container.decodeIfPresent(String.self, forKey: .accent)) ?? "amber"
        color = try? container.decodeIfPresent(String.self, forKey: .color)
    }

    /// The paint the keyboard draws with.
    var palette: PillPalette {
        PillPalette(accent: color.flatMap(RGBA.init(hex:)))
    }

    static var file: URL? {
        AppGroup.containerURL?.appending(path: "pill.json")
    }

    static func read(from file: URL? = file) -> PillLook {
        guard let file, let data = try? Data(contentsOf: file), let look = try? JSONDecoder().decode(PillLook.self, from: data) else {
            return PillLook(style: .bars)
        }
        return look
    }

    func write(to file: URL? = PillLook.file) {
        guard let file, let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
```

`ios/Shared/PillView.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The pill as a view (ios/prd.json IOS-010), for the keyboard's pad and,
// wrapped, for the app's screens. It keeps the last moments of loudness and
// redraws about 30 times a second only while its stage moves; at rest it
// draws once and the display link stops.
import UIKit

final class PillView: UIView {
    var style: PillStyle = .bars {
        didSet {
            guard style != oldValue else { return }
            scene = InkScene.paints(style) ? InkScene(style: style, stage: stage, at: clock) : nil
            setNeedsDisplay()
            run()
        }
    }

    /// The accent's paint (IOS-020).
    var palette: PillPalette = .standard {
        didSet { if palette != oldValue { setNeedsDisplay() } }
    }

    /// Reads how loud the take is now, 0 to 1, while recording.
    var level: (@MainActor () -> Float)?

    private(set) var stage: PillStage = .idle
    private var levels = [Float](repeating: 0, count: Pill.barCount)
    private var smoothed: Float = 0
    private var began = CACurrentMediaTime()
    private var link: CADisplayLink?
    private var still = UIAccessibility.isReduceMotionEnabled
    /// The ink and pulse styles' scene, stepped as the display link ticks.
    private var scene: InkScene?

    /// The scene's clock, in milliseconds.
    private var clock: Double { CACurrentMediaTime() * 1000 }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        NotificationCenter.default.addObserver(self, selector: #selector(motionChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("PillView is built in code") }

    /// Shows a stage from now. A new recording starts from silence; the
    /// stages after it keep the take's last shape, so it dries and sinks
    /// where it was.
    func show(_ stage: PillStage) {
        guard stage != self.stage else { return }
        if stage == .recording {
            levels = [Float](repeating: 0, count: Pill.barCount)
            smoothed = 0
        }
        advance()
        scene?.show(stage, palette: palette)
        self.stage = stage
        began = CACurrentMediaTime()
        setNeedsDisplay()
        run()
    }

    /// Steps the scene to now with the voice as it is.
    private func advance() {
        scene?.step(to: clock, level: Double(stage == .recording ? level?() ?? 0 : 0))
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        Pill.paint(current, in: bounds, context: context)
    }

    /// The frame drawn now.
    var current: PillFrame {
        PillFrame(style: style, stage: stage, levels: levels, time: CACurrentMediaTime() - began, still: still, palette: palette, ink: scene)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        run()
    }

    /// Runs the display link while the stage moves and the view is on screen.
    private func run() {
        let moves = scene.map { $0.busy(still: still) } ?? Pill.moves(stage, at: CACurrentMediaTime() - began, still: still)
        let moving = window != nil && moves
        if moving, link == nil {
            let link = CADisplayLink(target: Tick(self), selector: #selector(Tick.fire(_:)))
            link.preferredFrameRateRange = CAFrameRateRange(minimum: 20, maximum: 30, preferred: 30)
            link.add(to: .main, forMode: .common)
            self.link = link
        } else if !moving {
            link?.invalidate()
            link = nil
        }
    }

    fileprivate func tick() {
        if scene != nil {
            advance()
        } else if stage == .recording, let level {
            smoothed += (level() - smoothed) * 0.35
            levels.removeFirst()
            levels.append(smoothed)
        }
        setNeedsDisplay()
        run()
    }

    @objc private func motionChanged() {
        still = UIAccessibility.isReduceMotionEnabled
        setNeedsDisplay()
        run()
    }
}

/// The display link's target, holding the view weakly so the link never
/// keeps it alive; once the view is gone, the link stops itself.
@MainActor private final class Tick: NSObject {
    weak var view: PillView?

    init(_ view: PillView) {
        self.view = view
    }

    @objc func fire(_ link: CADisplayLink) {
        guard let view else {
            link.invalidate()
            return
        }
        view.tick()
    }
}

extension PillStage {
    /// The pill's stage for a keyboard take, from the mailbox.
    init(_ phase: MailboxEntry.Phase?) {
        switch phase {
        case .listening?: self = .recording
        case .working?: self = .processing
        case .ready?: self = .inserted
        case .nothing?: self = .noSpeech
        case .failed?: self = .error
        case nil: self = .idle
        }
    }
}

/// How loud the take is now, which the app writes about 30 times a second
/// while a keyboard take records, for the keyboard's pill: 8 bytes, the
/// level and a count. The keyboard reads nothing else about the audio.
struct LevelFile: Sendable {
    let url: URL?

    static let shared = LevelFile(url: AppGroup.containerURL?.appending(path: "level"))

    func write(_ level: Float, count: UInt32) {
        guard let url else { return }
        var bytes = Data()
        withUnsafeBytes(of: level.bitPattern.littleEndian) { bytes.append(contentsOf: $0) }
        withUnsafeBytes(of: count.littleEndian) { bytes.append(contentsOf: $0) }
        try? bytes.write(to: url, options: .completeFileProtectionUntilFirstUserAuthentication)
    }

    /// The level and its count, or nil when there is none.
    func read() -> (level: Float, count: UInt32)? {
        guard let url, let data = try? Data(contentsOf: url), data.count == 8 else { return nil }
        let bits = data.prefix(4).enumerated().reduce(UInt32(0)) { $0 | UInt32($1.element) << (8 * UInt32($1.offset)) }
        let count = data.suffix(4).enumerated().reduce(UInt32(0)) { $0 | UInt32($1.element) << (8 * UInt32($1.offset)) }
        return (Float(bitPattern: bits), count)
    }
}
```

`ios/App/Pill/PillCanvas.swift`, whole (the palette passed through; `DemoVoice` moved to `Ink.swift`):

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The pill on the app's screens (ios/prd.json IOS-010): the same PillView
// the keyboard draws, so every place shows one pill.
import SwiftUI

struct PillCanvas: UIViewRepresentable {
    var style: PillStyle
    var stage: PillStage
    /// Reads how loud the take is now, while recording.
    var level: (@MainActor () -> Float)?
    var palette: PillPalette = .standard

    func makeUIView(context: Context) -> PillView {
        PillView()
    }

    func updateUIView(_ view: PillView, context: Context) {
        view.style = style
        view.palette = palette
        view.level = level
        view.show(stage)
    }
}

extension PillStage {
    /// The pill's stage for a take in the app.
    init(_ state: TakeModel.State) {
        switch state {
        case .idle: self = .idle
        case .recording: self = .recording
        case .transcribing: self = .processing
        case .words: self = .inserted
        case .heardNothing: self = .noSpeech
        case .failed, .micOff, .micFailed: self = .error
        }
    }
}

#if DEBUG
/// Every stage of both styles, as the keyboard draws them.
struct PillGallery: View {
    let stages: [PillStage] = [.idle, .recording, .processing, .inserted, .noSpeech, .error]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(PillStyle.allCases, id: \.self) { style in
                    ForEach(stages, id: \.self) { stage in
                        HStack(spacing: 16) {
                            PillCanvas(style: style, stage: stage, level: DemoVoice.level)
                                .padding(.horizontal, 28)
                                .padding(.vertical, 14)
                                .frame(width: 236, height: 56)
                                .background(Capsule().fill(Tokens.panelLift))
                            Text("\(style.rawValue), \(Pill.label(stage))")
                                .font(.footnote)
                                .foregroundStyle(Tokens.textDim)
                        }
                    }
                }
            }
            .padding()
        }
        .background(Tokens.ink)
    }
}

#Preview("Every stage") { PillGallery() }
#Preview("Bars recording") {
    PillCanvas(style: .bars, stage: .recording, level: DemoVoice.level).frame(width: 180, height: 28).padding().background(Tokens.panelLift)
}
#Preview("Speckle recording") {
    PillCanvas(style: .speckle, stage: .recording, level: DemoVoice.level).frame(width: 180, height: 28).padding().background(Tokens.panelLift)
}
#endif
```

In `ios/App/Keyboard/KeyboardScreen.swift`, `KeyboardCopy.name` names the five new styles (Task 5 replaces it with the shared names):

```swift
        case .pulse: "Pulse"
        case .dabs: "Ink dabs"
        case .flecks: "Ink flecks"
        case .rings: "Ink rings"
        case .ribbon: "Ink ribbon"
```

In `ios/project.yml`, the widget extension compiles the ink and links MurmurCore:

```yaml
      - path: Widgets
      - path: Live
      - path: Shared/Pill.swift
      - path: Shared/Ink.swift
      - path: Shared/AppGroup.swift
      - path: Generated/Tokens.swift
    dependencies:
      - package: MurmurCore
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`
Expected: MurmurCore 134; the app's tests pass, `InkSceneTests` and the seven style `PillTests` among them.

- [ ] **Step 5: Run the gates and commit**

Run `npm run ios:pill-shots` too, and look at the ink shots. Expected: 77 shots; every ink style's recording, drying, and error read as on desktop.

```bash
git add ios/Shared/Ink.swift ios/Shared/Pill.swift ios/Shared/PillView.swift ios/App/Pill/PillCanvas.swift ios/App/Keyboard/KeyboardScreen.swift ios/project.yml ios/AppTests/InkTests.swift ios/AppTests/PillTests.swift ios/AppTests/KeyboardCopyTests.swift
git commit -m "IOS-020: the pill paints pulse, dabs, flecks, rings, and ribbon with desktop's brush, in the accent"
```

### Task 5: The Look screen, and the look in the keyboard

**Files:**
- Create `ios/App/Look/Look.swift` and `ios/App/Look/LookScreen.swift`.
- Modify `ios/App/Settings/ConnectionStore.swift`, `ios/App/Home/SettingsScreen.swift`, `ios/App/Keyboard/KeyboardScreen.swift`, `ios/App/History/History.swift`, `ios/App/Session/RecordingScreen.swift`, and `ios/Keyboard/KeyboardViewController.swift`.
- Test `ios/AppTests/LookTests.swift` and `ios/AppTests/KeyboardCopyTests.swift`.

**Interfaces:**
- Consumes `Cosmetics` (Task 3), `PillLook`, `PillPalette`, and `PillCanvas` (Task 4), `Journey.report` and `Journey.earned`, `JourneyRules.live`, and `HistoryChange`.
- Produces `BundledRules.cosmetics()`, `LookRules` (`live`, `standing(_:)`), `LookStanding` (`unlocked`, `color`, `swatch`, `resolved`), `Looks.refresh(_:rules:file:)`, `HistoryChange.kept`, `LookCopy`, `LookModel`, `LookScreen(model:)`, `StyleTile`, `AccentRow`, and `Color(rgba:)`.

- [ ] **Step 1: Write the failing test**

`ios/AppTests/LookTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// The Look (IOS-020): what this iPhone's takes unlock, by desktop's rules,
/// and the look the keyboard reads.
@MainActor @Suite struct LookTests {
    /// A take a day for `days` days, `words` words each, ending yesterday.
    func takes(days: Int, words: Int) -> [HistoryEntry] {
        let start = Date.now.addingTimeInterval(Double(-days) * 86_400)
        return (0..<days).map { i in
            HistoryEntry(at: start.addingTimeInterval(Double(i) * 86_400), durationMs: 60_000, words: Array(repeating: "word", count: words).joined(separator: " "))
        }
    }

    func scratch() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "look-\(UUID().uuidString).json")
    }

    func rules() throws -> LookRules {
        try #require(LookRules.live)
    }

    func unlockedStyles(_ entries: [HistoryEntry]) throws -> [String] {
        let rules = try rules()
        let standing = rules.standing(entries)
        return rules.cosmetics.overlayStyles.filter(standing.unlocked).map(\.id)
    }

    /// Pulse and ink dabs at white, flecks at blue, rings at purple, the
    /// ribbon at brown, as on desktop.
    @Test func eachBeltUnlocksItsStyles() throws {
        #expect(try unlockedStyles([]) == ["bars", "speckle"])
        #expect(try unlockedStyles(takes(days: 1, words: 150)) == ["bars", "speckle", "pulse", "dabs"])
        #expect(try unlockedStyles(takes(days: 14, words: 1800)) == ["bars", "speckle", "pulse", "dabs", "flecks"])
        #expect(try unlockedStyles(takes(days: 45, words: 1700)) == ["bars", "speckle", "pulse", "dabs", "flecks", "rings"])
        #expect(try unlockedStyles(takes(days: 90, words: 2400)) == ["bars", "speckle", "pulse", "dabs", "flecks", "rings", "ribbon"])
    }

    /// Your belt color follows the rank; a locked accent paints signal amber.
    @Test func accentsResolveAsOnDesktop() throws {
        let rules = try rules()
        let amber = rules.cosmetics.accents.first { $0.unlock == nil }?.color
        let blue = rules.standing(takes(days: 14, words: 1800))
        #expect(blue.color("belt") == rules.cosmetics.beltColors["blue"])
        #expect(blue.color("belt-white") == rules.cosmetics.accents.first { $0.id == "belt-white" }?.color)
        #expect(blue.color("ember") == amber)
        #expect(blue.color("not-an-accent") == amber)
        #expect(rules.standing([]).color("belt") == amber)
    }

    /// A pick on the Look screen is written where the keyboard reads it, with
    /// its color; a locked pick changes nothing.
    @Test func aPickReachesTheKeyboard() throws {
        let file = scratch()
        let model = LookModel(entries: takes(days: 1, words: 150), rules: try rules(), file: file)
        let dabs = try #require(model.styles.first { $0.style == .dabs })
        model.choose(.dabs, item: dabs.item)
        #expect(PillLook.read(from: file).style == .dabs)
        let belt = try #require(model.accents.first { $0.id == "belt" })
        model.choose(accent: belt)
        let white = try rules().cosmetics.beltColors["white"]
        #expect(PillLook.read(from: file) == PillLook(style: .dabs, accent: "belt", color: white))
        #expect(PillLook.read(from: file).palette.wet == white.flatMap(RGBA.init(hex:)))
        let ribbon = try #require(model.styles.first { $0.style == .ribbon })
        model.choose(.ribbon, item: ribbon.item)
        let ember = try #require(model.accents.first { $0.id == "ember" })
        model.choose(accent: ember)
        #expect(PillLook.read(from: file) == PillLook(style: .dabs, accent: "belt", color: white))
    }

    /// The Look opens with its accent's color as the takes paint it now, and
    /// writes it back when the file lagged.
    @Test func theLookOpensResolved() throws {
        let file = scratch()
        PillLook(style: .bars, accent: "belt").write(to: file)
        let model = LookModel(entries: takes(days: 14, words: 1800), rules: try rules(), file: file)
        let blue = try rules().cosmetics.beltColors["blue"]
        #expect(model.look.color == blue)
        #expect(PillLook.read(from: file).color == blue)
    }

    /// New takes repaint the keyboard's accent: a new belt colors the belt
    /// accent, and Clear all returns it to signal amber. The chosen style
    /// stays when its belt goes, as on desktop.
    @Test func takesRepaintTheAccent() throws {
        let rules = try rules()
        let file = scratch()
        PillLook(style: .flecks, accent: "belt", color: rules.cosmetics.beltColors["white"]).write(to: file)
        Looks.refresh(takes(days: 14, words: 1800), rules: rules, file: file)
        #expect(PillLook.read(from: file) == PillLook(style: .flecks, accent: "belt", color: rules.cosmetics.beltColors["blue"]))
        Looks.refresh(HistoryChange.cleared.kept, rules: rules, file: file)
        #expect(PillLook.read(from: file) == PillLook(style: .flecks, accent: "belt", color: rules.cosmetics.accents.first?.color))
    }

    @Test func aChangeKeepsTheTakesLeft() {
        let all = takes(days: 3, words: 10)
        #expect(HistoryChange.added(all).kept == all)
        #expect(HistoryChange.deleted(all[0], remaining: Array(all.dropFirst())).kept == Array(all.dropFirst()))
        #expect(HistoryChange.cleared.kept.isEmpty)
    }

    /// Each tile and row reads its name, what it is or what earns it, and
    /// VoiceOver says how to unlock a locked one.
    @Test func theWordsAreThePlainOnes() throws {
        let spec = try rules().cosmetics
        let dabs = try #require(spec.overlayStyles.first { $0.id == "dabs" })
        let bars = try #require(spec.overlayStyles.first { $0.id == "bars" })
        let ember = try #require(spec.accents.first { $0.id == "ember" })
        #expect(LookCopy.name(dabs) == "Ink dabs")
        #expect(LookCopy.name(try #require(spec.accents.first)) == "Signal amber")
        #expect(LookCopy.status(dabs, inUse: false, unlocked: false) == "Earn your white belt")
        #expect(LookCopy.status(dabs, inUse: false, unlocked: true) == "Earned at white belt")
        #expect(LookCopy.status(dabs, inUse: true, unlocked: true) == "In use")
        #expect(LookCopy.status(bars, inUse: false, unlocked: true) == "The classic")
        #expect(LookCopy.lockedHint(ember) == "Locked. Hold a dictation past five minutes.")
        for line in [LookCopy.waveFooter, LookCopy.accentFooter] {
            #expect(!line.contains("Murmur") && !line.contains("\u{2014}") && !line.contains(" - "))
        }
    }
}
```

`ios/AppTests/KeyboardCopyTests.swift`, whole (the names test goes; the Look's names come from shared/cosmetics.json):

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Testing
@testable import murmur

@Suite struct KeyboardCopyTests {
    /// The steps are a real sequence, and murmur stays lowercase where a
    /// sentence starts.
    @Test func theStepsReadPlainly() {
        #expect(KeyboardCopy.steps.count == 4)
        for line in KeyboardCopy.steps + [KeyboardCopy.fullAccess, KeyboardCopy.tryPrompt, KeyboardCopy.tryFooter, KeyboardCopy.lookFooter] {
            #expect(!line.contains("Murmur"))
        }
        #expect(KeyboardCopy.fullAccess.contains("never connects to the internet"))
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: the app's tests fail to build: `cannot find 'LookRules' in scope`.

- [ ] **Step 3: Build the Look**

`ios/App/Look/Look.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The pill's look (ios/prd.json IOS-020): which waveform styles and accents
// this iPhone's takes have earned, by desktop's rules (MurmurCore's
// Cosmetics over shared/cosmetics.json), and the look the keyboard reads
// from the app group. The keyboard never sees the history, so the app
// writes the accent's color beside the choice and rewrites it whenever the
// takes change what it resolves to: a new belt, an achievement, or takes
// deleted.
import Foundation
import MurmurCore

/// What the look is decided from, read once from the app bundle.
struct LookRules: Sendable {
    let cosmetics: CosmeticsFile
    let journey: JourneyRules

    static let live: LookRules? = {
        guard let journey = JourneyRules.live, let cosmetics = try? BundledRules.cosmetics() else { return nil }
        return LookRules(cosmetics: cosmetics, journey: journey)
    }()

    /// Where these takes stand for unlocking.
    func standing(_ entries: [HistoryEntry]) -> LookStanding {
        LookStanding(rules: self, progress: Journey.report(entries, rules: journey), earned: Journey.earned(entries, rules: journey))
    }
}

/// Where practice stands, and so what it has unlocked.
struct LookStanding: Sendable {
    let rules: LookRules
    let progress: ProgressReport
    let earned: [EarnedAchievement]

    func unlocked(_ item: CosmeticItem) -> Bool {
        Cosmetics.isUnlocked(item, progress: progress, earned: earned)
    }

    /// The color an accent paints with now: a locked or unknown one paints
    /// signal amber, as on desktop.
    func color(_ accent: String) -> String? {
        Cosmetics.accentColor(accent, spec: rules.cosmetics, progress: progress, earned: earned)
    }

    /// A swatch's color: the accent's own, or the belt held for the belt
    /// accent, locked or not.
    func swatch(_ item: CosmeticItem) -> String? {
        item.color ?? Cosmetics.beltColor(rules.cosmetics, progress: progress)
    }

    /// The look as it should be written: its accent's color resolved.
    func resolved(_ look: PillLook) -> PillLook {
        var look = look
        look.color = color(look.accent)
        return look
    }
}

enum Looks {
    /// After takes land, one is deleted, or all are cleared: the look's
    /// color follows what the takes now unlock, written only when it moved.
    static func refresh(_ entries: [HistoryEntry], rules: LookRules? = .live, file: URL? = PillLook.file) {
        guard let rules else { return }
        let look = PillLook.read(from: file)
        let resolved = rules.standing(entries).resolved(look)
        if resolved != look { resolved.write(to: file) }
    }
}

extension HistoryChange {
    /// Every take kept once the change is made.
    var kept: [HistoryEntry] {
        switch self {
        case let .added(all): all
        case let .deleted(_, remaining): remaining
        case .cleared: []
        }
    }
}

/// The Look screen's words.
enum LookCopy {
    static let waveFooter = "How the pill draws your voice, in the keyboard and when murmur opens to record. Each tile is the real pill, moving to a made-up voice; locked styles show the belt that earns them."

    static let accentFooter = "The paint the pill draws with while you speak. It dries to a darker shade of itself when the brush lifts; signal amber dries to gold."

    /// A name from shared/cosmetics.json, in sentence case.
    static func name(_ item: CosmeticItem) -> String {
        item.name.prefix(1).uppercased() + item.name.dropFirst()
    }

    /// The line under a style: in use, what earns it, or what it is.
    static func status(_ item: CosmeticItem, inUse: Bool, unlocked: Bool) -> String {
        if inUse { return "In use" }
        if !unlocked { return sentence(item.hint) }
        if let rank = item.unlock?.rank { return "Earned at \(rank) belt" }
        return sentence(item.hint)
    }

    /// What VoiceOver adds for a locked style or accent.
    static func lockedHint(_ item: CosmeticItem) -> String {
        "Locked. \(sentence(item.hint))."
    }

    static func sentence(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst()
    }
}
```

`ios/App/Look/LookScreen.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Look screen (ios/prd.json IOS-020): every waveform style as a live
// mini pill and every accent, as desktop's Look section shows them. Locked
// ones stay visible, dimmed, with the belt or the moment that earns them,
// so the screen also shows the path through the Journey. A choice is
// written to the app group, where the keyboard reads it by the next take.
import MurmurCore
import SwiftUI

/// The choices and what this iPhone's takes have unlocked.
@Observable @MainActor final class LookModel {
    private(set) var look: PillLook
    let standing: LookStanding?
    @ObservationIgnored private let file: URL?

    init(entries: [HistoryEntry], rules: LookRules? = .live, file: URL? = PillLook.file) {
        self.file = file
        let standing = rules?.standing(entries)
        let read = PillLook.read(from: file)
        self.standing = standing
        // The look as the takes paint it now, written if the file lags.
        look = standing?.resolved(read) ?? read
        if look != read { look.write(to: file) }
    }

    /// The styles this build draws, in shared/cosmetics.json's order.
    var styles: [(item: CosmeticItem, style: PillStyle)] {
        (standing?.rules.cosmetics.overlayStyles ?? []).compactMap { item in
            PillStyle(rawValue: item.id).map { (item, $0) }
        }
    }

    var accents: [CosmeticItem] {
        standing?.rules.cosmetics.accents ?? []
    }

    func unlocked(_ item: CosmeticItem) -> Bool {
        standing?.unlocked(item) ?? (item.unlock == nil)
    }

    /// The paint the pill draws with now.
    var palette: PillPalette { look.palette }

    func choose(_ style: PillStyle, item: CosmeticItem) {
        guard unlocked(item), style != look.style else { return }
        look.style = style
        save()
    }

    func choose(accent item: CosmeticItem) {
        guard unlocked(item), item.id != look.accent else { return }
        look.accent = item.id
        save()
    }

    private func save() {
        if let standing { look = standing.resolved(look) }
        look.write(to: file)
    }
}

struct LookScreen: View {
    @State private var model: LookModel

    init(model: LookModel? = nil) {
        _model = State(initialValue: model ?? LookModel(entries: History.live().entries))
    }

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        Form {
            Section {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(model.styles, id: \.item.id) { entry in
                        StyleTile(
                            item: entry.item,
                            style: entry.style,
                            palette: model.palette,
                            inUse: model.look.style == entry.style,
                            unlocked: model.unlocked(entry.item)
                        ) {
                            model.choose(entry.style, item: entry.item)
                        }
                    }
                }
                .padding(.vertical, 6)
            } header: {
                SectionTitle("Waveform")
            } footer: {
                Text(LookCopy.waveFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                ForEach(model.accents) { item in
                    AccentRow(
                        item: item,
                        swatch: model.standing?.swatch(item),
                        chosen: model.look.accent == item.id,
                        unlocked: model.unlocked(item)
                    ) {
                        model.choose(accent: item)
                    }
                }
            } header: {
                SectionTitle("Accent")
            } footer: {
                Text(LookCopy.accentFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Look")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One style, live: the real pill moving to a made-up voice, in the accent.
struct StyleTile: View {
    let item: CosmeticItem
    let style: PillStyle
    let palette: PillPalette
    let inUse: Bool
    let unlocked: Bool
    let choose: () -> Void

    var body: some View {
        Button(action: choose) {
            VStack(alignment: .leading, spacing: 8) {
                PillCanvas(style: style, stage: .recording, level: DemoVoice.level, palette: palette)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(height: 44)
                    .background(Capsule().fill(Tokens.panelLift))
                    .opacity(unlocked ? 1 : 0.4)
                VStack(alignment: .leading, spacing: 2) {
                    Text(LookCopy.name(item))
                        .font(.subheadline.weight(inUse ? .semibold : .regular))
                        .foregroundStyle(inUse ? Tokens.brand : unlocked ? Tokens.text : Tokens.textDim)
                    Text(LookCopy.status(item, inUse: inUse, unlocked: unlocked))
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 4)
            }
            .padding(10)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 14).stroke(inUse ? Tokens.brand : Tokens.panelEdge, lineWidth: inUse ? 1.5 : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!unlocked)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(LookCopy.name(item))
        .accessibilityValue(LookCopy.status(item, inUse: inUse, unlocked: unlocked))
        .accessibilityHint(unlocked ? "" : LookCopy.lockedHint(item))
        .accessibilityAddTraits(inUse ? [.isButton, .isSelected] : .isButton)
    }
}

/// One accent: its swatch, its name, and what earns it while locked.
struct AccentRow: View {
    let item: CosmeticItem
    let swatch: String?
    let chosen: Bool
    let unlocked: Bool
    let choose: () -> Void

    var body: some View {
        Button(action: choose) {
            HStack(spacing: 12) {
                Circle()
                    .fill(swatch.flatMap(RGBA.init(hex:)).map(Color.init(rgba:)) ?? Tokens.amber)
                    .frame(width: 20, height: 20)
                    .overlay(Circle().stroke(Tokens.panelEdge, lineWidth: 1))
                    .opacity(unlocked ? 1 : 0.4)
                VStack(alignment: .leading, spacing: 2) {
                    Text(LookCopy.name(item))
                        .foregroundStyle(unlocked ? Tokens.text : Tokens.textDim)
                    if !unlocked {
                        Text(LookCopy.sentence(item.hint))
                            .font(.footnote)
                            .foregroundStyle(Tokens.textDim)
                    }
                }
                Spacer(minLength: 8)
                if chosen {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Tokens.brand)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!unlocked)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(LookCopy.name(item))
        .accessibilityHint(unlocked ? "" : LookCopy.lockedHint(item))
        .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
    }
}

extension Color {
    /// A color the shared data names, mixed as the pill mixes it.
    init(rgba: RGBA) {
        self.init(uiColor: UIColor(cgColor: rgba.cgColor))
    }
}

#if DEBUG
#Preview {
    NavigationStack { LookScreen() }.preferredColorScheme(.dark)
}
#endif
```

In `ios/App/Settings/ConnectionStore.swift`, `BundledRules` reads the cosmetics, before `catalog()`:

```swift
    /// The waveform styles and accents (IOS-020).
    static func cosmetics() throws -> CosmeticsFile {
        try shared().decode(CosmeticsFile.self, from: "cosmetics.json")
    }
```

In `ios/App/Home/SettingsScreen.swift`, Look follows Keyboard (and the header comment says so):

```swift
// Settings (ios/prd.json IOS-012): Provider and keys, Cleanup, Dictionary
// and expansions (IOS-013), the session's length, the keyboard, the pill's
// look (IOS-020), Diagnostics (IOS-014), and About.
```

```swift
                NavigationLink("Keyboard") { KeyboardScreen() }
                NavigationLink("Look") { LookScreen() }
```

`ios/App/Keyboard/KeyboardScreen.swift`, whole (The pill section links to the Look; `LookTile` and `KeyboardCopy.name` go):

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Keyboard screen (ios/prd.json IOS-008): how to add the murmur
// keyboard and turn on Full Access, why it needs it, a box to try it in,
// and the way to the pill's look (IOS-010, the Look screen since IOS-020).
// A stand-in until first run (IOS-011) walks you through it.
import SwiftUI
import UIKit

struct KeyboardScreen: View {
    @State private var tryIt = ""
    @State private var look = PillLook.read()

    var body: some View {
        Form {
            Section {
                ForEach(Array(KeyboardCopy.steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(index + 1)")
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Tokens.brand)
                            .accessibilityHidden(true)
                        Text(step)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Step \(index + 1). \(step)")
                }
                if let settings = URL(string: UIApplication.openSettingsURLString) {
                    Link("Open Settings", destination: settings)
                        .buttonStyle(RowAction())
                }
            } header: {
                SectionTitle("Add the keyboard")
            } footer: {
                Text(KeyboardCopy.fullAccess).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                NavigationLink {
                    LookScreen()
                } label: {
                    HStack(spacing: 14) {
                        PillCanvas(style: look.style, stage: .recording, level: DemoVoice.level, palette: look.palette)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .frame(width: 112, height: 36)
                            .background(Capsule().fill(Tokens.panelLift))
                            .accessibilityHidden(true)
                        Text("Look")
                    }
                }
            } header: {
                SectionTitle("The pill")
            } footer: {
                Text(KeyboardCopy.lookFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                TextField(KeyboardCopy.tryPrompt, text: $tryIt, axis: .vertical)
                    .lineLimit(3...8)
            } header: {
                SectionTitle("Try it here")
            } footer: {
                Text(KeyboardCopy.tryFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Keyboard")
        .navigationBarTitleDisplayMode(.inline)
        // Back from the Look screen, the row shows the new choice.
        .onAppear { look = PillLook.read() }
    }
}

/// The Keyboard screen's words.
enum KeyboardCopy {
    static let steps = [
        "Open Settings, then General, then Keyboard, then Keyboards.",
        "Tap Add New Keyboard, and pick murmur.",
        "Tap murmur in the list, and turn on Allow Full Access.",
        "Come back here, tap the box below, and hold the globe key to pick murmur."
    ]

    static let fullAccess = "Full Access lets the keyboard hand your take to the murmur app and read the words back. The keyboard itself never connects to the internet; only the app talks to your provider."

    static let tryPrompt = "Tap here, then the pill"

    static let tryFooter = "Tap the pill, speak, and tap it again. Your words land where the cursor is."

    static let lookFooter = "How the pill looks in the keyboard and when murmur opens to record."
}

#if DEBUG
#Preview {
    NavigationStack { KeyboardScreen() }.preferredColorScheme(.dark)
}
#endif
```

In `ios/App/History/History.swift`, `History.live()` refreshes the look as it opens and after every change:

```swift
    static func live() -> History {
        if let shared { return shared }
        let history = History(store: .standard) { words in
            TakeModel.live()?.forget(words)
            Mailbox.shared?.forget(words)
        } changed: { change in
            PaintingStore.live()?.apply(change)
            Looks.refresh(change.kept)
        }
        // Takes kept before the painting a day paint their days too.
        PaintingStore.live()?.sync(history.entries)
        // A look chosen before its accent's color moved paints the new one.
        Looks.refresh(history.entries)
        shared = history
        return history
```

In `ios/App/Session/RecordingScreen.swift`, the large pill paints in the accent:

```swift
                PillCanvas(style: look.style, stage: model.isRecording ? .recording : .idle, level: { model.level }, palette: look.palette)
```

In `ios/Keyboard/KeyboardViewController.swift`, `viewWillAppear` calls `applyLook()` where it set the style, and the pill reads the look as it is touched:

```swift
    @objc private func pillDown() {
        haptic.prepare()
        // A look chosen in murmur while the keyboard stayed up reaches the
        // pill before the take it starts.
        applyLook()
    }

    /// The pill's style and accent, from the app group (IOS-020).
    private func applyLook() {
        let look = PillLook.read()
        pad.wave.style = look.style
        pad.wave.palette = look.palette
    }
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm run ios:test`
Expected: MurmurCore 134; 325 app tests pass, `LookTests` among them.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Look ios/App/Settings/ConnectionStore.swift ios/App/Home/SettingsScreen.swift ios/App/Keyboard/KeyboardScreen.swift ios/App/History/History.swift ios/App/Session/RecordingScreen.swift ios/Keyboard/KeyboardViewController.swift ios/AppTests/LookTests.swift ios/AppTests/KeyboardCopyTests.swift
git commit -m "IOS-020: the Look screen picks any earned style and accent, and the keyboard paints it by the next take"
```

### Task 6: The smoke, the docs, and the live check

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`, `ios/docs/iphone.md`, `DESIGN.md`, `HANDOFF.md`, and `ios/prd.json`.

- [ ] **Step 1: Add the smoke check**

In `SmokeRunner`'s list, after `("paintingDay", checkPaintingDay),`:

```swift
            ("look", checkLook),
```

Before `/// Runs main-actor work to the end from the smoke's synchronous start`:

```swift
    /// The look (IOS-020): every style and accent in shared/cosmetics.json
    /// is set in the app group as the Look screen sets it, for a seeded
    /// purple belt, and read back as the keyboard reads it, with the paint
    /// the keyboard draws: unlocked accents in their own color, locked ones
    /// in signal amber. Every style paints its recording stage.
    static func checkLook() throws {
        if let failure = onMain({ lookFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func lookFailure() -> String? {
        guard let container = AppGroup.containerURL else { return "no container for \(AppGroup.identifier)" }
        guard let rules = LookRules.live else { return "the cosmetics did not load" }
        let file = container.appending(path: "smoke-pill-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        let start = Date.now.addingTimeInterval(-45 * 86_400)
        let takes = (0..<45).map { i in
            HistoryEntry(at: start.addingTimeInterval(Double(i) * 86_400), durationMs: 60_000, words: Array(repeating: "word", count: 1700).joined(separator: " "))
        }
        let standing = rules.standing(takes)
        guard standing.progress.rank.belt == "purple" else { return "the seeded takes reached \(standing.progress.rank.id), not purple" }
        let amber = rules.cosmetics.accents.first { $0.unlock == nil }?.color
        for item in rules.cosmetics.overlayStyles {
            guard let style = PillStyle(rawValue: item.id) else { return "no pill style for \(item.id)" }
            for accent in rules.cosmetics.accents {
                let look = standing.resolved(PillLook(style: style, accent: accent.id))
                let expected = standing.unlocked(accent) ? accent.color ?? rules.cosmetics.beltColors["purple"] : amber
                guard look.color == expected else { return "\(accent.id) resolved to \(look.color ?? "nothing"), not \(expected ?? "nothing")" }
                look.write(to: file)
                let read = PillLook.read(from: file)
                guard read == look else { return "\(style.rawValue) with \(accent.id) read back as \(read)" }
                guard read.palette == PillPalette(accent: expected.flatMap(RGBA.init(hex:))) else { return "\(accent.id) gave the keyboard the wrong paint" }
            }
            let frame = PillFrame(style: style, stage: .recording, levels: DemoVoice.levels, time: 0.5, still: false, palette: PillLook(style: style, color: rules.cosmetics.beltColors["purple"]).palette)
            let size = CGSize(width: 180, height: 28)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 2
            format.opaque = false
            let image = UIGraphicsImageRenderer(size: size, format: format).image { Pill.paint(frame, in: CGRect(origin: .zero, size: size), context: $0.cgContext) }
            guard inked(image) > 100 else { return "\(style.rawValue) painted nothing" }
        }
        return nil
    }
```

- [ ] **Step 2: See it catch a keyboard that misreads the look, then pass**

Temporarily make `PillLook.palette` return `.standard`. Run: `npm run ios:smoke`. Expected: `"look":false` with `smoke look: ... gave the keyboard the wrong paint`. Restore it and run again. Expected: twenty-two true checks.

- [ ] **Step 3: Write the docs**

In `ios/docs/iphone.md`, the section `## How do I change how the pill looks on iPhone?` becomes:

```markdown
## How do I change the waveform on iPhone?

In murmur, tap the gear at the top right, then Look, and tap a waveform. The Keyboard screen links to the same place, under The pill. The waveform in use is outlined in gold and says In use. Each tile is the real pill moving to a made-up voice; your microphone is never used for the tiles. The keyboard draws your pick from your next take, and the screen murmur opens to draws it the next time it records.

There are seven waveforms, the same as on the Mac. Two are free, and belts earn the rest, from the takes this iPhone keeps:

- **Bars** is the classic equalizer. Free.
- **Speckle** is a dust field that vibrates with your speech. Free.
- **Pulse** sends rings out from a steady dot as you speak. White belt.
- **Ink dabs** paints a brush dab for each moment of your voice. White belt.
- **Ink flecks** is specks of paint that jitter with your voice and throw drops when you are loud. Blue belt.
- **Ink rings** sends brushed rings out from the dot. Purple belt.
- **Ink ribbon** is one continuous stroke that swells with your voice. Brown belt.

A locked waveform stays on the screen, dimmed, with the belt that earns it; VoiceOver reads it as locked and says how to earn it. A waveform you picked stays yours if Clear all later takes its belt away, as on the Mac.

## How do I change the pill's color on iPhone?

On the same Look screen, pick an accent under Accent. Every accent paints wet while you speak and dries when you stop: signal amber, the original, dries to gold, and every other accent dries to a darker shade of itself.

- **Signal amber** is free.
- **Your belt color** follows your rank, so it changes as you earn belts. White belt.
- **White belt, blue belt, purple belt, brown belt, and black belt** each come with that belt, and the coral and red belts with their degrees.
- **Ember red** comes with a dictation past five minutes, **moonlight** with dictating between midnight and four, and **dawn** with dictating before six in the morning.

A locked accent shows what earns it. If an accent you picked is locked again (after Clear all), the pill paints signal amber until you earn it back, as on the Mac.
```

In its `## What does the pill show on iPhone?`, the recording line and the closing paragraph become:

```markdown
- **Recording**, it is wet amber at your voice's level, cooling toward gold as each moment ages. With another accent, it is wet in that color, cooling toward a darker shade of it.
```

```markdown
Every waveform follows these stages; an error is always plain red, never paint. Your iPhone gives a light tap when a take starts and when it stops. With Reduce Motion on (Settings, then Accessibility, then Motion), each stage is a still picture, and so is every tile on the Look screen. VoiceOver reads the pill as a button with its stage: Start dictation, Recording, Working, Words added, Heard nothing, or Failed, retry in murmur.
```

In `DESIGN.md`, after the paragraph on the default accent under The ink waveforms:

```markdown
On iPhone (IOS-020), `ios/Shared/Ink.swift` paints dabs, flecks, rings, ribbon, and pulse in the keyboard and the app with MurmurCore's `Brush`, a Swift port of `brush.ts` held to it by `shared/brush-vectors.json`. It runs this table in points as desktop runs it in CSS pixels, with desktop's per frame updates at 60 a second whatever the screen's rate, and pulse follows the table too (cream at rest, red for an error), as the iPhone's pill does in every style. Only the pill look exists on iPhone; the keyboard gives the pill a fixed home.
```

In `HANDOFF.md`, above the IOS-019 live check:

```markdown
- [ ] IOS-020 live check, once a TestFlight build with it is on your iPhone (added 2026-10-13). (1) In murmur, tap the gear, then Look. You should see seven waveform tiles, each moving; the ones your belts have not earned are dimmed and say which belt earns them. (2) Tap a waveform you have earned, like Ink dabs; it gets a gold outline and says In use. (3) Under Accent, tap Your belt color (or any accent you have earned); the tiles change to that color. (4) Open Messages, tap the message box, switch to the murmur keyboard, and tap the pill. Say a sentence and tap the pill again. The pill should paint in your waveform and color while you speak, dry when you stop, and your words should land in the message. (5) Tell Claude what you saw, and whether the paint felt right on the phone.
```

- [ ] **Step 4: Record the story**

In `ios/prd.json`, IOS-020's `notes` say how each criterion was verified: the vectors and test counts, the smoke, the side by side against desktop's ink shots, the frame times, the screens, these rulings, and the live check that waits on LaBroi (`passes` stays false). Run `npm run roadmap`.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift ios/docs/iphone.md DESIGN.md HANDOFF.md ios/prd.json ROADMAP.md
git commit -m "IOS-020: the smoke sets every style and accent and reads it back as the keyboard does; the docs answer how to change the waveform"
```
