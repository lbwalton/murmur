'use strict';

const $ = (id) => document.getElementById(id);

let S = null;    // settings
let META = null; // { version, holdAvailable, userDataPath }

// ---------------------------------------------------------------- helpers

function toast(message, ms = 4500, kind = 'error') {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('ok', kind === 'ok');
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

async function save(partial) {
  const { settings, error } = await window.murmur.setSettings(partial);
  S = settings;
  if (error) {
    toast(error);
    render();
  }
}

function prettyAccelerator(acc) {
  return acc.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ');
}

// ---------------------------------------------------------------- render

function render() {
  $('holdEnabled').checked = S.holdEnabled;
  $('holdKeyBtn').textContent = S.holdKeyLabel;
  $('toggleBtn').textContent = prettyAccelerator(S.toggleShortcut);
  $('insertMethod').value = S.insertMethod;
  $('restoreClipboard').checked = S.restoreClipboard;
  $('sounds').checked = S.sounds;
  $('launchAtLogin').checked = S.launchAtLogin;
  $('maxSeconds').value = String(S.maxSeconds);
  $('noLimitWarning').hidden = S.maxSeconds !== 0;
  $('warmMicSeconds').value = String(S.warmMicSeconds);
  if (document.activeElement !== $('apiKey')) $('apiKey').value = S.apiKey;
  if (document.activeElement !== $('baseUrl')) $('baseUrl').value = S.baseUrl;
  if ($('model').options.length) $('model').value = S.model;
  if ($('formatModel').options.length) $('formatModel').value = S.formatModel;
  $('smartFormat').checked = S.smartFormat;
  $('language').value = S.language;
  $('historyEnabled').checked = S.historyEnabled;
  renderChips();
  renderCorrections();

  $('verLine').textContent = `v${META.version}`;
  $('aboutVersion').textContent = META.version;
  $('aboutData').textContent = META.userDataPath;
  $('holdStatus').textContent = META.holdAvailable ? 'HOLD KEY · READY' : 'HOLD KEY · UNAVAILABLE';
  $('holdUnavailable').hidden = META.holdAvailable;
  $('holdKeyBtn').disabled = !META.holdAvailable;
  $('obHoldKey').textContent = S.holdKeyLabel;
  $('obToggle').textContent = prettyAccelerator(S.toggleShortcut);
}

// ---------------------------------------------------------------- tabs

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => gotoTab(btn.dataset.tab));
});

function gotoTab(tab) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
  if (tab === 'history') refreshHistory();
  if (tab === 'voice') { populateMics(); populateModels(true); }
}

window.murmur.on('goto-tab', gotoTab);

// ---------------------------------------------------------------- bindings

const bindCheck = (id, key) => $(id).addEventListener('change', (e) => save({ [key]: e.target.checked }));
const bindValue = (id, key, transform = (v) => v) =>
  $(id).addEventListener('change', (e) => save({ [key]: transform(e.target.value) }));

bindCheck('holdEnabled', 'holdEnabled');
bindCheck('restoreClipboard', 'restoreClipboard');
bindCheck('sounds', 'sounds');
bindCheck('launchAtLogin', 'launchAtLogin');
bindCheck('smartFormat', 'smartFormat');
bindCheck('historyEnabled', 'historyEnabled');
bindValue('insertMethod', 'insertMethod');
bindValue('maxSeconds', 'maxSeconds', Number);
bindValue('warmMicSeconds', 'warmMicSeconds', Number);
bindValue('language', 'language');
bindValue('apiKey', 'apiKey', (v) => v.trim());
bindValue('micSelect', 'micDeviceId');
$('baseUrl').addEventListener('change', async (e) => {
  await save({ baseUrl: e.target.value.trim().replace(/\/$/, '') });
  populateModels(true);
});

// ---------------------------------------------------------------- model pickers

