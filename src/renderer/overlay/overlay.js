'use strict';

// The overlay owns the microphone: capture, waveform, and cues all live here
// so the pill reflects the real signal, not a simulation of it.
//
// Two hard-won rules encoded below:
// 1. getUserMedia is slow (hundreds of ms). Every await is generation-guarded
//    so a release/cancel during mic-open can never leave an orphaned recorder
//    holding the mic and corrupting the next dictation.
// 2. The stream stays warm for a few seconds after a dictation, so
//    back-to-back dictations start instantly instead of re-opening the mic.

const pill = document.getElementById('pill');
const label = document.getElementById('label');
const value = document.getElementById('value');
const canvas = document.getElementById('wave');
const ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const AMBER = [240, 164, 75];
const BAR_COUNT = 44;
const BAR_W = 3;
const GAP = 2;
let warmStreamMs = 8000; // from the Keep mic warm setting; -1 means Always
let alwaysWarm = false;
let warmDeviceId = 'default';
let platform = 'win32';

let stream = null;
let lastDeviceId = null;
let releaseTimer = 0;
let recorder = null;
let chunks = [];
let audioCtx = null;
let analyser = null;
let captureGen = 0;
let raf = 0;
let bars = [];
let startedAt = 0;
let timerInterval = 0;
let mode = 'idle'; // idle | live | processing
let processT = 0;
let soundsOn = true;

// ---------------------------------------------------------------- audio cues

function blip(kind) {
  if (!soundsOn || reducedMotion) return;
  try {
    const ac = new AudioContext();
    const notes = kind === 'start' ? [523.25, 783.99] : kind === 'stop' ? [783.99, 523.25] : [196, 174.61];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.04, ac.currentTime + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.07 + 0.12);
      osc.connect(gain).connect(ac.destination);
      osc.start(ac.currentTime + i * 0.07);
      osc.stop(ac.currentTime + i * 0.07 + 0.14);
    });
    setTimeout(() => ac.close(), 500);
  } catch {}
}

// ---------------------------------------------------------------- waveform

function resizeCanvas() {
  const scale = devicePixelRatio || 1;
  canvas.width = 220 * scale;
  canvas.height = 36 * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
resizeCanvas();

function draw() {
  ctx.clearRect(0, 0, 220, 36);
  const mid = 18;

  if (mode === 'live' && analyser) {
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    bars.push(Math.min(1, rms * 3.2));
    if (bars.length > BAR_COUNT) bars.shift();
  } else if (mode === 'processing') {
    // signal handed off: a low sine ripple sweeps while we wait for words
    processT += 0.09;
    bars = Array.from({ length: BAR_COUNT }, (_, i) =>
      0.12 + 0.1 * Math.max(0, Math.sin(i * 0.55 - processT * 2.4))
    );
  }

  const startX = 220 - bars.length * (BAR_W + GAP);
  for (let i = 0; i < bars.length; i++) {
    const amp = bars[i];
    const h = Math.max(2.5, amp * 32);
    const isNewest = mode === 'live' && i === bars.length - 1;
    const alpha = mode === 'processing' ? 0.5 : 0.35 + amp * 0.65;
    ctx.fillStyle = `rgba(${AMBER[0]}, ${AMBER[1]}, ${AMBER[2]}, ${isNewest ? 1 : alpha})`;
    roundBar(startX + i * (BAR_W + GAP), mid - h / 2, BAR_W, h);
  }
  raf = requestAnimationFrame(draw);
}

function roundBar(x, y, w, h) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.fill();
}

function startDrawing() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

function stopDrawing() {
  cancelAnimationFrame(raf);
  raf = 0;
}

// ---------------------------------------------------------------- mic stream

function releaseStream() {
  clearTimeout(releaseTimer);
  releaseTimer = 0;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  analyser = null;
  lastDeviceId = null;
}

function scheduleStreamRelease() {
  clearTimeout(releaseTimer);
  if (warmStreamMs < 0) return; // Always warm: never release
  if (warmStreamMs === 0) {
    releaseStream();
    return;
  }
  releaseTimer = setTimeout(releaseStream, warmStreamMs);
}

// Warm-from-launch (US-022): open the stream and analyser without recording
// so the very first dictation of the day starts as fast as a back-to-back
// one. Fails silently; a cold dictation still opens the mic and reports
// real errors through the normal path.
async function warmStream(deviceId) {
  if (streamIsWarm(deviceId)) return;
  const gen = captureGen;
  releaseStream();
  let acquired;
  try {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (deviceId && deviceId !== 'default') audio.deviceId = { exact: deviceId };
    acquired = await navigator.mediaDevices.getUserMedia({ audio });
  } catch {
    return;
  }
  // A real capture started while the warm stream was opening; get out of
  // its way instead of clobbering the stream it owns.
  if (gen !== captureGen || stream) {
    acquired.getTracks().forEach((t) => t.stop());
    return;
  }
  stream = acquired;
  lastDeviceId = deviceId || 'default';
  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  watchStreamEnd();
}

// Re-warm when the device disappears (unplugged headset, changed default).
function watchStreamEnd() {
  if (!stream) return;
  for (const t of stream.getTracks()) {
    t.onended = () => {
      if (alwaysWarm && mode === 'idle') {
        releaseStream();
        setTimeout(() => warmStream(warmDeviceId), 1000);
      }
    };
  }
}

