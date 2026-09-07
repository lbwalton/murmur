// SPDX-License-Identifier: GPL-3.0-only
// Pure decision logic for the clipboard dance around a paste insertion.
// The rule that matters: never destroy something the user had copied,
// and never restore over something they copied mid-insertion.

export interface ClipboardSnapshot {
  text: string
  /** Fully captured clipboard entries available for wholesale restore. */
  itemCount: number
}

export type RestoreMode = 'items' | 'text' | 'none'

/**
 * Decide how to restore the pre-insertion clipboard.
 * currentText is what the clipboard holds after the paste settled.
 * Wholesale item restore is preferred (it brings back images and rich
 * flavors); text is the fallback; a mid-insertion copy by the user
 * always wins and suppresses any restore.
 */
export function planRestore(
  snapshot: ClipboardSnapshot,
  currentText: string,
  insertedText: string
): RestoreMode {
  // The user copied something new while we worked: theirs wins.
  if (currentText !== insertedText) return 'none'
  if (snapshot.itemCount > 0) return 'items'
  if (snapshot.text) return 'text'
  return 'none'
}

/** Build the platform paste-keystroke command. Pure for testing. */
export function pasteCommand(platform: NodeJS.Platform): { file: string; args: string[] } | null {
  if (platform === 'darwin') {
    return {
      file: 'osascript',
      args: ['-e', 'tell application "System Events" to keystroke "v" using command down']
    }
  }
  if (platform === 'win32') {
    return {
      file: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$w = New-Object -ComObject wscript.shell; $w.SendKeys("^v")'
      ]
    }
  }
  return null
}
