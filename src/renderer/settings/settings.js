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
  $('formatStyle').value = S.formatStyle;
  $('formatLevel').value = S.formatLevel;
  $('language').value = S.language;
  $('historyEnabled').checked = S.historyEnabled;
  $('analyticsEnabled').checked = S.analyticsEnabled;
  $('baselineWpm').value = S.baselineWpm;
  renderRecaps();
  renderChips();
  renderExpansions();
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
  if (tab === 'analytics') refreshAnalytics();
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
bindCheck('analyticsEnabled', 'analyticsEnabled');
bindValue('baselineWpm', 'baselineWpm', (v) => Math.min(200, Math.max(10, Number(v) || 40)));
bindValue('insertMethod', 'insertMethod');
bindValue('formatStyle', 'formatStyle');
bindValue('formatLevel', 'formatLevel');
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

function renderExpansions() {
  const wrap = $('expList');
  wrap.replaceChildren();
  const list = S.expansions || [];
  $('expEmpty').hidden = list.length > 0;
  list.forEach((exp, i) => {
    const row = document.createElement('div');
    row.className = 'corr-row' + (exp.enabled === false ? ' exp-off' : '');
    const from = document.createElement('span');
    from.className = 'corr-from';
    from.textContent = `"${exp.trigger}"`;
    const arrow = document.createElement('span');
    arrow.className = 'corr-arrow';
    arrow.textContent = '→';
    const to = document.createElement('span');
    to.className = 'corr-to';
    to.textContent = exp.value;
    to.title = exp.value;
    const onOff = document.createElement('label');
    onOff.className = 'switch';
    onOff.style.marginLeft = 'auto';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = exp.enabled !== false;
    cb.addEventListener('change', () => {
      const next = S.expansions.slice();
      next[i] = { ...next[i], enabled: cb.checked };
      save({ expansions: next }).then(renderExpansions);
    });
    onOff.append(cb, document.createElement('span'));
    const del = document.createElement('button');
    del.className = 'btn subtle';
    del.textContent = '✕';
    del.title = 'Delete this expansion';
    del.addEventListener('click', () => {
      save({ expansions: S.expansions.filter((_, j) => j !== i) }).then(renderExpansions);
    });
    row.append(from, arrow, to, onOff, del);
    wrap.appendChild(row);
  });
}

$('expTrigger').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('expValue').focus();
});

$('expValue').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const trigger = $('expTrigger').value.trim();
  const value = $('expValue').value.trim();
  if (!trigger || !value) { toast('An expansion needs both a trigger and a text.'); return; }
  if ((S.expansions || []).some((x) => x.trigger.toLowerCase() === trigger.toLowerCase())) {
    toast('That trigger already exists. Delete it first to change it.');
    return;
  }
  save({ expansions: [...(S.expansions || []), { trigger, value, enabled: true }] }).then(renderExpansions);
  $('expTrigger').value = '';
  $('expValue').value = '';
  $('expTrigger').focus();
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

// ---------------------------------------------------------------- analytics

async function refreshAnalytics() {
  const events = await window.murmur.analyticsList();
  const days = Number($('anaRange').value);
  const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
  const inRange = events.filter((e) => e.ts >= cutoff);

  const seconds = inRange.reduce((a, e) => a + (e.seconds || 0), 0);
  const words = inRange.reduce((a, e) => a + (e.words || 0), 0);
  const cost = inRange.reduce((a, e) => a + (e.cost || 0), 0);
  const minutes = seconds / 60;
  const wpm = minutes > 0 ? words / minutes : 0;
  const savedMin = Math.max(0, words / Math.max(10, S.baselineWpm) - minutes);

  $('anaMinutes').textContent = minutes >= 100 ? Math.round(minutes) : minutes.toFixed(1);
  $('anaWords').textContent = words.toLocaleString();
  $('anaWpm').textContent = Math.round(wpm);
  $('anaCost').textContent = cost < 0.005 && cost > 0 ? '<$0.01' : `$${cost.toFixed(2)}`;
  $('anaSaved').textContent = savedMin >= 90 ? `${(savedMin / 60).toFixed(1)} hr` : `${Math.round(savedMin)} min`;
  $('anaCount').textContent = inRange.length.toLocaleString();
  $('anaEmpty').hidden = inRange.length > 0;
  drawAnaChart(inRange, days || 90);
}

