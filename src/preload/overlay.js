'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const LISTEN_CHANNELS = ['state', 'rec-start', 'rec-stop', 'rec-cancel', 'warm-config'];

contextBridge.exposeInMainWorld('murmur', {
  on(channel, cb) {
    if (!LISTEN_CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, (e, payload) => cb(payload));
  },
  recStarted: () => ipcRenderer.send('rec-started'),
  recError: (message) => ipcRenderer.send('rec-error', message),
  recData: (arrayBuffer, meta) => ipcRenderer.send('rec-data', new Uint8Array(arrayBuffer), meta),
});
