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
}

export function createTray(handlers: TrayHandlers): Tray {
  tray = new Tray(nativeImage.createFromPath(trayIconPath()))
  tray.setToolTip('murmur')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open murmur', click: handlers.onOpen },
      { type: 'separator' },
      { label: 'Quit murmur', click: handlers.onQuit }
    ])
  )
  // On Windows a left click opens the window; macOS convention keeps the
  // click on the menu, where Open murmur is the first item.
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
