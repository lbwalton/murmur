// SPDX-License-Identifier: GPL-3.0-only
// Report a problem (US-182), the main process half. It reads the facts
// only main can (the version, the system, the window), takes a picture
// of murmur's own settings window and nothing else on screen, and opens
// the person's browser at murmur's new issue form. murmur sends nothing
// itself: every byte leaves by the person's own click, in their own
// browser or mail app, after they have seen all of it.
import { readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { type BrowserWindow, ClipboardItem, app, clipboard, dialog, nativeImage, screen, shell } from 'electron'
import { knownMicNames } from './audio'
import { getCatalog } from './catalog'
import { ipc } from './ipc'
import { boundedText } from './ipc-rules'
import { getPolishApiKey, getSettings, listSavedKeyBaseUrls, updateSettings } from './settings'
import { registerSmokeCheck } from './smoke'
import { trayMenuLabels } from './tray'
import { writeAppLog } from './window-watch'
import {
  type ProblemDraft,
  type ProblemFacts,
  type ProblemFields,
  type ProblemView,
  asProblemView,
  buildProblemDetails,
  isProblemIssueUrl,
  planIssue,
  problemText
} from '../shared/problem'

export interface ProblemDeps {
  settingsWindow: () => BrowserWindow | null
  showSettingsWindow: () => void
  /** The window's look, and why it is solid when it is (US-150). */
  look: () => { look: 'glass' | 'solid'; reason: string | null }
}

/** The tray item's label; the smoke check looks for it. */
export const TRAY_LABEL = 'Report a problem…'

// A screenshot of a 300 percent zoomed window on a big screen fits well
// inside this; anything bigger is not one of ours.
const MAX_SHOT_BYTES = 48 * 1024 * 1024
// Each text box is bounded before anything reads it.
const MAX_FIELD_CHARS = 200_000
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

let deps: ProblemDeps | null = null

/** What a tray click left for the window: the screenshot taken before
 *  the window came forward, if it was showing. The page takes it once. */
let pending: { shot: Uint8Array | null; hidden: boolean } | null = null

function logFile(): string {
  return join(app.getPath('userData'), 'logs', 'murmur.log')
}

/** The end of the log and of its last rotated copy, enough for the
 *  newest lines that pass the filter. */
function logText(): string {
  const read = (file: string): string => {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return ''
    }
  }
  const lines = `${read(`${logFile()}.1`)}\n${read(logFile())}`.split('\n')
  return lines.slice(Math.max(0, lines.length - 800)).join('\n')
}

function username(): string {
  try {
    return userInfo().username
  } catch {
    return ''
  }
}

function liveWindow(): BrowserWindow | null {
  const win = deps?.settingsWindow() ?? null
  return win && !win.isDestroyed() ? win : null
}

function showing(win: BrowserWindow | null): win is BrowserWindow {
  return win !== null && win.isVisible() && !win.isMinimized()
}

/** The facts only main can read, none of them typed by the person. */
export function problemFacts(): ProblemFacts {
  const win = liveWindow()
  const shown = showing(win)
  const [width, height] = shown ? win.getContentSize() : [0, 0]
  const display = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()
  const look = deps?.look() ?? { look: 'solid' as const, reason: null }
  return {
    version: app.getVersion(),
    platform: process.platform,
    osVersion: process.getSystemVersion(),
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    scaleFactor: display.scaleFactor,
    windowSize: shown ? { width, height } : null,
    zoom: win ? win.webContents.getZoomFactor() : null,
    look: look.look,
    lookReason: look.reason,
    locale: app.getLocale(),
    home: homedir(),
    username: username(),
    micLabels: knownMicNames()
  }
}

/** The details and log the panel shows, read fresh each time. */
export function problemDraft(view: ProblemView): ProblemDraft {
  return buildProblemDetails({
    settings: getSettings(),
    catalog: getCatalog(),
    keys: { ring: listSavedKeyBaseUrls(), cleanupKey: getPolishApiKey() !== null },
    facts: problemFacts(),
    view,
    log: logText()
  })
}

