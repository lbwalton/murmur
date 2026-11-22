// SPDX-License-Identifier: GPL-3.0-only
// The watcher for learning from fixes (US-185), macOS. It is a script
// for osascript in its JavaScript mode, which ships with macOS, so no
// compiled code joins the app. It asks the accessibility API (the one
// screen readers use, under the Accessibility permission murmur holds
// already for its paste keystroke) for the text box in front, and
// follows that 1 box and no other.
//
// What it will and will not do, in order:
//  - A password box is refused by its kind, before its text is read.
//  - A box that is not a text box, or belongs to murmur, is refused.
//  - The box must hold the exact words murmur just typed, once. If it
//    does not, nothing is watched.
//  - From then on it reads that same box about once a second, while it
//    still has focus in the app that was in front, and only while
//    everything outside murmur's words is unchanged. When focus is
//    found gone it reads the box 1 last time, and stops.
//  - What it prints is murmur's own words as they read now, and nothing
//    else of the box. Text typed before or after them stays in this
//    script; where the first or last word murmur typed was itself
//    changed, the 1 to 3 words that took its place are printed, and a
//    longer run there is not.
//  - It stops for good the moment most of murmur's words are gone: a
//    box that was emptied, or sent, or filled with something else is
//    never read again.
//  - It stops when focus moves, the box changes around the words, the
//    time is up, or murmur ends it.
//
// The words to look for arrive on standard input, never in the command
// line, where other programs on the computer could read them.

import { WORD } from '../../shared/learn'

/** Lines the watcher prints, 1 JSON object each. */
export type WatchLine =
  | { s: 'skip'; why: 'untrusted' | 'nofocus' | 'own' | 'kind' | 'secure' | 'novalue' | 'big' | 'notfound' }
  | { s: 'watch' }
  | { s: 'span'; t: string }
  | { s: 'end'; why: 'focus' | 'gone' | 'anchor' | 'time' }

/** The largest box the watcher reads, in characters. */
export const MAX_BOX_CHARS = 200_000

