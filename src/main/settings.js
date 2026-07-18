'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
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
  dictionary: [],
  corrections: [], // learned {from, to, count, ts} pairs from History edits
  // input
  micDeviceId: 'default',
  warmMicSeconds: 8, // 0 disables; see the note in Settings for the tradeoff
  toggleShortcut: 'Control+Shift+Space',
  holdEnabled: true,
  holdKeycodes: [3613], // uiohook VC_CONTROL_R (Right Ctrl); chords hold multiple codes
  holdKeyLabel: 'Right Ctrl',
  // insertion
  insertMethod: 'paste', // 'paste' | 'type'
  restoreClipboard: true,
  // behavior
  historyEnabled: true,
  sounds: true,
  launchAtLogin: false,
  maxSeconds: 300,
  onboarded: false,
};

const emitter = new EventEmitter();
let current = { ...DEFAULTS };
let filePath = null;

function init() {
  filePath = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      current = { ...DEFAULTS, ...raw };
      // Migrate the pre-chord single hold key field.
      if (raw.holdKeycode && !raw.holdKeycodes) current.holdKeycodes = [raw.holdKeycode];
      delete current.holdKeycode;
    }
  } catch (err) {
    console.error('settings: could not read, using defaults:', err.message);
    current = { ...DEFAULTS };
  }
  save();
  return current;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
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

module.exports = { init, get, set, onChange, DEFAULTS };