function streamIsWarm(deviceId) {
  return (
    stream &&
    lastDeviceId === (deviceId || 'default') &&
    stream.getTracks().length &&
    stream.getTracks().every((t) => t.readyState === 'live')
  );
}

// ---------------------------------------------------------------- recording

async function startCapture({ deviceId, sounds, warmSeconds, platform: plat }) {
  soundsOn = sounds !== false;
  if (plat) platform = plat;
  const ws = typeof warmSeconds === 'number' ? warmSeconds : 8;
  alwaysWarm = ws === -1;
  warmStreamMs = ws < 0 ? -1 : ws * 1000;
  bars = [];
  chunks = [];
  clearTimeout(releaseTimer);
  const gen = ++captureGen;

  // Defensive: a recorder should never still exist here, but never let one
  // linger and interleave into the new take.
  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop(); } catch {}
  }
  recorder = null;

  if (!streamIsWarm(deviceId)) {
    releaseStream();
    let acquired;
    try {
      const audio = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (deviceId && deviceId !== 'default') audio.deviceId = { exact: deviceId };
      acquired = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
      if (gen === captureGen) {
        mode = 'idle';
        window.murmur.recError(micErrorMessage(err));
      }
      return;
    }
    if (gen !== captureGen) {
      // Released or cancelled while the mic was opening; walk away cleanly.
      acquired.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = acquired;
    lastDeviceId = deviceId || 'default';
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    watchStreamEnd();
  }

  mode = 'live';
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  // 48 kbps opus is transparent for speech recognition and keeps even an
  // hour-long take (~21 MB) under Groq's 25 MB free-tier upload cap.
  recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.start(250);
  startedAt = Date.now();
  startTimer();
  startDrawing();
  blip('start');
  window.murmur.recStarted();
}

function micErrorMessage(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return platform === 'darwin'
      ? 'Microphone blocked. System Settings, Privacy & Security, Microphone: allow Murmur.'
      : 'Microphone blocked. Windows Settings, Privacy, Microphone: allow desktop apps.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Selected microphone not found. Pick another one in Settings.';
  }
  if (name === 'NotReadableError') {
    return 'Microphone is busy in another app.';
  }
  return `Microphone error: ${err && err.message ? err.message : name || 'unknown'}`;
}

function stopCapture(discard) {
  stopTimer();
  const ms = Date.now() - startedAt;
  if (!recorder || recorder.state === 'inactive') {
    // The mic was still opening when the key was released. Invalidate the
    // pending acquisition so it can't start an orphaned recording.
    captureGen++;
    recorder = null;
    chunks = [];
    scheduleStreamRelease();
    if (!discard) {
      window.murmur.recError('The mic was still starting. Hold a moment longer and try again.');
    }
    return;
  }
  recorder.onstop = async () => {
    if (!discard) {
      mode = 'processing';
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const buf = await blob.arrayBuffer();
      window.murmur.recData(buf, { ms });
    } else {
      mode = 'idle';
      stopDrawing();
    }
    recorder = null;
    chunks = [];
    scheduleStreamRelease();
  };
  recorder.stop();
  blip('stop');
}

// ---------------------------------------------------------------- timer + ui

function startTimer() {
  clearInterval(timerInterval); // never let two timers race over the readout
  value.textContent = '0:00';
  timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    value.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }, 200);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = 0;
}

window.murmur.on('rec-start', startCapture);
window.murmur.on('warm-config', ({ deviceId, warmSeconds, platform: plat }) => {
  if (plat) platform = plat;
  alwaysWarm = warmSeconds === -1;
  warmDeviceId = deviceId || 'default';
  warmStreamMs = alwaysWarm ? -1 : (typeof warmSeconds === 'number' ? warmSeconds : 8) * 1000;
  if (mode !== 'idle') return; // a live take applies the new policy when it ends
  if (alwaysWarm) warmStream(warmDeviceId);
  else if (stream) scheduleStreamRelease();
});
window.murmur.on('rec-stop', () => stopCapture(false));
window.murmur.on('rec-cancel', () => {
  stopCapture(true);
  mode = 'idle';
  stopDrawing();
  pill.dataset.state = 'hidden'; // main hides the window after the exit plays
});

window.murmur.on('state', ({ state, words, message }) => {
  pill.dataset.state = state;
  if (state === 'listening') {
    label.textContent = 'LISTENING';
  } else if (state === 'processing') {
    label.textContent = 'TRANSCRIBING';
    value.textContent = '...';
    mode = 'processing';
    startDrawing();
  } else if (state === 'done') {
    stopTimer();
    label.textContent = 'INSERTED';
    value.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
    mode = 'idle';
    stopDrawing();
    ctx.clearRect(0, 0, 220, 36);
  } else if (state === 'error') {
    stopTimer();
    label.textContent = 'ERROR';
    value.textContent = message || 'Something went wrong';
    mode = 'idle';
    stopDrawing();
    blip('error');
  } else if (state === 'hidden') {
    // Exit: the CSS falls the pill away; main hides the window right after.
    stopTimer();
    mode = 'idle';
    stopDrawing();
    ctx.clearRect(0, 0, 220, 36);
  }
  // An errored or finished take can leave the stream released; Always mode
  // quietly re-warms so the next start is still instant.
  if ((state === 'done' || state === 'error') && alwaysWarm && !stream) {
    warmStream(warmDeviceId);
  }
});
