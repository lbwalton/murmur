// SPDX-License-Identifier: GPL-3.0-only
// The share card's preview (US-078): the card painted from your last
// thirty days, shown at full resolution, and Save card writes exactly
// that canvas to a PNG through a save dialog. Nothing is sent anywhere.
import { useEffect, useRef, useState } from 'react'
import cosmeticsFile from '../../../shared/cosmetics.json'
import type { SettingsApi } from '../../preload/settings'
import { journeyColors } from './journeyPaint'
import { CARD_DAYS, CARD_H, CARD_W, type CardData, type CardDay, paintShareCard } from './cardPaint'

const bridge = (): SettingsApi => window.murmur
const BELT_HEX = (cosmeticsFile as { beltColors: Record<string, string> }).beltColors

/** The display face's family name in this window. */
export const DISPLAY = 'murmur display'
let faceLoad: Promise<boolean> | null = null

/** Loads Bricolage Grotesque from the build's fonts folder once; false
 *  when it is not there (a build made offline), and the system face
 *  stands in. */
export function loadDisplayFace(): Promise<boolean> {
  faceLoad ??= (async () => {
    try {
      const url = new URL('../fonts/bricolage-grotesque-display.woff2', window.location.href).href
      const face = new FontFace(DISPLAY, `url("${url}")`, { weight: '800', stretch: '75% 85%' })
      await face.load()
      document.fonts.add(face)
      return true
    } catch {
      return false
    }
  })()
  return faceLoad
}

/** The last thirty days, oldest first, totaled in main from the whole
 *  log (the history list the window holds is capped). */
async function lastDays(): Promise<CardDay[]> {
  return bridge().getRecentDays()
}

const SCALE = 2

export function ShareCardDialog(props: { card: Omit<CardData, 'days'>; onClose: () => void }): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('')
  const [returnTo] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const closeRef = useRef(props.onClose)
  closeRef.current = props.onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    let live = true
    void Promise.all([lastDays(), loadDisplayFace()]).then(([days, hasFace]) => {
      const canvas = canvasRef.current
      if (!live || !canvas) return
      canvas.width = CARD_W * SCALE
      canvas.height = CARD_H * SCALE
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
      const css = getComputedStyle(document.documentElement)
      const body = css.getPropertyValue('--font-body').trim() || 'sans-serif'
      paintShareCard(ctx, { ...props.card, days }, journeyColors(BELT_HEX), {
        display: hasFace ? `"${DISPLAY}", ${body}` : `"Arial Narrow", "Helvetica Neue", ${body}`,
        body,
        mono: css.getPropertyValue('--font-mono').trim() || 'monospace'
      })
      setReady(true)
    })
    return () => {
      live = false
    }
    // The card's data, not the object around it, decides a repaint.
  }, [props.card.rank.id, props.card.level, props.card.founder])

  const close = (): void => {
    dialogRef.current?.close()
    returnTo?.focus({ preventScroll: true })
    closeRef.current()
  }

  const save = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (!canvas) return
    setStatus('Saving…')
    const saved = await bridge().saveShareCard(canvas.toDataURL('image/png'))
    setStatus(saved ? 'Saved.' : '')
  }

  return (
    <dialog
      ref={dialogRef}
      className="share-dialog"
      aria-labelledby="share-title"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <div className="share-head">
        <h2 id="share-title">Your share card</h2>
        <p className="dim">Painted from your last {CARD_DAYS} days: a stroke for each day you dictated, ember on your three biggest.</p>
      </div>
      <canvas
        ref={canvasRef}
        className="share-canvas"
        role="img"
        aria-label={`Share card: ${props.card.rank.label}, painted from your last ${CARD_DAYS} days`}
      />
      <div className="share-actions">
        <span className="dim" aria-live="polite">
          {status}
        </span>
        <button className="btn" onClick={() => void save()} disabled={!ready}>
          Save card
        </button>
        <button className="btn quiet-btn" onClick={close} autoFocus>
          Close
        </button>
      </div>
    </dialog>
  )
}
