'use strict';

const path = require('path');
const fs = require('fs');
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain,
  screen, nativeImage, shell, session, systemPreferences, Notification, clipboard, powerMonitor,
} = require('electron');

const IS_MAC = process.platform === 'darwin';

const settings = require('./settings');
const history = require('./history');
const transcribe = require('./transcribe');
const inject = require('./inject');
const hotkeys = require('./hotkeys');
const corrections = require('./corrections');
const expansions = require('./expansions');
const analytics = require('./analytics');
const recaps = require('./recaps');

// Everything the recap scheduler needs, injected so recaps.js stays pure
// enough for the smoke test to pin its logic down.
function recapDeps() {
  return {
    getSettings: () => settings.get(),
    setSettings: (p) => settings.set(p),
    listEvents: () => analytics.list(),
    notify: (title, body) => {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title, body });
      n.on('click', () => openSettings('analytics'));
      n.show();
    },
  };
}

const SMOKE = process.argv.includes('--smoke');
// Smoke gets its own disposable profile. Two Electron instances sharing one
// Chromium profile deadlock (found when smoke hung while the installed app
// was running), and isolation also keeps test probes away from real user
// data: the keyStorage check now exercises a scratch settings.json, never
// the user's actual key.
if (SMOKE) app.setPath('userData', app.getPath('userData') + '-smoke');
const ASSETS = path.join(__dirname, '..', '..', 'assets', 'generated');
const OVERLAY_SIZE = { width: 420, height: 120 };

let tray = null;
let overlayWin = null;
let settingsWin = null;
let trayIdle = null;
let trayRec = null;

// idle -> listening -> processing -> idle
let state = 'idle';
let recSource = null;
let recStartedAt = 0;
let recGen = 0; // bumped on start and cancel so a cancelled dictation can never insert late
let maxTimer = null;
let escBound = false;

// ---------------------------------------------------------------- windows

// Tells the overlay the current warm policy so Always mode can hold the mic
// open from launch, not just after the first dictation.
function broadcastWarmConfig() {
  const s = settings.get();
  sendOverlay('warm-config', { deviceId: s.micDeviceId, warmSeconds: s.warmMicSeconds, platform: process.platform });
}

function createOverlay() {
  overlayWin = new BrowserWindow({
    ...OVERLAY_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'overlay', 'overlay.html'));
}

function positionOverlay() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = display.workArea;
  overlayWin.setBounds({
    x: Math.round(wa.x + (wa.width - OVERLAY_SIZE.width) / 2),
    y: Math.round(wa.y + wa.height - OVERLAY_SIZE.height - 12),
    ...OVERLAY_SIZE,
  });
}

function sendOverlay(channel, payload) {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send(channel, payload);
}

