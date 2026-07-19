'use strict';

const path = require('path');
const fs = require('fs');
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain,
  screen, nativeImage, shell, session, systemPreferences,
} = require('electron');

const IS_MAC = process.platform === 'darwin';

const settings = require('./settings');
const history = require('./history');
const transcribe = require('./transcribe');
const inject = require('./inject');
const hotkeys = require('./hotkeys');
const corrections = require('./corrections');

const SMOKE = process.argv.includes('--smoke');
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
  sendOverlay('rec-start', { deviceId: s.micDeviceId, sounds: s.sounds, warmSeconds: s.warmMicSeconds });
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
  overlayWin.hide();
}

function finishCycle() {
  state = 'idle';
  recSource = null;
  if (tray && trayIdle) tray.setImage(trayIdle);
  unbindEsc();
}

function hideOverlayIfIdle() {
  if (state === 'idle' && overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
}

async function handleAudio(arrayBuffer, meta) {
  const s = settings.get();
  const gen = recGen;
  const startedProcessing = Date.now();
  try {
    const raw = Buffer.from(arrayBuffer);
    if (raw.length < 1200) throw new Error('No speech detected');
    let text = await transcribe.transcribe(raw, s);
    if (!text) throw new Error('No speech detected');
    text = corrections.applyCorrections(text, s.corrections);
    if (s.smartFormat) text = await transcribe.smartFormat(text, s);
    if (gen !== recGen) return; // cancelled while transcribing
    await inject.insert(text, s);
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    if (s.historyEnabled) {
      history.add({ text, words, ms: meta && meta.ms ? meta.ms : 0, model: s.model });
      if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('history-changed');
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
  const required = [
    'iconsExist', 'iconsDecode', 'settingsFile', 'tray', 'fetchGlobals',
    'injectHelper', 'injectChain', 'overlayLoaded', 'correctionDiff',
    'correctionApply', 'settingsRenderer', 'onboardDismiss', 'keyStorage', 'formatPrompt', 'structurePrompt',
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
    createTray();
    createOverlay();
    registerIpc();
    if (SMOKE) {
      await runSmoke();
      return;
    }
    applyHotkeys();
    if (!IS_MAC || app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.launchAtLogin });
    if (!s.onboarded) openSettings();
  });

  app.on('window-all-closed', () => {
    // Tray app: stay alive with no windows.
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    hotkeys.stop();
    inject.dispose();
  });
}
