// SPDX-License-Identifier: GPL-3.0-only
// The journey: your belt, drawn; the road to the next one; the story of
// how far your voice has carried; the badges along the way.
import { useEffect, useMemo, useRef, useState } from 'react'
import ranksFile from '../../../shared/ranks.json'
import cosmeticsFile from '../../../shared/cosmetics.json'
import { type Rgb, clamp, parseColor } from '../brush'
import { PaintCanvas } from './PaintCanvas'
import {
  type JourneyColors,
  ROAD,
  beltOnInk,
  daysPerMark,
  earnedIndex,
  rankX,
  journeyColors,
  paintBelt,
  paintEase,
  paintRoad,
  paintStamp,
  paintTallies,
  paintWordsGate,
  youX
} from './journeyPaint'
import type { EarnedAchievement } from '../../shared/achievements'
import type { CosmeticsReport } from '../../shared/cosmetics'
import { type ProgressReport, type RankSpec, WORDS_PER_LEVEL } from '../../shared/ranks'
import type { SettingsApi } from '../../preload/settings'
import { PageTitle, sentence } from './PageTitle'
import { HoverNote } from './HoverNote'
import { Ceremony } from './Ceremony'
import { ShareCardDialog } from './ShareCard'
import { type Celebration, lastCelebrated, rememberCelebrated, toCelebrate } from './celebrate'
import { EmptyState } from './EmptyState'

const bridge = (): SettingsApi => window.murmur

// The same file the engine promotes from, so this list can never drift.
const LADDER = (ranksFile as { ranks: RankSpec[] }).ranks
/** The road: every rank after the starting none; the founder-only rank
 *  only on the founder's road. */
const roadRanks = (founder: boolean): RankSpec[] => LADDER.filter((rank) => rank.id !== 'none' && (!rank.founderOnly || founder))
const BELT_HEX = (cosmeticsFile as { beltColors: Record<string, string> }).beltColors

const cssValue = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/** Share of the way from your rank's total to the next one's: the road,
 *  the words stroke, and the tallies all measure since your current rank,
 *  so they always agree. */
function sinceRank(have: number, from: number, need: number): number {
  return need <= from ? 1 : clamp((have - from) / (need - from), 0, 1)
}

/** Paint in only when progress moved since the last visit; otherwise the
 *  Journey opens finished (paint stays still unless the moment moves). */
const SEEN_KEY = 'murmur-journey-painted'
function progressMoved(key: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== key
  } catch {
    return false
  }
}
function rememberProgress(key: string): void {
  try {
    localStorage.setItem(SEEN_KEY, key)
  } catch {
    // Without storage the Journey simply opens finished next time too.
  }
}

interface AchievementDef {
  id: string
  name: string
  hint: string
}

/**
 * The belt, painted (US-076): fabric in the belt's color, the rank bar
 * (none on coral and red belts), and crisp tape stripes. The founder
 * crown still sits on the fabric.
 */
function Belt(props: {
  belt: string
  stripes: number
  label: string
  founder: boolean
  colors: JourneyColors
  paintIn: boolean
  /** A new stripe (US-077): its tape slaps onto the finished fabric. */
  tape: boolean
}): React.JSX.Element {
  const newest = Math.min(props.stripes, props.belt === 'black' ? 6 : 4) - 1
  return (
    <div className="belt-paint">
      <PaintCanvas
        key={props.tape ? 'tape' : 'belt'}
        className="belt-canvas"
        label={props.label}
        paintKey={`${props.belt}|${props.stripes}`}
        paintInMs={props.tape ? 520 : props.paintIn ? 760 : 0}
        paint={(ctx, w, h, k) =>
          props.tape
            ? paintBelt(ctx, w, h, props.belt, props.stripes, props.colors, 1, { i: newest, k })
            : paintBelt(ctx, w, h, props.belt, props.stripes, props.colors, paintEase(k))
        }
      />
      {props.founder && (
        <span className="belt-crown" title="the founder">
          ♛
        </span>
      )}
    </div>
  )
}

/** What the level chip explains (US-093): levels count words only, and
 *  how many more reach the next one. */
export function levelNote(level: number, words: number): string {
  const next = level * WORDS_PER_LEVEL
  const left = Math.max(0, next - words)
  return `Level ${level.toLocaleString()}. You gain a level for every ${WORDS_PER_LEVEL.toLocaleString()} words you dictate, with no days needed. ${left.toLocaleString()} more ${left === 1 ? 'word' : 'words'} to reach level ${(level + 1).toLocaleString()}.`
}

