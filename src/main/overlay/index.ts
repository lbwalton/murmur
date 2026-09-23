// SPDX-License-Identifier: GPL-3.0-only
// The overlay window: a click-through, never-focusable pill pinned to the
// bottom center of the active display. Focus stealing would break
// insertion into the target app, so focusable stays false forever.
import { join } from 'node:path'
import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { watchWindow } from '../window-watch'
import { IpcChannels } from '../../shared/ipc'
import {
  OVERLAY_LOOKS,
  type OverlayLook,
  OverlayMachine,
  type OverlayMode,
  type OverlayPhase,
  type OverlayState,
  type TransitionExtras,
  normalizeOverlayLook
} from '../../shared/overlay-state'
import { NOTE_FOLDER_HINT } from '../../shared/notes'
import { getSettings, onSettingsChanged, updateSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'

const WIDTH = 340
const HEIGHT = 84
const MARGIN_BOTTOM = 28
const LINGER_MS = 1400
// A hint is text the user has to read, so it stays a beat longer.
const HINT_LINGER_MS = 2400

let overlayWindow: BrowserWindow | null = null
const machine = new OverlayMachine()
let lingerTimer: NodeJS.Timeout | null = null
let clickThrough = false
const previewTimers: NodeJS.Timeout[] = []

/** The overlay window, only while it is safe to touch. */
function aliveOverlay(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null
}

function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  win.setIgnoreMouseEvents(true)
  clickThrough = true
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  watchWindow(win, 'overlay')
  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void win.loadURL(`${devServer}/overlay/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay/index.html'))
  }
  return win
}

function positionOverlay(win: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  win.setBounds({
    x: Math.round(x + (width - WIDTH) / 2),
    y: Math.round(y + height - HEIGHT - MARGIN_BOTTOM),
    width: WIDTH,
    height: HEIGHT
  })
}

function sendState(state: OverlayState): void {
  aliveOverlay()?.webContents.send(IpcChannels.overlayState, state)
}

/** Drive the overlay. Illegal transitions are ignored, never thrown. */
export function setOverlayPhase(
  phase: OverlayPhase,
  wpm: number | null = null,
  extras: TransitionExtras = {}
): OverlayState | null {
  const state = machine.transition(phase, undefined, wpm, extras)
  if (!state || !overlayWindow) return state
  if (lingerTimer) {
    clearTimeout(lingerTimer)
    lingerTimer = null
  }

  const win = aliveOverlay()
  if (!win) return state
  // Recording and hint both start from rest, so both bring the pill up.
  if (phase === 'recording' || phase === 'hint') {
    positionOverlay(win)
    if (!isSmoke) win.showInactive()
  }
  sendState(state)

  if (phase === 'inserted' || phase === 'error' || phase === 'nospeech' || phase === 'hint') {
    lingerTimer = setTimeout(
      () => {
        setOverlayPhase('idle')
      },
      // An error that says why is read like a hint, so it lingers like one.
      phase === 'hint' || (phase === 'error' && state.hint) ? HINT_LINGER_MS : LINGER_MS
    )
  }
  if (phase === 'idle' && !isSmoke) win.hide()
  return state
}

/** A short message from rest: the pill says it, lingers, and hides.
 *  Refused while a session is live (the machine rejects the jump). */
export function showOverlayHint(text: string, mode: OverlayMode = 'dictation'): boolean {
  return setOverlayPhase('hint', null, { mode, hint: text }) !== null
}

export function getOverlayPhase(): OverlayPhase {
  return machine.get().phase
}

export function getOverlayState(): OverlayState {
  return machine.get()
}

/** Show the pill with synthetic levels for a moment: settings "preview". */
export function overlayPreviewBurst(durationMs = 2500): void {
  if (getOverlayPhase() !== 'idle') return
  if (!setOverlayPhase('recording')) return
  let t = 0
  const levels = setInterval(() => {
    t += 1
    const level = 0.12 + 0.1 * Math.abs(Math.sin(t / 3)) + 0.06 * Math.random()
    aliveOverlay()?.webContents.send(IpcChannels.overlayLevel, level)
  }, 33)
  const stop = setTimeout(() => {
    clearInterval(levels)
    setOverlayPhase('idle')
  }, durationMs)
  previewTimers.push(levels, stop)
}

async function resolveAccent(): Promise<string> {
  try {
    const { resolveAccentColor } = await import('../../shared/cosmetics')
    const { computeProgress } = await import('../../shared/ranks')
    const { evaluateAchievements } = await import('../../shared/achievements')
    const { readStatsHistory } = await import('../history')
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const cosmeticsSpec = (await import('../../../shared/cosmetics.json')).default
    const ranksSpec = (await import('../../../shared/ranks.json')).default
    const defs = (await import('../../../shared/achievements.json')).default
    const events = readStatsHistory()
    const founder = existsSync(join(app.getPath('userData'), 'founder'))
    const progress = computeProgress(events, ranksSpec as never, { founder })
    const earned = evaluateAchievements(events, defs as never)
    return resolveAccentColor(getSettings().cosmetics.accent, cosmeticsSpec as never, progress, earned)
  } catch {
    return '#f0a44b'
  }
}

/** The look in force: a design QA override, else the setting. The
 *  window itself stays one size in every look: it is transparent and
 *  click-through, so its bounds are invisible, and the pill inside it
 *  shrinks or sheds its box instead. */
function currentLook(): OverlayLook {
  // Smoke walks every look through the setting, so the QA override
  // must not be able to pin it there.
  const override = isSmoke ? undefined : process.env.MURMUR_OVERLAY_LOOK
  return normalizeOverlayLook(override ?? getSettings().overlay.look)
}

function sendOverlayConfig(): void {
  void (async () => {
    const style = process.env.MURMUR_OVERLAY_STYLE ?? getSettings().overlay.style
    const accent = await resolveAccent()
    aliveOverlay()?.webContents.send(IpcChannels.overlayConfig, { style, accent, look: currentLook() })
  })()
}

/** Re-resolve and resend the overlay config (promotions change accents). */
export function refreshOverlayConfig(): void {
  sendOverlayConfig()
}

export function initOverlay(): void {
  overlayWindow = createOverlayWindow()

  overlayWindow.webContents.on('did-finish-load', sendOverlayConfig)
  // Resolving the accent walks the whole history log; only do it when a
  // field that can affect the overlay actually changed (review gate
  // finding: every settings save was re-reading the entire log).
  let lastConfigKey = ''
  onSettingsChanged((settings) => {
    const key = `${settings.overlay.style}|${settings.overlay.look}|${settings.cosmetics.accent}`
    if (key === lastConfigKey) return
    lastConfigKey = key
    sendOverlayConfig()
  })

  // closable false means app.quit() can never close this window through
  // the normal path; it must be destroyed or quitting hangs forever.
  app.on('before-quit', () => {
    if (lingerTimer) clearTimeout(lingerTimer)
    for (const timer of previewTimers) clearTimeout(timer)
    previewTimers.length = 0
    overlayWindow?.destroy()
    overlayWindow = null
  })

  ipcMain.handle('overlay:preview', () => {
    overlayPreviewBurst()
  })

  // Design QA hook: MURMUR_OVERLAY_PREVIEW=1 shows the pill recording
  // with synthetic levels, no mic or hotkey needed; MURMUR_OVERLAY_MODE
  // =note shows the note state instead; MURMUR_OVERLAY_LOOK=compact or
  // bare draws that look.
  if (process.env.MURMUR_OVERLAY_PREVIEW === '1') {
    overlayWindow.webContents.once('did-finish-load', () => {
      const kickoff = setTimeout(() => {
        setOverlayPhase('recording', null, {
          mode: process.env.MURMUR_OVERLAY_MODE === 'note' ? 'note' : 'dictation'
        })
        let t = 0
        const levels = setInterval(() => {
          t += 1
          const level = 0.12 + 0.1 * Math.abs(Math.sin(t / 3)) + 0.06 * Math.random()
          aliveOverlay()?.webContents.send(IpcChannels.overlayLevel, level)
        }, 33)
        previewTimers.push(levels)
        // MURMUR_OVERLAY_CAPTURE=/path.png saves a shot of the pill and
        // exits: design QA without a screen, mic, or hotkey.
        const capturePath = process.env.MURMUR_OVERLAY_CAPTURE
        if (capturePath) {
          const shot = setTimeout(() => {
            const win = aliveOverlay()
            if (!win) {
              app.exit(1)
              return
            }
            void win.webContents.capturePage().then(async (image) => {
              const { writeFile } = await import('node:fs/promises')
              await writeFile(capturePath, image.toPNG())
              clearInterval(levels)
              app.exit(0)
            })
          }, 2000)
          previewTimers.push(shot)
        }
      }, 400)
      previewTimers.push(kickoff)
    })
  }

  // Live waveform: audio renderer posts levels, the overlay paints them.
  ipcMain.on(IpcChannels.audioLevel, (_event, level: number) => {
    if (machine.get().phase === 'recording') {
      aliveOverlay()?.webContents.send(IpcChannels.overlayLevel, level)
    }
  })

  registerSmokeCheck('overlayFlags', () => {
    if (!overlayWindow) return false
    return (
      !overlayWindow.isFocusable() &&
      overlayWindow.isAlwaysOnTop() &&
      clickThrough &&
      !overlayWindow.isDestroyed()
    )
  })

  registerSmokeCheck('overlayBridge', async () => {
    if (!overlayWindow) return false
    const kind = await overlayWindow.webContents.executeJavaScript('typeof window.murmurOverlay')
    return kind === 'object'
  })

  registerSmokeCheck('overlayHint', async () => {
    // The real hint text reaches the DOM with the note styling AND fits
    // inside the fixed pill (review gate 2026-09-18: the first cut
    // clipped the last word), idle clears it, and a hint mid-session
    // is refused.
    if (!overlayWindow) return false
    const read = (): Promise<string> => {
      return overlayWindow!.webContents.executeJavaScript(
        `(() => {
          const pill = document.querySelector('.pill')
          const box = pill ? pill.getBoundingClientRect() : null
          return JSON.stringify({
            phase: document.body.dataset.phase,
            mode: document.body.dataset.mode,
            hint: (document.querySelector('[data-hint]') || {}).textContent,
            note: document.querySelector('.pill-note') !== null,
            fits: box !== null && box.left >= 0 && box.right <= window.innerWidth
          })
        })()`
      )
    }
    if (!showOverlayHint(NOTE_FOLDER_HINT, 'note')) return false
    await new Promise((resolve) => setTimeout(resolve, 300))
    const shown = JSON.parse(await read()) as {
      phase: string
      mode: string
      hint: string | null
      note: boolean
      fits: boolean
    }
    setOverlayPhase('idle')
    await new Promise((resolve) => setTimeout(resolve, 80))
    const idle = JSON.parse(await read()) as { phase: string; note: boolean }
    setOverlayPhase('recording')
    const refused = !showOverlayHint('nope')
    setOverlayPhase('idle')
    return (
      shown.phase === 'hint' &&
      shown.mode === 'note' &&
      shown.hint === NOTE_FOLDER_HINT &&
      shown.note &&
      shown.fits &&
      idle.phase === 'idle' &&
      !idle.note &&
      refused
    )
  })

  registerSmokeCheck('overlayLooks', async () => {
    // Every look, live in the DOM (US-061): the pill keeps its box at
    // 56px, compact is the same box at 38px, bare paints no box and no
    // border while recording, and all three give a hint the full pill
    // that fits; the timer reads in each; focus and click-through hold
    // throughout. The setting is restored afterwards.
    if (!overlayWindow) return false
    interface Shape {
      look: string | undefined
      boxed: boolean
      height: number
      timer: string | null
      hint: string | null
      fits: boolean
    }
    const read = (): Promise<string> => {
      return overlayWindow!.webContents.executeJavaScript(
        `(() => {
          const pill = document.querySelector('.pill')
          const cs = pill ? getComputedStyle(pill) : null
          const box = pill ? pill.getBoundingClientRect() : null
          const clear = 'rgba(0, 0, 0, 0)'
          return JSON.stringify({
            look: document.body.dataset.look,
            boxed: cs !== null && cs.backgroundColor !== clear && cs.borderTopColor !== clear,
            height: box ? Math.round(box.height) : 0,
            timer: (document.querySelector('[data-timer]') || {}).textContent,
            hint: (document.querySelector('[data-hint]') || {}).textContent,
            fits: box !== null && box.left >= 0 && box.right <= window.innerWidth
          })
        })()`
      )
    }
    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    const original = getSettings().overlay.look
    try {
      for (const look of OVERLAY_LOOKS) {
        updateSettings({ overlay: { look } })
        // The config resolves the accent from the log before it is sent.
        await wait(300)
        if (!setOverlayPhase('recording')) return false
        await wait(150)
        const recording = JSON.parse(await read()) as Shape
        setOverlayPhase('idle')
        await wait(80)
        if (!showOverlayHint(NOTE_FOLDER_HINT, 'note')) return false
        await wait(150)
        const hint = JSON.parse(await read()) as Shape
        setOverlayPhase('idle')
        await wait(80)
        const flags = !overlayWindow.isFocusable() && overlayWindow.isAlwaysOnTop() && clickThrough
        const ok =
          recording.look === look &&
          recording.boxed === (look !== 'bare') &&
          typeof recording.timer === 'string' &&
          (look === 'bare' || recording.height === (look === 'compact' ? 38 : 56)) &&
          hint.boxed &&
          hint.height === 56 &&
          hint.fits &&
          hint.hint === NOTE_FOLDER_HINT &&
          flags
        if (!ok) {
          console.log('[murmur] overlayLooks failed for', look, JSON.stringify({ recording, hint, flags }))
          return false
        }
      }
      return true
    } finally {
      // Whatever failed, the next check must find the machine at rest
      // and the user's look back in place.
      setOverlayPhase('idle')
      updateSettings({ overlay: { look: original } })
      await wait(100)
    }
  })

  registerSmokeCheck('overlayStatesAndTimer', async () => {
    if (!overlayWindow) return false
    const read = (): Promise<string> => {
      return overlayWindow!.webContents.executeJavaScript(
        'JSON.stringify({ phase: document.body.dataset.phase, timer: (document.querySelector("[data-timer]")||{}).textContent })'
      )
    }
    if (!setOverlayPhase('recording')) return false
    await new Promise((resolve) => setTimeout(resolve, 1250))
    const recording = JSON.parse(await read()) as { phase: string; timer: string | null }
    setOverlayPhase('processing')
    await new Promise((resolve) => setTimeout(resolve, 80))
    const processing = JSON.parse(await read()) as { phase: string }
    setOverlayPhase('idle')
    await new Promise((resolve) => setTimeout(resolve, 80))
    const idle = JSON.parse(await read()) as { phase: string }
    return (
      recording.phase === 'recording' &&
      typeof recording.timer === 'string' &&
      /0:0[12]/.test(recording.timer) &&
      processing.phase === 'processing' &&
      idle.phase === 'idle'
    )
  })
}