function openSettings(tab, extraEvent) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    if (tab) settingsWin.webContents.send('goto-tab', tab);
    if (extraEvent) settingsWin.webContents.send(extraEvent);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 940,
    height: 680,
    minWidth: 780,
    minHeight: 540,
    show: false,
    backgroundColor: '#0F0E11',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0F0E11', symbolColor: '#8D8A94', height: 44 },
    icon: nativeImage.createFromPath(path.join(ASSETS, 'icon-256.png')),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'settings.html'));
  settingsWin.once('ready-to-show', () => {
    settingsWin.show();
    if (tab) settingsWin.webContents.send('goto-tab', tab);
    if (extraEvent) settingsWin.webContents.send(extraEvent);
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------------------------------------------------------------- dictation

function bindEsc() {
  if (escBound) return;
  escBound = globalShortcut.register('Escape', cancelDictation);
}

function unbindEsc() {
  if (escBound) {
    globalShortcut.unregister('Escape');
    escBound = false;
  }
}

function startDictation(source) {
  if (state !== 'idle') return;
  const s = settings.get();
  if (!s.apiKey) {
    positionOverlay();
    overlayWin.showInactive();
    sendOverlay('state', { state: 'error', message: 'Add your API key in Settings first' });
    setTimeout(hideOverlayIfIdle, 3000);
    openSettings('voice');
    return;
  }
  state = 'listening';
  recSource = source;
  recStartedAt = Date.now();
  recGen += 1;
  positionOverlay();
  overlayWin.showInactive();
  sendOverlay('state', { state: 'listening' });
  sendOverlay('rec-start', { deviceId: s.micDeviceId, sounds: s.sounds, warmSeconds: s.warmMicSeconds, platform: process.platform });
  if (tray && trayRec) tray.setImage(trayRec);
  bindEsc();
  if (s.maxSeconds > 0) maxTimer = setTimeout(() => stopDictation(), Math.max(10, s.maxSeconds) * 1000);
}

function stopDictation() {
  if (state !== 'listening') return;
  state = 'processing';
  clearTimeout(maxTimer);
  sendOverlay('state', { state: 'processing' });
  sendOverlay('rec-stop');
}

function cancelDictation() {
  if (state === 'idle') return;
  recGen += 1;
  clearTimeout(maxTimer);
  sendOverlay('rec-cancel');
  finishCycle();
  hideOverlayIfIdle();
}

function finishCycle() {
  state = 'idle';
  recSource = null;
  if (tray && trayIdle) tray.setImage(trayIdle);
  unbindEsc();
}

// The pill animates out (state hidden), then the window actually hides a
// beat later so the exit is visible instead of a hard vanish (US-023).
function hideOverlayIfIdle() {
  if (state !== 'idle' || !overlayWin || overlayWin.isDestroyed()) return;
  sendOverlay('state', { state: 'hidden' });
  setTimeout(() => {
    if (state === 'idle' && overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
  }, 240);
}

async function handleAudio(arrayBuffer, meta) {
  const s = settings.get();
  const gen = recGen;
  const startedProcessing = Date.now();
  try {
    const raw = Buffer.from(arrayBuffer);
    if (raw.length < 1200) throw new Error('No speech detected');
    // Whisper hallucinates plausible words ("You're welcome.") on silence, so
    // a take with no voice-like bursts is refused before it can reach the
    // API. Fewer than 3 frames above the take's own noise floor means no one
    // spoke: a key click or breath spikes one or two, speech spans hundreds.
    // Only vetoes when the overlay actually sampled frames, so a throttled
    // renderer can never eat real speech.
    if (meta && typeof meta.voicedFrames === 'number' && meta.rmsSamples >= 5 && meta.voicedFrames < 3) {
      throw new Error('No speech detected');
    }
    let text = await transcribe.transcribe(raw, s);
    // Whisper answers silence with a lone "." or similar; a transcript with
    // no letters or digits is silence, not text to insert.
    if (!text || !/[\p{L}\p{N}]/u.test(text)) throw new Error('No speech detected');
    text = corrections.applyCorrections(text, s.corrections);
    if (s.smartFormat) text = await transcribe.smartFormat(text, s);
    // Last step on purpose: expansion values must never reach any API.
    text = expansions.applyExpansions(text, s.expansions);
    if (gen !== recGen) return; // cancelled while transcribing
    await inject.insert(text, s);
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    if (s.historyEnabled) {
      history.add({ text, words, ms: meta && meta.ms ? meta.ms : 0, model: s.model });
      if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('history-changed');
    }
    if (s.analyticsEnabled) {
      analytics.add({
        seconds: meta && meta.ms ? meta.ms / 1000 : 0,
        words,
        model: s.model,
        formatModel: s.smartFormat ? s.formatModel : null,
      });
    }
    sendOverlay('state', { state: 'done', words, ms: Date.now() - startedProcessing });
    setTimeout(hideOverlayIfIdle, 1400);
  } catch (err) {
    sendOverlay('state', { state: 'error', message: err.message || String(err) });
    setTimeout(hideOverlayIfIdle, 3800);
  } finally {
    finishCycle();
  }
}

// ---------------------------------------------------------------- hotkeys

function applyHotkeys() {
  const s = settings.get();
  globalShortcut.unregisterAll();
  escBound = false;
  let toggleOk = true;
  try {
    toggleOk = globalShortcut.register(s.toggleShortcut, () => {
      if (state === 'idle') startDictation('toggle');
      else if (state === 'listening') stopDictation();
    });
  } catch {
    toggleOk = false;
  }
  if (s.holdEnabled && hotkeys.available()) {
    hotkeys.bindHold(
      s.holdKeycodes,
      () => { if (state === 'idle') startDictation('hold'); },
      () => {
        if (state === 'listening' && recSource === 'hold') {
          if (Date.now() - recStartedAt < 350) cancelDictation();
          else stopDictation();
        }
      }
    );
  } else {
    hotkeys.unbindHold();
  }
  return toggleOk;
}

// ---------------------------------------------------------------- tray

// macOS menu bar wants a 16pt image with a 2x representation for retina.
function macTrayImage(base) {
  const img = nativeImage.createEmpty();
  img.addRepresentation({ scaleFactor: 1, buffer: fs.readFileSync(path.join(ASSETS, `${base}-16.png`)) });
  img.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(path.join(ASSETS, `${base}-32.png`)) });
  return img;
}

function createTray() {
  if (IS_MAC) {
    // Idle is a Template image so macOS recolors it for light and dark menu
    // bars. Recording stays amber and non-template: live color, live state.
    trayIdle = macTrayImage('tray-idle-mac');
    trayIdle.setTemplateImage(true);
    trayRec = macTrayImage('tray-rec-mac');
  } else {
    trayIdle = nativeImage.createFromPath(path.join(ASSETS, 'tray-idle.png'));
    trayRec = nativeImage.createFromPath(path.join(ASSETS, 'tray-rec.png'));
  }
  tray = new Tray(trayIdle);
  tray.setToolTip('Murmur, push to talk dictation');
  const menu = Menu.buildFromTemplate([
    { label: 'Start dictation', click: () => startDictation('toggle') },
    { label: 'Fix last dictation', click: () => openSettings('history', 'edit-latest') },
    { type: 'separator' },
    { label: 'Settings', click: () => openSettings() },
    { label: 'History', click: () => openSettings('history') },
    { type: 'separator' },
    { label: 'Quit Murmur', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => openSettings());
}

// ---------------------------------------------------------------- ipc

function registerIpc() {
  ipcMain.on('rec-started', () => {});
  ipcMain.on('rec-error', (e, message) => {
    clearTimeout(maxTimer);
    sendOverlay('state', { state: 'error', message });
    setTimeout(hideOverlayIfIdle, 3800);
    finishCycle();
  });
  ipcMain.on('rec-data', (e, buf, meta) => { handleAudio(buf, meta); });

  ipcMain.handle('settings:get', () => ({
    settings: settings.get(),
    meta: {
      version: app.getVersion(),
      holdAvailable: hotkeys.available(),
      userDataPath: app.getPath('userData'),
      platform: process.platform,
      keyEncrypted: settings.keystoreAvailable(),
    },
  }));

  // macOS permission plumbing. Insertion needs Accessibility, hold-to-talk
  // needs Input Monitoring (no API to query it; the capture timeout is the
  // tell), and the mic prompt should come from us, not a surprise mid-take.
  ipcMain.handle('perm:status', () => {
    if (!IS_MAC) return { platform: process.platform };
    return {
      platform: 'darwin',
      accessibility: systemPreferences.isTrustedAccessibilityClient(false),
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
    };
  });
  ipcMain.handle('perm:requestAccessibility', () => {
    if (!IS_MAC) return true;
    return systemPreferences.isTrustedAccessibilityClient(true);
  });
  ipcMain.handle('perm:requestMic', () => {
    if (!IS_MAC) return true;
    return systemPreferences.askForMediaAccess('microphone');
  });
  ipcMain.on('perm:openPane', (e, pane) => {
    const panes = {
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      inputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
      microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    };
    if (IS_MAC && panes[pane]) shell.openExternal(panes[pane]);
  });

  ipcMain.handle('settings:set', (e, partial) => {
    const before = settings.get();
    const next = settings.set(partial);
    let error = null;
    if ('launchAtLogin' in partial) {
      // macOS only accepts login items from packaged apps; a dev build
      // logs an OS error, so skip it there.
      if (!IS_MAC || app.isPackaged) app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    }
    const needsRebind = ['toggleShortcut', 'holdEnabled', 'holdKeycodes'].some((k) => k in partial);
    if (needsRebind && !SMOKE) {
      if (!applyHotkeys()) {
        settings.set({ toggleShortcut: before.toggleShortcut });
        applyHotkeys();
        error = `Could not register "${partial.toggleShortcut}". It may be taken by another app. Kept the previous shortcut.`;
      }
    }
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('settings-changed', settings.get());
    }
    return { settings: settings.get(), error };
  });

  ipcMain.handle('connection:test', () => transcribe.testConnection(settings.get()));
  ipcMain.handle('models:list', async () => {
    try {
      return { ok: true, models: await transcribe.listModels(settings.get()) };
    } catch (err) {
      return { ok: false, message: err.message, models: [] };
    }
  });
  ipcMain.handle('hold:capture', async () => {
    const result = await hotkeys.captureNextKey();
    return result;
  });
  ipcMain.handle('analytics:list', () => analytics.list());
  ipcMain.handle('analytics:clear', () => { analytics.clear(); return []; });
  ipcMain.on('recaps:test', () => recaps.fire('weekly', recapDeps()));
  // Copy goes through the main-process clipboard: the renderer-side
  // navigator.clipboard API silently rejects when Chromium decides the
  // document lacks focus or permission, which broke History's Copy button.
  ipcMain.handle('clipboard:copy', (e, text) => {
    clipboard.writeText(String(text == null ? '' : text));
    return true;
  });
  ipcMain.handle('history:list', () => history.list());
  ipcMain.handle('history:update', (e, id, newText) => {
    const prev = history.update(id, newText);
    let learned = [];
    let promoted = [];
    if (prev !== null && prev !== newText) {
      const res = corrections.learn(prev, newText, settings.get());
      learned = res.pairs;
      promoted = res.promoted;
      if (learned.length) {
        settings.set({ corrections: res.corrections, dictionary: res.dictionary });
        if (settingsWin && !settingsWin.isDestroyed()) {
          settingsWin.webContents.send('settings-changed', settings.get());
        }
      }
    }
    return { items: history.list(), learned, promoted };
  });
  ipcMain.handle('history:delete', (e, id) => { history.remove(id); return history.list(); });
  ipcMain.handle('history:clear', () => { history.clear(); return []; });
  ipcMain.on('open-external', (e, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
  });
  ipcMain.on('dictation:test', () => {
    if (settingsWin) settingsWin.minimize();
    setTimeout(() => startDictation('toggle'), 400);
  });
}

// ---------------------------------------------------------------- smoke test

async function runSmoke() {
  const checks = {};
  const iconFiles = ['tray-idle.png', 'tray-rec.png', 'icon-256.png'];
  if (IS_MAC) iconFiles.push('tray-idle-mac-16.png', 'tray-idle-mac-32.png', 'tray-rec-mac-16.png', 'tray-rec-mac-32.png');
  checks.iconsExist = iconFiles.every((f) => fs.existsSync(path.join(ASSETS, f)));
  checks.iconsDecode = iconFiles.every((f) => !nativeImage.createFromPath(path.join(ASSETS, f)).isEmpty());
  checks.settingsFile = fs.existsSync(path.join(app.getPath('userData'), 'settings.json'));
  checks.tray = !!tray;
  checks.fetchGlobals = typeof fetch === 'function' && typeof FormData === 'function' && typeof Blob === 'function';
  checks.holdAvailable = hotkeys.available();
  try {
    checks.injectHelper = await inject.ping();
    const chain = await inject.probeChain();
    checks.injectChain = chain === 'unknown command';
    if (!checks.injectChain) checks.injectChainError = chain;
  } catch (err) {
    checks.injectHelper = false;
    checks.injectHelperError = err.message;
  }
  checks.overlayLoaded = await new Promise((resolve) => {
    if (overlayWin.webContents.isLoading()) {
      overlayWin.webContents.once('did-finish-load', () => resolve(true));
      setTimeout(() => resolve(false), 15000);
    } else resolve(true);
  });
  if (IS_MAC) {
    // Template idle icon is what makes the tray legible on light menu bars.
    checks.macTrayTemplate = !!(trayIdle && trayIdle.isTemplateImage()) && !!(trayRec && !trayRec.isTemplateImage());
    // Informational: Accessibility is granted per-machine by the user, so it
    // must never gate the smoke result, but it is worth surfacing.
    checks.accessibilityGranted = systemPreferences.isTrustedAccessibilityClient(false);
  } else {
    checks.sendKeysEscape = inject.escapeSendKeys('a+b{c}\n') === 'a{+}b{{}c{}}{ENTER}';
  }
  checks.correctionDiff = JSON.stringify(corrections.diffPairs('open cloud code now', 'open Claude Code now'))
    === JSON.stringify([{ from: 'cloud code', to: 'Claude Code' }]);
  // Key at rest: when the OS keystore is available, a set key must roundtrip
  // and must not appear in plaintext on disk. When it is not available the
  // documented fallback is plaintext, so the check passes vacuously.
  checks.keyEncryptionAvailable = settings.keystoreAvailable();
  if (checks.keyEncryptionAvailable) {
    const prevKey = settings.get().apiKey;
    try {
      settings.set({ apiKey: 'gsk_smoke_probe_secret' });
      const onDisk = fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8');
      checks.keyStorage = !onDisk.includes('gsk_smoke_probe_secret') && settings.get().apiKey === 'gsk_smoke_probe_secret';
    } catch (err) {
      checks.keyStorage = false;
      checks.keyStorageError = err.message;
    } finally {
      settings.set({ apiKey: prevKey });
    }
  } else {
    checks.keyStorage = true;
  }
  checks.correctionApply = corrections.applyCorrections('i use cloud code daily', [{ from: 'cloud code', to: 'Claude Code' }])
    === 'i use Claude Code daily';
  // Recaps: once-per-period scheduling logic on fixed timestamps. Wednesday
  // 2026-07-15 noon: all three cadences overdue against an empty lastFired,
  // none after stamping, and toggles gate correctly.
  checks.recapSchedule = (() => {
    const cfg = {
      enabled: true,
      weekly: { enabled: true, dayOfWeek: 1, hour: 9 },
      monthly: { enabled: true, dayOfMonth: 1, hour: 9 },
      yearly: { enabled: true, dayOfMonth: 1, hour: 9 },
      lastFired: {},
    };
    const now = new Date(2026, 6, 15, 12, 0, 0).getTime();
    const wSched = new Date(recaps.lastScheduled('weekly', cfg.weekly, now));
    return recaps.computeDue(cfg, now).length === 3
      && wSched.getDay() === 1 && wSched.getHours() === 9
      && recaps.computeDue({ ...cfg, lastFired: { weekly: now, monthly: now, yearly: now } }, now).length === 0
      && recaps.computeDue({ ...cfg, enabled: false }, now).length === 0
      && recaps.computeDue({ ...cfg, weekly: { ...cfg.weekly, enabled: false } }, now).join(',') === 'monthly,yearly';
  })();
  // Analytics: event write, read, and clear against a probe file so real
  // usage data is never touched, plus cost math against the verified rates.
  checks.analyticsEvents = (() => {
    const probe = path.join(app.getPath('userData'), 'analytics-smoke.jsonl');
    try {
      analytics.init(probe);
      analytics.add({ seconds: 60, words: 100, model: 'whisper-large-v3-turbo', formatModel: 'llama-3.1-8b-instant' });
      const one = analytics.list();
      analytics.clear();
      return one.length === 1 && one[0].words === 100 && one[0].cost > 0 && analytics.list().length === 0;
    } catch {
      return false;
    } finally {
      analytics.init();
    }
  })();
  checks.analyticsCost = Math.abs(analytics.estimateCost(3600, 0, 'whisper-large-v3-turbo', null) - 0.04) < 1e-9
    && analytics.estimateCost(3600, 0, 'some-local-model', null) === 0;
  // Expansions: whole-phrase, word-boundary, case-insensitive, disabled
  // entries skipped, punctuation-adjacent triggers still match, and partial
  // words never match. Privacy half: the formatter prompt must not contain
  // expansion values even when expansions are present in settings.
  checks.expansionApply = (() => {
    const list = [
      { trigger: 'my email', value: 'lb@example.com', enabled: true },
      { trigger: 'sign off', value: 'Best,\nLB', enabled: false },
    ];
    return expansions.applyExpansions('send it to My Email, thanks', list) === 'send it to lb@example.com, thanks'
      && expansions.applyExpansions('use my emailing habit', list) === 'use my emailing habit'
      && expansions.applyExpansions('ok sign off now', list) === 'ok sign off now'
      && expansions.applyExpansions('', list) === '';
  })();
  checks.expansionPrivacy = !transcribe.buildFormatPrompt({
    formatLevel: 'medium', formatStyle: 'conversation',
    expansions: [{ trigger: 'my email', value: 'lb@example.com', enabled: true }],
  }).includes('lb@example.com');
  // Formatter level and style must map to distinct prompt rules: None keeps
  // exact words and never strips filler, High rewrites, Medium resolves
  // self-corrections, and vibe-coding adds the developer rule.
  checks.formatPrompt = (() => {
    const p = (formatLevel, formatStyle) => transcribe.buildFormatPrompt({ formatLevel, formatStyle });
    return p('none', 'conversation').includes('exactly as spoken')
      && !p('none', 'conversation').includes('Remove filler words')
      && p('high', 'conversation').includes('polished, professional')
      && p('medium', 'conversation').includes('final intent')
      && !p('soft', 'conversation').includes('final intent')
      && p('medium', 'vibe-coding').includes('developer')
      && !p('medium', 'conversation').includes('developer')
      && p('bogus', 'bogus') === p('medium', 'conversation');
  })();
  // US-009 chat guard: canned chatty replies (both live-observed artifacts)
  // must fail open to the raw transcript; legitimate cleanups pass through,
  // including one-word commands, digit conversion, and unanswered questions.
  checks.formatChatGuard = (() => {
    const g = transcribe.guardFormatOutput;
    return g('.', 'There is no text to clean up. Please provide the dictated speech to be converted into written text.') === '.'
      && g('so um the budget is fine', 'Before sending the cleaned text, I will confirm it with you to ensure it meets the requirements. Please provide the dictated speech.') === 'so um the budget is fine'
      && g('Thank you.', "You're welcome! Let me know if you need anything else.") === 'Thank you.'
      && g('Thank you.', "You're welcome.") === 'Thank you.'
      && g('um, send it to bob', 'Send it to Bob.') === 'Send it to Bob.'
      && g('period', '.') === '.'
      && g('two', '2') === '2'
      && g('what time is it', 'What time is it?') === 'What time is it?'
      && g('some text', '') === 'some text';
  })();
  // US-028 segment filter: near-certain non-speech segments (silence
  // hallucinations) drop, real and mixed segments survive, endpoints
  // without segment data fall through to plain text.
  checks.silenceSegments = (() => {
    const x = transcribe.extractTranscript;
    return x({ text: 'Thank you.', segments: [{ text: ' Thank you.', no_speech_prob: 0.97 }] }) === ''
      && x({ text: 'Real words here. Thank you.', segments: [{ text: ' Real words here.', no_speech_prob: 0.02 }, { text: ' Thank you.', no_speech_prob: 0.93 }] }) === 'Real words here.'
      && x({ text: 'whispered but real', segments: [{ text: ' whispered but real', no_speech_prob: 0.55 }] }) === 'whispered but real'
      && x({ text: 'plain endpoint' }) === 'plain endpoint'
      && x({ text: 'no probs', segments: [{ text: ' no probs' }] }) === 'no probs';
  })();
  // Numbers: digits mode adds the digit rule, words mode the word rule,
  // auto adds neither, unknown values fall back to auto.
  checks.numberPrompt = (() => {
    const p = (numberStyle) => transcribe.buildFormatPrompt({ formatLevel: 'medium', formatStyle: 'conversation', numberStyle });
    return p('digits').includes('as digits')
      && p('words').includes('as words')
      && !p('auto').includes('as digits') && !p('auto').includes('as words')
      && p('bogus') === p('auto');
  })();
  // Auto structure rules ride every level except None, which promises exact
  // words: lists, topic-pivot paragraphs, headings, and the comma guard.
  checks.structurePrompt = (() => {
    const p = (formatLevel) => transcribe.buildFormatPrompt({ formatLevel, formatStyle: 'conversation' });
    const structured = ['structure', 'soft', 'medium', 'high'].every((lvl) =>
      p(lvl).includes('format it as a list') && p(lvl).includes('heading line') && p(lvl).includes('new topic') && p(lvl).includes('Never turn an ordinary comma-separated phrase'));
    return structured && !p('none').includes('format it as a list');
  })();
  // Boot the settings renderer hidden and make sure it wires up cleanly.
  checks.settingsRenderer = await new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'settings.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const errors = [];
    win.webContents.on('console-message', (e, level, message) => {
      if (level >= 3) errors.push(message);
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'settings.html'));
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 700));
        const wired = await win.webContents.executeJavaScript(
          "!!window.murmur && !!document.getElementById('nav') && document.getElementById('verLine').textContent !== 'v0.0.0'"
        );
        // Informational (not required, so offline machines stay green):
        // the model dropdowns should populate from the API or fall back.
        checks.modelDropdown = await win.webContents.executeJavaScript(
          "document.getElementById('model').options.length > 0"
        );
        // Regression check: clicking "Start using Murmur" must actually
        // dismiss the welcome card (visually, not just the hidden attribute).
        checks.onboardDismiss = await win.webContents.executeJavaScript(`(async () => {
          const ob = document.getElementById('onboard');
          ob.hidden = false;
          await new Promise((r) => setTimeout(r, 50));
          const shown = getComputedStyle(ob).display !== 'none';
          document.getElementById('obDone').click();
          await new Promise((r) => setTimeout(r, 500));
          const dismissed = getComputedStyle(ob).display === 'none';
          const { settings } = await window.murmur.getSettings();
          return shown && dismissed && settings.onboarded === true;
        })()`);
        if (errors.length) checks.settingsRendererErrors = errors;
        win.destroy();
        resolve(wired && errors.length === 0);
      } catch (err) {
        checks.settingsRendererErrors = [err.message];
        win.destroy();
        resolve(false);
      }
    });
    setTimeout(() => resolve(false), 15000);
  });
  {
    const prevClip = clipboard.readText();
    clipboard.writeText('murmur-smoke-clip');
    checks.clipboardMain = clipboard.readText() === 'murmur-smoke-clip';
    clipboard.writeText(prevClip);
  }
  const required = [
    'iconsExist', 'iconsDecode', 'settingsFile', 'tray', 'fetchGlobals',
    'injectHelper', 'injectChain', 'overlayLoaded', 'correctionDiff', 'clipboardMain',
    'correctionApply', 'settingsRenderer', 'onboardDismiss', 'keyStorage', 'formatPrompt', 'structurePrompt',
    'expansionApply', 'expansionPrivacy', 'analyticsEvents', 'analyticsCost', 'recapSchedule', 'numberPrompt', 'formatChatGuard', 'silenceSegments',
    IS_MAC ? 'macTrayTemplate' : 'sendKeysEscape',
  ];
  const ok = required.every((k) => checks[k] === true);
  console.log('SMOKE_RESULT ' + JSON.stringify({ ok, checks }));
  inject.dispose();
  hotkeys.stop();
  app.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------- lifecycle

