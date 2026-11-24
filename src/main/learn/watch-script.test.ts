// SPDX-License-Identifier: GPL-3.0-only
// The watcher's promises (US-185), held by running it. osascript is
// where the script lives, so here it runs as its real text in a sandbox
// with a stand-in for the Mac's accessibility layer: a text box whose
// kind, text and focus the test sets, second by second. Everything the
// script would print is collected, and that is all that ever leaves it.
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { CHANGE_RULES, WORD, changesIn } from '../../shared/learn'
import { MAX_BOX_CHARS, WATCH_SCRIPT, type WatchLine, parseWatchLine } from './watch-script'

interface Box {
  role?: string
  subrole?: string | null
  /** The box's text; null is a box with no text to give. */
  value: string | null
  /** What the box says its length is, when it says. */
  size?: number
}

interface World {
  trusted?: boolean
  /** The app in front as the script starts. */
  pid?: number
  box: Box | null
  /** Whether the app is in front and the box has focus, each second. */
  focused?: boolean
  /** Runs before each 1 second wait ends: the person, typing. */
  tick?: (second: number, world: World) => void
}

const take = 'I met shiv on at the cafe today.'
const config = (text = take, over: Record<string, unknown> = {}): string =>
  JSON.stringify({ text, seconds: 60, ownPid: 4242, maxBox: MAX_BOX_CHARS, ...over })

/** Run the script once against a world. Returns what it printed and
 *  every text read it made, in order. */
function run(world: World, input = config()): { lines: WatchLine[]; printed: string[]; reads: string[] } {
  const printed: string[] = []
  const reads: string[] = []
  const app = { kind: 'app' }
  const other = { kind: 'another box' }
  let seconds = 0
  let clock = 1_000_000
  const dollar = Object.assign(
    (value: unknown) => ({ value, dataUsingEncoding: () => value }),
    {
      NSUTF8StringEncoding: 4,
      AXIsProcessTrusted: () => world.trusted !== false,
      NSWorkspace: {
        sharedWorkspace: {
          get frontmostApplication() {
            return { isNil: () => world.pid === -1, processIdentifier: world.pid ?? 500 }
          }
        }
      },
      NSFileHandle: {
        fileHandleWithStandardInput: { readDataToEndOfFile: input },
        fileHandleWithStandardOutput: { writeData: (data: string) => printed.push(...data.split('\n').filter(Boolean)) }
      },
      NSString: { alloc: { initWithDataEncoding: (data: string) => data } },
      AXUIElementCreateApplication: () => app,
      AXUIElementCopyAttributeValue: (element: unknown, name: { value: string }, ref: unknown[]) => {
        const attribute = name.value
        if (element === app) {
          if (attribute === 'AXFrontmost') return (ref[0] = world.focused !== false), 0
          if (attribute === 'AXFocusedUIElement') {
            if (world.box === null) return -25212
            return (ref[0] = world.focused !== false ? world.box : other), 0
          }
          return -25205
        }
        const box = element as Box
        if (attribute === 'AXRole') return (ref[0] = box.role ?? 'AXTextArea'), 0
        // -25204: the app did not answer in time.
        if (attribute === 'AXSubrole') return box.subrole === 'ERROR' ? -25204 : box.subrole ? ((ref[0] = box.subrole), 0) : -25212
        if (attribute === 'AXNumberOfCharacters') return box.size === undefined ? -25205 : ((ref[0] = box.size), 0)
        if (attribute === 'AXValue') {
          if (box.value === null) return -25212
          reads.push(box.value)
          return (ref[0] = box.value), 0
        }
        return -25205
      },
      CFEqual: (a: unknown, b: unknown) => a === b
    }
  )
  const sandbox = {
    $: dollar,
    ObjC: { import: () => undefined, bindFunction: () => undefined, unwrap: (v: unknown) => v, castRefToObject: (v: unknown) => v },
    Ref: () => [] as unknown[],
    delay: (wait: number) => {
      clock += wait * 1000
      if (wait >= 1) {
        seconds += 1
        world.tick?.(seconds, world)
      }
    },
    Date: { now: () => clock },
    JSON,
    Number,
    String,
    Math,
    Uint16Array
  }
  vm.runInNewContext(`${WATCH_SCRIPT}\nrun()`, sandbox, { timeout: 5_000 })
  const lines = printed.map((line) => parseWatchLine(line))
  expect(lines.every((line) => line !== null), printed.join(' | ')).toBe(true)
  return { lines: lines as WatchLine[], printed, reads }
}