/** The rank a knot stands for, in words, for the road's hover note. */
function knotNote(rank: RankSpec, state: 'earned' | 'next' | 'ahead'): string {
  if (rank.founderOnly) return `${sentence(rank.label)}: the founder's belt`
  const needs = `${(rank.words ?? 0).toLocaleString()} words, ${(rank.activeDays ?? 0).toLocaleString()} days`
  return `${sentence(rank.label)}: ${needs}${state === 'earned' ? ', earned' : state === 'next' ? ', next' : ''}`
}

/**
 * The road, painted as far as your words and days have taken you, and
 * scrolled so you are in view. The founder's belt is an identity, so the
 * founder's road shows earned practice too, with the crown at the end.
 * Hovering a mark names its rank and what it takes.
 */
function Road(props: { progress: ProgressReport; colors: JourneyColors; paintIn: boolean }): React.JSX.Element {
  const { progress } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const road = roadRanks(progress.founder)
  const { words: haveWords, activeDays: haveDays } = progress.totals
  const roadIndex = progress.founder ? earnedIndex(road, haveWords, haveDays) : road.findIndex((r) => r.id === progress.rank.id)
  const at = roadIndex >= 0 ? road[roadIndex] : null
  const next = road[roadIndex + 1] && !road[roadIndex + 1].founderOnly ? road[roadIndex + 1] : null
  const toNext = next
    ? Math.min(
        sinceRank(haveWords, at?.words ?? 0, next.words ?? 0),
        sinceRank(haveDays, at?.activeDays ?? 0, next.activeDays ?? 0)
      )
    : 1
  const you = youX(roadIndex, toNext, road.length)
  const words = `you, ${haveWords.toLocaleString()} words`
  const [tip, setTip] = useState<{ x: number; text: string; edge: '' | 'start' | 'end' } | null>(null)
  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollLeft = Math.max(0, you - box.clientWidth * 0.35)
  }, [you])
  const mono = cssValue('--font-mono', 'monospace')
  const where = at ? at.label : 'no belt yet'
  // The whole road in words for keyboard and screen reader users, the
  // next rank's needs included (the hover notes are pointer only).
  const label = next
    ? `The road: ${where}, ${Math.round(toNext * 100)} percent of the way to ${next.label}, which needs ${(next.words ?? 0).toLocaleString()} words and ${(next.activeDays ?? 0).toLocaleString()} days on the mat`
    : `The road: ${where}, at the end of the road`
  const onMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    let nearest = -1
    let gap = Infinity
    road.forEach((_, i) => {
      const d = Math.abs(rankX(i, road.length) - x)
      if (d < gap) {
        gap = d
        nearest = i
      }
    })
    if (nearest < 0 || gap > 16 || Math.abs(y - ROAD.y) > 22) {
      setTip(null)
      return
    }
    const state = nearest <= roadIndex ? 'earned' : nearest === roadIndex + 1 ? 'next' : 'ahead'
    const at = rankX(nearest, road.length)
    // Near either end the note hangs inward, so it never leaves the road.
    const edge = at < 220 ? 'start' : at > ROAD.W - 260 ? 'end' : ''
    setTip({ x: at, text: knotNote(road[nearest], state), edge })
  }
  return (
    <>
      <div className="road-scroll" ref={scrollRef}>
        <div className="road-inner" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
          <PaintCanvas
            className="road-canvas"
            width={ROAD.W}
            height={ROAD.H}
            label={label}
            paintKey={`${roadIndex}|${you.toFixed(1)}|${words}`}
            paintInMs={props.paintIn ? 900 : 0}
            paint={(ctx, _w, _h, k) =>
              paintRoad(ctx, road, roadIndex, you, ROAD.pad + (you - ROAD.pad) * paintEase(k), words, props.colors, mono)
            }
          />
          {tip && (
            <span className={`road-tip${tip.edge ? ` road-tip-${tip.edge}` : ''}`} style={{ left: tip.x }} aria-hidden="true">
              {tip.text}
            </span>
          )}
        </div>
      </div>
      <p className="row-desc road-note">
        {progress.founder
          ? "Your belt is the founder's. The road shows the ranks your words and days have earned, with the founder's crown at the end. Hover a mark to see its rank."
          : 'Every rank from white belt to red, left to right, painted as far as your words and days have taken you. The gold ring is your next promotion. Hover a mark to see its rank.'}
      </p>
    </>
  )
}

