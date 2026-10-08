// SPDX-License-Identifier: GPL-3.0-only
// The overlay window: a click-through, never-focusable pill pinned to the
// bottom center of the active display. Focus stealing would break
// insertion into the target app, so focusable stays false forever.
import { join } from 'node:path'
import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { devRendererUrl, watchWindow } from '../window-watch'
import { reviveOnDeath } from '../revive'
import { IpcChannels } from '../../shared/ipc'
import {
  INK_STYLES,
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
import { pillPlace } from '../../shared/receipt'
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
  const devServer = devRendererUrl()
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
/** Preview plays the whole cycle without dictating: speaking, then a
 *  held processing phase long enough to show the drying sheen and its
 *  repeats (US-091), then the words landing. */
export function overlayPreviewBurst(durationMs = 2500, processingMs = 5000): void {
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
    if (!setOverlayPhase('processing')) return
    // Inserted lingers, then the pill rests on its own.
    previewTimers.push(setTimeout(() => setOverlayPhase('inserted'), processingMs))
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
    // Smoke walks the ink styles through the setting, so the QA override
    // must not pin the style there either.
    const style = (isSmoke ? undefined : process.env.MURMUR_OVERLAY_STYLE) ?? getSettings().overlay.style
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
  // A revived page (US-071) gets the phase too, so a dictation in
  // flight shows its state; at first launch this sends idle. Focus and
  // click-through belong to the window, which survives the death.
  overlayWindow.webContents.on('did-finish-load', () => sendState(machine.get()))
  reviveOnDeath(overlayWindow, 'overlay')
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

  registerSmokeCheck('overlayRevive', async () => {
    // The pill's renderer dies mid-dictation: the page comes back on its
    // own showing the phase and look it had. Dying again at rest, it
    // comes back hidden and idle. The window stays unfocusable either
    // way (US-071); click-through is set once on the window, which a
    // renderer death never touches.
    const win = aliveOverlay()
    if (!win) return false
    const read = (): Promise<{ phase?: string; look?: string; bridge?: string }> =>
      win.webContents
        .executeJavaScript(
          'JSON.stringify({ phase: document.body.dataset.phase, look: document.body.dataset.look, bridge: typeof window.murmurOverlay })'
        )
        .then((json: string) => JSON.parse(json))
    const die = async (): Promise<void> => {
      const loaded = new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
      win.webContents.forcefullyCrashRenderer()
      await loaded
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    if (!setOverlayPhase('recording', null, { mode: 'dictation' })) {
      console.error(`smoke overlayRevive: could not start from ${machine.get().phase}`)
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
    const before = await read()
    await die()
    const live = await read()
    setOverlayPhase('idle')
    await die()
    const rest = await read()
    const ok =
      live.bridge === 'object' &&
      live.phase === 'recording' &&
      live.look !== undefined &&
      live.look === before.look &&
      rest.bridge === 'object' &&
      rest.phase === 'idle' &&
      !win.isVisible() &&
      !win.isFocusable()
    if (!ok) {
      console.error(`smoke overlayRevive: before=${JSON.stringify(before)} live=${JSON.stringify(live)} rest=${JSON.stringify(rest)}`)
    }
    return ok
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
      hint?: string
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
      timer?: string
      hint?: string
      noted?: string
      notedFits: boolean
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
            noted: (document.querySelector('[data-wpm]') || {}).textContent,
            notedFits: (() => {
              const slot = document.querySelector('.status-slot')
              const r = slot ? slot.getBoundingClientRect() : null
              // The words are whole: no ellipsis took over (US-082 review).
              return r !== null && box !== null && r.height <= 20 && r.right <= box.right && r.left >= box.left &&
                slot.scrollWidth <= slot.clientWidth
            })(),
            fits: box !== null && box.left >= 0 && box.right <= window.innerWidth
          })
        })()`
      )
    }
    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    // Poll the live DOM until it shows what was asked, then hand back
    // whatever it shows so the assertions below report the real state.
    // One deadline for the whole check keeps even a badly broken run
    // inside the harness's ten second cap, so it still logs and its
    // finally still restores the phase and the look.
    const deadline = Date.now() + 7_000
    const until = async (ready: (shape: Shape) => boolean): Promise<Shape> => {
      let shape = JSON.parse(await read()) as Shape
      while (!ready(shape) && Date.now() < deadline) {
        await wait(50)
        shape = JSON.parse(await read()) as Shape
      }
      return shape
    }
    const LONGEST_PLACE = pillPlace('Notes/quarterly-planning.md', 'folder')
    const original = getSettings().overlay.look
    try {
      for (const look of OVERLAY_LOOKS) {
        updateSettings({ overlay: { look } })
        // The config resolves the accent from the log before it is
        // sent, so wait for the renderer to report the look rather than
        // guess a delay (a busy machine made fixed waits flake).
        await until((shape) => shape.look === look)
        if (!setOverlayPhase('recording')) return false
        const recording = await until((shape) => typeof shape.timer === 'string')
        setOverlayPhase('idle')
        await until((shape) => shape.timer === undefined)
        if (!showOverlayHint(NOTE_FOLDER_HINT, 'note')) return false
        const hint = await until((shape) => shape.hint === NOTE_FOLDER_HINT && shape.height === 56)
        setOverlayPhase('idle')
        await until((shape) => shape.hint === undefined)
        // A saved note names where it landed on one line (US-082), and
        // the longest place the pill can say still fits its window.
        setOverlayPhase('recording', null, { mode: 'note' })
        setOverlayPhase('processing')
        setOverlayPhase('inserted', 12, { hint: LONGEST_PLACE })
        const noted = await until((shape) => shape.noted === `noted to ${LONGEST_PLACE}`)
        setOverlayPhase('idle')
        await until((shape) => shape.noted === undefined)
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
          noted.noted === `noted to ${LONGEST_PLACE}` &&
          noted.notedFits &&
          noted.fits &&
          flags
        if (!ok) {
          console.error('smoke overlayLooks: failed for', look, JSON.stringify({ recording, hint, noted, flags }))
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

  // Every ink style (US-074) in every look, live in the DOM, one check
  // per style so each has its own time budget: the style's canvas
  // mounts, reports a recording frame with paint on it, and keeps
  // changing across two reads at least 100 ms apart (the loop really
  // runs), while the window keeps its flags. The user's style and look
  // are restored afterwards.
  interface Ink {
    look: string | undefined
    phase: string | undefined
    ink: string | null
    /** The mode the canvas last painted, stamped by InkWave. */
    mode: string | null
    painted: number
    /** A cheap fingerprint of the whole canvas. */
    print: number
    /** Ms into processing by the renderer's own clock, at its last frame. */
    procMs: number | null
    /** Diagnostic only (2026-10-08 CI investigation): whether this
     *  WebContents itself reports prefers-reduced-motion as reduce,
     *  which would explain overlayInkSheen never animating a repeat
     *  (sheenFor returns nothing under reduced motion, by design). */
    reduced: boolean
  }
  const readInk = async (win: BrowserWindow): Promise<Ink> =>
    JSON.parse(
      await win.webContents.executeJavaScript(
        `(() => {
          const c = document.querySelector('canvas[data-ink]')
          let painted = 0, print = 0
          if (c && c.width > 0 && c.height > 0) {
            const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data
            for (let i = 3; i < d.length; i += 4) {
              if (d[i] > 8) painted++
              print = (print * 31 + d[i] + d[i - 1]) % 1000000007
            }
          }
          return JSON.stringify({ look: document.body.dataset.look, phase: document.body.dataset.phase, ink: c ? c.dataset.ink : null, mode: c ? c.dataset.mode || null : null, painted, print, procMs: c && c.dataset.procMs ? Number(c.dataset.procMs) : null, reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
        })()`
      )
    ) as Ink
  const inkWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  for (const style of INK_STYLES) {
    registerSmokeCheck(`overlayInk-${style}`, async () => {
      const win = aliveOverlay()
      if (!win) return false
      // Each look gets its own fresh budget below: bare costs more to
      // paint than pill or compact (it composites through an offscreen
      // buffer), and it runs last. A single deadline shared across all
      // three looks let pill and compact spend it down on a loaded or
      // GPU-less CI runner, starving bare before it ever got a turn
      // (caught on the Windows CI runner, 2026-10-08).
      let deadline = Date.now() + 8_000
      const until = async (ready: (ink: Ink) => boolean, voice = false): Promise<Ink> => {
        let ink = await readInk(win)
        while (!ready(ink) && Date.now() < deadline) {
          // A synthetic voice, so dabs and ribbon have height to paint.
          if (voice) win.webContents.send(IpcChannels.overlayLevel, 0.22)
          await inkWait(40)
          ink = await readInk(win)
        }
        return ink
      }
      const original = { style: getSettings().overlay.style, look: getSettings().overlay.look }
      try {
        for (const look of OVERLAY_LOOKS) {
          deadline = Date.now() + 8_000
          updateSettings({ overlay: { style, look } })
          await until((ink) => ink.look === look && ink.ink === style)
          if (!setOverlayPhase('recording')) return false
          const live = await until((ink) => ink.mode === 'rec' && ink.painted > 40, true)
          const t1 = Date.now()
          const second = await until((ink) => ink.print !== live.print && Date.now() - t1 >= 100, true)
          const t2 = Date.now()
          const third = await until((ink) => ink.print !== second.print && Date.now() - t2 >= 100, true)
          setOverlayPhase('idle')
          await until((ink) => ink.phase === 'idle')
          const flags = !win.isFocusable() && win.isAlwaysOnTop() && clickThrough
          const animating =
            second.print !== live.print && third.print !== second.print && third.mode === 'rec' && third.painted > 40
          if (!(live.ink === style && live.look === look && live.mode === 'rec' && live.painted > 40 && animating && flags)) {
            console.log('[murmur] overlayInk failed for', style, look, JSON.stringify({ live, second, third, flags }))
            return false
          }
        }
        return true
      } finally {
        setOverlayPhase('idle')
        updateSettings({ overlay: original })
        await inkWait(100)
      }
    })
  }

  // The repeating sheen (US-091): while processing runs long the ink
  // keeps moving. The paint goes still once the first sheen has crossed;
  // past the 2 second mark it must change again. Without the repeat the
  // loop stops after the settle time and nothing changes there. Timed by
  // the renderer's own clock (procMs), so a loaded machine slows the
  // check down instead of failing it.
  //
  // The actual root cause (found with the reduced-motion diagnostic
  // logged above, 2026-10-08): both the macOS and Windows hosted GitHub
  // runners report prefers-reduced-motion: reduce by default (no user
  // has ever opened an accessibility pane on them), and sheenFor is
  // designed to never animate a sheen under reduced motion. That is the
  // product working exactly as specified; the check needs to exercise
  // the non-reduced path it actually exists to verify, regardless of
  // the CI browser's default. The two fixes before this one (window
  // visibility, then removing the renderer's nap timer) were both real
  // improvements but neither could have mattered here.
  registerSmokeCheck('overlayInkSheen', async () => {
    const win = aliveOverlay()
    if (!win) return false
    // Force prefers-reduced-motion: reduce to read as false for the
    // rest of this check, restored in the finally block below. Scoped
    // to one query string so anything else that ever calls matchMedia
    // on this page is unaffected.
    await win.webContents.executeJavaScript(
      `(() => {
        if (!window.__murmurRealMatchMedia) {
          window.__murmurRealMatchMedia = window.matchMedia.bind(window)
          window.matchMedia = (q) =>
            typeof q === 'string' && q.includes('prefers-reduced-motion')
              ? { matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, onchange: null, dispatchEvent(){ return true } }
              : window.__murmurRealMatchMedia(q)
        }
      })()`
    )
    const original = { style: getSettings().overlay.style, look: getSettings().overlay.look }
    try {
      updateSettings({ overlay: { style: 'dabs', look: 'pill' } })
      for (let i = 0; i < 50 && (await readInk(win)).ink !== 'dabs'; i++) await inkWait(40)
      if (!setOverlayPhase('recording')) return false
      if (isSmoke) win.showInactive()
      for (let t = 0; t < 600; t += 40) {
        win.webContents.send(IpcChannels.overlayLevel, 0.22)
        await inkWait(40)
      }
      setOverlayPhase('processing')
      // Still and moved each get their own fresh budget: a loaded or
      // GPU-less CI runner can legitimately spend most of one window
      // just reaching the first still frame, and sharing a single
      // deadline between the two phases left the repeat with almost
      // nothing to prove itself in (caught on the macOS CI runner,
      // 2026-10-08).
      let deadline = Date.now() + 8_000
      // Still: drying (600 ms) and the first sheen (about 800 ms) are done.
      let still = await readInk(win)
      while (!(still.mode === 'proc' && (still.procMs ?? 0) >= 1000) && Date.now() < deadline) {
        await inkWait(40)
        still = await readInk(win)
      }
      let moved = false
      let last = still
      deadline = Date.now() + 8_000
      while (!moved && Date.now() < deadline) {
        await inkWait(40)
        last = await readInk(win)
        moved = last.mode === 'proc' && (last.procMs ?? 0) >= 2000 && last.print !== still.print
      }
      if (!moved) {
        console.error(
          `smoke overlayInkSheen: no repeat sheen; still=${still.mode}@${still.procMs} last=${last.mode}@${last.procMs} reduced=${last.reduced}`
        )
      }
      return still.mode === 'proc' && moved
    } finally {
      setOverlayPhase('idle')
      // Back to the hidden state every other smoke check expects.
      if (isSmoke) win.hide()
      updateSettings({ overlay: original })
      await win.webContents.executeJavaScript(
        `(() => {
          if (window.__murmurRealMatchMedia) {
            window.matchMedia = window.__murmurRealMatchMedia
            delete window.__murmurRealMatchMedia
          }
        })()`
      )
      await inkWait(100)
    }
  })

  // Design QA for the ink styles: MURMUR_INK_SHOTS=<dir> with npm run
  // smoke saves each style in each look after most of a second of a synthetic
  // voice, plus the drying state in the pill, one check per shot so
  // none can outrun the per-check timeout. Smoke's throwaway profile
  // and mocks mean no hotkey, mic, or real settings.
  const shotsDir = process.env.MURMUR_INK_SHOTS
  if (isSmoke && shotsDir) {
    for (const style of INK_STYLES) {
      for (const look of OVERLAY_LOOKS) {
        registerSmokeCheck(`overlayInkShot-${style}-${look}`, async () => {
          const win = aliveOverlay()
          if (!win) return false
          const { writeFile } = await import('node:fs/promises')
          const shoot = async (name: string): Promise<void> => {
            const image = await win.webContents.capturePage()
            await writeFile(join(shotsDir, `${name}.png`), image.toPNG())
          }
          const original = { style: getSettings().overlay.style, look: getSettings().overlay.look }
          try {
            updateSettings({ overlay: { style, look } })
            await inkWait(250)
            if (!setOverlayPhase('recording')) return false
            for (let t = 0; t < 900; t += 33) {
              const level = 0.04 + 0.2 * Math.abs(Math.sin(t / 110)) * (0.5 + 0.5 * Math.abs(Math.sin(t / 430)))
              win.webContents.send(IpcChannels.overlayLevel, level)
              await inkWait(33)
            }
            await shoot(`${style}-${look}`)
            if (look === 'pill') {
              setOverlayPhase('processing')
              await inkWait(320)
              await shoot(`${style}-${look}-drying`)
              setOverlayPhase('error')
              await inkWait(200)
              await shoot(`${style}-${look}-error`)
            }
            return true
          } finally {
            setOverlayPhase('idle')
            updateSettings({ overlay: original })
            await inkWait(100)
          }
        })
      }
    }
  }

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