/** The changes as the script last printed them. */
const fixes = (lines: WatchLine[]): Array<[string, string]> => {
  const printed = lines.flatMap((line) => (line.s === 'fixes' ? [line.f] : []))
  return printed.length === 0 ? [] : printed[printed.length - 1]
}
const last = (lines: WatchLine[]): WatchLine => lines[lines.length - 1]
/** A box that changes as the seconds pass. */
const typing = (start: string, later: Record<number, string | null>, over: Partial<World> = {}): World => ({
  box: { value: start },
  tick: (second, world) => {
    if (second in later && world.box) world.box.value = later[second]
  },
  ...over
})

describe('before it reads a character', () => {
  it('refuses a password box by its kind, and never reads its text', () => {
    const ran = run({ box: { role: 'AXTextField', subrole: 'AXSecureTextField', value: `hunter2 ${take}` } })
    expect(ran.lines).toEqual([{ s: 'skip', why: 'secure' }])
    expect(ran.reads).toEqual([])
  })

  it('treats a box whose kind cannot be asked as a password box', () => {
    const ran = run({ box: { subrole: 'ERROR', value: take } })
    expect(ran.lines).toEqual([{ s: 'skip', why: 'secure' }])
    expect(ran.reads).toEqual([])
  })

  it('refuses anything that is not a text box, murmur\'s own windows, and a Mac that has not trusted murmur', () => {
    for (const role of ['AXWebArea', 'AXList', 'AXButton', 'AXStaticText']) {
      const ran = run({ box: { role, value: take } })
      expect(ran.lines).toEqual([{ s: 'skip', why: 'kind' }])
      expect(ran.reads).toEqual([])
    }
    const own = run({ pid: 4242, box: { value: take } })
    expect(own.lines).toEqual([{ s: 'skip', why: 'own' }])
    expect(own.reads).toEqual([])
    const untrusted = run({ trusted: false, box: { value: take } })
    expect(untrusted.lines).toEqual([{ s: 'skip', why: 'untrusted' }])
    expect(untrusted.reads).toEqual([])
    expect(run({ box: null }).lines).toEqual([{ s: 'skip', why: 'nofocus' }])
    for (const role of ['AXTextArea', 'AXTextField', 'AXComboBox']) {
      const followed = run({ box: { role, value: take }, tick: (_second, world) => void (world.focused = false) })
      expect(followed.lines).toEqual([{ s: 'watch' }, { s: 'end', why: 'focus' }])
    }
  })

  it('refuses a box that says it is too long without reading it, and one that turns out to be', () => {
    const said = run({ box: { value: take, size: MAX_BOX_CHARS + 1 } })
    expect(said.lines).toEqual([{ s: 'skip', why: 'big' }])
    expect(said.reads).toEqual([])
    expect(run({ box: { value: `${take} ${'x'.repeat(MAX_BOX_CHARS)}` } }).lines).toEqual([{ s: 'skip', why: 'big' }])
  })

  it('follows a box only when it holds the exact words once', () => {
    expect(run({ box: { value: 'Something else entirely.' } }).lines).toEqual([{ s: 'skip', why: 'notfound' }])
    expect(run({ box: { value: `${take} ${take}` } }).lines).toEqual([{ s: 'skip', why: 'notfound' }])
    // The same words in another casing are not the exact words.
    expect(run({ box: { value: take.replace('shiv', 'Shiv') } }).lines).toEqual([{ s: 'skip', why: 'notfound' }])
    expect(run({ box: { value: null } }).lines).toEqual([{ s: 'skip', why: 'novalue' }])
  })

  it('waits for a paste that is still landing', () => {
    const ran = run({ box: { value: '' } })
    expect(ran.lines).toEqual([{ s: 'skip', why: 'notfound' }])
    expect(ran.reads.length).toBe(4)
  })
})

