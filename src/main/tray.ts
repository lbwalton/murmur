// SPDX-License-Identifier: GPL-3.0-only
// The tray is the app. macOS gets a template image the system recolors,
// Windows gets the warm-white variant. Icons come from the generated set.
import { join } from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'

let tray: Tray | null = null

function trayIconPath(): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray')
    : join(app.getAppPath(), 'build', 'icons', 'tray')
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray-light.png'
  return join(base, file)
}

export interface TrayHandlers {
  onOpen: () => void
  onQuit: () => void
}

export function createTray(handlers: TrayHandlers): Tray {
  tray = new Tray(nativeImage.createFromPath(trayIconPath()))
  tray.setToolTip('Murmur')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Murmur', click: handlers.onOpen },
      { type: 'separator' },
      { label: 'Quit Murmur', click: handlers.onQuit }
    ])
  )
  // On Windows a left click opens the window; macOS convention keeps the
  // click on the menu, where Open Murmur is the first item.
  tray.on('click', () => {
    if (process.platform !== 'darwin') handlers.onOpen()
  })
  return tray
}

export function getTray(): Tray | null {
  return tray
}
