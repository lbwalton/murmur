// SPDX-License-Identifier: GPL-3.0-only
// The journey: your belt, drawn; the road to the next one; the story of
// how far your voice has carried; the badges along the way.
import { useEffect, useRef, useState } from 'react'
import type { EarnedAchievement } from '../../shared/achievements'
import type { CosmeticsReport } from '../../shared/cosmetics'
import type { ProgressReport } from '../../shared/ranks'
import type { SettingsApi } from '../../preload/settings'

const bridge = (): SettingsApi => window.murmur

interface AchievementDef {
  id: string
  name: string
  hint: string
}

function Belt(props: { color: string; belt: string; stripes: number; founder: boolean }): React.JSX.Element {
  // 9th and 10th degree belts are solid red fabric with no rank bar,
  // which is what sets them apart from every rank below.
  const solid = props.belt === 'red'
  return (
    <div className="belt" style={{ background: props.color }}>
      {!solid && (
        <div className="belt-bar">
          {Array.from({ length: Math.min(props.stripes, 6) }, (_, i) => (
            <span className="belt-stripe" key={i} />
          ))}
        </div>
      )}
      {props.founder && (
        <span className="belt-crown" title="the founder">
          ♛
        </span>
      )}
    </div>
  )
}

export function JourneyView(): React.JSX.Element {
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

  if (!progress || !cosmetics) return <div className="home" />

  const earnedIds = new Set(earned.map((e) => e.id))

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

      ctx.fillStyle = dim
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
      <section className="panel">
        <div className="panel-head">
          <p className="micro-label">the journey</p>
          <button className="btn quiet-btn" onClick={() => void shareCard()} disabled={saving}>
            {saving ? 'Saving…' : 'Share card'}
          </button>
        </div>
        <div className="journey-hero">
          <Belt color={cosmetics.beltColor} belt={progress.rank.belt} stripes={progress.rank.stripes} founder={progress.founder} />
          <div>
            <h2 className="journey-rank">
              {progress.rank.label}
              <span className="level-chip" title="one level per hundred thousand words">
                lvl. {progress.level.toLocaleString()}
              </span>
            </h2>
            <p className="dim journey-title">"{progress.rank.title}"</p>
          </div>
        </div>
        {line && <p className="row-desc journey-line">{line}</p>}
      </section>

      {progress.next && (
        <section className="panel">
          <p className="micro-label">next: {progress.next.label}</p>
          {progress.words && (
            <div className="gate">
              <div className="gate-head">
                <span className="mono-inline dim">words</span>
                <span className="mono-inline dim">
                  {progress.words.have.toLocaleString()} / {progress.words.need.toLocaleString()}
                </span>
              </div>
              <div className="gate-track">
                <div className="gate-fill" style={{ width: `${Math.round(progress.words.pct * 100)}%` }} />
              </div>
            </div>
          )}
          {progress.activeDays && (
            <div className="gate">
              <div className="gate-head">
                <span className="mono-inline dim">days on the mat</span>
                <span className="mono-inline dim">
                  {progress.activeDays.have} / {progress.activeDays.need}
                </span>
              </div>
              <div className="gate-track">
                <div
                  className="gate-fill"
                  style={{ width: `${Math.round(progress.activeDays.pct * 100)}%` }}
                />
              </div>
            </div>
          )}
          <p className="row-desc rates-note">
            Both gates must close. Words come from dictating; days only from showing up.
          </p>
        </section>
      )}

      <section className="panel">
        <p className="micro-label">achievements</p>
        <div className="badge-grid">
          {defs.map((def) => {
            const got = earnedIds.has(def.id)
            return (
              <div className={`badge ${got ? 'badge-earned' : ''}`} key={def.id} title={def.hint}>
                <span className="badge-mark">{got ? '✓' : '·'}</span>
                <span className="badge-name">{def.name}</span>
                {!got && <span className="badge-hint">{def.hint}</span>}
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