describe('what leaves the script', () => {
  it('prints the change and nothing else: the words that went, and the words in their place', () => {
    const ran = run(typing(`Notes.\n${take}\nEnd.`, { 2: 'Notes.\nI met Siobhan at the cafe today.\nEnd.', 4: null }))
    expect(fixes(ran.lines)).toEqual([['shiv on', 'Siobhan']])
    // Not the words that stayed, and not the box around them.
    expect(ran.printed.join('\n')).not.toMatch(/Notes|End\.|cafe|today|met/)
  })

  it('prints nothing for text typed after an untouched take, at the end of a box', () => {
    // The usual case: the take is the last thing in the box, and the
    // person goes on typing. A phone number and a door code.
    const ran = run(typing(take, { 1: `${take} Call me on 555 0142 and the door code is 4471 star, do not share it.`, 3: null }))
    expect(ran.lines.filter((line) => line.s === 'fixes')).toEqual([])
    expect(ran.printed.join('\n')).not.toMatch(/555|4471|door|share|Call/)
  })

  it('prints nothing for text typed before an untouched take, at the start of a box', () => {
    for (const typed of ['We lost 4471. ', 'My card ends 9921 and expires soon. ', 'PIN 4471 ']) {
      const ran = run(typing(take, { 1: `${typed}${take}`, 3: null }))
      expect(ran.lines.filter((line) => line.s === 'fixes'), typed).toEqual([])
      expect(ran.printed.join('\n')).not.toMatch(/4471|9921|card|lost|PIN/)
    }
  })

  it('prints only the fix when text was typed around a fixed take, even text that repeats its words', () => {
    const after = run(typing(take, { 1: 'I met Siobhan at the cafe yesterday. I told the owner my code is 4471 today', 3: null }))
    expect(fixes(after.lines)).toEqual([['shiv on', 'Siobhan']])
    expect(after.printed.join('\n')).not.toMatch(/4471|owner|code|yesterday/)
    const before = run(typing(take, { 1: 'I wrote my PIN 4471 on the wall here. I met Siobhan at the cafe today.', 3: null }))
    expect(before.printed.join('\n')).not.toMatch(/4471|PIN|wall|wrote/)
    const middle = run(typing(take, { 1: 'I met Siobhan, whose door code is 4471 by the way, at the cafe today.', 3: null }))
    expect(middle.printed.join('\n')).not.toMatch(/4471|door|code|whose/)
  })

  it('never prints a terminal\'s output after the take', () => {
    const ran = run(typing(`$ ${take}`, { 1: `$ ${take}\nexport TOKEN=sk-live-51Habc\nready in 2s`, 3: null }))
    expect(ran.lines.filter((line) => line.s === 'fixes')).toEqual([])
    expect(ran.printed.join('\n')).not.toMatch(/TOKEN|sk-live|ready/)
  })

  it('never prints a changed number, a long run, or more than 40 characters a side', () => {
    const said = 'Please send 2025 invoices to shiv on by Friday the 3'
    const ran = run(
      typing(said, { 1: 'Please send 2026 invoices to Siobhan by Friday the 13', 3: null }),
      config(said)
    )
    expect(fixes(ran.lines)).toEqual([['shiv on', 'Siobhan']])
    expect(ran.printed.join('\n')).not.toMatch(/2026|13/)
    // 1 word swapped for a sentence, a 278 character token, 180 symbols.
    for (const value of [
      take.replace('shiv on', 'the person whose door code is 4471'),
      take.replace('shiv on', 'x'.repeat(278)),
      take.replace('shiv on', `a ${'#$%^&*'.repeat(30)} b`),
      take.replace('shiv on', '東京都港区六本木一丁目のビルの暗証番号は四四七一ですので誰にも言わないでください')
    ]) {
      const long = run(typing(take, { 1: value, 3: null }))
      expect(long.lines.filter((line) => line.s === 'fixes'), value.slice(0, 40)).toEqual([])
    }
  })

  it('prints at most 3 changes, each within the rules, whatever is typed', () => {
    // Deterministic noise: take words, secrets and filler, in every order.
    const pool = ['I', 'met', 'shiv', 'on', 'at', 'the', 'cafe', 'today', 'SECRET4471', 'alpha', 'Bravo', 'x'.repeat(50), '9', '', '\n']
    let seed = 7
    const pick = (): string => pool[(seed = (seed * 1103515245 + 12345) & 0x7fffffff) % pool.length]
    for (let n = 0; n < 300; n++) {
      const noise = (count: number): string => Array.from({ length: count }, pick).join(' ')
      const shapes = [`${take} ${noise(12)}`, `${noise(12)} ${take}`, take.replace('at the', `at ${noise(6)} the`), `${noise(8)} ${take.replace('shiv on', noise(2))} ${noise(8)}`]
      const ran = run(typing(take, { 1: shapes[n % shapes.length], 3: null }))
      for (const line of ran.lines) {
        if (line.s !== 'fixes') continue
        expect(line.f.length).toBeLessThanOrEqual(CHANGE_RULES.maxChanges)
        for (const [heard, written] of line.f) {
          expect(take).toContain(heard)
          expect(written.length).toBeLessThanOrEqual(CHANGE_RULES.maxChars)
          expect(written.split(/\s+/).length).toBeLessThanOrEqual(CHANGE_RULES.maxWords)
          expect(written).not.toMatch(/\n/)
        }
      }
    }
  })

  it('finds the changes the rest of murmur would find, text for text', () => {
    const cases: Array<[string, string]> = [
      [take, 'I met Siobhan at the cafe today.'],
      [take, 'I met Siobhan at the Cafe today, and more words typed after it.'],
      ['push it to git hub and deploy on kubernetes tonight', 'push it to GitHub and deploy on Kubernetes tonight'],
      [take, 'I really met shiv on at the cafe today.'],
      [take, 'A different message altogether, about the build.'],
      ['We agreed to meet with shiv on', 'We agreed to meet with Siobhan Byrne'],
      ['please ask jose about the invoice today', 'please ask José about the invoice today'],
      ['alfa bravo charly delta eko foxtrot golf hotel india juliet', 'alfa Bravo charly Delta eko Foxtrot golf Hotel india juliet']
    ]
    for (const [said, edited] of cases) {
      const ran = run(typing(said, { 1: edited, 2: null }), config(said))
      const expected = changesIn(said, edited)
      if (expected === null) expect(last(ran.lines), edited).toEqual({ s: 'end', why: 'anchor' })
      else expect(fixes(ran.lines), edited).toEqual(expected)
    }
  })

  it('prints nothing for a take nobody touched', () => {
    const ran = run(typing(take, { 3: null }))
    expect(ran.lines).toEqual([{ s: 'watch' }, { s: 'end', why: 'gone' }])
  })
})

