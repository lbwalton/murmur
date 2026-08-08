'use strict';

// Talks to any OpenAI-compatible endpoint. Groq is the default because its
// Whisper hosting is the cheapest hosted option and has a workable free tier,
// but a local server (speaches, faster-whisper-server) drops in via baseUrl.

// US-101: every formatter rule (levels, styles, structure, numbers, chat-guard
// tells, silence threshold) lives in shared/format-spec.json, the single
// source of truth for desktop and iOS. Tune the spec file, not this module.
const SPEC = require('../../shared/format-spec.json');

const REQUEST_TIMEOUT_MS = 45000;

function fillTemplate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
}

function apiError(status, body) {
  let msg = `API error ${status}`;
  try {
    const parsed = JSON.parse(body);
    if (parsed.error && parsed.error.message) msg = parsed.error.message;
  } catch {
    if (body) msg = `${msg}: ${body.slice(0, 140)}`;
  }
  if (status === 401) msg = 'Invalid API key. Check Settings, Voice & model.';
  if (status === 429) msg = 'Rate limited by the API. Wait a moment and try again.';
  return new Error(msg);
}

function friendlyNetworkError(err) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return new Error('The transcription request timed out.');
  }
  if (String(err.message || '').includes('fetch failed')) {
    return new Error('Could not reach the transcription API. Check your internet connection.');
  }
  return err;
}

async function transcribe(audioBuffer, s) {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'dictation.webm');
  form.append('model', s.model);
  form.append('temperature', '0');
  // verbose_json returns per-segment no_speech_prob, Whisper's own signal
  // for silence hallucinations that no audio or text guard can catch.
  form.append('response_format', 'verbose_json');
  if (s.language && s.language !== 'auto') form.append('language', s.language);
  if (Array.isArray(s.dictionary) && s.dictionary.length) {
    form.append('prompt', vocabPrompt(s.dictionary));
  }

  let res;
  try {
    res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw friendlyNetworkError(err);
  }
  if (!res.ok) throw apiError(res.status, await res.text().catch(() => ''));
  return stripPromptEcho(extractTranscript(await res.json()), s.dictionary);
}

// US-029: bare terms read like prior-transcript context, the form Whisper's
// prompt is designed for. The old instruction sentence ("Vocabulary that may
// appear: ...") was itself echoable text and showed up in a live transcript.
function vocabPrompt(dictionary, spec = SPEC) {
  return fillTemplate(spec.prompt.vocabularyPrompt, { terms: dictionary.join(', ') });
}

// US-029 prompt echo guard. Whisper regurgitates its vocabulary prompt into
// low-confidence spans of otherwise real speech (observed live 2026-07-28:
// "...switched our conversion actions within Google Ads to be VyStar,
// UPPAbaby, Tinuiti. We changed..."). See the spec's promptEcho block for the
// signature and the two fail-open paths.
function stripPromptEcho(text, dictionary, spec = SPEC) {
  const t = String(text || '');
  const echo = spec.promptEcho;
  if (!Array.isArray(dictionary) || dictionary.length < echo.minTerms) return t;
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re;
  try {
    re = new RegExp(
      `(?<![\\p{L}\\p{N}])${dictionary.map(esc).join(echo.joinPattern)}(?![\\p{L}\\p{N}])`,
      'gu'
    );
  } catch {
    return t;
  }
  const replaced = t.replace(re, ' ');
  if (replaced === t) return t;
  const stripped = replaced
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return /[\p{L}\p{N}]/u.test(stripped) ? stripped : t;
}

// Whisper marks segments it doubted were speech at all via no_speech_prob.
// Silence hallucinations ("Thank you.", vocabulary-prompt echoes) ride in
// near-certain (0.9+); real speech, even whispered, stays far lower, so only
// near-certain non-speech is dropped. Endpoints that return no segment data
// fall through to the plain text untouched (fail open). Threshold lives in
// the shared spec so iOS drops the same segments.
function extractTranscript(json, spec = SPEC) {
  const threshold = spec.silence.noSpeechProbThreshold;
  if (Array.isArray(json.segments) && json.segments.length) {
    return json.segments
      .filter((seg) => !(typeof seg.no_speech_prob === 'number' && seg.no_speech_prob > threshold))
      .map((seg) => String(seg.text || ''))
      .join('')
      .trim();
  }
  return String(json.text || '').trim();
}

