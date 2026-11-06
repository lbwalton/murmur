// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import cases from '../../../shared/cleanup-cases.json'
import packageJson from '../../../package.json'
import vitestConfig from '../../../vitest.config'
import { CLEANUP_KINDS, type CleanupCase, type CleanupOutcome, cleanupReport, gradeCase, plainText } from './cleanup-score'
import { CORRECTIONS_PROMPT, SMART_LISTS_PROMPT } from './llm'

const CASES = cases.cases as CleanupCase[]

describe('shared/cleanup-cases.json', () => {
  it('has at least 80 cases and enough of every kind', () => {
    const minimums: Record<(typeof CLEANUP_KINDS)[number], number> = {
      'cue-fix': 12,
      restatement: 12,
      'abandoned-start': 12,
      'real-cue-word': 12,
      list: 8,
      'long-structure': 6,
      'plain-prose': 8
    }
    expect(CASES.length).toBeGreaterThanOrEqual(80)
    for (const kind of CLEANUP_KINDS) {
      expect(CASES.filter((probe) => probe.kind === kind).length, kind).toBeGreaterThanOrEqual(minimums[kind])
    }
  })

  it('every case has the right shape', () => {
    expect(new Set(CASES.map((probe) => probe.id)).size).toBe(CASES.length)
    for (const probe of CASES) {
      expect(CLEANUP_KINDS, probe.id).toContain(probe.kind)
      expect(probe.text.trim().length, probe.id).toBeGreaterThan(0)
      expect(probe.keep.length, probe.id).toBeGreaterThan(0)
      expect(Array.isArray(probe.drop), probe.id).toBe(true)
    }
  })

  it('a case that keeps every word has nothing to drop', () => {
    for (const probe of CASES.filter((item) => item.unchanged)) {
      expect(probe.drop, probe.id).toEqual([])
    }
  })

  it('cases meant to be cut have something to cut, and real cue words have nothing', () => {
    for (const probe of CASES) {
      if (probe.kind === 'cue-fix' || probe.kind === 'restatement' || probe.kind === 'abandoned-start') {
        expect(probe.drop.length, probe.id).toBeGreaterThan(0)
      }
      if (probe.kind === 'real-cue-word') expect(probe.drop, probe.id).toEqual([])
    }
  })

  it('every phrase comes from what was spoken, so a good answer can pass', () => {
    for (const probe of CASES) {
      const spoken = plainText(probe.text)
      for (const phrase of probe.drop) {
        // A digit spelling (12th) of a spoken ordinal is a drop on purpose.
        const spokenHere = ` ${spoken} `.includes(` ${plainText(phrase)} `)
        expect(spokenHere || /\d(st|nd|rd|th)$/.test(phrase), `${probe.id}: ${phrase}`).toBe(true)
      }
      // Word for word, in order: a fallback types everything that was
      // said, and that must never grade as lost content.
      for (const phrase of probe.keep) {
        const first = plainText(phrase.split('|')[0])
        expect(` ${spoken} `.includes(` ${first} `), `${probe.id}: ${phrase}`).toBe(true)
      }
    }
  })

  it('every sentence of a case that gets cut is covered, so a whole sentence cannot vanish unseen', () => {
    const uncovered = CASES.filter((item) => !item.unchanged).flatMap((probe) => {
      const phrases = [...probe.keep, ...probe.drop].flatMap((phrase) => phrase.split('|')).map(plainText)
      return probe.text
        .split(/(?<=[.?!])\s+/)
        .filter((sentence) => !phrases.some((phrase) => ` ${plainText(sentence)} `.includes(` ${phrase} `)))
        .map((sentence) => `${probe.id}: ${sentence}`)
    })
    expect(uncovered).toEqual([])
  })

  it('real cue word cases keep every word', () => {
    for (const probe of CASES.filter((item) => item.kind === 'real-cue-word')) {
      expect(probe.unchanged, probe.id).toBe(true)
    }
  })

  it('a case close to a prompt example is marked tuned, so it cannot pass for a held out score', () => {
    const words = (value: string): Set<string> => new Set(plainText(value).split(' '))
    const examples = [CORRECTIONS_PROMPT, SMART_LISTS_PROMPT]
      .flatMap((prompt) => prompt.split('Example: ').slice(1))
      .map((example) => words(example.split(/ becomes: | stays exactly/)[0]))
    expect(examples.length).toBeGreaterThan(0)
    for (const probe of CASES.filter((item) => !item.tuned)) {
      const spoken = words(probe.text)
      for (const example of examples) {
        const shared = [...spoken].filter((word) => example.has(word)).length
        const overlap = shared / (spoken.size + example.size - shared)
        expect(overlap, probe.id).toBeLessThan(0.4)
      }
    }
  })

  it('stays out of the unit run: every unit glob is a test file, and the probe file is not', () => {
    const include = (vitestConfig as { test: { include: string[] } }).test.include
    expect(include.length).toBeGreaterThan(0)
    for (const glob of include) expect(glob).toMatch(/\.test\.[a-z]+$/)
    expect(packageJson.scripts.test).not.toContain('probe')
    expect(packageJson.scripts['probe:cleanup']).toContain('vitest.probe.config.ts')
  })
})

describe('plainText', () => {
  it('drops punctuation and case and joins contractions', () => {
    expect(plainText("Let's go, NOW!")).toBe('lets go now')
    expect(plainText('Let’s go')).toBe('lets go')
  })

  it('treats number words and digits alike', () => {
    expect(plainText('fifty thousand dollars')).toBe(plainText('$50,000 dollars'))
    expect(plainText('twenty five people')).toBe(plainText('25 people'))
    expect(plainText('seven thirty')).toBe(plainText('7:30'))
  })

  it('keeps numbers apart when a comma separates them', () => {
    expect(plainText('two thirty, three')).toBe('2 30 3')
    expect(plainText('thirty-five')).toBe('35')
  })
})

