// SPDX-License-Identifier: GPL-3.0-only
// The repo never names its owner (US-171). His rule, clarified 2026-11-15:
// his first and last name appear nowhere in murmur, in any tracked file,
// stories and code comments included; his initials, LB, are fine. The
// GitHub account name (lb and the last name run together, lowercase)
// stays, since every link to the repo, the release feed, and the app id
// carry it. This file spells neither name: the pattern uses character
// classes and the samples are built from pieces, so it passes its own scan.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')

// The first name in any case, run together or with a space, line break,
// dot, hyphen, or underscore inside it, and with the misheard ending an
// old example used; the last name in any case.
const OWNER_NAME = /la[\s._-]*bro[iy]|wal[t]on/gi

/** Where the owner's name appears in a text, as line:column (1-based).
 *  The last name right after a lowercase lb is the account name, and passes. */
function sightings(text) {
  return [...text.matchAll(OWNER_NAME)]
    .filter((match) => !(/^w/i.test(match[0]) && text.slice(match.index - 2, match.index) === 'lb'))
    .map((match) => {
      const before = text.slice(0, match.index)
      const line = before.split('\n').length
      const column = match.index - before.lastIndexOf('\n')
      return `${line}:${column}`
    })
}

/** Every file git tracks, plus new ones not yet added (so a run before a
 *  commit catches them), minus what .gitignore leaves out. Forward slashes
 *  on every platform. */
function repoFiles() {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return [...new Set(listed.split('\0').filter(Boolean))]
}

/** A file's text, or null for a binary, a folder, or a file deleted but not yet committed. */
function readText(file) {
  const full = join(ROOT, ...file.split('/'))
  try {
    if (!statSync(full).isFile()) return null
  } catch {
    return null
  }
  const bytes = readFileSync(full)
  // The same test git uses: a NUL byte near the start means binary.
  if (bytes.subarray(0, 8000).includes(0)) return null
  return bytes.toString('utf8')
}

describe('the repo never names its owner (US-171)', () => {
  // Samples are labeled by number, never by their text, so a failing run
  // does not print the name into a public CI log.
  it('catches either name in any case, spaced, or misheard, and lets the account name through', () => {
    const first = ['La', 'Broi'].join('')
    const last = ['Wal', 'ton'].join('')
    const named = [
      first,
      `${first}'s`,
      first.toUpperCase(),
      first.toLowerCase(),
      ['La', 'Broi'].join(' '),
      ['la', 'broi'].join('\n'),
      ['La', 'Broi'].join('-'),
      ['la', 'broi'].join('_'),
      ['La', 'Broi'].join('.'),
      ['La', 'Broy'].join(' '),
      ['lab', 'roy'].join(''),
      last,
      last.toUpperCase(),
      `${first} ${last}`,
      `Sincerely,\\n${first}`,
      `${first}${last}`.toLowerCase(),
      `LB${last}`,
      `Lb${last.toLowerCase()}`
    ]
    named.forEach((text, i) => expect(sightings(`say ${text} here`), `named sample ${i}`).not.toEqual([]))
    const allowed = [
      `https://github.com/lb${last.toLowerCase()}/murmur`,
      `lb${last.toLowerCase()}@example.com`,
      `com.lb${last.toLowerCase()}.murmur`,
      "LB, LB's picks",
      'collaborate on the labor plan with Siobhan',
      'the brook in La Paz'
    ]
    allowed.forEach((text, i) => expect(sightings(text), `allowed sample ${i}`).toEqual([]))
    expect(sightings(`one\ntwo ${last}`)).toEqual(['2:5'])
  })

  it('in no file of the repo, its contents or its path', () => {
    const files = repoFiles()
    const texts = files.map((file) => [file, readText(file)]).filter(([, text]) => text !== null)
    // A scan that read nothing would pass for the wrong reason.
    expect(texts.length).toBeGreaterThan(100)
    const scanned = texts.map(([file]) => file)
    for (const file of ['CLAUDE.md', 'prd.json', 'HANDOFF.md', 'src/renderer/tokens.css', 'shared/test-vectors.json', 'scripts/no-owner-name.test.js']) {
      expect(scanned).toContain(file)
    }
    // Places only, never the matched text.
    const found = [
      ...files.filter((file) => sightings(file).length > 0).map((file) => `${file} (its path)`),
      ...texts.flatMap(([file, text]) => sightings(text).map((at) => `${file}:${at}`))
    ]
    expect(found, 'the owner is named here; write LB instead (CLAUDE.md, Brand)').toEqual([])
  })
})
