// SPDX-License-Identifier: GPL-3.0-only
// Checks the App Store listing in ios/store/listing.json (ios/prd.json
// IOS-026) against Apple's limits and murmur's voice before LaBroi pastes
// it into App Store Connect. Apple's limits, checked 2026-10-22 against
// App Store Connect Help (App information; Platform version information):
// name and subtitle at most 30 characters, promotional text at most 170,
// a plain text description at most 4000, keywords at most 100 bytes, each
// more than 2 characters, not repeating the app's name.

const LIMITS = { name: 30, subtitle: 30, promotionalText: 170, description: 4000 }
const KEYWORD_BYTES = 100
const TEXT = ['name', 'subtitle', 'promotionalText', 'description', 'keywords']
const LINKS = ['supportUrl', 'marketingUrl', 'privacyPolicyUrl']
const SITE = 'https://murmurapp.app/'

// Spelled-out numbers (zero, 2 to 99, hundred, thousand); murmur's copy
// writes them as digits. One stays a word, as in one-time.
const UNITS = 'two|three|four|five|six|seven|eight|nine'
const TEENS = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen'
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety'
const NUMBER_WORD = new RegExp(`\\b(?:(?:${TENS})(?:-(?:one|${UNITS}))?|${TEENS}|${UNITS}|zero|hundred|thousand)\\b`, 'gi')

// Clause dashes: the figure, en, em, and horizontal bar dashes, a minus
// sign, a double hyphen, and a hyphen with a space before it, mid line or
// at its end.
const DASH = /[‒–—―−]|--| -(?: |$)/m

/** Everything wrong with a listing, in plain words; empty when it passes. */
function listingProblems(listing) {
  const problems = []
  for (const [field, limit] of Object.entries(LIMITS)) {
    const length = [...String(listing[field] ?? '')].length
    if (length === 0) problems.push(`${field} is empty`)
    else if (length > limit) problems.push(`${field} is ${length} characters, over Apple's ${limit}`)
  }

  const keywords = String(listing.keywords ?? '')
  const bytes = Buffer.byteLength(keywords, 'utf8')
  if (bytes > KEYWORD_BYTES) problems.push(`keywords are ${bytes} bytes, over Apple's ${KEYWORD_BYTES}`)
  const nameWords = new Set(String(listing.name ?? '').toLowerCase().split(/\s+/).concat('murmur'))
  for (const keyword of keywords.split(',').map((k) => k.trim())) {
    if ([...keyword].length <= 2) problems.push(`keyword "${keyword}" is 2 characters or fewer`)
    else if (keyword.toLowerCase().split(/\s+/).some((w) => nameWords.has(w))) {
      problems.push(`keyword "${keyword}" repeats the name, which App Store search already covers`)
    }
  }

  for (const field of TEXT) {
    const text = String(listing[field] ?? '')
    if ((text.match(/murmur/gi) ?? []).some((m) => m !== 'murmur')) problems.push(`${field}: murmur is always lowercase`)
    if (DASH.test(text)) problems.push(`${field}: a dash between clauses; use a period, comma, colon, or semicolon`)
    for (const word of new Set(text.match(NUMBER_WORD) ?? [])) problems.push(`${field}: "${word}" should be digits`)
  }
  if (/<[a-z!/]/i.test(String(listing.description ?? ''))) problems.push("description has HTML, which Apple's plain text field shows as is")

  for (const field of LINKS) {
    if (!String(listing[field] ?? '').startsWith(SITE)) problems.push(`${field} must start with ${SITE}`)
  }
  return problems
}

// App Review's notes field holds 4000 bytes (checked 2026-10-22). The notes
// must say why the keyboard asks for Full Access and why the microphone
// runs in the background, and where the review key goes; the key itself is
// pasted only into App Store Connect, never here.
const NOTES_BYTES = 4000
const NOTES_MUST_SAY = ['Full Access', 'no network requests', 'orange dot', 'UIBackgroundModes', 'never charged', 'REVIEW_KEY_HERE']
// Groq, OpenAI, OpenRouter, and Cerebras keys by their prefixes, and a bare
// run of 32 or more letters and digits with a digit in it, as Mistral's
// keys are.
const KEY_SHAPES = [/gsk_[A-Za-z0-9]{16,}/, /sk-[A-Za-z0-9_-]{16,}/, /sk-or-v\d-[A-Za-z0-9]{16,}/, /csk-[A-Za-z0-9]{16,}/, /\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{32,}\b/]

/** Everything wrong with the review notes; empty when they pass. */
function reviewNotesProblems(notes) {
  const problems = []
  const bytes = Buffer.byteLength(notes, 'utf8')
  if (bytes > NOTES_BYTES) problems.push(`the notes are ${bytes} bytes, over Apple's ${NOTES_BYTES}`)
  for (const phrase of NOTES_MUST_SAY) if (!notes.includes(phrase)) problems.push(`the notes never say ${phrase}`)
  if (KEY_SHAPES.some((shape) => shape.test(notes))) problems.push('the notes hold what looks like a real key; it goes only into App Store Connect')
  if ((notes.match(/murmur/gi) ?? []).some((m) => m !== 'murmur')) problems.push('murmur is always lowercase')
  if (DASH.test(notes)) problems.push('a dash between clauses; use a period, comma, colon, or semicolon')
  for (const word of new Set(notes.match(NUMBER_WORD) ?? [])) problems.push(`"${word}" should be digits`)
  return problems
}

// Apple's required iPhone screenshot, checked 2026-10-22 (Screenshot
// specifications): iPhone with Dynamic Island, medium display; the iPhone
// 17 takes 1206 by 2622 portrait, and no image may carry an alpha channel.
const SHOT = { width: 1206, height: 2622 }

/** What is wrong with one screenshot, from `sips -g pixelWidth -g
 *  pixelHeight -g hasAlpha` on it; empty when App Store Connect takes it. */
function storeShotProblems(name, sipsOutput) {
  const value = (key) => String(sipsOutput).match(new RegExp(`^\\s*${key}:\\s*(\\S+)`, 'm'))?.[1]
  const width = Number(value('pixelWidth'))
  const height = Number(value('pixelHeight'))
  const alpha = value('hasAlpha')
  if (!width || !height || !alpha) return [`${name} could not be read`]
  const problems = []
  if (width !== SHOT.width || height !== SHOT.height) problems.push(`${name} is ${width} by ${height}, not ${SHOT.width} by ${SHOT.height}`)
  if (alpha !== 'no') problems.push(`${name} has an alpha channel, which App Store Connect refuses`)
  return problems
}

module.exports = { SHOT, listingProblems, reviewNotesProblems, storeShotProblems }