// Pay-as-you-go rates for models Groq commonly serves; free tier is $0 within
// daily limits regardless. Unlisted models show without a price note.
const STT_NOTES = {
  'whisper-large-v3-turbo': '~$0.04/hr · fast · recommended',
  'whisper-large-v3': '~$0.11/hr · highest accuracy',
  'distil-whisper-large-v3-en': '~$0.02/hr · English only',
};
const LLM_NOTES = {
  'llama-3.1-8b-instant': 'fastest · ~$0.06 per 1M tokens · recommended',
  'llama-3.3-70b-versatile': 'smartest cleanup · ~$0.70 per 1M tokens',
  'openai/gpt-oss-20b': 'strong + cheap · ~$0.15 per 1M tokens',
  'openai/gpt-oss-120b': 'very strong · ~$0.40 per 1M tokens',
};

let modelsCache = null;

function fillModelSelect(sel, ids, notes, current) {
  const list = ids.slice();
  if (current && !list.includes(current)) list.unshift(current);
  sel.replaceChildren();
  for (const id of list) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = notes[id] ? `${id} · ${notes[id]}` : id;
    sel.appendChild(opt);
  }
  const custom = document.createElement('option');
  custom.value = '__custom';
  custom.textContent = 'Custom model id...';
  sel.appendChild(custom);
  sel.value = current;
}

async function populateModels(force = false) {
  if (modelsCache === null || force) {
    const res = await window.murmur.listModels();
    modelsCache = res.ok ? res.models : [];
  }
  const stt = modelsCache.filter((id) => /whisper/i.test(id));
  const llm = modelsCache.filter((id) => !/whisper|orpheus|tts|guard|embed|compound/i.test(id));
  fillModelSelect($('model'), stt.length ? stt : Object.keys(STT_NOTES), STT_NOTES, S.model);
  fillModelSelect($('formatModel'), llm.length ? llm : Object.keys(LLM_NOTES), LLM_NOTES, S.formatModel);
}

function bindModelSelect(selId, key) {
  const sel = $(selId);
  sel.addEventListener('change', () => {
    if (sel.value !== '__custom') {
      save({ [key]: sel.value });
      return;
    }
    // Swap the select for a text input so any model id can be typed.
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mono-input';
    input.placeholder = 'model-id';
    input.value = S[key];
    input.style.flex = '1';
    sel.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = async (revert) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      input.replaceWith(sel);
      if (!revert && v && v !== S[key]) await save({ [key]: v });
      await populateModels();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit(false);
      if (e.key === 'Escape') commit(true);
    });
    input.addEventListener('blur', () => commit(false));
  });
}

bindModelSelect('model', 'model');
bindModelSelect('formatModel', 'formatModel');

