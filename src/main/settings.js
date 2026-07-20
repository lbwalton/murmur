'use strict';

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { EventEmitter } = require('events');

const DEFAULTS = {
  // transcription
  provider: 'groq',
  apiKey: '',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'whisper-large-v3-turbo',
  language: 'auto',
  // formatting
  smartFormat: true,
  formatModel: 'llama-3.1-8b-instant',
  formatStyle: 'conversation', // 'conversation' | 'vibe-coding'
  formatLevel: 'medium', // 'none' | 'structure' | 'soft' | 'medium' | 'high'
  numberStyle: 'auto', // 'auto' | 'digits' | 'words'
  dictionary: [],
  corrections: [], // learned {from, to, count, ts} pairs from History edits
  expansions: [], // {trigger, value, enabled} applied after all API calls; values never leave the machine
  // input
  micDeviceId: 'default',
  warmMicSeconds: 8, // 0 disables; see the note in Settings for the tradeoff
  toggleShortcut: 'Control+Shift+Space',
  holdEnabled: true,
  // uiohook codes; chords hold multiple. Right Cmd on Mac (3676, MetaRight),
  // Right Ctrl on Windows (3613, CtrlRight).
  holdKeycodes: process.platform === 'darwin' ? [3676] : [3613],
  holdKeyLabel: process.platform === 'darwin' ? 'Right Cmd' : 'Right Ctrl',
  // insertion
  insertMethod: 'paste', // 'paste' | 'type'
  restoreClipboard: true,
  // behavior
  historyEnabled: true,
  analyticsEnabled: true,
  baselineWpm: 40, // typing speed the time-saved math compares against
  recaps: {
    enabled: true,
    weekly: { enabled: true, dayOfWeek: 1, hour: 9 }, // Monday 9:00
    monthly: { enabled: true, dayOfMonth: 1, hour: 9 },
    yearly: { enabled: true, dayOfMonth: 1, hour: 9 }, // January 1
    lastFired: {},
  },
  sounds: true,
  launchAtLogin: false,
  maxSeconds: 300,
  onboarded: false,
};

const emitter = new EventEmitter();
let current = { ...DEFAULTS };
let filePath = null;

// The API key is encrypted at rest with the OS keystore (Keychain on macOS,
// DPAPI on Windows) via Electron safeStorage. In memory it stays plaintext:
// transcribe.js needs it for the Authorization header and Settings prefills
// it. If the keystore is unavailable the file keeps a plaintext key, exactly
// the old behavior, and Settings says so. Fail-open: a key that cannot be
// decrypted (keystore reset, copied settings file) is dropped, not fatal.

function keystoreAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function init() {
  filePath = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      current = { ...DEFAULTS, ...raw };
      // Migrate the pre-chord single hold key field.
      if (raw.holdKeycode && !raw.holdKeycodes) current.holdKeycodes = [raw.holdKeycode];
      delete current.holdKeycode;
      if (raw.apiKeyEnc && !raw.apiKey) {
        try {
          current.apiKey = safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, 'base64'));
        } catch (err) {
          console.error('settings: stored key could not be decrypted, clearing it:', err.message);
          current.apiKey = '';
        }
      }
      delete current.apiKeyEnc;
    }
  } catch (err) {
    console.error('settings: could not read, using defaults:', err.message);
    current = { ...DEFAULTS };
  }
  // Also migrates a plaintext key to encrypted on the first post-update run.
  save();
  return current;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const disk = { ...current };
    if (disk.apiKey && keystoreAvailable()) {
      disk.apiKeyEnc = safeStorage.encryptString(disk.apiKey).toString('base64');
      disk.apiKey = '';
    }
    fs.writeFileSync(filePath, JSON.stringify(disk, null, 2));
  } catch (err) {
    console.error('settings: could not save:', err.message);
  }
}

function get() {
  return { ...current };
}

function set(partial) {
  const clean = {};
  for (const key of Object.keys(partial || {})) {
    if (key in DEFAULTS) clean[key] = partial[key];
  }
  Object.assign(current, clean);
  save();
  emitter.emit('change', get(), clean);
  return get();
}

function onChange(cb) {
  emitter.on('change', cb);
}

module.exports = { init, get, set, onChange, keystoreAvailable, DEFAULTS };
