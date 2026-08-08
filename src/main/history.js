'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const MAX_ITEMS = 200;
let filePath = null;
let items = [];

// An explicit path lets the smoke test exercise the store against a probe
// file instead of the user's real history (same shape as analytics.init).
function init(overridePath) {
  filePath = overridePath || path.join(app.getPath('userData'), 'history.json');
  try {
    if (fs.existsSync(filePath)) items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(items)) items = [];
  } catch {
    items = [];
  }
}

function save() {
  try {
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
  } catch (err) {
    console.error('history: could not save:', err.message);
  }
}

// `raw` is the pre-formatter transcript, present only when the formatter
// changed the text at all (US-030); absent means what you see is what Whisper
// heard. `altered` is the narrower flag History surfaces: the formatter added
// words that were never spoken.
function add({ text, raw, altered, words, ms, model }) {
  items.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    text,
    ...(raw ? { raw } : {}),
    ...(altered ? { altered: true } : {}),
    words,
    ms,
    model,
  });
  if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
  save();
}

function list() {
  return items.slice();
}

// Replaces an item's text (a user fix); returns the previous text or null.
function update(id, text) {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const prev = item.text;
  item.text = text;
  item.words = text.trim().split(/\s+/).filter(Boolean).length;
  save();
  return prev;
}

function remove(id) {
  items = items.filter((i) => i.id !== id);
  save();
}

function clear() {
  items = [];
  save();
}

module.exports = { init, add, list, update, remove, clear };