// toggle shortcut capture (DOM keydown -> Electron accelerator)
const CODE_MAP = { Space: 'Space', Comma: ',', Period: '.', Slash: '/', Backquote: '`', Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\' };

$('toggleBtn').addEventListener('click', () => {
  const btn = $('toggleBtn');
  btn.classList.add('listening');
  btn.textContent = 'press keys...';
  const onKey = (e) => {
    e.preventDefault();
    if (e.key === 'Escape') return cleanup();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    const mods = [];
    if (e.ctrlKey) mods.push('Control');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');
    let key = null;
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
    else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
    else if (CODE_MAP[e.code]) key = CODE_MAP[e.code];
    if (!key) return;
    if (!mods.length && !/^F\d{1,2}$/.test(key)) { toast('Add a modifier (Ctrl, Alt, Shift) or use an F-key.'); return; }
    cleanup();
    save({ toggleShortcut: [...mods, key].join('+') });
  };
  const cleanup = () => {
    window.removeEventListener('keydown', onKey, true);
    btn.classList.remove('listening');
    render();
  };
  window.addEventListener('keydown', onKey, true);
});

// hold key capture (global, via uiohook in main)
$('holdKeyBtn').addEventListener('click', async () => {
  const btn = $('holdKeyBtn');
  btn.classList.add('listening');
  btn.textContent = 'press any key...';
  try {
    const { keycodes, label } = await window.murmur.captureHoldKey();
    await save({ holdKeycodes: keycodes, holdKeyLabel: label });
  } catch {
    toast('Key capture timed out.');
  }
  btn.classList.remove('listening');
  render();
});

// ---------------------------------------------------------------- connection test

async function runTest(statusEl) {
  statusEl.hidden = false;
  statusEl.className = 'row-note mono';
  statusEl.textContent = 'TESTING...';
  const { ok, message } = await window.murmur.testConnection();
  statusEl.textContent = (ok ? 'OK · ' : 'FAILED · ') + message;
  statusEl.classList.add(ok ? 'status-ok' : 'status-err');
  return ok;
}

$('testBtn').addEventListener('click', async () => {
  if (document.activeElement === $('apiKey')) $('apiKey').blur();
  await save({ apiKey: $('apiKey').value.trim() });
  const ok = await runTest($('testStatus'));
  if (ok) populateModels(true);
});

// ---------------------------------------------------------------- microphone

async function populateMics() {
  try {
    // A quick permission grab so device labels are readable.
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
    tmp.getTracks().forEach((t) => t.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications');
    const sel = $('micSelect');
    sel.replaceChildren();
    const def = document.createElement('option');
    def.value = 'default';
    def.textContent = 'System default';
    sel.appendChild(def);
    for (const m of mics) {
      if (m.deviceId === 'default') continue;
      const opt = document.createElement('option');
      opt.value = m.deviceId;
      opt.textContent = m.label || 'Microphone';
      sel.appendChild(opt);
    }
    sel.value = [...sel.options].some((o) => o.value === S.micDeviceId) ? S.micDeviceId : 'default';
  } catch {
    toast(`Could not list microphones. Check ${META && META.platform === 'darwin' ? 'macOS' : 'Windows'} microphone privacy settings.`);
  }
}

let meterStream = null;
let meterRaf = 0;

$('micTestBtn').addEventListener('click', async () => {
  if (meterStream) return stopMeter();
  try {
    const audio = S.micDeviceId !== 'default' ? { deviceId: { exact: S.micDeviceId } } : true;
    meterStream = await navigator.mediaDevices.getUserMedia({ audio });
  } catch {
    toast(`Could not open the microphone. Check ${META && META.platform === 'darwin' ? 'macOS' : 'Windows'} privacy settings.`);
    return;
  }
  $('meter').hidden = false;
  $('micTestBtn').textContent = 'Stop';
  const ac = new AudioContext();
  const an = ac.createAnalyser();
  an.fftSize = 512;
  ac.createMediaStreamSource(meterStream).connect(an);
  const data = new Uint8Array(an.fftSize);
  const tick = () => {
    an.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    $('meterFill').style.width = `${Math.min(100, Math.sqrt(sum / data.length) * 300)}%`;
    meterRaf = requestAnimationFrame(tick);
  };
  tick();
  stopMeter._ac = ac;
});

function stopMeter() {
  cancelAnimationFrame(meterRaf);
  if (meterStream) meterStream.getTracks().forEach((t) => t.stop());
  if (stopMeter._ac) stopMeter._ac.close().catch(() => {});
  meterStream = null;
  $('meter').hidden = true;
  $('meterFill').style.width = '0%';
  $('micTestBtn').textContent = 'Check level';
}

// ---------------------------------------------------------------- dictionary

function renderChips() {
  const wrap = $('chips');
  wrap.replaceChildren();
  $('dictEmpty').hidden = S.dictionary.length > 0;
  S.dictionary.forEach((word, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const text = document.createElement('span');
    text.textContent = word;
    const x = document.createElement('button');
    x.textContent = '✕';
    x.title = `Remove ${word}`;
    x.addEventListener('click', () => {
      const next = S.dictionary.slice();
      next.splice(i, 1);
      save({ dictionary: next }).then(render);
    });
    chip.append(text, x);
    wrap.appendChild(chip);
  });
}

$('dictInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const word = e.target.value.trim();
  if (!word) return;
  if (S.dictionary.some((w) => w.toLowerCase() === word.toLowerCase())) {
    e.target.value = '';
    return;
  }
  save({ dictionary: [...S.dictionary, word] }).then(render);
  e.target.value = '';
});

function renderCorrections() {
  const wrap = $('corrList');
  wrap.replaceChildren();
  const list = S.corrections || [];
  $('corrEmpty').hidden = list.length > 0;
  for (const c of list) {
    const row = document.createElement('div');
    row.className = 'corr-row';
    const from = document.createElement('span');
    from.className = 'corr-from';
    from.textContent = `"${c.from}"`;
    const arrow = document.createElement('span');
    arrow.className = 'corr-arrow';
    arrow.textContent = '→';
    const to = document.createElement('span');
    to.className = 'corr-to';
    to.textContent = `"${c.to}"`;
    const count = document.createElement('span');
    count.className = 'corr-count';
    count.textContent = `x${c.count}`;
    const del = document.createElement('button');
    del.className = 'btn subtle';
    del.textContent = '✕';
    del.title = 'Forget this correction';
    del.addEventListener('click', () => {
      save({ corrections: (S.corrections || []).filter((x) => !(x.from === c.from && x.to === c.to)) })
        .then(renderCorrections);
    });
    row.append(from, arrow, to, count, del);
    wrap.appendChild(row);
  }
}

// ---------------------------------------------------------------- history

async function refreshHistory() {
  const items = await window.murmur.historyList();
  const list = $('historyList');
  list.replaceChildren();
  $('historyEmpty').hidden = items.length > 0;
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'h-item';
    const text = document.createElement('div');
    text.className = 'h-text';
    text.textContent = item.text;
    text.title = item.text;
    const meta = document.createElement('div');
    meta.className = 'h-meta';
    const when = new Date(item.ts);
    meta.textContent = `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${item.words}w`;
    const actions = document.createElement('div');
    actions.className = 'h-actions';
    const edit = document.createElement('button');
    edit.className = 'btn edit-btn';
    edit.textContent = 'Fix';
    edit.title = 'Correct this transcript; Murmur learns from your fix';
    edit.addEventListener('click', () => openEditor(row, item));
    const copy = document.createElement('button');
    copy.className = 'btn';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(item.text);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
    });
    const del = document.createElement('button');
    del.className = 'btn subtle';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', async () => {
      await window.murmur.historyDelete(item.id);
      refreshHistory();
    });
    actions.append(edit, copy, del);
    row.append(text, meta, actions);
    list.appendChild(row);
  }
  return items;
}