/** A picture of murmur's settings window as it is drawn, and nothing
 *  else on screen: no Screen Recording permission, no other app, no
 *  desktop. Null when the window is not showing. */
export async function captureSettingsWindow(): Promise<Uint8Array | null> {
  const win = liveWindow()
  if (!showing(win)) return null
  try {
    const image = await win.webContents.capturePage()
    return image.isEmpty() ? null : new Uint8Array(image.toPNG())
  } catch {
    return null
  }
}

/** PNG bytes the page flattened, or null for anything else. */
function shotImage(value: unknown): Electron.NativeImage | null {
  if (!(value instanceof Uint8Array) || value.byteLength < PNG.length || value.byteLength > MAX_SHOT_BYTES) return null
  if (!PNG.every((byte, i) => value[i] === byte)) return null
  const image = nativeImage.createFromBuffer(Buffer.from(value))
  return image.isEmpty() ? null : image
}

/** Puts the screenshot on the clipboard as an image, ready to paste. */
async function copyShot(value: unknown): Promise<boolean> {
  const image = shotImage(value)
  if (!image) return false
  try {
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })])
    return true
  } catch {
    return false
  }
}

function fieldsFrom(value: unknown): ProblemFields | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const what = boundedText(v.what, MAX_FIELD_CHARS)
  const expected = boundedText(v.expected, MAX_FIELD_CHARS)
  const details = boundedText(v.details, MAX_FIELD_CHARS)
  const log = boundedText(v.log, MAX_FIELD_CHARS)
  if (what === null || expected === null || details === null || log === null || what.trim() === '') return null
  return { what, expected, details, log }
}

export type IssueOutcome =
  | { outcome: 'opened'; mode: 'link' | 'paste'; dropped: number; copied: 'shot' | 'text' | 'none' }
  | { outcome: 'failed'; copied: 'text' }
  | { outcome: 'refused' }

/** Builds the link here, from the person's own words, checks it is
 *  exactly murmur's new issue form, and only then opens it. */
async function openIssue(value: unknown, shot: unknown): Promise<IssueOutcome> {
  const fields = fieldsFrom(value)
  if (!fields) return { outcome: 'refused' }
  const plan = planIssue(fields)
  if (!isProblemIssueUrl(plan.url)) {
    writeAppLog('[problem] refused a link that is not the issue form')
    return { outcome: 'refused' }
  }
  // 1 clipboard: a report too long for the link takes it, and the
  // screenshot waits for the panel's Copy screenshot.
  let copied: 'shot' | 'text' | 'none' = 'none'
  if (plan.mode === 'paste') {
    await clipboard.writeText(plan.report)
    copied = 'text'
  } else if (shot !== null && shot !== undefined && (await copyShot(shot))) {
    copied = 'shot'
  }
  try {
    await shell.openExternal(plan.url)
  } catch {
    // No browser answered: the whole report is copied, so nothing is lost.
    await clipboard.writeText(problemText(fields)).catch(() => undefined)
    writeAppLog('[problem] the browser did not open; copied the report')
    return { outcome: 'failed', copied: 'text' }
  }
  const dropped = plan.mode === 'link' ? plan.dropped : 0
  writeAppLog(`[problem] opened the issue form mode=${plan.mode} dropped=${dropped} copied=${copied}`)
  return { outcome: 'opened', mode: plan.mode, dropped, copied }
}

/** The tray's Report a problem…: a picture of the window if it is
 *  showing, taken before it comes forward, then the panel. A closed or
 *  hidden window gets no picture: the panel says how to take one. */
export async function reportProblemFromTray(): Promise<void> {
  if (!deps) return
  const shown = showing(liveWindow())
  const shot = shown ? await captureSettingsWindow() : null
  deps.showSettingsWindow()
  handProblemToWindow(shot, !shown)
}