const SCRIPT = String.raw`
// These 2 are frameworks of macOS itself, loaded by osascript: nothing
// murmur bundles, so nothing for the parts list.
ObjC.import("AppKit")
ObjC.import("ApplicationServices")
ObjC.bindFunction('AXUIElementCopyAttributeValue', ['int', ['void *', 'id', 'void **']])
ObjC.bindFunction('CFEqual', ['bool', ['void *', 'void *']])

function attr(el, name) {
  var ref = Ref()
  return $.AXUIElementCopyAttributeValue(el, $(name), ref) === 0 ? ref[0] : null
}
function text(value) {
  try {
    // An empty box is a box with no text in it, not a box with no text to give.
    var unwrapped = value === null || value === undefined ? null : ObjC.unwrap(ObjC.castRefToObject(value))
    return typeof unwrapped === 'string' ? unwrapped : null
  } catch (e) {
    return null
  }
}
function say(line) {
  var data = $(JSON.stringify(line) + '\n').dataUsingEncoding($.NSUTF8StringEncoding)
  $.NSFileHandle.fileHandleWithStandardOutput.writeData(data)
}
// Which app is in front, read once as the script starts. A script has
// no run loop, so this answer would go stale if it were asked again.
function frontPid() {
  var app = $.NSWorkspace.sharedWorkspace.frontmostApplication
  return app.isNil() ? -1 : app.processIdentifier
}
// Whether that app is still in front, asked of the app itself each
// time, so the answer is never a stale one.
function inFront(app) {
  try {
    var value = attr(app, 'AXFrontmost')
    return value !== null && ObjC.unwrap(ObjC.castRefToObject(value)) === true
  } catch (e) {
    return false
  }
}
// A word, by the rule src/shared/learn.ts uses (a unit test holds the
// 2 to the same text).
var WORD = WORD_SOURCE
function wordsOf(value) {
  var out = []
  var match
  WORD.lastIndex = 0
  while ((match = WORD.exec(value)) !== null) out.push({ t: match[0], s: match.index, e: match.index + match[0].length })
  return out
}
// Pairs of words the take and the box still share, in order.
function shared(a, b) {
  var cols = b.length + 1
  var table = new Uint16Array((a.length + 1) * cols)
  for (var i = a.length - 1; i >= 0; i--) {
    for (var j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i].t === b[j].t ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  var pairs = []
  var x = 0
  var y = 0
  while (x < a.length && y < b.length) {
    if (a[x].t === b[y].t) {
      pairs.push([x, y])
      x++
      y++
    } else if (table[(x + 1) * cols + y] >= table[x * cols + y + 1]) x++
    else y++
  }
  return pairs
}
// The part of the stretch that is still murmur's take, or null when
// most of the take is gone. Words typed before the take's first word
// or after its last never leave: the stretch is cut at the first and
// last word that stayed. The 1 exception is an edge word murmur typed
// that was itself changed: up to 3 words in its place are kept, since
// that is what a fix looks like.
function stillTake(take, stretch) {
  var now = wordsOf(stretch)
  if (now.length === 0 || now.length > take.length * 2 + 200) return null
  var pairs = shared(take, now)
  if (pairs.length < 2 || pairs.length * 2 < take.length) return null
  var first = pairs[0]
  var last = pairs[pairs.length - 1]
  var lead = first[1]
  var tail = now.length - 1 - last[1]
  var from = first[0] > 0 && lead > 0 && lead <= 3 ? now[0].s : now[first[1]].s
  var to = last[0] < take.length - 1 && tail > 0 && tail <= 3 ? now[now.length - 1].e : now[last[1]].e
  return stretch.slice(from, to)
}
function count(haystack, needle) {
  var n = 0
  var at = haystack.indexOf(needle)
  while (at !== -1 && n < 2) {
    n += 1
    at = haystack.indexOf(needle, at + 1)
  }
  return n
}

function run() {
  var input = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile
  var config = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(input, $.NSUTF8StringEncoding)))
  var words = String(config.text)
  var seconds = Number(config.seconds)
  var maxBox = Number(config.maxBox)
  if (!$.AXIsProcessTrusted()) return say({ s: 'skip', why: 'untrusted' })
  var pid = frontPid()
  if (pid === -1) return say({ s: 'skip', why: 'nofocus' })
  if (pid === Number(config.ownPid)) return say({ s: 'skip', why: 'own' })
  var app = $.AXUIElementCreateApplication(pid)
  var box = attr(app, 'AXFocusedUIElement')
  if (box === null) return say({ s: 'skip', why: 'nofocus' })
  // The kind of box, before a character of it is read.
  if (text(attr(box, 'AXSubrole')) === 'AXSecureTextField') return say({ s: 'skip', why: 'secure' })
  var role = text(attr(box, 'AXRole'))
  if (role !== 'AXTextArea' && role !== 'AXTextField' && role !== 'AXComboBox') return say({ s: 'skip', why: 'kind' })

  // How long the box is, asked before its text where the box can say.
  var size = attr(box, 'AXNumberOfCharacters')
  try {
    if (size !== null && Number(ObjC.unwrap(ObjC.castRefToObject(size))) > maxBox) return say({ s: 'skip', why: 'big' })
  } catch (e) {}
  // The paste may still be landing: look a few times before giving up.
  var value = null
  var found = 0
  for (var tries = 0; tries < 4 && found !== 1; tries++) {
    if (tries > 0) delay(0.4)
    value = text(attr(box, 'AXValue'))
    if (value === null) return say({ s: 'skip', why: 'novalue' })
    if (value.length > maxBox) return say({ s: 'skip', why: 'big' })
    found = count(value, words)
  }
  if (found !== 1) return say({ s: 'skip', why: 'notfound' })
  var at = value.indexOf(words)
  var before = value.slice(0, at)
  var after = value.slice(at + words.length)
  var take = wordsOf(words)
  var most = words.length * 4 + 400
  // The take as it would be printed untouched, so a take nobody
  // touches prints nothing.
  var last = stillTake(take, words)
  if (last === null) return say({ s: 'skip', why: 'notfound' })
  say({ s: 'watch' })

  var started = Date.now()
  while (true) {
    delay(1)
    var now = inFront(app) ? attr(app, 'AXFocusedUIElement') : null
    var focused = now !== null && $.CFEqual(now, box)
    // 1 read of the box per pass, the pass that finds focus gone
    // included: a fix made just before clicking away is still seen.
    value = text(attr(box, 'AXValue'))
    if (value === null) return say({ s: 'end', why: 'gone' })
    var fits = value.length >= before.length + after.length && value.length <= maxBox
    if (!fits || value.slice(0, before.length) !== before || value.slice(value.length - after.length) !== after) {
      return say({ s: 'end', why: 'anchor' })
    }
    var kept = stillTake(take, value.slice(before.length, value.length - after.length).slice(0, most))
    // Most of the take is gone: emptied, sent, or another text. Never
    // read this box again.
    if (kept === null) return say({ s: 'end', why: 'anchor' })
    if (kept !== last) {
      last = kept
      say({ s: 'span', t: kept })
    }
    if (!focused) return say({ s: 'end', why: 'focus' })
    if (Date.now() - started >= seconds * 1000) return say({ s: 'end', why: 'time' })
  }
}
`

/** The script as osascript runs it, with the 1 rule for what a word is
 *  that the rest of murmur uses. */
export const WATCH_SCRIPT = SCRIPT.replace('WORD_SOURCE', () => String(WORD))

/** Read 1 printed line. Anything that is not a line of the watcher's
 *  is no line: the script's output is trusted for nothing. */
export function parseWatchLine(line: string): WatchLine | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { s, why, t } = parsed as Record<string, unknown>
  if (s === 'watch') return { s }
  if (s === 'span' && typeof t === 'string') return { s, t }
  if (s === 'skip' && typeof why === 'string' && SKIPS.has(why)) return { s, why } as WatchLine
  if (s === 'end' && typeof why === 'string' && ENDS.has(why)) return { s, why } as WatchLine
  return null
}

const SKIPS = new Set(['untrusted', 'nofocus', 'own', 'kind', 'secure', 'novalue', 'big', 'notfound'])
const ENDS = new Set(['focus', 'gone', 'anchor', 'time'])