// Style and level compose the system prompt, a VFlow idea ported here.
// None fixes only spelling and punctuation, High rewrites into polished
// prose, Medium matches Murmur's original behavior and stays the default.
// Every rule string comes from the shared spec; this function only owns the
// composition order, which the spec's comment documents for other platforms.
function buildFormatPrompt(s, spec = SPEC) {
  const level = spec.levels[s.formatLevel] ? s.formatLevel : spec.defaults.level;
  const style = spec.styles[s.formatStyle] ? s.formatStyle : spec.defaults.style;
  const numbers = spec.numbers[s.numberStyle] ? s.numberStyle : spec.defaults.numbers;
  return [
    spec.prompt.header,
    spec.prompt.rulesLabel,
    ...spec.levels[level],
    ...spec.numbers[numbers],
    // Auto structure and spoken commands ride every level except None,
    // which promises exact words only.
    ...(level === 'none' ? [] : [spec.prompt.spokenCommands, ...spec.structure]),
    // Headings start at Soft: Structure promises the speaker's own words with
    // polish, and a heading invents a line that was never a sentence.
    ...(level === 'none' || level === 'structure' ? [] : spec.headingRule),
    ...spec.styles[style],
    ...spec.prompt.footer,
  ].join('\n');
}

function wordsOf(text) {
  return String(text || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
}

// US-030. The chat-guard tells catch the formatter refusing to work, an
// output sharing almost no words with the transcript. Compliance is the
// mirror image: handed a task-shaped dictation the model performs the task,
// reusing the speaker's own vocabulary, so the overlap floor never trips
// (observed live 2026-08-07, a 285-word two-email draft carrying "[Your
// Name]"). The patterns live in the shared spec so iOS refuses the same
// output. Compiled once per spec object, never with the global flag, so
// lastIndex can never leak between calls.
const complyCache = new WeakMap();
function compiledComplyPatterns(chatGuard) {
  if (complyCache.has(chatGuard)) return complyCache.get(chatGuard);
  const compiled = (chatGuard.complyPatterns || []).flatMap((p) => {
    try {
      return [new RegExp(p.pattern, (p.flags || '').replace(/g/g, ''))];
    } catch {
      return []; // A spec pattern this platform cannot compile must not break the guard.
    }
  });
  complyCache.set(chatGuard, compiled);
  return compiled;
}

// The transcript goes to the model fenced; a model that echoes the fence back
// would otherwise insert literal tags into the target app. Every occurrence
// goes, not just wrapping ones, so a fence echoed mid-reply cannot survive.
function stripTranscriptTags(text, spec = SPEC) {
  const w = spec.prompt.transcriptWrapper;
  // Flags come from the spec too: without them each platform guesses, and a
  // guard that is case-sensitive on one and not the other is not one contract.
  const re = new RegExp(w.stripPattern, w.stripFlags);
  return String(text || '').replace(re, '').trim();
}

// US-030: fixing punctuation and capitalization is the formatter doing its
// job, so string inequality alone cannot mean a take was altered, it would
// flag nearly every dictation and drown the signal. What all the observed
// failures share is words in the output that were never spoken. Counted as a
// multiset, so a word used twice in the output is not excused by one use in
// the transcript. Desktop History uses this to decide what to flag.
function addedWords(spoken, formatted) {
  const have = new Map();
  for (const w of wordsOf(spoken)) have.set(w, (have.get(w) || 0) + 1);
  const added = [];
  for (const w of wordsOf(formatted)) {
    const n = have.get(w) || 0;
    if (n > 0) have.set(w, n - 1);
    else added.push(w);
  }
  return added;
}

// US-009 chat guard. The formatter must transform the transcript, never
// converse with it (observed live twice: an instruction-echo preamble on
// 2026-07-20, and "There is no text to clean up..." replacing a silence
// artifact on 2026-07-22). Two tells, both failing open to the raw
// transcript: output containing meta-phrases a cleanup could never add,
// and output whose words are mostly not the transcript's words. Tells and
// thresholds live in the shared spec's chatGuard block.
function guardFormatOutput(input, output, spec = SPEC) {
  const g = spec.chatGuard;
  const inp = String(input || '').trim();
  const out = String(output || '').trim();
  if (!out) return inp;
  // Wildly longer output means the model started talking.
  if (out.length > inp.length * g.lengthMultiplier + g.lengthSlack) return inp;
  const lowerIn = inp.toLowerCase();
  const lowerOut = out.toLowerCase();
  if (g.tells.some((t) => lowerOut.includes(t) && !lowerIn.includes(t))) return inp;
  // US-030 compliance patterns, same output-but-not-input rule as the tells.
  if (compiledComplyPatterns(g).some((re) => re.test(out) && !re.test(inp))) return inp;
  const inWords = wordsOf(inp);
  const outWords = wordsOf(out);
  // A transcript of at most one word gives a cleanup nothing to say beyond
  // that word (or its punctuation or digit form); more is invention.
  if (inWords.length <= 1) return outWords.length <= inWords.length + g.singleWordSlack ? out : inp;
  // A cleanup reuses the transcript's own words. An output that mostly
  // does not is a reply about the text, not the text. The tradeoff is that
  // an all-new legit rewrite of a tiny take (digits mode turning "forty
  // two" into "42") also fails open to the raw words; losing a conversion
  // beats inserting a chat reply.
  const inSet = new Set(inWords);
  const kept = outWords.filter((w) => inSet.has(w)).length;
  if (outWords.length && kept / outWords.length < g.overlapFloor) return inp;
  return out;
}

async function smartFormat(text, s) {
  // Punctuation-only transcripts (a silence artifact) go straight through
  // instead of inviting the model to chat about them.
  if (!wordsOf(text).length) return text;
  try {
    let system = buildFormatPrompt(s);
    if (Array.isArray(s.dictionary) && s.dictionary.length) {
      system += '\n' + fillTemplate(SPEC.prompt.dictionaryRule, { terms: s.dictionary.join(', ') });
    }
    if (Array.isArray(s.corrections) && s.corrections.length) {
      const top = s.corrections.slice().sort((a, b) => b.count - a.count).slice(0, SPEC.prompt.correctionsPromptLimit);
      const pairs = top
        .map((c) => fillTemplate(SPEC.prompt.correctionPairTemplate, { from: c.from, to: c.to }))
        .join(SPEC.prompt.correctionPairSeparator);
      system += '\n' + fillTemplate(SPEC.prompt.correctionsRule, { pairs });
    }
    const res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: s.formatModel,
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: SPEC.prompt.transcriptWrapper.open + text + SPEC.prompt.transcriptWrapper.close },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return text;
    const json = await res.json();
    const out = json.choices && json.choices[0] && json.choices[0].message
      ? String(json.choices[0].message.content || '').trim()
      : '';
    // Fail open: chatty, empty, or runaway output must never eat a dictation.
    return guardFormatOutput(text, stripTranscriptTags(out));
  } catch {
    return text;
  }
}

async function listModels(s) {
  const res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/models`, {
    headers: { Authorization: `Bearer ${s.apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw apiError(res.status, await res.text().catch(() => ''));
  const json = await res.json();
  return (json.data || []).map((m) => m.id).sort();
}

async function testConnection(s) {
  try {
    const res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${s.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw apiError(res.status, await res.text().catch(() => ''));
    return { ok: true, message: 'Connected. Your key works.' };
  } catch (err) {
    return { ok: false, message: friendlyNetworkError(err).message };
  }
}

module.exports = { transcribe, smartFormat, testConnection, listModels, buildFormatPrompt, guardFormatOutput, extractTranscript, stripPromptEcho, vocabPrompt, stripTranscriptTags, addedWords };
