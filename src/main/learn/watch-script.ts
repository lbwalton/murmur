// SPDX-License-Identifier: GPL-3.0-only
// The watcher for learning from fixes (US-185), macOS. It is a script
// for osascript in its JavaScript mode, which ships with macOS, so no
// compiled code joins the app. It asks the accessibility API (the one
// screen readers use, under the Accessibility permission murmur holds
// already for its paste keystroke) for the text box in front, and
// follows that 1 box and no other.
//
// What it will and will not do, in order:
//  - A password box is refused by its kind, before its text is read,
//    and so is a box whose kind cannot be asked.
//  - A box that is not a text box, or belongs to murmur, is refused.
//  - The box must hold the exact words murmur just typed, once. If it
//    does not, nothing is watched.
//  - From then on it reads that same box about once a second, while it
//    still has focus in the app that was in front, and only while
//    everything outside murmur's words is unchanged. When focus is
//    found gone it reads the box 1 last time, and stops.
//  - It prints no text of the box at all except changes: where 1 to 3
//    of murmur's words are gone and 1 to 3 words stand in their place,
//    it prints those 2 short runs, each 40 characters at most and the
//    new one about as long as the old, and never a changed number. Words murmur typed that are still there,
//    words added with nothing taken away, and everything typed before,
//    after or between them never leave this script.
//  - It stops for good the moment most of murmur's words are gone: a
//    box that was emptied, or sent, or filled with something else is
//    never read again.
//  - It stops when focus moves, the box changes around the words, the
//    time is up, or murmur ends it.
//
// The words to look for arrive on standard input, never in the command
// line, where other programs on the computer could read them.
import { CHANGE_RULES, WORD } from '../../shared/learn'

/** Lines the watcher prints, 1 JSON object each. */
export type WatchLine =
  | { s: 'skip'; why: 'untrusted' | 'nofocus' | 'own' | 'kind' | 'secure' | 'novalue' | 'big' | 'notfound' }
  | { s: 'watch' }
  /** The changes as they stand now: [murmur's words, the words in their place]. */
  | { s: 'fixes'; f: Array<[string, string]> }
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

