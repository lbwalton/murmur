// SPDX-License-Identifier: GPL-3.0-only
// Every IPC channel in the app, in one place. Preloads expose only
// functions bound to these names; renderers never touch ipcRenderer.
export const IpcChannels = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  apiKeySet: 'apikey:set',
  apiKeyClear: 'apikey:clear',
  apiKeyStatus: 'apikey:status'
} as const
