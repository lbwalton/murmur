// SPDX-License-Identifier: GPL-3.0-only
// The dictionary as a file (US-183): what a list from somewhere else
// may hold, how it folds into the list in Settings, and what goes back
// out to a file.
import { describe, expect, it } from 'vitest'
import {
  FILE_TIPS,
  MAX_DICTIONARY_ENTRIES,
  MAX_ENTRY_CHARS,
  type DictionaryPick,
  decodeWordList,
  dictionaryCsv,
  dictionaryFileText,
  dictionaryJson,
  exportedMessage,
  importQuestion,
  importedMessage,
  mergeDictionary,
  parseDictionaryFile,
  pickMessage,
  shortName
} from './dictionary-file'

const BOM = '\uFEFF'

const read = (text: string, ext = 'csv') => {
  const parsed = parseDictionaryFile(text, ext)
  if (!parsed.ok) throw new Error('not read')
  return parsed
}

describe('parseDictionaryFile, CSV', () => {
  it('reads heard and written pairs', () => {
    expect(read('shivon,Siobhan\nkubernetties,Kubernetes\n').entries).toEqual([
      { from: 'shivon', to: 'Siobhan' },
      { from: 'kubernetties', to: 'Kubernetes' }
    ])
  })

  it('leaves out a heading row, however it is spelled', () => {
    const headings = [
      'from,to',
      'Heard As,Written As',
      'heard_as,written_as',
      'heard,written',
      'wrong,right',
      'Word,Replacement',
      'Name,Spelling',
      'Term,Correct',
      'Spoken,Written',
      'Heard,Spelling',
      'Incorrect,Correct'
    ]
    for (const heading of headings) {
      expect(read(`${heading}\nshivon,Siobhan\n`).entries, heading).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    }
  })

  it('says which line it read as a heading, except its own export heading', () => {
    expect(read('Word,Replacement\nshivon,Siobhan\n').heading).toBe('Word, Replacement')
    expect(read('Names\nSiobhan\n', 'txt').heading).toBe('Names')
    expect(read('"heard as","written as"\nshivon,Siobhan\n').heading).toBeNull()
    expect(read('shivon,Siobhan\n').heading).toBeNull()
  })

  it('reads a heading only on the first line with words', () => {
    expect(read('\n\nfrom,to\nshivon,Siobhan\nword,Word\n').entries).toEqual([
      { from: 'shivon', to: 'Siobhan' },
      { from: 'word', to: 'Word' }
    ])
  })

  it('reads Windows, old Mac, and mixed line ends, and no last line end', () => {
    expect(read('from,to\r\nshivon,Siobhan\racme,ACME\nkube,Kube').entries).toEqual([
      { from: 'shivon', to: 'Siobhan' },
      { from: 'acme', to: 'ACME' },
      { from: 'kube', to: 'Kube' }
    ])
  })

  it('reads a byte order mark before rows and before JSON', () => {
    expect(read(`${BOM}shivon,Siobhan`).entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    expect(read(`${BOM}[{"from":"shivon","to":"Siobhan"}]`, 'json').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
  })

  it('reads quoted cells holding a comma or a doubled quote, and a quote inside a word as itself', () => {
    expect(read('"smith, jon","Smith, John"\n"five inch","5"""\nsix inch,6"\n').entries).toEqual([
      { from: 'smith, jon', to: 'Smith, John' },
      { from: 'five inch', to: '5"' },
      { from: 'six inch', to: '6"' }
    ])
  })

  it('reads tabs and semicolons as separators, by the one that makes 2 columns', () => {
    expect(read('shivon\tSiobhan\n', 'tsv').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    expect(read('heard;written\nshivon;Siobhan\n').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    // Commas inside the cells of a semicolon file.
    expect(read('smith, jon;Smith, John\ndoe, al;Doe, Al\n').entries).toEqual([
      { from: 'smith, jon', to: 'Smith, John' },
      { from: 'doe, al', to: 'Doe, Al' }
    ])
    // A heading with no separator does not decide for the file.
    expect(read('names\nshivon;Siobhan\n').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    // A .tsv is tabs, whatever else its cells hold.
    expect(read('smith, jon\tSmith, John\n', 'tsv').entries).toEqual([{ from: 'smith, jon', to: 'Smith, John' }])
    // 3 columns of commas are still commas.
    expect(read('shivon,Siobhan,a note\nacme,ACME,another\n').entries).toEqual([
      { from: 'shivon', to: 'Siobhan' },
      { from: 'acme', to: 'ACME' }
    ])
  })

  it('is not led off by a stray separator in a notes column', () => {
    const pairs = [
      { from: 'shivon', to: 'Siobhan' },
      { from: 'acme', to: 'ACME' },
      { from: 'kube', to: 'Kubernetes' }
    ]
    expect(read('shivon;Siobhan;a friend\nacme;ACME;brand, client\nkube;Kubernetes;tool\n').entries).toEqual(pairs)
    expect(read('shivon\tSiobhan\ta friend\nacme\tACME\tbrand, client\nkube\tKubernetes\ttool\n', 'txt').entries).toEqual(pairs)
    expect(read('shivon,Siobhan,a friend\nacme,ACME,brand; client\nkube,Kubernetes,tool\n').entries).toEqual(pairs)
    expect(read('heard,written,notes\nshivon,Siobhan,a\tfriend\nacme,ACME,brand\nkube,Kubernetes,tool\n').entries).toEqual(pairs)
  })

  it('reads a .tsv by tabs, whatever else its lines hold more of', () => {
    const text = 'x,y\tX\nz,w\nq,r\n'
    expect(read(text, 'tsv').entries).toEqual([
      { from: 'x,y', to: 'X' },
      { from: 'z,w', to: 'z,w' },
      { from: 'q,r', to: 'q,r' }
    ])
    // Under another name the same lines go by their commas.
    expect(read(text, 'txt').entries).toEqual([
      { from: 'z', to: 'w' },
      { from: 'q', to: 'r' }
    ])
  })

  it('breaks a tie for the rarer character: a tab, then a semicolon, then a comma', () => {
    expect(read('wait; what,Wait what\n').entries).toEqual([{ from: 'wait', to: 'what,Wait what' }])
    expect(read('a,b\tA B\n').entries).toEqual([{ from: 'a,b', to: 'A B' }])
    expect(read('a;b\tA B\n').entries).toEqual([{ from: 'a;b', to: 'A B' }])
  })

  it('keeps a lone word with its own spelling and casing', () => {
    expect(read('names\nSiobhan\nKubernetes,\n', 'txt').entries).toEqual([
      { from: 'Siobhan', to: 'Siobhan' },
      { from: 'Kubernetes', to: 'Kubernetes' }
    ])
  })

  it('skips blank rows silently and counts rows it cannot use', () => {
    const long = 'x'.repeat(MAX_ENTRY_CHARS + 1)
    const parsed = read(`shivon,Siobhan\n\n , \n,Orphan\n${long},Long\n`)
    expect(parsed.entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    expect(parsed.unread).toBe(2)
  })

  it('loses 1 line to a stray quote, never the rest of the file', () => {
    const parsed = read('a,A\n"b,B\nc,C\nd,D\n')
    expect(parsed.entries).toEqual([
      { from: 'a', to: 'A' },
      { from: 'c', to: 'C' },
      { from: 'd', to: 'D' }
    ])
    expect(parsed.unread).toBe(1)
  })

  it('takes no word from the pieces of a cell that held a line break, and counts both lines', () => {
    const parsed = read('a,A\n"two\nlines",Broken\nc,C\n')
    expect(parsed.entries).toEqual([
      { from: 'a', to: 'A' },
      { from: 'c', to: 'C' }
    ])
    expect(parsed.unread).toBe(2)
  })

  it('never drops a row unseen after a stray quote: a row with 1 quote of its own is counted', () => {
    const parsed = read('a,A\n"b,B\nsix inch,6"\nc,C\n')
    expect(parsed.entries).toEqual([
      { from: 'a', to: 'A' },
      { from: 'c', to: 'C' }
    ])
    expect(parsed.unread).toBe(2)
    // With no quote of its own, the row after a stray quote is read.
    expect(read('"b,B\nseven inch,7\n').entries).toEqual([{ from: 'seven inch', to: '7' }])
  })

  it('still reads the heading after a broken first line', () => {
    const parsed = read('"oops\nfrom,to\nshivon,Siobhan\n')
    expect(parsed.entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    expect(parsed.unread).toBe(1)
  })

  it('takes no word that holds a control character from either range', () => {
    const parsed = read(`ok,OK\nbad${String.fromCharCode(0x81)},Bad\nbell${String.fromCharCode(7)},Bell\n`)
    expect(parsed.entries).toEqual([{ from: 'ok', to: 'OK' }])
    expect(parsed.unread).toBe(2)
  })

  it('lets the first row win for a heard word said twice, as murmur does when it applies the list', () => {
    expect(read('shivon,Siobhan\nSHIVON,Siobhán\n').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
  })

  it('stays linear on large files of junk', () => {
    const junk = [
      '"'.repeat(400_000) + ','.repeat(400_000),
      // A quote inside a cell that is not blank: once measured again
      // at every quote, 52 seconds for this file.
      `x${'"'.repeat(900_000)}`,
      'x"'.repeat(450_000),
      `${' '.repeat(400_000)}${'"'.repeat(400_000)}`,
      '\n'.repeat(900_000),
      ',;\t'.repeat(300_000)
    ]
    for (const text of junk) {
      const started = performance.now()
      const parsed = read(text)
      expect(parsed.entries.length).toBeLessThanOrEqual(1)
      expect(performance.now() - started).toBeLessThan(1_500)
    }
  })
})

describe('parseDictionaryFile, JSON', () => {
  it('reads an array of from and to, the shape settings use', () => {
    expect(read('[{"from":"shivon","to":"Siobhan"},{"heard":"acme","written":"ACME"}]', 'json').entries).toEqual([
      { from: 'shivon', to: 'Siobhan' },
      { from: 'acme', to: 'ACME' }
    ])
  })

  it('reads a settings file, a map, pairs, and bare words', () => {
    expect(read('{"dictionary":[{"from":"shivon","to":"Siobhan"}],"other":1}', 'json').entries).toEqual([
      { from: 'shivon', to: 'Siobhan' }
    ])
    expect(read('{"shivon":"Siobhan"}', 'json').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    expect(read('[["shivon","Siobhan"],"Kubernetes"]', 'json').entries).toEqual([
      { from: 'shivon', to: 'Siobhan' },
      { from: 'Kubernetes', to: 'Kubernetes' }
    ])
  })

  it('reads 1 item on its own as that item, never as a map of the words from and to', () => {
    expect(read('{"from":"shivon","to":"Siobhan"}', 'json').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    expect(read('{"heard":"acme","written":"ACME"}', 'json').entries).toEqual([{ from: 'acme', to: 'ACME' }])
  })

  it('reads an item with a wrong-typed side as an item it cannot use, and a map with other keys as a map', () => {
    const bad = read('{"from":"a","to":5}', 'json')
    expect(bad.entries).toEqual([])
    expect(bad.unread).toBe(1)
    expect(read('{"from":"x","to":"y","shivon":"Siobhan"}', 'json').entries).toEqual([
      { from: 'from', to: 'x' },
      { from: 'to', to: 'y' },
      { from: 'shivon', to: 'Siobhan' }
    ])
  })

  it('counts items it cannot use, and never throws on odd shapes', () => {
    const parsed = read('[{"from":"shivon","to":"Siobhan"},{"from":1,"to":2},null,7,{"to":"x"},[]]', 'json')
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.unread).toBe(5)
  })

  it('is not ok for broken JSON or a value that is no list', () => {
    expect(parseDictionaryFile('[{"from":', 'json').ok).toBe(false)
    expect(parseDictionaryFile('"just a string"', 'json').ok).toBe(false)
    expect(parseDictionaryFile('12', 'json').ok).toBe(false)
  })

  it('reads JSON as JSON whatever the file is called, and rows as rows', () => {
    for (const ext of ['', 'txt', 'csv']) {
      expect(read(' [{"from":"shivon","to":"Siobhan"}]', ext).entries, ext).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    }
    expect(read('shivon,Siobhan', '').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    // Rows whose first cell opens with a bracket are still rows.
    expect(read('[tag],Tag', 'csv').entries).toEqual([{ from: '[tag]', to: 'Tag' }])
  })
})

describe('files that are not word lists, and files in other encodings', () => {
  it('is not ok for binary content', () => {
    expect(parseDictionaryFile('PK\u0003\u0004\u0000\u0000rest', 'csv').ok).toBe(false)
    expect(parseDictionaryFile(decodeWordList(Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0, 0xff, 0x80])), 'csv').ok).toBe(false)
  })

  it('reads an empty file as no words', () => {
    expect(read('').entries).toEqual([])
    expect(read('').unread).toBe(0)
  })

  it('reads UTF-8, with or without a byte order mark', () => {
    const utf8 = new TextEncoder().encode('shivon,Siobhán')
    expect(read(decodeWordList(utf8)).entries).toEqual([{ from: 'shivon', to: 'Siobhán' }])
    expect(read(decodeWordList(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]))).entries).toEqual([{ from: 'shivon', to: 'Siobhán' }])
  })

  it('reads a spreadsheet saved in the older Western encoding, accents and all', () => {
    // "shivon,Siobhán" with á as the single byte 0xE1, which is not UTF-8.
    const latin = Uint8Array.from([...new TextEncoder().encode('shivon,Siobh'), 0xe1, 0x6e])
    expect(read(decodeWordList(latin)).entries).toEqual([{ from: 'shivon', to: 'Siobhán' }])
  })

  it('reads a spreadsheet saved as Unicode text, which is UTF-16 with tabs', () => {
    const text = 'shivon\tSiobhán\r\nacme\tACME\r\n'
    const le = [0xff, 0xfe]
    const be = [0xfe, 0xff]
    for (const char of text) {
      const code = char.charCodeAt(0)
      le.push(code & 0xff, code >> 8)
      be.push(code >> 8, code & 0xff)
    }
    const expected = [
      { from: 'shivon', to: 'Siobhán' },
      { from: 'acme', to: 'ACME' }
    ]
    expect(read(decodeWordList(Uint8Array.from(le)), 'txt').entries).toEqual(expected)
    expect(read(decodeWordList(Uint8Array.from(be)), 'txt').entries).toEqual(expected)
  })
})

describe('mergeDictionary', () => {
  const current = [
    { from: 'shivon', to: 'Siobhan' },
    { from: 'acme', to: 'ACME' }
  ]

  it('adds new words at the end, leaves the list in its order, and shows the first 3 it adds', () => {
    const plan = mergeDictionary(current, [
      { from: 'kubernetties', to: 'Kubernetes' },
      { from: 'Excel', to: 'Excel' },
      { from: 'a', to: 'A' },
      { from: 'b', to: 'B' }
    ])
    expect(plan.next.slice(0, 3)).toEqual([...current, { from: 'kubernetties', to: 'Kubernetes' }])
    expect(plan).toMatchObject({ added: 4, changed: 0, same: 0, left: 0 })
    expect(plan.addedWords).toEqual(['kubernetties → Kubernetes', 'Excel', 'a → A'])
  })

  it('changes a spelling in place, names the word, and counts words spelled the same', () => {
    const plan = mergeDictionary(current, [
      { from: 'Shivon', to: 'Siobhán' },
      { from: 'ACME', to: 'ACME' }
    ])
    expect(plan.next).toEqual([
      { from: 'shivon', to: 'Siobhán' },
      { from: 'acme', to: 'ACME' }
    ])
    expect(plan).toMatchObject({ added: 0, changed: 1, changedWords: ['shivon'], same: 1 })
  })

  it('names 3 changed words at most, and shortens a long one', () => {
    const list = ['a', 'b', 'c', 'd'].map((from) => ({ from, to: 'old' }))
    const plan = mergeDictionary(
      list,
      list.map(({ from }) => ({ from, to: 'new' }))
    )
    expect(plan.changed).toBe(4)
    expect(plan.changedWords).toEqual(['a', 'b', 'c'])
    const long = mergeDictionary([{ from: 'x'.repeat(500), to: 'old' }], [{ from: 'x'.repeat(500), to: 'new' }])
    expect(long.changedWords[0]).toHaveLength(30)
  })

  it('stops adding when the list is full, and still changes what is there', () => {
    const plan = mergeDictionary(
      current,
      [
        { from: 'one', to: '1' },
        { from: 'two', to: '2' },
        { from: 'acme', to: 'Acme' }
      ],
      3
    )
    expect(plan.next).toHaveLength(3)
    expect(plan).toMatchObject({ added: 1, changed: 1, left: 1 })
  })

  it('never changes the list it was given', () => {
    const before = JSON.stringify(current)
    mergeDictionary(current, [{ from: 'shivon', to: 'X' }])
    expect(JSON.stringify(current)).toBe(before)
  })

  it('holds 2,000 words', () => {
    expect(MAX_DICTIONARY_ENTRIES).toBe(2_000)
  })
})

describe('dictionaryCsv and dictionaryJson', () => {
  const entries = [
    { from: 'shivon', to: 'Siobhán' },
    { from: 'smith, jon', to: 'Smith, "Jon"' },
    { from: 'at murmur', to: '@murmurapp' },
    { from: 'plus one', to: '+1' },
    { from: "'tis", to: "'Tis" },
    { from: "'@home", to: "''-ish" },
    { from: 'semi;colon', to: 'Semi;Colon' }
  ]

  it('comes back as the same list from CSV and from JSON', () => {
    expect(read(dictionaryCsv(entries)).entries).toEqual(entries)
    expect(read(dictionaryJson(entries), 'json').entries).toEqual(entries)
  })

  it('changes nothing when a list is imported into itself, a repeated word included', () => {
    const repeated = [...entries, { from: 'Shivon', to: 'Siobhan' }]
    for (const text of [dictionaryCsv(repeated), dictionaryJson(repeated)]) {
      const plan = mergeDictionary(repeated, read(text, text.startsWith('[') ? 'json' : 'csv').entries)
      expect(plan).toMatchObject({ added: 0, changed: 0, left: 0 })
      expect(plan.next).toEqual(repeated)
    }
  })

  it('writes a header, quoted cells, and a byte order mark for spreadsheets', () => {
    const csv = dictionaryCsv(entries)
    expect(csv.startsWith(`${BOM}"heard as","written as"\r\n"shivon","Siobhán"\r\n`)).toBe(true)
    expect(csv).toContain('"smith, jon","Smith, ""Jon"""')
  })

  it('never writes a cell a spreadsheet would run as a formula', () => {
    const csv = dictionaryCsv([
      { from: '=1+1', to: '@SUM(A1)' },
      { from: '-2', to: '+cmd' }
    ])
    for (const line of csv.split('\r\n').slice(1)) {
      for (const value of line.split('","')) expect(value.replace(/^"/, '')).not.toMatch(/^[=+\-@]/)
    }
    expect(read(csv).entries).toEqual([
      { from: '=1+1', to: '@SUM(A1)' },
      { from: '-2', to: '+cmd' }
    ])
  })

  it('leaves out entries with an empty side, and wrong-typed ones', () => {
    const odd = [{ from: 'a', to: ' ' }, { from: 1, to: 2 }, null, 'x', { from: ' ok ', to: ' OK ' }]
    expect(read(dictionaryCsv(odd)).entries).toEqual([{ from: 'ok', to: 'OK' }])
    expect(JSON.parse(dictionaryJson(odd))).toEqual([{ from: 'ok', to: 'OK' }])
  })

  it('writes JSON to a file named .json and CSV to any other', () => {
    expect(dictionaryFileText(entries, '/a/words.json')).toEqual({ text: dictionaryJson(entries), format: 'json' })
    expect(dictionaryFileText(entries, 'C:\\a\\WORDS.JSON').format).toBe('json')
    expect(dictionaryFileText(entries, '/a/words.csv')).toEqual({ text: dictionaryCsv(entries), format: 'csv' })
    expect(dictionaryFileText(entries, '/a/words').format).toBe('csv')
    expect(dictionaryFileText(entries, '/a/json').format).toBe('csv')
  })
})

describe('what the row says', () => {
  const ready = (over: Partial<Extract<DictionaryPick, { status: 'ready' }>>) =>
    ({
      status: 'ready',
      token: 't',
      name: 'names.csv',
      added: 0,
      addedWords: [],
      changed: 0,
      changedWords: [],
      same: 0,
      left: 0,
      unread: 0,
      heading: null,
      ...over
    }) as Extract<DictionaryPick, { status: 'ready' }>

  it('asks with the counts, shows words it adds, and names the words whose spelling changes', () => {
    expect(
      importQuestion(
        ready({
          added: 9,
          addedWords: ['shivon → Siobhan', 'Excel', 'acme → ACME'],
          changed: 2,
          changedWords: ['kube', 'mermer'],
          same: 1,
          unread: 3
        })
      )
    ).toBe(
      'Import names.csv? It adds 9 words (shivon → Siobhan; Excel; acme → ACME; and more) and changes the spelling of 2 words you have (kube; mermer). 1 word is already here. 3 entries could not be read.'
    )
    expect(importQuestion(ready({ added: 1, addedWords: ['shivon → Siobhan'] }))).toBe(
      'Import names.csv? It adds 1 word (shivon → Siobhan).'
    )
    expect(importQuestion(ready({ changed: 5, changedWords: ['a', 'b', 'c'] }))).toBe(
      'Import names.csv? It changes the spelling of 5 words you have (a; b; c; and more).'
    )
  })

  it('shows a heading row that slipped in as a word, and says which line it took as a heading', () => {
    const parsed = read('Heard it,Spell it\nshivon,Siobhan\n')
    const plan = mergeDictionary([], parsed.entries)
    expect(importQuestion(ready({ added: plan.added, addedWords: plan.addedWords }))).toContain('(Heard it → Spell it; shivon → Siobhan)')
    expect(importQuestion(ready({ added: 1, addedWords: ['Excel'], heading: 'Word' }))).toBe(
      'Import names.csv? It adds 1 word (Excel). The first line (Word) was read as a heading.'
    )
  })

  it('says when the list is full', () => {
    expect(importQuestion(ready({ added: 2, left: 40 }))).toContain('40 words do not fit: an import stops at 2,000 words.')
  })

  it('asks nothing when the file would change nothing, and says why', () => {
    expect(importQuestion(ready({ same: 12 }))).toBeNull()
    expect(pickMessage(ready({ same: 12 }))).toBe('Nothing to import from names.csv. 12 words are already here.')
    expect(pickMessage(ready({ unread: 4 }))).toBe(
      'No words could be read from names.csv. murmur takes a CSV or JSON list of words.'
    )
    expect(pickMessage(ready({ added: 1 }))).toBe('')
    // A file that was only a heading says so.
    expect(pickMessage(ready({ heading: 'word, Word' }))).toBe(
      'No words could be read from names.csv. murmur takes a CSV or JSON list of words. The first line (word, Word) was read as a heading.'
    )
  })

  it('says why a file was not opened', () => {
    expect(pickMessage({ status: 'cancelled' })).toBe('')
    expect(pickMessage({ status: 'too-big' })).toContain('1 MB')
    expect(pickMessage({ status: 'unreadable' })).toContain('CSV or JSON')
  })

  it('says what an import and an export did', () => {
    expect(importedMessage({ status: 'done', added: 9, changed: 2 })).toBe('Added 9 words and changed 2 words.')
    expect(importedMessage({ status: 'done', added: 0, changed: 1 })).toBe('Changed 1 word.')
    expect(importedMessage({ status: 'stale' })).toContain('Pick the file again')
    expect(exportedMessage({ status: 'saved', count: 14 })).toBe('Saved 14 words.')
    expect(exportedMessage({ status: 'cancelled' })).toBe('')
    expect(exportedMessage({ status: 'failed' })).toContain('Could not save')
  })

  it('shortens a long file name to 1 line', () => {
    expect(shortName('names.csv')).toBe('names.csv')
    expect(shortName('n'.repeat(80))).toHaveLength(40)
  })
})

describe('the note beside Import: what a file needs, and what can go wrong', () => {
  const all = FILE_TIPS.join(' ')
  const read = (text: string, ext = 'csv'): { entries: Array<{ from: string; to: string }>; unread: number } => {
    const parsed = parseDictionaryFile(text, ext)
    if (!parsed.ok) throw new Error('not read')
    return parsed
  }

  it('is 6 lines, and names every limit a person can act on before they pick a file', () => {
    expect(FILE_TIPS).toHaveLength(6)
    for (const said of ['double quotes', 'comma or semicolon', 'never type them into a cell', 'line break', 'CSV UTF-8', 'Unicode text', 'Western European', 'first 3 new words', 'no undo']) {
      expect(all).toContain(said)
    }
    expect(all).toContain(`a word ${MAX_ENTRY_CHARS} characters`)
    expect(all).toContain(`the dictionary ${MAX_DICTIONARY_ENTRIES.toLocaleString('en-US')} words`)
    expect(all).toContain('1 MB at most')
  })

  it('line 1 is true: 2 columns parted by a comma, a tab or a semicolon, and its example reads', () => {
    const pair = [{ from: 'shivon', to: 'Siobhan' }]
    expect(read('shivon,Siobhan').entries).toEqual(pair)
    expect(read('shivon\tSiobhan').entries).toEqual(pair)
    expect(read('shivon;Siobhan').entries).toEqual(pair)
    expect(FILE_TIPS[0]).toContain('shivon,Siobhan')
  })

  it('line 2 is true: without quotes a line splits in the wrong place, and with them it reads', () => {
    // A notes column of commas in a semicolon file: the comma wins.
    const notes = read('shivon;Siobhan;a name, Irish\nkubernetties;Kubernetes;a tool, for servers')
    expect(notes.entries[0]).toEqual({ from: 'shivon;Siobhan;a name', to: 'Irish' })
    expect(read('shivon;Siobhan;"a name, Irish"\nkubernetties;Kubernetes;"a tool, for servers"').entries).toEqual([
      { from: 'shivon', to: 'Siobhan' },
      { from: 'kubernetties', to: 'Kubernetes' }
    ])
    // A word that holds a comma, in quotes, and a note that holds a tab.
    expect(read('"smith, jon","Smith, Jon"').entries).toEqual([{ from: 'smith, jon', to: 'Smith, Jon' }])
    expect(read('shivon,Siobhan,"a\tnote"').entries).toEqual([{ from: 'shivon', to: 'Siobhan' }])
    // Quotes typed into a spreadsheet cell are doubled on save, and come in as part of the word.
    expect(read('"""smith, jon""","""Smith, Jon"""').entries).toEqual([{ from: '"smith, jon"', to: '"Smith, Jon"' }])
  })

  it('lines 3 and 5 are true: a cell with a line break is skipped or leaves stray words, and no word holds a tab', () => {
    const one = read('"one\ntwo",Written')
    expect(one.entries).toEqual([])
    expect(one.unread).toBe(2)
    expect(read('"one\nstray\ntwo",Written').entries.some((entry) => entry.from === 'stray')).toBe(true)
    const tab = read('"a\tb",Written')
    expect(tab.entries).toEqual([])
    expect(tab.unread).toBe(1)
  })

  it('line 4 is true: a Western European file reads right, and another encoding comes out as wrong letters', () => {
    // Bytes from 0xA0 up only: below that, runtimes disagree on windows-1252.
    const western = Buffer.from([0x6a, 0x6f, 0x73, 0x65, 0x2c, 0x4a, 0x6f, 0x73, 0xe9])
    expect(read(decodeWordList(western)).entries).toEqual([{ from: 'jose', to: 'José' }])
    // The same name list saved as Central European: 0xA3 is its Ł.
    const central = Buffer.from([0x6c, 0x75, 0x6b, 0x61, 0x73, 0x7a, 0x2c, 0xa3, 0x75, 0x6b, 0x61, 0x73, 0x7a])
    expect(read(decodeWordList(central)).entries).toEqual([{ from: 'lukasz', to: '£ukasz' }])
  })

  it('line 6 is true: the question shows 3 new words and no more, whatever the file holds', () => {
    const file = ['a1,A1', 'b2,B2', 'c3,C3', 'd4;wrong,D4', 'e5,E5'].join('\n')
    const plan = mergeDictionary([], read(file).entries)
    expect(plan.added).toBe(5)
    expect(plan.addedWords).toHaveLength(3)
    expect(plan.addedWords.join(' ')).not.toContain('d4')
  })

  it('keeps the copy rules: no dashes between clauses, digits for numbers', () => {
    expect(all).not.toMatch(/—|–|--| - /)
    expect(all).not.toMatch(/\b(one|two|three)\b/i)
    expect(all).not.toContain('Murmur')
  })
})
