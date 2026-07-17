'use strict';

const path = require('path');
const fs = require('fs');
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain,
  screen, nativeImage, shell, session,
} = require('electron');

const settings = require('./settings');
const history = require('./history');
const transcribe = require('./transcribe');
const inject = require('./inject');
const hotkeys = require('./hotkeys');

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

function openSettings(tab) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    if (tab) settingsWin.webContents.send('goto-tab', tab);
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
  sendOverlay('rec-start', { deviceId: s.micDeviceId, sounds: s.sounds });
  if (tray && trayRec) tray.setImage(trayRec);
  bindEsc();
  maxTimer = setTimeout(() => stopDictation(), Math.max(10, s.maxSeconds) * 1000);
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
      s.holdKeycode,
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

function createTray() {
  trayIdle = nativeImage.createFromPath(path.join(ASSETS, 'tray-idle.png'));
  trayRec = nativeImage.createFromPath(path.join(ASSETS, 'tray-rec.png'));
  tray = new Tray(trayIdle);
  tray.setToolTip('Murmur, push to talk dictation');
  const menu = Menu.buildFromTemplate([
    { label: 'Start dictation', click: () => startDictation('toggle') },
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
    },
  }));

  ipcMain.handle('settings:set', (e, partial) => {
    const before = settings.get();
    const next = settings.set(partial);
    let error = null;
    if ('launchAtLogin' in partial) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    }
    const needsRebind = ['toggleShortcut', 'holdEnabled', 'holdKeycode'].some((k) => k in partial);
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
  ipcMain.handle('hold:capture', async () => {
    const result = await hotkeys.captureNextKey();
    return result;
  });
  ipcMain.handle('history:list', () => history.list());
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
  checks.iconsExist = iconFiles.every((f) => fs.existsSync(path.join(ASSETS, f)));
  checks.iconsDecode = iconFiles.every((f) => !nativeImage.createFromPath(path.join(ASSETS, f)).isEmpty());
  checks.settingsFile = fs.existsSync(path.join(app.getPath('userData'), 'settings.json'));
  checks.tray = !!tray;
  checks.fetchGlobals = typeof fetch === 'function' && typeof FormData === 'function' && typeof Blob === 'function';
  checks.holdAvailable = hotkeys.available();
  try {
    checks.injectHelper = await inject.ping();
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
  checks.sendKeysEscape = inject.escapeSendKeys('a+b{c}\n') === 'a{+}b{{}c{}}{ENTER}';
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
  const required = ['iconsExist', 'iconsDecode', 'settingsFile', 'tray', 'fetchGlobals', 'injectHelper', 'overlayLoaded', 'sendKeysEscape', 'settingsRenderer', 'onboardDismiss'];
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
    app.setLoginItemSettings({ openAtLogin: s.launchAtLogin });
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
