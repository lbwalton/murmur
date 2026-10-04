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
import type { ProgressReport, RankSpec } from '../../shared/ranks'
import type { SettingsApi } from '../../preload/settings'
import { PageTitle, sentence } from './PageTitle'
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
}): React.JSX.Element {
  return (
    <div className="belt-paint">
      <PaintCanvas
        className="belt-canvas"
        label={props.label}
        paintKey={`${props.belt}|${props.stripes}`}
        paintInMs={props.paintIn ? 760 : 0}
        paint={(ctx, w, h, k) => paintBelt(ctx, w, h, props.belt, props.stripes, props.colors, paintEase(k))}
      />
      {props.founder && (
        <span className="belt-crown" title="the founder">
          ♛
        </span>
      )}
    </div>
  )
}

/** The road, painted to where you are, scrolled so you are in view. */
function Road(props: { progress: ProgressReport; colors: JourneyColors; paintIn: boolean }): React.JSX.Element {
  const { progress } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const road = roadRanks(progress.founder)
  const roadIndex = progress.founder ? road.length - 1 : road.findIndex((r) => r.id === progress.rank.id)
  const toNext = progress.next
    ? Math.min(
        sinceRank(progress.totals.words, progress.rank.words ?? 0, progress.next.words ?? 0),
        sinceRank(progress.totals.activeDays, progress.rank.activeDays ?? 0, progress.next.activeDays ?? 0)
      )
    : 1
  const you = youX(roadIndex, toNext, road.length)
  const words = `you, ${progress.totals.words.toLocaleString()} words`
  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollLeft = Math.max(0, you - box.clientWidth * 0.35)
  }, [you])
  const mono = cssValue('--font-mono', 'monospace')
  const label = progress.next
    ? `The road: ${progress.rank.label}, ${Math.round(toNext * 100)} percent of the way to ${progress.next.label}`
    : `The road: ${progress.rank.label}, at the end of the road`
  return (
    <div className="road-scroll" ref={scrollRef}>
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
    </div>
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
  const [saving, setSaving] = useState(false)
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

  const shareCard = async (): Promise<void> => {
    setSaving(true)
    try {
      const styles = getComputedStyle(document.documentElement)
      const token = (name: string, fallback: string): string =>
        styles.getPropertyValue(name).trim() || fallback
      const canvas = document.createElement('canvas')
      canvas.width = 840
      canvas.height = 440
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const ink = token('--ink', 'rgb(15, 14, 17)')
      const panel = token('--panel', 'rgb(23, 22, 27)')
      const text = token('--text', 'rgb(236, 233, 228)')
      const dim = token('--text-dim', 'rgb(154, 150, 143)')
      const mono = token('--font-mono', 'ui-monospace, monospace')
      const body = token('--font-body', 'sans-serif')

      ctx.fillStyle = ink
      ctx.fillRect(0, 0, 840, 440)
      ctx.fillStyle = panel
      ctx.beginPath()
      ctx.roundRect(28, 28, 784, 384, 22)
      ctx.fill()

      ctx.fillStyle = token('--brand', dim)
      ctx.font = `12px ${mono}`
      ctx.fillText('m u r m u r', 64, 84)

      // The belt.
      ctx.fillStyle = cosmetics.beltColor
      ctx.beginPath()
      ctx.roundRect(64, 112, 320, 44, 8)
      ctx.fill()
      if (progress.rank.belt !== 'red') {
        ctx.fillStyle = progress.rank.belt === 'white' ? ink : 'rgba(0, 0, 0, 0.55)'
        ctx.fillRect(300, 112, 60, 44)
        ctx.fillStyle = text
        for (let i = 0; i < Math.min(progress.rank.stripes, 6); i++) {
          ctx.fillRect(308 + i * 8, 118, 4, 32)
        }
      }

      ctx.fillStyle = text
      ctx.font = `bold 34px ${body}`
      ctx.fillText(progress.rank.label, 64, 216)
      const labelWidth = ctx.measureText(progress.rank.label).width
      ctx.fillStyle = dim
      ctx.font = `14px ${mono}`
      ctx.fillText(`lvl. ${progress.level.toLocaleString()}`, 64 + labelWidth + 16, 216)
      ctx.fillStyle = dim
      ctx.font = `italic 17px ${body}`
      ctx.fillText(`"${progress.rank.title}"`, 64, 248)

      ctx.font = `14px ${mono}`
      ctx.fillStyle = text
      ctx.fillText(
        `${progress.totals.words.toLocaleString()} words · ${progress.totals.activeDays} days on the mat · ${earned.length} achievements`,
        64,
        304
      )
      if (line) {
        ctx.fillStyle = dim
        ctx.font = `13px ${body}`
        ctx.fillText(line.length > 88 ? `${line.slice(0, 88)}…` : line, 64, 336)
      }
      if (progress.founder) {
        // Centered on the solid red belt, matching the live view.
        ctx.fillStyle = token('--founder-gold', cosmetics.beltColor)
        ctx.font = `26px ${body}`
        ctx.textAlign = 'center'
        ctx.fillText('♛', 224, 143)
        ctx.textAlign = 'start'
      }
      ctx.fillStyle = dim
      ctx.font = `11px ${mono}`
      ctx.fillText('push-to-talk dictation · earned, never bought', 64, 384)

      await bridge().saveShareCard(canvas.toDataURL('image/png'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="home">
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
          <button className="btn quiet-btn" onClick={() => void shareCard()} disabled={saving}>
            {saving ? 'Saving…' : 'Share card'}
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
          />
          <div>
            <p className="journey-rank">
              <span className="level-chip" title="one level per hundred thousand words">
                lvl. {progress.level.toLocaleString()}
              </span>
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
