// SPDX-License-Identifier: GPL-3.0-only
// The tray is the app. macOS gets a template image the system recolors.
// Windows picks warm-white or ink to match the taskbar theme, because a
// white icon on a light taskbar reads as a ghost outline (issue 1), and
// follows live theme changes. Icons come from the generated set.
import { join } from 'node:path'
import { Menu, Tray, app, nativeImage, nativeTheme } from 'electron'

let tray: Tray | null = null

function trayIconPath(): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray')
    : join(app.getAppPath(), 'build', 'icons', 'tray')
  if (process.platform === 'darwin') return join(base, 'trayTemplate.png')
  // Dark taskbar wants the light icon; light taskbar wants the dark one.
  // Windows themes the SHELL separately from apps, so this must read the
  // system integrated UI flag, not shouldUseDarkColors (app mode): a
  // split theme would otherwise ghost the icon exactly like issue 1.
  return join(base, nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? 'tray-light.png' : 'tray-dark.png')
}

export interface TrayHandlers {
  onOpen: () => void
  onQuit: () => void
  /** Open today's notes inbox (US-050); the item shows only while a
   *  notes folder is set. */
  onOpenInbox?: () => void
  /** Open the newest note where it landed (US-082); shows once a note
   *  has been saved. */
  onOpenLastNote?: () => void
  /** While a hands-free take is locked (US-117): stop it and save the
   *  words without a paste, or throw it away. */
  onStopHandsFree?: () => void
  onDiscardHandsFree?: () => void
}

let trayHandlers: TrayHandlers | null = null
let inboxVisible = false
let lastNoteVisible = false
let handsFreeVisible = false

function buildMenu(): Menu {
  const handlers = trayHandlers
  if (!handlers) return Menu.buildFromTemplate([])
  // A locked take leads the menu: it is what the mic is doing now.
  const handsFree =
    handsFreeVisible && handlers.onStopHandsFree && handlers.onDiscardHandsFree
      ? [
          { label: 'Stop hands-free', click: handlers.onStopHandsFree },
          { label: 'Discard', click: handlers.onDiscardHandsFree },
          { type: 'separator' as const }
        ]
      : []
  return Menu.buildFromTemplate([
    ...handsFree,
    { label: 'Open murmur', click: handlers.onOpen },
    ...(lastNoteVisible && handlers.onOpenLastNote
      ? [{ label: 'Open last note', click: handlers.onOpenLastNote }]
      : []),
    ...(inboxVisible && handlers.onOpenInbox
      ? [{ label: "Open today's inbox", click: handlers.onOpenInbox }]
      : []),
    { type: 'separator' as const },
    { label: 'Quit murmur', click: handlers.onQuit }
  ])
}

/** Show or hide the inbox item; rebuilds the menu only on a change. */
export function setTrayInboxVisible(visible: boolean): void {
  if (visible === inboxVisible) return
  inboxVisible = visible
  tray?.setContextMenu(buildMenu())
}

/** The menu's labels as built now; the smoke checks read them. */
export function trayMenuLabels(): string[] {
  return buildMenu().items.map((item) => item.label)
}

/** Show Open last note once there is a note to open. */
export function setTrayLastNoteVisible(visible: boolean): void {
  if (visible === lastNoteVisible) return
  lastNoteVisible = visible
  tray?.setContextMenu(buildMenu())
}

/** Show Stop hands-free and Discard while a take is locked. */
export function setTrayHandsFree(on: boolean): void {
  if (on === handsFreeVisible) return
  handsFreeVisible = on
  tray?.setContextMenu(buildMenu())
}

export function createTray(handlers: TrayHandlers): Tray {
  trayHandlers = handlers
  tray = new Tray(nativeImage.createFromPath(trayIconPath()))
  tray.setToolTip('murmur')
  tray.setContextMenu(buildMenu())
  // On Windows a left click opens the window; macOS convention keeps the
  // click on the menu, where Open murmur is the first item (after the
  // hands-free items while a take is locked).
  tray.on('click', () => {
    if (process.platform !== 'darwin') handlers.onOpen()
  })
  if (process.platform !== 'darwin') {
    nativeTheme.on('updated', () => {
      tray?.setImage(nativeImage.createFromPath(trayIconPath()))
    })
  }
  return tray
}

export function getTray(): Tray | null {
  return tray
}