describe('when it stops', () => {
  it('stops for good when a chat box is sent, and never reads the next message', () => {
    // The take is the whole box. It is fixed, sent (the box empties),
    // and a message much like it is typed by hand.
    const said = 'Thanks for the update on shiv on'
    const ran = run(
      typing(said, { 1: 'Thanks for the update on Siobhan', 2: '', 3: 'Thanks for the update on Apex', 4: 'Thanks for the update on Apex today' }),
      config(said)
    )
    expect(ran.lines).toEqual([{ s: 'watch' }, { s: 'fixes', f: [['shiv on', 'Siobhan']] }, { s: 'end', why: 'anchor' }])
    expect(ran.reads.some((value) => value.includes('Apex'))).toBe(false)
  })

  it('stops when the box holds some other text, or most of the take is deleted', () => {
    const other = run(typing(take, { 1: 'A different message altogether, about the build.' }))
    expect(other.lines).toEqual([{ s: 'watch' }, { s: 'end', why: 'anchor' }])
    const cut = run(typing(take, { 1: 'I met' }))
    expect(cut.lines).toEqual([{ s: 'watch' }, { s: 'end', why: 'anchor' }])
    // A short take replaced by a message that shares 2 of its 4 words.
    const short = run(typing('see you at five', { 1: 'meet you at Hotel Bravo' }), config('see you at five'))
    expect(short.lines).toEqual([{ s: 'watch' }, { s: 'end', why: 'anchor' }])
  })

  it('does not follow a take too short to tell a fix from a new message', () => {
    expect(run({ box: { value: 'hi shiv on' } }, config('hi shiv on')).lines).toEqual([{ s: 'skip', why: 'notfound' }])
  })

  it('stops when the text before or after murmur\'s words changes', () => {
    const before = run(typing(`Dear team,\n${take}\nThanks.`, { 1: `Dear all,\nI met Siobhan at the cafe today.\nThanks.` }))
    expect(before.lines).toEqual([{ s: 'watch' }, { s: 'end', why: 'anchor' }])
    const after = run(typing(`Dear team,\n${take}\nThanks.`, { 1: `Dear team,\nI met Siobhan at the cafe today.\nCheers.` }))
    expect(after.lines).toEqual([{ s: 'watch' }, { s: 'end', why: 'anchor' }])
  })

  it('reads 1 last time as focus leaves, so a fix made just before a click away is seen, then never again', () => {
    const world: World = {
      box: { value: take },
      tick: (second, w) => {
        if (second === 1 && w.box) {
          w.box.value = 'I met Siobhan at the cafe today.'
          w.focused = false
        }
        if (second === 2 && w.box) w.box.value = 'later text'
      }
    }
    const ran = run(world)
    expect(ran.lines).toEqual([{ s: 'watch' }, { s: 'fixes', f: [['shiv on', 'Siobhan']] }, { s: 'end', why: 'focus' }])
    expect(ran.reads.includes('later text')).toBe(false)
  })

  it('takes back a change the person undid', () => {
    const ran = run(typing(take, { 1: 'I met Siobhan at the cafe today.', 2: take, 4: null }))
    expect(ran.lines.filter((line) => line.s === 'fixes')).toEqual([
      { s: 'fixes', f: [['shiv on', 'Siobhan']] },
      { s: 'fixes', f: [] }
    ])
  })

  it('stops after its seconds, having read the box about once a second', () => {
    const ran = run({ box: { value: take } }, config(take, { seconds: 60 }))
    expect(ran.lines).toEqual([{ s: 'watch' }, { s: 'end', why: 'time' }])
    expect(ran.reads.length).toBe(61)
  })
})

