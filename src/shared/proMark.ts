// SPDX-License-Identifier: GPL-3.0-only
// The murmur Pro mark (US-107): which surfaces show it filled or
// outlined, when the Home offer and the daily brush fill are due, the
// install date, and the daily fill's seeded strokes. Pure functions, so
// the rules are tested without a window. The rule under all of it: a
// filled mark means Pro is yours, an outlined mark means Pro offers it.

/** Just the license facts the mark needs (main's LicenseStatus fits). */
export interface ProFacts {
  pro: boolean
  /** A deactivated key still parked on this machine. */
  retained?: boolean
}

export type MarkState = 'filled' | 'outlined' | 'none'

/**
 * The header mark belongs to Pro users only; free users and a parked
 * key see none. The offer surfaces (the rail entry, the Profiles row,
 * the Pro section title) show it filled for Pro and outlined otherwise.
 * Nothing shows while the status loads.
 */
export function markFor(surface: 'header' | 'offer', status: ProFacts | null): MarkState {
  if (!status) return 'none'
  if (status.pro) return 'filled'
  return surface === 'header' ? 'none' : 'outlined'
}

/** Calendar days from one moment to another in local time: the day of
 *  installing is day 0, the next calendar day is day 1. */
export function calendarDaysSince(fromMs: number, nowMs: number): number {
  const a = new Date(fromMs)
  const b = new Date(nowMs)
  const startA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const startB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((startB - startA) / 86_400_000)
}

/** The Home offer waits this many calendar days after installing (LB, 2026-10-19). */
export const OFFER_AFTER_DAYS = 30

/**
 * The one dim Home line for free users: never before day 30, never
 * once answered (See Pro, No thanks, or a purchase), never for anyone
 * who owns a key, active or parked, and never without a known install
 * date.
 */
export function shouldOfferPro(o: { installedAt: number; now: number; done: boolean; status: ProFacts | null }): boolean {
  if (!o.status || o.status.pro || o.status.retained) return false
  if (o.done || !(o.installedAt > 0)) return false
  return calendarDaysSince(o.installedAt, o.now) >= OFFER_AFTER_DAYS
}

/**
 * The install date, recorded once: an install that already knows it
 * keeps it; one from before the field existed takes its earliest
 * dictation on record; a fresh install, or one with no dictations,
 * takes this launch.
 */
export function resolveInstallDate(current: number, earliestAt: number | null, now: number): number {
  if (Number.isFinite(current) && current > 0) return current
  if (earliestAt !== null && Number.isFinite(earliestAt) && earliestAt > 0 && earliestAt <= now) return earliestAt
  return now
}

/** The daily fill plays once per local day, for Pro users who leave it on. */
export function dailyFillDue(o: { status: ProFacts | null; enabled: boolean; lastPaintDay: string; today: string }): boolean {
  return Boolean(o.status?.pro) && o.enabled && o.lastPaintDay !== o.today
}

/**
 * The moment you buy reaches the header mark through a timestamp: fresh
 * (under 3 seconds old) and not yet played. The mark may mount in the
 * same instant the timestamp is set, so a fresh one counts at mount too;
 * one already played never replays when the header remounts.
 */
export function arrivalDue(arrival: number, played: number, now: number): boolean {
  return arrival > 0 && arrival > played && now - arrival >= 0 && now - arrival < 3000
}

/** The thank-you after an activation shows on the next Home visit, for Pro only. */
export function thanksDue(status: ProFacts | null, pending: boolean): boolean {
  return Boolean(status?.pro) && pending
}

/**
 * Timing for the moment the window opens (the motion designer's tuning,
 * LB's pick 2026-10-22): wait for the window to settle in front,
 * lift to 2x with a small overshoot, paint while big, hold, settle back.
 * A click, a key, or the window losing focus skips to the end.
 */
export const LIFT = {
  waitMs: 350,
  /** murmur opens its window by itself at launch, before you are looking
   *  (found live 2026-10-23: the fill ran 1 s after launch). Then the
   *  lift waits until the window has been up this long. */
  launchMs: 2500,
  growMs: 300,
  scale: 2,
  overshoot: 2.06,
  holdMs: 400,
  settleMs: 500,
  skipSettleMs: 200
} as const

/**
 * The moment you buy, rolled from the top of the window down (LB's
 * pick on canvas board 2, 2026-10-23): the header's mark starts at once,
 * each outlined mark below it fills one step later than the one above,
 * and every mark glows bright gold as it fills, then fades.
 */
export const ARRIVE = {
  stepMs: 150,
  /** pro-mark-glow in styles.css runs this long. */
  glowMs: 1900
} as const