// 1 question of 1 element: the answer, and the system's error code.
function ask(el, name) {
  var ref = Ref()
  var err = $.AXUIElementCopyAttributeValue(el, $(name), ref)
  return { err: err, value: err === 0 ? ref[0] : null }
}
function attr(el, name) {
  return ask(el, name).value
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
// What a word is and what counts as a change: the rules of
// src/shared/learn.ts, the same text (a unit test holds the 2 together).
var WORD = WORD_SOURCE
var RULES = RULES_SOURCE
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
// The numbers in a run of words, as written.
function numbers(run) {
  return (run.match(/\d[\d.,]*\d|\d/g) || []).join(' ')
}
// The changes between the take and the stretch of the box where it
// was: null when most of the take is gone, otherwise each place where
// 1 to 3 of murmur's words are missing and 1 to 3 words stand instead.
// Nothing else of the stretch is ever returned.
function changes(takeText, take, stretch) {
  var now = wordsOf(stretch)
  if (now.length === 0 || now.length > take.length * 2 + 200) return null
  var pairs = shared(take, now)
  if (pairs.length < RULES.minStay || pairs.length < take.length * RULES.stayShare) return null
  var out = []
  var ai = 0
  var bi = 0
  for (var k = 0; k <= pairs.length; k++) {
    var pa = k < pairs.length ? pairs[k][0] : take.length
    var pb = k < pairs.length ? pairs[k][1] : now.length
    var gone = pa - ai
    var came = pb - bi
    if (gone >= 1 && gone <= RULES.maxWords && came >= 1 && came <= RULES.maxWords) {
      var heard = takeText.slice(take[ai].s, take[pa - 1].e)
      var written = stretch.slice(now[bi].s, now[pb - 1].e)
      var number = numbers(heard)
      var plain = heard.length <= RULES.maxChars && written.length <= RULES.maxChars && !/[\u0000-\u001f\u007f-\u009f]/.test(written)
      // What stands in a change's place is about as long as what went:
      // a clause where a name stood is no fix.
      plain = plain && written.length <= Math.max(heard.length * RULES.growTimes, heard.length + RULES.growBy)
      // A changed number is what was meant, never a spelling, and never
      // murmur's to carry.
      if (plain && (number === '' || number === numbers(written))) out.push([heard, written])
    }
    ai = pa + 1
    bi = pb + 1
  }
  // More changes than a person makes to spellings is a rewrite.
  return out.length > RULES.maxChanges ? [] : out
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
  // The kind of box, before a character of it is read. A box that
  // says it has no kind (-25212) or knows no such question (-25205) is
  // no password box; a box that cannot be asked is treated as one.
  var kind = ask(box, 'AXSubrole')
  if (kind.err !== 0 && kind.err !== -25212 && kind.err !== -25205) return say({ s: 'skip', why: 'secure' })
  if (text(kind.value) === 'AXSecureTextField') return say({ s: 'skip', why: 'secure' })
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
  // A take too short to tell a fix from a new message is not followed.
  if (take.length <= RULES.minStay || changes(words, take, words) === null) return say({ s: 'skip', why: 'notfound' })
  var most = words.length * 4 + 400
  var seen = value
  var last = '[]'
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
    if (value !== seen) {
      seen = value
      var fits = value.length >= before.length + after.length && value.length <= maxBox
      if (!fits || value.slice(0, before.length) !== before || value.slice(value.length - after.length) !== after) {
        return say({ s: 'end', why: 'anchor' })
      }
      var stretch = value.slice(before.length, value.length - after.length)
      if (stretch.length > most) {
        // Cut between words, never inside 1.
        stretch = stretch.slice(0, most)
        var edge = stretch.search(/\s\S*$/)
        if (edge > 0) stretch = stretch.slice(0, edge)
      }
      var changed = changes(words, take, stretch)
      // Most of the take is gone: emptied, sent, or another text. Never
      // read this box again.
      if (changed === null) return say({ s: 'end', why: 'anchor' })
      var key = JSON.stringify(changed)
      if (key !== last) {
        last = key
        say({ s: 'fixes', f: changed })
      }
    }
    if (!focused) return say({ s: 'end', why: 'focus' })
    if (Date.now() - started >= seconds * 1000) return say({ s: 'end', why: 'time' })
  }
}
`

/** The script as osascript runs it, with the rules for what a word is
 *  and what counts as a change that the rest of murmur uses. */
export const WATCH_SCRIPT = SCRIPT.replace('WORD_SOURCE', () => String(WORD)).replace('RULES_SOURCE', () => JSON.stringify(CHANGE_RULES))

const SKIPS = new Set(['untrusted', 'nofocus', 'own', 'kind', 'secure', 'novalue', 'big', 'notfound'])
const ENDS = new Set(['focus', 'gone', 'anchor', 'time'])

/** Read 1 printed line. Anything that is not a line of the watcher's
 *  is no line: the script's output is trusted for nothing, and a list
 *  of changes longer or wider than the script may print is refused
 *  whole. */
export function parseWatchLine(line: string): WatchLine | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { s, why, f } = parsed as Record<string, unknown>
  if (s === 'watch') return { s }
  if (s === 'skip' && typeof why === 'string' && SKIPS.has(why)) return { s, why } as WatchLine
  if (s === 'end' && typeof why === 'string' && ENDS.has(why)) return { s, why } as WatchLine
  if (s === 'fixes' && Array.isArray(f) && f.length <= CHANGE_RULES.maxChanges) {
    const pairs: Array<[string, string]> = []
    for (const pair of f as unknown[]) {
      if (!Array.isArray(pair) || pair.length !== 2) return null
      const [heard, written] = pair as unknown[]
      if (typeof heard !== 'string' || typeof written !== 'string') return null
      if (heard.length > CHANGE_RULES.maxChars || written.length > CHANGE_RULES.maxChars) return null
      pairs.push([heard, written])
    }
    return { s, f: pairs }
  }
  return null
}