function openEditor(row, item) {
  const editor = document.createElement('textarea');
  editor.className = 'h-text-edit';
  editor.value = item.text;
  const actions = document.createElement('div');
  actions.className = 'h-actions';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn primary';
  saveBtn.textContent = 'Save fix';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn subtle';
  cancelBtn.textContent = 'Cancel';
  saveBtn.addEventListener('click', async () => {
    const fixed = editor.value.trim();
    if (fixed && fixed !== item.text) {
      const res = await window.murmur.historyUpdate(item.id, fixed);
      if (res.learned.length) {
        let msg = 'Learned: ' + res.learned.map((p) => `"${p.from}" → "${p.to}"`).join(', ');
        if (res.promoted.length) msg += `. Added to dictionary: ${res.promoted.join(', ')}`;
        toast(msg, 6000, 'ok');
      }
    }
    refreshHistory();
  });
  cancelBtn.addEventListener('click', refreshHistory);
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBtn.click(); }
    if (e.key === 'Escape') refreshHistory();
  });
  actions.append(saveBtn, cancelBtn);
  row.replaceChildren(editor, actions);
  editor.focus();
}

window.murmur.on('edit-latest', async () => {
  gotoTab('history');
  await refreshHistory();
  const first = $('historyList').querySelector('.edit-btn');
  if (first) first.click();
});