describe('the script as written', () => {
  it('takes the words on standard input, never on the command line', () => {
    expect(WATCH_SCRIPT).toContain('fileHandleWithStandardInput')
    expect(WATCH_SCRIPT).not.toMatch(/\bargv\b/)
  })

  it('asks the app itself whether it is still in front: a script has no run loop, so the workspace would never change its answer', () => {
    expect(WATCH_SCRIPT).toContain("attr(app, 'AXFrontmost')")
    expect(WATCH_SCRIPT.match(/frontPid\(\)/g)).toHaveLength(2)
  })

  it('writes to no file, opens no connection, and changes nothing in the other app', () => {
    expect(WATCH_SCRIPT).not.toMatch(/writeToFile|NSURL|curl|doShellScript|AXUIElementSetAttributeValue|AXUIElementPerformAction|NSPasteboard/)
  })

  it('reads a word, and counts a change, by the rules the rest of murmur uses', () => {
    expect(WATCH_SCRIPT).toContain(`var WORD = ${String(WORD)}`)
    expect(WATCH_SCRIPT).toContain(`var RULES = ${JSON.stringify(CHANGE_RULES)}`)
    expect(WATCH_SCRIPT).not.toMatch(/WORD_SOURCE|RULES_SOURCE/)
  })

  it('has 1 place that prints text of the box, and it prints changes', () => {
    expect(WATCH_SCRIPT.match(/say\(\{ s: 'fixes'/g)).toHaveLength(1)
    expect(WATCH_SCRIPT).not.toMatch(/say\([^)]*\b(value|before|after|stretch|words)\b[^)]*\)/)
  })
})

describe('parseWatchLine', () => {
  it('reads the watcher\'s own lines', () => {
    expect(parseWatchLine('{"s":"watch"}')).toEqual({ s: 'watch' })
    expect(parseWatchLine('{"s":"fixes","f":[["shiv on","Siobhan"]]}')).toEqual({ s: 'fixes', f: [['shiv on', 'Siobhan']] })
    expect(parseWatchLine('{"s":"fixes","f":[]}')).toEqual({ s: 'fixes', f: [] })
    expect(parseWatchLine('{"s":"skip","why":"secure"}')).toEqual({ s: 'skip', why: 'secure' })
    expect(parseWatchLine('{"s":"end","why":"focus"}')).toEqual({ s: 'end', why: 'focus' })
  })

  it('takes nothing else for a line, and no list wider or longer than the script may print', () => {
    const wide = JSON.stringify({ s: 'fixes', f: [['shiv on', 'x'.repeat(41)]] })
    const many = JSON.stringify({ s: 'fixes', f: [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']] })
    for (const line of [
      '',
      'not json',
      '[]',
      'null',
      '7',
      '{"s":"span","t":"I met Siobhan today."}',
      '{"s":"fixes"}',
      '{"s":"fixes","f":"shiv on"}',
      '{"s":"fixes","f":[["shiv on"]]}',
      '{"s":"fixes","f":[["shiv on","Siobhan","more"]]}',
      '{"s":"fixes","f":[["shiv on",7]]}',
      wide,
      many,
      '{"s":"skip","why":"because"}',
      '{"s":"end","why":"secure"}',
      '{"s":"other"}'
    ]) {
      expect(parseWatchLine(line), line).toBeNull()
    }
    // Extra fields are dropped, never passed on.
    expect(parseWatchLine('{"s":"watch","t":"words"}')).toEqual({ s: 'watch' })
  })
})
