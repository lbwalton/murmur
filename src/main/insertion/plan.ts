// SPDX-License-Identifier: GPL-3.0-only
// Pure decision logic for the clipboard dance around a paste insertion.
// The rule that matters: never destroy something the user had copied,
// and never restore over something they copied mid-insertion.

export interface ClipboardSnapshot {
  text: string
  /** The clipboard held a non-text payload (image, files) before we touched it. */
  hasNonText: boolean
}

export interface RestorePlan {
  restore: boolean
  value: string
}

/**
 * Decide whether to restore the pre-insertion clipboard.
 * currentText is what the clipboard holds after the paste settled.
 */
export function planRestore(
  snapshot: ClipboardSnapshot,
  currentText: string,
  insertedText: string
): RestorePlan {
  // An image or file payload was there before: writing text over it
  // already cost it, and writing text again cannot bring it back.
  // Leave the inserted text in place rather than pretend.
  if (snapshot.hasNonText) return { restore: false, value: '' }
  // The user copied something new while we worked: theirs wins.
  if (currentText !== insertedText) return { restore: false, value: '' }
  return { restore: true, value: snapshot.text }
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