/** Leaves the tray's picture for the page and tells it. A page still
 *  loading asks for it as it mounts. */
export function handProblemToWindow(shot: Uint8Array | null, hidden: boolean): void {
  pending = { shot, hidden }
  const target = liveWindow()
  if (target && !target.webContents.isLoading()) target.webContents.send('problem:open')
}

export function initProblem(input: ProblemDeps): void {
  deps = input

  ipc.handle('problem:draft', (_event, view: unknown) => problemDraft(asProblemView(view) ?? { page: 'home', section: null }))
  ipc.handle('problem:capture', () => captureSettingsWindow())
  ipc.handle('problem:pending', () => {
    const taken = pending
    pending = null
    return taken
  })
  ipc.handle('problem:openIssue', (_event, fields: unknown, shot: unknown) => openIssue(fields, shot))
  ipc.handle('problem:copyShot', (_event, shot: unknown) => copyShot(shot))
  ipc.handle('problem:saveShot', async (_event, shot: unknown) => {
    const image = shotImage(shot)
    // Parented to the settings window, so it never opens buried (US-047).
    const target = liveWindow()
    if (!image || !target) return false
    const { writeFile } = await import('node:fs/promises')
    const { canceled, filePath } = await dialog.showSaveDialog(target, {
      defaultPath: `murmur-problem-${new Date().toISOString().slice(0, 10)}.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (canceled || !filePath) return false
    await writeFile(filePath, image.toPNG())
    return true
  })

  registerSmokeCheck('problemReport', async () => {
    // The leak assertions must be able to fail: plant a dictionary word,
    // a custom endpoint, a home folder path and a mic sentence in the
    // log, prove the report keeps the lines but never those, then put
    // the settings back (the diagnostics check's pattern).
    const before = getSettings()
    updateSettings({
      dictionary: [{ from: 'smokeproblemprobe', to: 'SmokeProblemProbe' }],
      trustedHttpHosts: ['smokeprobe-lan.example']
    })
    const home = homedir()
    writeAppLog(`[dictation] smoke problem probe ${home}/murmur at http://smokeprobe-lan.example:8080/v1/audio`)
    writeAppLog('[transcribe] failed kind=network detail=getaddrinfo ENOTFOUND smokeprobe-lan.example model=smoke-model baseUrl=http://smokeprobe-lan.example:8080/v1')
    writeAppLog('[window:audio] renderer-error file:///x.js:1 [murmur] capture on smokeprobe headset')
    const draft = problemDraft({ page: 'setup', section: 'system' })
    updateSettings({ dictionary: before.dictionary, trustedHttpHosts: before.trustedHttpHosts })
    const everything = `${draft.details}\n${draft.log.join('\n')}`
    const plan = planIssue({ what: 'smoke', expected: '', details: draft.details, log: draft.log.join('\n') })
    const ok =
      draft.details.startsWith(`murmur ${app.getVersion()} on `) &&
      draft.details.includes('Showing: Settings, System') &&
      draft.log.some((line) => line.includes('[dictation] smoke problem probe ~/murmur at [custom endpoint]')) &&
      draft.log.some((line) => line.includes('detail=ENOTFOUND model=smoke-model baseUrl=[custom endpoint]')) &&
      draft.log.some((line) => line.includes('capture on [mic]')) &&
      !/smokeprobe|smokeproblemprobe/.test(everything) &&
      (home.length < 2 || !everything.includes(home)) &&
      plan.mode === 'link' &&
      isProblemIssueUrl(plan.url) &&
      !isProblemIssueUrl(plan.url.replace('lbwalton/murmur', 'lbwalton/murmurx')) &&
      trayMenuLabels().includes(TRAY_LABEL) &&
      // Smoke's window is hidden, so the tray's rule gives no picture.
      (await captureSettingsWindow()) === null
    if (!ok) console.error(`smoke problemReport: details=${JSON.stringify(draft.details)} log=${draft.log.length} lines`)
    return ok
  })
}