export function JourneyView(props: {
  hotkey: string
  /** The chosen accent color, or null for the default: it tints the
   *  gates, as it tints progress across the window. */
  accent: string | null
}): React.JSX.Element {
  const [progress, setProgress] = useState<ProgressReport | null>(null)
  const [earned, setEarned] = useState<EarnedAchievement[]>([])
  const [defs, setDefs] = useState<AchievementDef[]>([])
  const [cosmetics, setCosmetics] = useState<CosmeticsReport | null>(null)
  const [line, setLine] = useState('')
  const [sharing, setSharing] = useState(false)
  const pick = useRef(Math.random())

  useEffect(() => {
    const load = (): void => {
      void Promise.all([
        bridge().getRankProgress(),
        bridge().getEarnedAchievements(),
        bridge().getAchievementDefs(),
        bridge().getCosmetics(),
      ]).then(([p, e, d, c]) => {
        setProgress(p)
        setEarned(e)
        setDefs(d)
        setCosmetics(c)
      })
      void bridge().getEquivalentLine(pick.current).then(setLine)
    }
    load()
    return bridge().onHistoryAppended(() => load())
  }, [])

  const colors = useMemo(() => journeyColors(BELT_HEX), [])
  // The promotion to celebrate, decided once, when progress first arrives,
  // so the belt's first paint already knows about a new stripe.
  const celebration = useRef<Celebration | null | undefined>(undefined)
  if (progress && celebration.current === undefined) {
    celebration.current = progress.founder ? null : toCelebrate(progress.promotions, LADDER, lastCelebrated(), Date.now())
  }
  const [ceremonyDone, setCeremonyDone] = useState(false)
  // Remember how high you have climbed, celebrated or not, so the first
  // open of a long history sets the mark and nothing below it replays.
  const reachedIndex = progress && !progress.founder ? LADDER.findIndex((r) => r.id === progress.rank.id) : -1
  useEffect(() => {
    if (reachedIndex >= 0) rememberCelebrated(reachedIndex)
  }, [reachedIndex])
  // Progress as of this visit: the paint-in plays only when it moved.
  const progressKey = progress ? `${progress.rank.id}|${progress.totals.words}|${progress.totals.activeDays}` : ''
  const moved = useMemo(() => (progressKey ? progressMoved(progressKey) : false), [progressKey])
  useEffect(() => {
    if (progressKey) rememberProgress(progressKey)
  }, [progressKey])

  if (!progress || !cosmetics) {
    return (
      <div className="home">
        <PageTitle title="Journey" />
      </div>
    )
  }

  const earnedIds = new Set(earned.map((e) => e.id))
  const bodyFont = cssValue('--font-body', 'sans-serif')
  // The gates take the chosen accent, else the belt's own color.
  const gateColor: Rgb = (props.accent ? parseColor(props.accent) : null) ?? beltOnInk(progress.rank.belt, colors)
  const gateColorKey = gateColor.join(',')


  const ceremony = celebration.current?.belt && !ceremonyDone ? celebration.current.belt : null
  const shareData = { rank: progress.rank, level: progress.level, founder: progress.founder }
  // The tape moment for a new stripe plays once the ceremony is over.
  const tapeNow = Boolean(celebration.current?.tape && celebration.current.tape.id === progress.rank.id && !ceremony)
  return (
    <div className="home">
      {ceremony && <Ceremony rank={ceremony} onClose={() => setCeremonyDone(true)} />}
      {sharing && (
        <ShareCardDialog
          card={shareData}
          onClose={() => setSharing(false)}
        />
      )}
      <PageTitle title={sentence(progress.rank.label)} sub={`"${progress.rank.title}"`} />
      {progress.totals.words === 0 && !progress.founder && (
        <EmptyState
          title="Your journey starts with your first dictation."
          hotkey={props.hotkey}
          after="Words and days on the mat count toward your white belt."
        />
      )}
      <section className="panel">
        <div className="panel-head">
          <p className="micro-label">the journey</p>
          <button className="btn quiet-btn" onClick={() => setSharing(true)}>
            Share card
          </button>
        </div>
        <div className="journey-hero">
          <Belt
            belt={progress.rank.belt}
            stripes={progress.rank.stripes}
            label={progress.rank.label}
            founder={progress.founder}
            colors={colors}
            paintIn={moved}
            tape={tapeNow}
          />
          <div>
            <p className="journey-rank">
              <HoverNote className="level-chip" note={levelNote(progress.level, progress.totals.words)}>
                lvl. {progress.level.toLocaleString()}
              </HoverNote>
            </p>
          </div>
        </div>
        {line && <p className="row-desc journey-line">{line}</p>}
      </section>

      <section className="panel">
        <p className="micro-label">{progress.next ? `next: ${progress.next.label}` : 'the road'}</p>
        <Road progress={progress} colors={colors} paintIn={moved} />
        {progress.words && progress.next && (
          <div className={`gate${progress.words.pct >= 1 ? ' gate-closed' : ''}`}>
            <div className="gate-head">
              <span className="mono-inline dim">words</span>
              <span className="mono-inline dim">
                {progress.words.have.toLocaleString()} / {progress.words.need.toLocaleString()}
              </span>
            </div>
            <PaintCanvas
              className="gate-canvas"
              label={`Words: ${progress.words.have.toLocaleString()} of ${progress.words.need.toLocaleString()}`}
              paintKey={`${progress.words.have}|${progress.words.need}|${progress.rank.id}|${gateColorKey}`}
              paintInMs={moved ? 700 : 0}
              paint={(ctx, w, h, k) =>
                paintWordsGate(
                  ctx,
                  w,
                  h,
                  sinceRank(progress.totals.words, progress.rank.words ?? 0, progress.next?.words ?? 0) * paintEase(k),
                  gateColor,
                  colors
                )
              }
            />
          </div>
        )}
        {progress.activeDays && progress.next && (
          <div className={`gate${progress.activeDays.pct >= 1 ? ' gate-closed' : ''}`}>
            <div className="gate-head">
              <span className="mono-inline dim">
                days on the mat
                {daysPerMark(progress.activeDays.need - (progress.rank.activeDays ?? 0)) > 1 &&
                  ` · each mark is ${daysPerMark(progress.activeDays.need - (progress.rank.activeDays ?? 0))} days`}
              </span>
              <span className="mono-inline dim">
                {progress.activeDays.have} / {progress.activeDays.need}
              </span>
            </div>
            <PaintCanvas
              className="gate-canvas"
              label={`Days on the mat: ${progress.activeDays.have} of ${progress.activeDays.need}`}
              paintKey={`${progress.activeDays.have}|${progress.activeDays.need}|${progress.rank.id}|${gateColorKey}`}
              paintInMs={moved ? 700 : 0}
              paint={(ctx, w, h, k) => {
                const days = progress.activeDays
                if (!days) return
                const from = progress.rank.activeDays ?? 0
                paintTallies(ctx, w, h, days.need - from, days.have - from, gateColor, colors, paintEase(k))
              }}
            />
          </div>
        )}
        {progress.next && (
          <p className="row-desc rates-note">
            Both gates must close. Words come from dictating; days only from showing up.
          </p>
        )}
      </section>

      <section className="panel">
        <details className="ladder">
          <summary className="micro-label ladder-summary">the full ladder</summary>
          <p className="row-desc">
            Every promotion needs both gates: lifetime words dictated AND distinct days you
            dictated. Levels are separate and have no day gate: one level per hundred thousand
            words.
          </p>
          <div className="log-list">
            {LADDER.filter((rank) => rank.id !== 'none').map((rank) => {
              const earned =
                rank.words !== null &&
                rank.activeDays !== null &&
                progress.totals.words >= rank.words &&
                progress.totals.activeDays >= rank.activeDays
              const current = rank.founderOnly ? progress.founder : rank.id === progress.rank.id
              return (
                <div
                  className={`ladder-row${current ? ' ladder-row-current' : ''}${earned && !current ? ' ladder-row-done' : ''}`}
                  key={rank.id}
                >
                  <span className="ladder-mark mono-inline">
                    {rank.founderOnly ? '♛' : current ? '●' : earned ? '✓' : '·'}
                  </span>
                  <span className="ladder-name">{rank.label}</span>
                  <span className="mono-inline dim ladder-gates">
                    {rank.words === null || rank.activeDays === null
                      ? 'founder only'
                      : `${rank.words.toLocaleString()} words · ${rank.activeDays.toLocaleString()} days`}
                  </span>
                </div>
              )
            })}
          </div>
        </details>
      </section>

      <section className="panel">
        <p className="micro-label">achievements</p>
        <div className="stamps">
          {defs.map((def, i) => {
            const got = earnedIds.has(def.id)
            return (
              <div className={`stamp${got ? ' stamp-earned' : ''}`} key={def.id} title={def.hint}>
                <PaintCanvas
                  className="stamp-canvas"
                  width={76}
                  height={76}
                  paintKey={`${def.id}|${got}`}
                  paint={(ctx, w) => paintStamp(ctx, w, def.id, got, 1200 + i * 9, colors, bodyFont)}
                />
                <span className="stamp-name">
                  {def.name}
                  <span className="visually-hidden">{got ? ', earned' : ', not yet earned'}</span>
                </span>
                {!got && <span className="stamp-hint">{def.hint}</span>}
              </div>
            )
          })}
        </div>
      </section>

      {progress.promotions.length > 0 && (
        <section className="panel">
          <p className="micro-label">promotions</p>
          <div className="log-list">
            {[...progress.promotions].reverse().map((p) => (
              <div className="promo-row" key={p.id}>
                <span className="mono-inline dim">
                  {new Date(p.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span>{p.id.replace(/-/g, ' ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