describe('gradeCase', () => {
  const probe: CleanupCase = {
    id: 't',
    kind: 'cue-fix',
    text: 'Send it Tuesday, sorry, Wednesday.',
    keep: ['wednesday'],
    drop: ['tuesday', 'sorry']
  }

  it('passes a clean fix', () => {
    expect(gradeCase(probe, 'Send it Wednesday.')).toEqual({
      passed: true,
      lost: [],
      left: [],
      changed: false,
      shortList: false
    })
  })

  it('reports lost content apart from a stumble left in', () => {
    expect(gradeCase(probe, 'Send it Thursday.').lost).toEqual(['wednesday'])
    expect(gradeCase(probe, 'Send it Thursday.').left).toEqual([])
    const left = gradeCase(probe, 'Send it Tuesday, sorry, Wednesday.')
    expect(left.lost).toEqual([])
    expect(left.left).toEqual(['tuesday', 'sorry'])
    expect(left.passed).toBe(false)
  })

  it('matches whole words only', () => {
    const wait: CleanupCase = { ...probe, keep: ['send'], drop: ['wait'] }
    expect(gradeCase(wait, 'Send it to the waiter.').left).toEqual([])
  })

  it('accepts any spelling after a bar', () => {
    const date: CleanupCase = { ...probe, keep: ['fourteenth|14th'], drop: [] }
    expect(gradeCase(date, 'on the 14th').passed).toBe(true)
    expect(gradeCase(date, 'on the fourteenth').passed).toBe(true)
    expect(gradeCase(date, 'on the fifteenth').lost).toEqual(['fourteenth|14th'])
  })

  it('fails a changed word on a case that keeps every word, and allows punctuation', () => {
    const prose: CleanupCase = { ...probe, text: 'we left at noon', keep: ['noon'], drop: [], unchanged: true }
    expect(gradeCase(prose, 'We left at noon.').passed).toBe(true)
    expect(gradeCase(prose, 'We departed at noon.').changed).toBe(true)
  })

  it('fails a list forced onto prose even when every word stayed', () => {
    const prose: CleanupCase = {
      ...probe,
      text: 'We went to the store, then we got lunch.',
      keep: ['we got lunch'],
      drop: [],
      unchanged: true
    }
    expect(gradeCase(prose, 'We went to the store, then we got lunch.').passed).toBe(true)
    expect(gradeCase(prose, '- We went to the store\n- then we got lunch').changed).toBe(true)
    expect(gradeCase(prose, '* We went to the store, then we got lunch.').changed).toBe(true)
    expect(gradeCase(prose, 'We went to the store,\nthen we got lunch.').changed).toBe(true)
  })

  it('does not read a list number as a spoken word', () => {
    const recipe: CleanupCase = { ...probe, text: 'x', keep: ['two eggs'], drop: [] }
    expect(gradeCase(recipe, '1. flour\n2. eggs').lost).toEqual(['two eggs'])
    expect(gradeCase(recipe, '1. flour\n2. two eggs').passed).toBe(true)
  })

  it('counts list lines', () => {
    const list: CleanupCase = { ...probe, text: 'a b', keep: ['eggs', 'milk'], drop: [], listLines: 2 }
    expect(gradeCase(list, 'eggs, milk').shortList).toBe(true)
    expect(gradeCase(list, '1. eggs\n2. milk').passed).toBe(true)
    expect(gradeCase(list, '- eggs\n- milk').passed).toBe(true)
  })
})

describe('cleanupReport', () => {
  const one: CleanupCase = { id: 'a', kind: 'cue-fix', text: 'x', keep: ['x'], drop: [] }
  const row = (id: string, typed: string, extra: Partial<CleanupOutcome> = {}): CleanupOutcome => ({
    model: 'm',
    id,
    kind: 'cue-fix',
    tuned: false,
    run: 0,
    typed,
    fallback: null,
    transport: false,
    grade: gradeCase(one, typed),
    ...extra
  })

  it('prints pass rate, lost content by name, and fallback reasons per kind', () => {
    const report = cleanupReport([row('a', 'x'), row('b', 'y', { fallback: 'validate: length ratio' })])
    expect(report).toContain('model m: 2 graded, 0 could not be graded')
    expect(report).toContain('50%  1/2  lost 1  fallbacks: validate: length ratio 1')
    expect(report).toContain('LOST CONTENT:')
    expect(report).toContain('b 1x, lost: x')
  })

  it('leaves a failed request out of the score and names why', () => {
    const report = cleanupReport([row('a', 'x'), row('b', 'y', { fallback: 'http 429', transport: true })])
    expect(report).toContain('model m: 1 graded, 1 could not be graded')
    expect(report).toContain('100%  1/1  lost 0  not graded: http 429 1')
    expect(report).not.toContain('LOST CONTENT')
  })

  it('still lists a kind where nothing could be graded', () => {
    const report = cleanupReport([row('a', 'y', { fallback: 'http 401', transport: true })])
    expect(report).toContain('model m: 0 graded, 1 could not be graded')
    expect(report).toContain('not graded: http 401 1')
  })

  it('counts passes the model did not earn', () => {
    const report = cleanupReport([row('a', 'x', { fallback: 'timeout' }), row('c', 'x')])
    expect(report).toContain('passed by falling back 1')
  })

  it('shows a held out rate only when a kind has tuned cases', () => {
    const report = cleanupReport([row('a', 'x', { tuned: true }), row('b', 'y')])
    expect(report).toContain('held out 0%')
    expect(cleanupReport([row('a', 'x')])).not.toContain('held out')
  })
})
