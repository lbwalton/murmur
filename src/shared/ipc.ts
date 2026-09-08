// SPDX-License-Identifier: GPL-3.0-only
// Every IPC channel in the app, in one place. Preloads expose only
// functions bound to these names; renderers never touch ipcRenderer.
export const IpcChannels = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  apiKeySet: 'apikey:set',
  apiKeyClear: 'apikey:clear',
  apiKeyStatus: 'apikey:status',
  audioStart: 'audio:start',
  audioStop: 'audio:stop',
  audioCancel: 'audio:cancel',
  audioRearm: 'audio:rearm',
  audioReady: 'audio:ready',
  audioArmed: 'audio:armed',
  audioResult: 'audio:result',
  audioLevel: 'audio:level',
  audioCue: 'audio:cue',
  audioCuePlayed: 'audio:cue-played',
  overlayState: 'overlay:state',
  overlayLevel: 'overlay:level',
  overlayConfig: 'overlay:config',
  overlayPreview: 'overlay:preview',
  licenseStatus: 'license:status',
  licenseSet: 'license:set',
  licenseBuy: 'license:buy',
  analyticsSummary: 'analytics:summary',
  analyticsHeatmap: 'analytics:heatmap',
  providerTest: 'provider:test',
  permsStatus: 'perms:status',
  permsOpen: 'perms:open',
  hotkeysStatus: 'hotkeys:status'
} as const