const gotLock = app.requestSingleInstanceLock();
if (!gotLock && !SMOKE) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.labroi.murmur');
    // Tray app on macOS too: no Dock icon, no Cmd-Tab entry.
    if (IS_MAC && app.dock) app.dock.hide();
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
      cb(permission === 'media');
    });
    const s = settings.init();
    history.init();
    analytics.init();
    createTray();
    createOverlay();
    overlayWin.webContents.once('did-finish-load', broadcastWarmConfig);
    // Sleep and the lock screen can kill the audio capture underneath a warm
    // stream while its tracks still read live; make the overlay reopen it.
    powerMonitor.on('resume', () => sendOverlay('mic-rewarm'));
    powerMonitor.on('unlock-screen', () => sendOverlay('mic-rewarm'));
    settings.onChange((next, changed) => {
      if ('micDeviceId' in changed || 'warmMicSeconds' in changed) broadcastWarmConfig();
    });
    registerIpc();
    if (SMOKE) {
      await runSmoke();
      return;
    }
    applyHotkeys();
    recaps.start(recapDeps());
    if (!IS_MAC || app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.launchAtLogin });
    if (!s.onboarded) openSettings();
  });

  app.on('window-all-closed', () => {
    // Tray app: stay alive with no windows.
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    hotkeys.stop();
    recaps.stop();
    inject.dispose();
  });
}
