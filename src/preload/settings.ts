// SPDX-License-Identifier: GPL-3.0-only
// Settings window preload. Every IPC channel this window may use is named
// here explicitly; the renderer never sees ipcRenderer itself.
import { contextBridge } from 'electron'

const api = {
  appVersion: (): string => process.env.npm_package_version ?? '0.1.0'
}

export type SettingsApi = typeof api

contextBridge.exposeInMainWorld('murmur', api)
