'use strict';

// Recap notifications, ported from VFlow: an optional weekly, monthly, and
// yearly wrap-up built from the local analytics log. A recap fires at most
// once per period: each cadence's most recent scheduled time is computed
// and compared against a persisted lastFired stamp, so a machine that was
// asleep at 9:00 still gets its recap once, late, when Murmur next checks.

const CHECK_EVERY_MS = 5 * 60 * 1000;

// Most recent scheduled fire time at or before `now` for a cadence.
function lastScheduled(kind, r, now) {
  const t = new Date(now);
  t.setHours(r.hour, 0, 0, 0);
  if (kind === 'weekly') {
    const back = (t.getDay() - r.dayOfWeek + 7) % 7;
    t.setDate(t.getDate() - back);
    if (t.getTime() > now) t.setDate(t.getDate() - 7);
  } else if (kind === 'monthly') {
    t.setDate(r.dayOfMonth);
    if (t.getTime() > now) t.setMonth(t.getMonth() - 1);
  } else {
    t.setMonth(0);
    t.setDate(r.dayOfMonth);
    if (t.getTime() > now) t.setFullYear(t.getFullYear() - 1);
  }
  return t.getTime();
}

// Which cadences are due right now. Pure, so smoke can pin it down.
function computeDue(recaps, now) {
  if (!recaps || !recaps.enabled) return [];
  const due = [];
  for (const kind of ['weekly', 'monthly', 'yearly']) {
    const cfg = recaps[kind];
    if (!cfg || !cfg.enabled) continue;
    const sched = lastScheduled(kind, cfg, now);
    const fired = (recaps.lastFired || {})[kind] || 0;
    if (fired < sched) due.push(kind);
  }
  return due;
}

const TRAILING_DAYS = { weekly: 7, monthly: 30, yearly: 365 };

function summarize(events, kind, baselineWpm, now) {
  const cutoff = now - TRAILING_DAYS[kind] * 86400000;
  const inRange = events.filter((e) => e.ts >= cutoff);
  const minutes = inRange.reduce((a, e) => a + (e.seconds || 0), 0) / 60;
  const words = inRange.reduce((a, e) => a + (e.words || 0), 0);
  const savedMin = Math.max(0, words / Math.max(10, baselineWpm || 40) - minutes);
  return { minutes, words, savedMin, count: inRange.length };
}

function recapText(kind, stats) {
  const period = kind === 'weekly' ? 'week' : kind === 'monthly' ? 'month' : 'year';
  if (!stats.count) {
    return { title: `Murmur ${kind} recap`, body: `A quiet ${period}: no dictations. Your hold key misses you.` };
  }
  const mins = stats.minutes >= 100 ? Math.round(stats.minutes) : Math.round(stats.minutes * 10) / 10;
  const saved = stats.savedMin >= 90 ? `${(stats.savedMin / 60).toFixed(1)} hours` : `${Math.round(stats.savedMin)} minutes`;
  return {
    title: `Murmur ${kind} recap`,
    body: `This ${period}: ${mins} min dictated, ${stats.words.toLocaleString()} words, about ${saved} saved versus typing.`,
  };
}

// Called from main. deps: { getSettings, setSettings, listEvents, notify }.
// notify(title, body) is injected so this module never touches Electron.
let timer = 0;

function start(deps) {
  const s = deps.getSettings();
  // Fresh install baseline: stamp every cadence to now so nobody gets three
  // recaps about usage that predates the feature.
  const lastFired = { ...(s.recaps.lastFired || {}) };
  let stamped = false;
  for (const kind of ['weekly', 'monthly', 'yearly']) {
    if (!lastFired[kind]) { lastFired[kind] = Date.now(); stamped = true; }
  }
  if (stamped) deps.setSettings({ recaps: { ...s.recaps, lastFired } });
  check(deps);
  timer = setInterval(() => check(deps), CHECK_EVERY_MS);
}

function check(deps) {
  const s = deps.getSettings();
  const now = Date.now();
  for (const kind of computeDue(s.recaps, now)) {
    fire(kind, deps);
    const fresh = deps.getSettings();
    deps.setSettings({ recaps: { ...fresh.recaps, lastFired: { ...(fresh.recaps.lastFired || {}), [kind]: now } } });
  }
}

function fire(kind, deps) {
  const s = deps.getSettings();
  const { title, body } = recapText(kind, summarize(deps.listEvents(), kind, s.baselineWpm, Date.now()));
  deps.notify(title, body);
}

function stop() {
  clearInterval(timer);
  timer = 0;
}

module.exports = { start, stop, fire, computeDue, lastScheduled, summarize, recapText };