// Minutes-per-day bars, drawn by hand: no chart library, night studio quiet.
function drawAnaChart(events, days) {
  const canvas = $('anaChart');
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const W = canvas.width, H = canvas.height, pad = 24;
  ctx.clearRect(0, 0, W, H);
  const shown = Math.min(days, 90);
  const perDay = new Array(shown).fill(0);
  const dayMs = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const e of events) {
    const idx = shown - 1 - Math.floor((today.getTime() + dayMs - e.ts) / dayMs);
    if (idx >= 0 && idx < shown) perDay[idx] += (e.seconds || 0) / 60;
  }
  const max = Math.max(1, ...perDay);
  const bw = (W - pad * 2) / shown;
  ctx.fillStyle = css.getPropertyValue('--muted').trim() || '#8D8A94';
  for (let i = 0; i < shown; i++) {
    const h = (perDay[i] / max) * (H - pad * 2);
    if (h > 0) ctx.fillRect(pad + i * bw + 1, H - pad - h, Math.max(1, bw - 2), h);
  }
  ctx.strokeStyle = css.getPropertyValue('--hairline').trim() || '#2A2830';
  ctx.beginPath();
  ctx.moveTo(pad, H - pad + 0.5);
  ctx.lineTo(W - pad, H - pad + 0.5);
  ctx.stroke();
  ctx.fillStyle = css.getPropertyValue('--faint').trim() || '#5C5964';
  ctx.font = '10px monospace';
  ctx.fillText(`${max.toFixed(1)} min peak`, pad, pad - 8);
}

$('anaRange').addEventListener('change', refreshAnalytics);
$('anaClear').addEventListener('click', async () => {
  await window.murmur.analyticsClear();
  refreshAnalytics();
});

// Recaps: one nested settings object, updated wholesale.
function saveRecaps(mutate) {
  const next = JSON.parse(JSON.stringify(S.recaps));
  mutate(next);
  save({ recaps: next });
}

function renderRecaps() {
  if (!$('recapHour').options.length) {
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement('option');
      opt.value = String(h);
      opt.textContent = `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;
      $('recapHour').appendChild(opt);
    }
  }
  const r = S.recaps;
  $('recapsEnabled').checked = r.enabled;
  $('recapWeekly').checked = r.weekly.enabled;
  $('recapMonthly').checked = r.monthly.enabled;
  $('recapYearly').checked = r.yearly.enabled;
  $('recapDay').value = String(r.weekly.dayOfWeek);
  $('recapHour').value = String(r.weekly.hour);
}

$('recapsEnabled').addEventListener('change', (e) => saveRecaps((r) => { r.enabled = e.target.checked; }));
$('recapWeekly').addEventListener('change', (e) => saveRecaps((r) => { r.weekly.enabled = e.target.checked; }));
$('recapMonthly').addEventListener('change', (e) => saveRecaps((r) => { r.monthly.enabled = e.target.checked; }));
$('recapYearly').addEventListener('change', (e) => saveRecaps((r) => { r.yearly.enabled = e.target.checked; }));
$('recapDay').addEventListener('change', (e) => saveRecaps((r) => { r.weekly.dayOfWeek = Number(e.target.value); }));
$('recapHour').addEventListener('change', (e) => saveRecaps((r) => {
  const hour = Number(e.target.value);
  r.weekly.hour = hour; r.monthly.hour = hour; r.yearly.hour = hour;
}));
$('recapTest').addEventListener('click', () => window.murmur.recapsTest());

// ---------------------------------------------------------------- platform

// The HTML is written in the Windows voice; on macOS the copy and the extra
// permission rows swap in here.
function applyPlatform() {
  if (META.platform !== 'darwin') return;
  $('launchDesc').textContent = 'Start Murmur in the menu bar when you log in.';
  $('micDesc').textContent = 'macOS asks for microphone access the first time. Manage it in System Settings, Privacy & Security, Microphone.';
  $('warmDesc').textContent = 'macOS takes a moment to open the microphone, so Murmur holds it open briefly after each dictation to make the next one start instantly.';
  $('warmNote').textContent = 'Why this is a setting: while the mic is warm, the macOS mic-in-use indicator stays on even though nothing is recorded or sent. Choose Off if you want the indicator gone the instant a dictation ends; the tradeoff is a short delay before each one starts. Always holds the mic open from launch so even your first dictation of the day starts instantly, with the indicator on the whole time.';
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
