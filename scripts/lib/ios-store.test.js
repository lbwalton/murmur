// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listingProblems, reviewNotesProblems, storeShotProblems } from './ios-store'

const store = join(__dirname, '..', '..', 'ios', 'store')
const fields = JSON.parse(readFileSync(join(store, 'listing.json'), 'utf8'))
// The description is its own plain text file, so it pastes with real line
// breaks, never a JSON string's \n.
// Windows checks text out with \r\n line ends; read it as it is pasted.
const description = readFileSync(join(store, 'description.txt'), 'utf8').replace(/\r\n/g, '\n').trim()
const listing = { ...fields, description }
const withField = (field, value) => ({ ...listing, [field]: value })
const one = (problems, words) => {
  expect(problems.length).toBe(1)
  expect(problems[0]).toContain(words)
}

describe('the App Store listing (IOS-026)', () => {
  it("passes Apple's limits and murmur's voice as written", () => {
    expect(listingProblems(listing)).toEqual([])
  })

  it('keeps the description in a file that pastes as is', () => {
    expect(fields.description).toBeUndefined()
    expect(description).toContain('\n\n')
    expect(description).not.toContain('\\n')
  })

  // Smart lists, Apply corrections, and note sorting are off until turned
  // on (docs/iphone.md), so the listing says so where it names them.
  it('never sells an opt-in feature as a default', () => {
    expect(description).not.toContain('lists made into lists')
    expect(description).toMatch(/turn on Smart lists/i)
    expect(description).toMatch(/turn on Apply corrections/i)
    expect(description).toMatch(/turn on sorting/i)
  })

  it("holds Apple's lengths, checked 2026-10-22", () => {
    one(listingProblems(withField('subtitle', 'a'.repeat(31))), 'subtitle')
    one(listingProblems(withField('name', 'a'.repeat(31))), 'name')
    one(listingProblems(withField('promotionalText', 'a'.repeat(171))), 'promotionalText')
    one(listingProblems(withField('description', 'a'.repeat(4001))), 'description')
    expect(listingProblems(withField('subtitle', 'a'.repeat(30)))).toEqual([])
  })

  it('counts keywords in bytes, not characters', () => {
    const base = `${'abcdefghi,'.repeat(9)}abcdefghi`
    expect(base.length).toBe(99)
    // 100 characters either way; the accent takes 2 bytes.
    expect(listingProblems(withField('keywords', `${base}x`))).toEqual([])
    one(listingProblems(withField('keywords', `${base}é`)), '101 bytes')
  })

  it('turns down short keywords and ones the name already covers', () => {
    one(listingProblems(withField('keywords', 'speech to text,ok,notes')), '"ok"')
    one(listingProblems(withField('keywords', 'speech to text,voice notes')), '"voice notes"')
    one(listingProblems(withField('keywords', 'speech to text,murmur')), '"murmur"')
  })

  it('keeps murmur lowercase everywhere', () => {
    one(listingProblems(withField('promotionalText', 'Murmur types for you.')), 'lowercase')
    one(listingProblems(withField('description', `${listing.description}\nMURMUR PRO`)), 'lowercase')
  })

  it('writes no dashes between clauses', () => {
    for (const bad of ['Talk — it types.', 'Talk – it types.', 'Talk -- it types.', 'Talk - it types.', 'Talk ‒ it types.', 'Talk ― it types.', 'Talk − it types.', 'Talk -\nit types.']) {
      one(listingProblems(withField('promotionalText', bad)), 'dash')
    }
    expect(listingProblems(withField('promotionalText', 'A one-time purchase.'))).toEqual([])
  })

  it('writes numbers as digits', () => {
    one(listingProblems(withField('promotionalText', 'Takes two taps.')), '"two"')
    one(listingProblems(withField('promotionalText', 'Saves twenty-five minutes.')), '"twenty-five"')
    for (const word of ['zero', 'hundred', 'thousand']) one(listingProblems(withField('promotionalText', `Costs ${word} cents.`)), `"${word}"`)
    expect(listingProblems(withField('promotionalText', 'Takes 2 taps, someone said.'))).toEqual([])
  })

  it('points every link at murmurapp.app, and the description has no HTML', () => {
    one(listingProblems(withField('supportUrl', 'https://example.com/support/')), 'supportUrl')
    one(listingProblems(withField('privacyPolicyUrl', 'http://murmurapp.app/privacy/')), 'privacyPolicyUrl')
    one(listingProblems(withField('description', '<b>murmur</b> types.')), 'HTML')
  })
})

describe('the App Store screenshots (IOS-026)', () => {
  const sips = (width, height, alpha) => `/tmp/1-dictate.png\n  pixelWidth: ${width}\n  pixelHeight: ${height}\n  hasAlpha: ${alpha}\n`

  it("pass at the iPhone 17's size with no alpha, checked 2026-10-22", () => {
    expect(storeShotProblems('1-dictate.png', sips(1206, 2622, 'no'))).toEqual([])
  })

  it('name a wrong size, an alpha channel, or an answer sips did not give', () => {
    expect(storeShotProblems('1-dictate.png', sips(1179, 2556, 'no'))).toEqual(['1-dictate.png is 1179 by 2556, not 1206 by 2622'])
    expect(storeShotProblems('1-dictate.png', sips(1206, 2622, 'yes'))).toEqual(['1-dictate.png has an alpha channel, which App Store Connect refuses'])
    expect(storeShotProblems('1-dictate.png', '')).toEqual(['1-dictate.png could not be read'])
  })
})

describe('the App Review notes (IOS-026)', () => {
  const notes = readFileSync(join(__dirname, '..', '..', 'ios', 'store', 'review-notes.txt'), 'utf8').replace(/\r\n/g, '\n')

  it('pass as written', () => {
    expect(reviewNotesProblems(notes)).toEqual([])
  })

  it("stay inside Apple's 4000 bytes, checked 2026-10-22", () => {
    one(reviewNotesProblems(`${notes}${'é'.repeat(2000)}`), 'bytes')
  })

  it('explain Full Access, the background microphone, and the review key', () => {
    for (const phrase of ['Full Access', 'no network requests', 'orange dot', 'UIBackgroundModes', 'never charged', 'REVIEW_KEY_HERE']) {
      one(reviewNotesProblems(notes.split(phrase).join('x')), phrase)
    }
  })

  it('never carry a key', () => {
    one(reviewNotesProblems(notes.replace('REVIEW_KEY_HERE', `REVIEW_KEY_HERE gsk_${'a1B2'.repeat(10)}`)), 'key')
    one(reviewNotesProblems(`${notes}\nsk-or-v1-${'0f'.repeat(20)}`), 'key')
    one(reviewNotesProblems(`${notes}\nkey:csk-${'ab12'.repeat(8)}`), 'key')
    one(reviewNotesProblems(`${notes}\n${'aB3x'.repeat(8)}`), 'key')
  })

  it("keep murmur's voice", () => {
    one(reviewNotesProblems(notes.replace('murmur', 'Murmur')), 'lowercase')
    one(reviewNotesProblems(`${notes}\nIt takes two taps.`), '"two"')
  })
})