$('clearHistory').addEventListener('click', async () => {
  await window.murmur.historyClear();
  refreshHistory();
});

window.murmur.on('history-changed', () => {
  if (document.querySelector('.panel[data-panel="history"]').classList.contains('active')) refreshHistory();
});

// ---------------------------------------------------------------- onboarding

$('obTest').addEventListener('click', async () => {
  await save({ apiKey: $('obKey').value.trim() });
  $('apiKey').value = S.apiKey;
  runTest($('obStatus'));
});

$('obDone').addEventListener('click', async () => {
  if ($('obKey').value.trim() && $('obKey').value.trim() !== S.apiKey) {
    await save({ apiKey: $('obKey').value.trim() });
  }
  await save({ onboarded: true });
  $('onboard').hidden = true;
});

// ---------------------------------------------------------------- platform

// The HTML is written in the Windows voice; on macOS the copy and the extra
// permission rows swap in here.
function applyPlatform() {
  if (META.platform !== 'darwin') return;
  $('launchDesc').textContent = 'Start Murmur in the menu bar when you log in.';
  $('micDesc').textContent = 'macOS asks for microphone access the first time. Manage it in System Settings, Privacy & Security, Microphone.';
  $('warmDesc').textContent = 'macOS takes a moment to open the microphone, so Murmur holds it open briefly after each dictation to make the next one start instantly.';
  $('warmNote').textContent = 'Why this is a setting: while the mic is warm, the macOS mic-in-use indicator stays on even though nothing is recorded or sent. Choose Off if you want the indicator gone the instant a dictation ends; the tradeoff is a short delay before each one starts.';
  $('aboutLede').textContent = 'Push to talk dictation. Hold a key anywhere, speak, release, and clean text lands at your cursor.';
  $('obMicDesc').textContent = 'macOS asks the first time Murmur uses the microphone. Also grant Accessibility in System Settings, Privacy & Security, so Murmur can insert text.';
  $('macPerms').hidden = false;
  refreshPermStatus();
  $('axGrantBtn').addEventListener('click', async () => {
    await window.murmur.permRequestAccessibility();
    setTimeout(refreshPermStatus, 800);
  });
  $('axOpenBtn').addEventListener('click', () => window.murmur.permOpenPane('accessibility'));
  $('imOpenBtn').addEventListener('click', () => window.murmur.permOpenPane('inputMonitoring'));
  // Coming back from System Settings should reflect the new grant right away.
  window.addEventListener('focus', refreshPermStatus);
}

async function refreshPermStatus() {
  const st = await window.murmur.permStatus();
  const el = $('axStatus');
  el.textContent = st.accessibility ? '· GRANTED' : '· NOT GRANTED';
  el.classList.toggle('status-ok', !!st.accessibility);
  el.classList.toggle('status-err', !st.accessibility);
  $('axGrantBtn').hidden = !!st.accessibility;
}

// ---------------------------------------------------------------- misc

document.querySelectorAll('.link[data-href]').forEach((el) => {
  el.addEventListener('click', () => window.murmur.openExternal(el.dataset.href));
});

window.murmur.on('settings-changed', (settings) => {
  S = settings;
  render();
});

// ---------------------------------------------------------------- boot

(async function boot() {
  const { settings, meta } = await window.murmur.getSettings();
  S = settings;
  META = meta;
  render();
  applyPlatform();
  $('keyStorageNote').textContent = META.keyEncrypted
    ? ' Encrypted with the OS keystore.'
    : ' Heads up: no OS keystore here, so it is stored in plain text.';
  populateMics();
  populateModels();
  if (!S.onboarded) $('onboard').hidden = false;
})();