/** Each mark's delay, by its place on screen: highest first, then leftmost. */
export function rollDelaysMs(places: readonly { top: number; left: number }[]): number[] {
  const order = places.map((_, i) => i).sort((a, b) => places[a].top - places[b].top || places[a].left - places[b].left)
  const delays = new Array<number>(places.length)
  order.forEach((index, rank) => {
    delays[index] = (rank + 1) * ARRIVE.stepMs
  })
  return delays
}

/** How long the lift waits once the window is in front, given how long its page has been up. */
export function liftWaitMs(pageAgeMs: number): number {
  return Math.max(LIFT.waitMs, LIFT.launchMs - pageAgeMs)
}

/** One stroke of the daily fill, in the mark's own box (0 to 1 each way). */
export interface FillStroke {
  /** Degrees from horizontal. */
  angle: number
  cx: number
  cy: number
  /** Length as a share of the box's width. */
  len: number
  /** Width as a share of the box's height. */
  width: number
  /** Bow of the stroke as a share of the box's height. */
  bow: number
  /** Painted from the far end. */
  reverse: boolean
  /** -1 darker to 1 lighter, a small shift of the gold. */
  shade: number
  /** How fast it runs dry, 0 wet to 1 dry. */
  dry: number
  /** Brush seed, kept to a small set so the bristle cache stays small. */
  brush: number
  startMs: number
  durMs: number
}

function hashDay(day: string): number {
  // FNV-1a: the same day always seeds the same strokes.
  let h = 0x811c9dc5
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function seeded(seed: number): () => number {
  // mulberry32, the same generator the brush engine uses.
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The steeper angles the later strokes cut in from (canvas board 7). */
const STEEP = [-36, -24, -14, 14, 24, 36]

/**
 * The day's strokes, seeded by its date (LB's picks on canvas board
 * 7, 2026-10-22): 3 or 4 slashing strokes, 1 shallow stroke laying the
 * ground and the rest cutting in steeper, each from its own side, over
 * about 3 seconds. They stay as they land: dry ends and small gaps are
 * the day's badge until the next day's fill.
 */
export function fillStrokes(day: string): FillStroke[] {
  const r = seeded(hashDay(day))
  const n = r() < 0.5 ? 3 : 4
  const steep = [...STEEP]
  for (let j = steep.length - 1; j > 0; j--) {
    const m = Math.floor(r() * (j + 1))
    ;[steep[j], steep[m]] = [steep[m], steep[j]]
  }
  const out: FillStroke[] = []
  for (let i = 0; i < n; i++) {
    const first = i === 0
    // Jitter stays under half the gap between steep angles, so no two
    // strokes ever share one.
    const angle = first ? (r() * 2 - 1) * 7 : steep[i - 1] + (r() * 2 - 1) * 3
    const tilt = Math.abs(angle) / 36
    out.push({
      angle,
      // The ground stroke stays centered and long, so its taper falls
      // outside the letters and PRO always sits on its solid middle.
      cx: first ? 0.5 + (r() * 2 - 1) * 0.04 : 0.2 + r() * 0.6,
      cy: first ? 0.5 + (r() * 2 - 1) * 0.03 : 0.18 + r() * 0.64,
      len: first ? 1.34 : 1.18 + tilt * 0.2,
      width: (first ? 1.2 : 0.72 + tilt * 0.22) + r() * 0.12,
      bow: (r() * 2 - 1) * 0.12,
      reverse: r() < 0.5,
      shade: r() * 2 - 1,
      // The shallow ground stroke runs wetter, so PRO sits on solid gold;
      // the steeper strokes stay dry, their ends and gaps the day's look,
      // though not so dry that the grain turns coarse (the soft grain).
      // The painter treats under 0.5 as wet.
      dry: first ? 0.3 + r() * 0.1 : 0.53 + r() * 0.15,
      brush: 3 + Math.floor(r() * 5),
      // Spread so the last stroke starts near 1.7 s with 3 strokes or 4,
      // and the fill lands in about 3 seconds either way.
      startMs: Math.round(Math.max(0, i * (n === 3 ? 855 : 570) + (r() * 2 - 1) * 90)),
      durMs: Math.round(900 + r() * 300)
    })
  }
  return out
}

/** When the last stroke of a fill lands, in ms from the first. */
export function fillDurationMs(strokes: readonly FillStroke[]): number {
  return strokes.reduce((end, s) => Math.max(end, s.startMs + s.durMs), 0)
}

/** How far a stroke has painted at t ms: fast attack, long settle. */
export function strokeProgress(s: FillStroke, t: number): number {
  const p = (t - s.startMs) / s.durMs
  if (p <= 0) return 0
  if (p >= 1) return 1
  return 1 - Math.pow(1 - p, 3.2)
}
