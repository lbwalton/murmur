// SPDX-License-Identifier: GPL-3.0-only
// The overlay window: a click-through, never-focusable pill pinned to the
// bottom center of the active display. Focus stealing would break
// insertion into the target app, so focusable stays false forever.
import { join } from 'node:path'
import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { IpcChannels } from '../../shared/ipc'
import { OverlayMachine, type OverlayPhase, type OverlayState } from '../../shared/overlay-state'
import { getSettings, onSettingsChanged } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'

const WIDTH = 340
const HEIGHT = 84
const MARGIN_BOTTOM = 28
const LINGER_MS = 1400

let overlayWindow: BrowserWindow | null = null
const machine = new OverlayMachine()
let lingerTimer: NodeJS.Timeout | null = null
let clickThrough = false

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
  overlayWindow?.webContents.send(IpcChannels.overlayState, state)
}

/** Drive the overlay. Illegal transitions are ignored, never thrown. */
export function setOverlayPhase(phase: OverlayPhase): OverlayState | null {
  const state = machine.transition(phase)
  if (!state || !overlayWindow) return state
  if (lingerTimer) {
    clearTimeout(lingerTimer)
    lingerTimer = null
  }

  if (phase === 'recording') {
    positionOverlay(overlayWindow)
    if (!isSmoke) overlayWindow.showInactive()
  }
  sendState(state)

  if (phase === 'inserted' || phase === 'error' || phase === 'nospeech') {
    lingerTimer = setTimeout(() => {
      setOverlayPhase('idle')
    }, LINGER_MS)
  }
  if (phase === 'idle' && !isSmoke) overlayWindow.hide()
  return state
}

export function getOverlayPhase(): OverlayPhase {
  return machine.get().phase
}

/** Show the pill with synthetic levels for a moment: settings "preview". */
export function overlayPreviewBurst(durationMs = 2500): void {
  if (getOverlayPhase() !== 'idle') return
  if (!setOverlayPhase('recording')) return
  let t = 0
  const levels = setInterval(() => {
    t += 1
    const level = 0.12 + 0.1 * Math.abs(Math.sin(t / 3)) + 0.06 * Math.random()
    overlayWindow?.webContents.send(IpcChannels.overlayLevel, level)
  }, 33)
  setTimeout(() => {
    clearInterval(levels)
    setOverlayPhase('idle')
  }, durationMs)
}

function sendOverlayConfig(): void {
  const style = process.env.MURMUR_OVERLAY_STYLE ?? getSettings().overlay.style
  overlayWindow?.webContents.send(IpcChannels.overlayConfig, { style })
}

export function initOverlay(): void {
  overlayWindow = createOverlayWindow()

  overlayWindow.webContents.on('did-finish-load', sendOverlayConfig)
  onSettingsChanged(sendOverlayConfig)

  // closable false means app.quit() can never close this window through
  // the normal path; it must be destroyed or quitting hangs forever.
  app.on('before-quit', () => {
    if (lingerTimer) clearTimeout(lingerTimer)
    overlayWindow?.destroy()
    overlayWindow = null
  })

  ipcMain.handle('overlay:preview', () => {
    overlayPreviewBurst()
  })

  // Design QA hook: MURMUR_OVERLAY_PREVIEW=1 shows the pill recording
  // with synthetic levels, no mic or hotkey needed.
  if (process.env.MURMUR_OVERLAY_PREVIEW === '1') {
    overlayWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        setOverlayPhase('recording')
        let t = 0
        setInterval(() => {
          t += 1
          const level = 0.12 + 0.1 * Math.abs(Math.sin(t / 3)) + 0.06 * Math.random()
          overlayWindow?.webContents.send(IpcChannels.overlayLevel, level)
        }, 33)
        // MURMUR_OVERLAY_CAPTURE=/path.png saves a shot of the pill and
        // exits: design QA without a screen, mic, or hotkey.
        const capturePath = process.env.MURMUR_OVERLAY_CAPTURE
        if (capturePath) {
          setTimeout(() => {
            void overlayWindow?.webContents.capturePage().then(async (image) => {
              const { writeFile } = await import('node:fs/promises')
              await writeFile(capturePath, image.toPNG())
              app.exit(0)
            })
          }, 2000)
        }
      }, 400)
    })
  }

  // Live waveform: audio renderer posts levels, the overlay paints them.
  ipcMain.on(IpcChannels.audioLevel, (_event, level: number) => {
    if (machine.get().phase === 'recording') {
      overlayWindow?.webContents.send(IpcChannels.overlayLevel, level)
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
