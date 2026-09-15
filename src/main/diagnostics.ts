// SPDX-License-Identifier: GPL-3.0-only
// The diagnostics report: one text file a user can read, keep, or hand
// to support. Built entirely from local state and the content-free log.
// Nothing here auto-sends, ever: the report exists only where the user
// saves it and goes only where the user sends it. It must never
// contain transcript text, dictionary or expansion contents, or key
// material in any form.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BrowserWindow, app, ipcMain } from 'electron'
import { getHotkeysStatus } from './hotkeys'
import { getSettings, updateSettings } from './settings'
import { registerSmokeCheck } from './smoke'

const LOG_TAIL_LINES = 200

function logFile(): string {
  return join(app.getPath('userData'), 'logs', 'murmur.log')
}

function logTail(): string {
  try {
    const lines = readFileSync(logFile(), 'utf8').split('\n')
    return lines.slice(Math.max(0, lines.length - LOG_TAIL_LINES)).join('\n')
  } catch {
    return '(no log file yet)'
  }
}

/** The report body. Exported so smoke can assert its shape offline. */
export function buildDiagnosticsReport(): string {
  const settings = getSettings()
  const hotkeys = getHotkeysStatus()
  const lines = [
    `murmur diagnostics report`,
    `generated: ${new Date().toISOString()}`,
    `version: ${app.getVersion()}`,
    `platform: ${process.platform} ${process.arch}`,
    `os: ${process.getSystemVersion()}`,
    `uptimeSeconds: ${Math.round(process.uptime())}`,
    ``,
    `hookStarted: ${hotkeys.hookStarted}`,
    `bindingValid: ${hotkeys.bindingValid}`,
    `pasteBindingValid: ${hotkeys.pasteBindingValid}`,
    ``,
    `provider.baseUrl: ${settings.provider.baseUrl}`,
    `provider.sttModel: ${settings.provider.sttModel}`,
    `provider.llmModel: ${settings.provider.llmModel}`,
    `provider.keySavedForBaseUrl: ${settings.provider.keySavedForBaseUrl || '(unknown)'}`,
    `polish.enabled: ${settings.polish.enabled}`,
    `polish.baseUrl: ${settings.polish.baseUrl || '(unset)'}`,
    `formatting: level=${settings.formatting.level} numbers=${settings.formatting.numbers} smartLists=${settings.formatting.smartLists}`,
    `insertion.mode: ${settings.insertion.mode}`,
    `hotkey: mode=${settings.hotkey.mode} binding=${settings.hotkey.binding} pasteLast=${settings.hotkey.pasteLastBinding || '(unset)'}`,
    `dictionaryEntries: ${settings.dictionary.length}`,
    `expansionEntries: ${settings.expansions.length}`,
    `catalogRefresh: ${settings.catalogRefresh}`,
    ``,
    `recent log (${LOG_TAIL_LINES} lines max):`,
    logTail()
  ]
  return lines.join('\n')
}

export function initDiagnostics(settingsWindow: () => BrowserWindow | null): void {
  ipcMain.handle('diag:save', async () => {
    // Parented to the settings window: a parentless dialog from a
    // Dock-hidden accessory app can open buried behind the active app,
    // the same failure the tray raise fix closed (review gate finding).
    const target = settingsWindow()
    if (!target || target.isDestroyed()) return false
    const { dialog } = await import('electron')
    const { writeFile } = await import('node:fs/promises')
    const { canceled, filePath } = await dialog.showSaveDialog(target, {
      defaultPath: `murmur-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: 'Text report', extensions: ['txt'] }]
    })
    if (canceled || !filePath) return false
    await writeFile(filePath, buildDiagnosticsReport(), 'utf8')
    return true
  })

  ipcMain.handle('diag:openLogs', async () => {
    const { shell } = await import('electron')
    shell.showItemInFolder(logFile())
  })

  registerSmokeCheck('diagnostics', () => {
    // The leak assertion must be able to fail: seed a recognizable
    // dictionary entry, prove the report carries its count but never
    // its text, then restore (a vacuous check over an empty dictionary
    // was a review gate finding).
    const before = getSettings().dictionary
    updateSettings({ dictionary: [{ from: 'smokeleakprobe', to: 'SmokeLeakProbe' }] })
    const report = buildDiagnosticsReport()
    updateSettings({ dictionary: before })
    return (
      report.includes('murmur diagnostics report') &&
      report.includes('hookStarted:') &&
      report.includes('dictionaryEntries: 1') &&
      !report.includes('smokeleakprobe') &&
      // The dictation loop ran earlier in this same smoke boot, so its
      // breadcrumb must already be in the log tail.
      report.includes('[dictation] delivered outcome=')
    )
  })
}
