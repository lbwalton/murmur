// SPDX-License-Identifier: GPL-3.0-only
// Permission status and System Settings deep links for the settings
// surface. macOS is the interesting platform; Windows reports granted.
import { shell, systemPreferences } from 'electron'
import { ipc } from './ipc'
import { getHotkeysStatus } from './hotkeys'

export interface PermissionsStatus {
  /** 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown' */
  microphone: string
  accessibility: boolean
  /** No direct macOS API: a running global hook is the practical truth. */
  inputMonitoring: boolean
}

const PANES: Record<string, string> = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  input: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'
}

export function getPermissionsStatus(): PermissionsStatus {
  if (process.platform !== 'darwin') {
    return { microphone: 'granted', accessibility: true, inputMonitoring: true }
  }
  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    inputMonitoring: getHotkeysStatus().hookStarted
  }
}

export function initPermissions(): void {
  ipc.handle('perms:status', () => getPermissionsStatus())
  ipc.handle('perms:open', (_event, pane: unknown) => {
    // Own keys only: an inherited name like constructor is not a pane.
    const key = String(pane)
    const url = Object.hasOwn(PANES, key) ? PANES[key] : undefined
    if (url && process.platform === 'darwin') void shell.openExternal(url)
  })
  ipc.handle('hotkeys:status', () => getHotkeysStatus())
}
