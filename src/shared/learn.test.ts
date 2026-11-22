// SPDX-License-Identifier: GPL-3.0-only
// Learning a spelling from a fix (US-184, US-185): which changes to a
// take are spellings, which words the dictionary would have to hear,
// and how fixes are counted until they are worth a question.
import { describe, expect, it } from 'vitest'
import { applyDictionary } from './dictionary'
import { KEEP_24_HOURS, KEEP_FOREVER, KEEP_NO_TEXT } from './history'
import {
  type Candidate,
  LEARN_REPEATS,
  MAX_CANDIDATES,
  countFixes,
  fixesIn,
  heardInTranscript,
  isSpellingFix,
  keepCandidates,
  pairText,
  seenLine,
  selectionToFix,
  settleCandidate,
  SUGGESTION_NOTICE,
  fixHint,
  suggestionsFrom,
  typedFix,
  usableCandidates,
  worthWatching
} from './learn'

const take = 'I met shiv on at the cafe today.'

describe('fixesIn: the spellings a person fixed in a take', () => {
  it('finds a name fixed in place', () => {
    expect(fixesIn(take, take, 'I met Siobhan at the cafe today.')).toEqual([{ heard: 'shiv on', written: 'Siobhan' }])
  })

  it('finds casing and spacing fixes', () => {
    const said = 'push it to git hub and deploy on kubernetes tonight'
    expect(fixesIn(said, said, 'push it to GitHub and deploy on Kubernetes tonight')).toEqual([
      { heard: 'git hub', written: 'GitHub' },
      { heard: 'kubernetes', written: 'Kubernetes' }
    ])
  })

  it('learns nothing from an untouched take', () => {
    expect(fixesIn(take, take, take)).toEqual([])
  })

  it('never takes words added or deleted for a fix', () => {
    expect(fixesIn(take, take, 'I met shiv on at the cafe today. Then we walked home.')).toEqual([])
    expect(fixesIn(take, take, 'I met shiv on today.')).toEqual([])
    expect(fixesIn(take, take, 'I really met shiv on at the cafe today.')).toEqual([])
  })

  it('still learns the name when the person went on typing after it', () => {
    expect(fixesIn(take, take, 'I met Siobhan at the cafe today, and then we had a long lunch by the river.')).toEqual([
      { heard: 'shiv on', written: 'Siobhan' }
    ])
  })

  it('learns nothing from a different text: most of the take must still be there', () => {
    expect(fixesIn(take, take, '')).toEqual([])
    expect(fixesIn(take, take, 'Siobhan')).toEqual([])
    expect(fixesIn(take, take, 'The build is green and the deploy went out at noon.')).toEqual([])
    expect(fixesIn(take, take, '> _\n⏺ Working on it')).toEqual([])
  })

  it('learns nothing from a take too short to tell a fix from a new message', () => {
    expect(fixesIn('shiv on', 'shiv on', 'Siobhan')).toEqual([])
    expect(fixesIn('hi shiv on', 'hi shiv on', 'hi Siobhan')).toEqual([])
  })

  it('leaves a change of meaning alone: a different word is not a spelling', () => {
    const said = 'the meeting moved to the big room on the second floor'
    expect(fixesIn(said, said, 'the lunch moved to the big room on the second floor')).toEqual([])
  })

  it('leaves a changed date or number alone, and still learns the name beside it', () => {
    const said = 'shiv on moved the launch to Tuesday the 15 of June'
    expect(fixesIn(said, said, 'Siobhan moved the launch to Thursday the 16 of July')).toEqual([{ heard: 'shiv on', written: 'Siobhan' }])
  })

  it('leaves everyday words alone, however they were changed', () => {
    const said = 'we left there bags by the door of the house'
    expect(fixesIn(said, said, 'we left their bags by the door of the house')).toEqual([])
  })

  it('skips a rewritten stretch and still learns from the rest', () => {
    const said = 'tell shiv on that the quarterly numbers look fine to me'
    expect(fixesIn(said, said, 'tell Siobhan that everything in the finance report this quarter looks fine to me')).toEqual([
      { heard: 'shiv on', written: 'Siobhan' }
    ])
  })

  it('counts a fix made twice in 1 take once', () => {
    const said = 'shiv on called and I told shiv on to come by'
    expect(fixesIn(said, said, 'Siobhan called and I told Siobhan to come by')).toEqual([{ heard: 'shiv on', written: 'Siobhan' }])
  })

  it('ignores punctuation and line changes around words', () => {
    expect(fixesIn(take, take, 'I met shiv on, at the cafe, today!')).toEqual([])
  })

  it('keeps a mark that rides on a letter with its word, however the accent was typed', () => {
    const said = 'please ask jose about the invoice today'
    // The accent as its own character, as some keyboards type it.
    expect(fixesIn(said, said, 'please ask Jose\u0301 about the invoice today')).toEqual([{ heard: 'jose', written: 'Jos\u00e9' }])
    const hindi = 'please ask \u0905\u092e\u0930 about the invoice today'
    const fixed = fixesIn(hindi, hindi, 'please ask \u0905\u092e\u0932\u0940 Ji about the invoice today')
    // Whatever is learned holds the whole word, vowel sign included.
    for (const fix of fixed) expect(fix.written.endsWith('\u0905\u092e\u0932')).toBe(false)
  })

  it('gives up on a take with more fixes than a person makes to spellings', () => {
    const said = 'alfa bravo charly delta eko foxtrot golf hotel india juliet kilo lima'
    const fixed = 'alfa Bravo charly Delta eko Foxtrot golf Hotel india juliet kilo lima'
    expect(fixesIn(said, said, fixed)).toEqual([])
  })

  it('stays quick on the longest take it reads, and reads nothing longer', () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')
    const started = Date.now()
    expect(fixesIn(long, long, long.replace('word7 ', 'Word7 '))).toEqual([{ heard: 'word7', written: 'Word7' }])
    expect(Date.now() - started).toBeLessThan(500)
    const longer = `${long} more`
    expect(fixesIn(longer, longer, longer.replace('word7 ', 'Word7 '))).toEqual([])
  })
})

describe('heardInTranscript: the dictionary hears the transcript, not the cleaned text', () => {
  it('uses the cleaned words when the transcript holds them too', () => {
    expect(heardInTranscript('i met shiv on today', 'I met shiv on today.', 'shiv on', 'Siobhan')).toBe('shiv on')
  })

  it('uses the transcript words when cleanup changed them', () => {
    // Cleanup joined 2 words into 1; the dictionary must hear the 2.
    const raw = 'deploy it on cooper netties tonight please'
    const final = 'Deploy it on Coopernetties tonight, please.'
    expect(heardInTranscript(raw, final, 'Coopernetties', 'Kubernetes')).toBe('cooper netties')
    const fixes = fixesIn(raw, final, 'Deploy it on Kubernetes tonight, please.')
    expect(fixes).toEqual([{ heard: 'cooper netties', written: 'Kubernetes' }])
    // The rule would have changed the take it came from.
    expect(applyDictionary(raw, [{ from: fixes[0].heard, to: fixes[0].written }])).toBe('deploy it on Kubernetes tonight please')
  })

  it('is null when no rule on the transcript would have changed the take', () => {
    // Cleanup wrote a word the transcript never held, around other changes.
    expect(heardInTranscript('so um the thing is broken', 'The widget is broken.', 'widget', 'Widgit')).toBeNull()
    expect(fixesIn('so um the thing is broken again today', 'The widget is broken again today.', 'The Widgit is broken again today.')).toEqual([])
  })
})

describe('isSpellingFix', () => {
  it('takes names, terms, casing and spacing', () => {
    expect(isSpellingFix('shiv on', 'Siobhan')).toBe(true)
    expect(isSpellingFix('cooper netties', 'Kubernetes')).toBe(true)
    expect(isSpellingFix('git hub', 'GitHub')).toBe(true)
    expect(isSpellingFix('node js', 'Node.js')).toBe(true)
    expect(isSpellingFix('see plus plus', 'C++')).toBe(false)
    expect(isSpellingFix('obrien', "O'Brien")).toBe(true)
  })

  it('refuses the same words, empty sides, long sides, and more than 1 line', () => {
    expect(isSpellingFix('Siobhan', 'Siobhan')).toBe(false)
    expect(isSpellingFix('', 'Siobhan')).toBe(false)
    expect(isSpellingFix('shiv on', ' ')).toBe(false)
    expect(isSpellingFix('a'.repeat(41), 'b')).toBe(false)
    expect(isSpellingFix('one two three four', 'Onetwothreefour')).toBe(false)
    expect(isSpellingFix('shiv on', 'Sio\nbhan')).toBe(false)
  })

  it('refuses everyday words on the heard side, and words that only look alike by chance', () => {
    expect(isSpellingFix('there', 'their')).toBe(false)
    expect(isSpellingFix('to', 'too')).toBe(false)
    expect(isSpellingFix('it’s', 'its')).toBe(false)
    expect(isSpellingFix('meeting', 'lunch')).toBe(false)
    expect(isSpellingFix('budget', 'calendar')).toBe(false)
  })

  it('never takes a number, a day, a month or a short form for a spelling: those change what was meant', () => {
    for (const [heard, written] of [
      ['2025', '2026'],
      ['15', '50'],
      ['March 3', 'March 13'],
      ['v2', 'v3'],
      ['3pm', '4pm'],
      ['Q3', 'Q4'],
      ['iphone 15', 'iPhone 16'],
      ['Tuesday', 'Thursday'],
      ['june', 'July'],
      ['north', 'south'],
      ['fifteen', 'fifty'],
      ["won't", 'will'],
      ["isn't", 'is'],
      ['can', "can't"],
      ['affect', 'effect'],
      ['accept', 'except'],
      ['wright', 'right']
    ]) {
      expect(isSpellingFix(heard, written), `${heard} for ${written}`).toBe(false)
    }
    // 2 plain words that look alike are a change of meaning, and a short
    // name leaves too little to go on.
    for (const [heard, written] of [
      ['increase', 'decrease'],
      ['enable', 'disable'],
      ['include', 'exclude'],
      ['legal', 'illegal'],
      ['minutes', 'hours'],
      ['weekly', 'monthly'],
      ['upload', 'download'],
      ['Jon', 'Tom'],
      ['nginks', 'nginx']
    ]) {
      expect(isSpellingFix(heard, written), `${heard} for ${written}`).toBe(false)
    }
    // A term with a number in it is still a spelling when the number stays.
    expect(isSpellingFix('gpt 4', 'GPT-4')).toBe(true)
    expect(isSpellingFix('monday', 'Monday')).toBe(true)
    expect(isSpellingFix('John', 'Jon')).toBe(true)
  })

  it('refuses a side that took punctuation with it', () => {
    expect(isSpellingFix('shiv on,', 'Siobhan')).toBe(false)
    expect(isSpellingFix('(shiv on', 'Siobhan')).toBe(false)
  })
})

describe('the fix a word chord (US-184)', () => {
  it('takes a word or a short phrase on 1 line, whatever the word', () => {
    expect(selectionToFix('  shiv on ')).toBe('shiv on')
    expect(selectionToFix('there')).toBe('there')
    expect(selectionToFix('')).toBeNull()
    expect(selectionToFix('2 lines\nof text')).toBeNull()
    expect(selectionToFix('x'.repeat(81))).toBeNull()
  })

  it('makes a fix of what was typed, or nothing when it changes nothing', () => {
    expect(typedFix('shiv on', ' Siobhan ')).toEqual({ heard: 'shiv on', written: 'Siobhan' })
    expect(typedFix('shiv on', 'shiv on')).toBeNull()
    expect(typedFix('shiv on', '   ')).toBeNull()
    expect(typedFix('shiv on', 'x'.repeat(81))).toBeNull()
    expect(typedFix('shiv on', 'Sio\tbhan')).toBeNull()
  })
})

describe('worthWatching', () => {
  it('follows a take of 3 to 400 words, and no other', () => {
    expect(worthWatching('shiv on')).toBe(false)
    expect(worthWatching('hi shiv on')).toBe(true)
    expect(worthWatching(Array.from({ length: 400 }, () => 'word').join(' '))).toBe(true)
    expect(worthWatching(Array.from({ length: 401 }, () => 'word').join(' '))).toBe(false)
    expect(worthWatching('  ...  ')).toBe(false)
  })
})

describe('counting fixes until they are worth a question', () => {
  const fix = { heard: 'shiv on', written: 'Siobhan' }
  const day = 24 * 60 * 60 * 1000

  it('suggests nothing after 1 take, and the fix after enough', () => {
    let list: Candidate[] = countFixes([], [fix], 1_000)
    expect(suggestionsFrom(list, [])).toEqual([])
    for (let n = 1; n < LEARN_REPEATS; n++) list = countFixes(list, [fix], 1_000 + n)
    expect(suggestionsFrom(list, [])).toEqual([
      { heard: 'shiv on', written: 'Siobhan', count: LEARN_REPEATS, first: 1_000, last: 1_000 + LEARN_REPEATS - 1 }
    ])
  })

  it('counts the same heard words in any casing as 1 fix, and another spelling as another', () => {
    const list = countFixes(countFixes([], [fix], 1), [{ heard: 'Shiv On', written: 'Siobhan' }, { heard: 'shiv on', written: 'Shivon' }], 2)
    expect(list.map((c) => [c.heard, c.written, c.count])).toEqual([
      ['shiv on', 'Siobhan', 2],
      ['shiv on', 'Shivon', 1]
    ])
  })

  it('never suggests what the dictionary already does, or what was turned down', () => {
    const list = countFixes(countFixes([], [fix], 1), [fix], 2)
    expect(suggestionsFrom(list, [{ from: 'Shiv on', to: 'Siobhan' }])).toEqual([])
    // Another spelling of a word the dictionary has is still a question.
    expect(suggestionsFrom(list, [{ from: 'shiv on', to: 'Shivon' }])).toHaveLength(1)
    expect(suggestionsFrom(settleCandidate(list, fix, 'dismissed'), [])).toEqual([])
    // Turned down stays turned down when it is seen again.
    const again = countFixes(settleCandidate(list, fix, 'dismissed'), [fix], 3)
    expect(again[0].count).toBe(3)
    expect(suggestionsFrom(again, [])).toEqual([])
    expect(settleCandidate(list, fix, 'added')).toEqual([])
  })

  it('forgets fixes on the same schedule as history', () => {
    const list = countFixes(countFixes([], [fix], 0), [{ heard: 'git hub', written: 'GitHub' }], 40 * day)
    expect(keepCandidates(list, 45 * day, 30).map((c) => c.heard)).toEqual(['git hub'])
    expect(keepCandidates(list, 45 * day, 90)).toHaveLength(2)
    // The 24 hours setting, forever, and no text at all.
    expect(keepCandidates(list, 40 * day + 3_600_000, KEEP_24_HOURS).map((c) => c.heard)).toEqual(['git hub'])
    expect(keepCandidates(list, 4_000 * day, KEEP_FOREVER)).toHaveLength(2)
    expect(keepCandidates(list, 45 * day, KEEP_NO_TEXT)).toEqual([])
  })

  it('keeps a pair that was turned down when newer fixes push the oldest out', () => {
    let list: Candidate[] = countFixes([], [{ heard: 'shiv on', written: 'Siobhan' }], 0)
    list = settleCandidate(list, { heard: 'shiv on', written: 'Siobhan' }, 'dismissed')
    for (let n = 0; n < MAX_CANDIDATES + 5; n++) list = countFixes(list, [{ heard: `nayme${n}`, written: `Name${n}` }], n + 1)
    expect(list).toHaveLength(MAX_CANDIDATES)
    expect(list.find((c) => c.heard === 'shiv on')?.dismissed).toBe(true)
  })

  it('never remembers more than its cap, and drops the fixes seen longest ago', () => {
    let list: Candidate[] = []
    for (let n = 0; n < MAX_CANDIDATES + 5; n++) list = countFixes(list, [{ heard: `nayme${n}`, written: `Name${n}` }], n)
    expect(list).toHaveLength(MAX_CANDIDATES)
    expect(list.some((c) => c.heard === 'nayme0')).toBe(false)
    expect(list.some((c) => c.heard === `nayme${MAX_CANDIDATES + 4}`)).toBe(true)
  })

  it('trusts nothing in a stored list', () => {
    expect(usableCandidates(null)).toEqual([])
    expect(usableCandidates('text')).toEqual([])
    expect(
      usableCandidates([
        { heard: 'shiv on', written: 'Siobhan', count: 2, first: 1, last: 2, extra: 'x' },
        { heard: 'shiv on', written: 'Siobhan', count: 0, first: 1, last: 2 },
        { heard: 'there', written: 'their', count: 5, first: 1, last: 2 },
        { heard: 'shiv on', written: 9, count: 2, first: 1, last: 2 },
        { heard: 'git hub', written: 'GitHub', count: 3, first: 1, last: 2, dismissed: true },
        null,
        7
      ])
    ).toEqual([
      { heard: 'shiv on', written: 'Siobhan', count: 2, first: 1, last: 2 },
      { heard: 'git hub', written: 'GitHub', count: 3, first: 1, last: 2, dismissed: true }
    ])
  })
})

describe('what murmur says about a fix', () => {
  const fix = { heard: 'shiv on', written: 'Siobhan' }

  it('shows the pair as the dictionary does, and counts takes in digits', () => {
    expect(pairText(fix)).toBe('shiv on → Siobhan')
    expect(seenLine(2)).toBe('You made this fix in 2 takes.')
  })

  it('never puts the words in the notification, which outlives murmur in the system\'s list', () => {
    const said = `${SUGGESTION_NOTICE.title} ${SUGGESTION_NOTICE.body}`
    expect(said).toContain('ready to add to your dictionary')
    expect(said).not.toMatch(/→|Murmur|—|--| - /)
  })

  it('says what happened to the word, then to the pair, after a fix was typed', () => {
    expect(fixHint('inserted', 'added')).toBe('fixed and saved')
    expect(fixHint('inserted', 'changed')).toBe('fixed and saved')
    expect(fixHint('inserted', 'same')).toBe('fixed')
    expect(fixHint('inserted', 'full')).toBe('fixed, your dictionary is full')
    expect(fixHint('inserted', 'failed')).toBe('fixed, could not save')
    expect(fixHint('copied', 'added')).toBe('saved, paste to fix')
    expect(fixHint('copied', 'same')).toBe('copied, paste to fix')
    // A full dictionary is said in copy only mode too, never "saved".
    expect(fixHint('copied', 'full')).toBe('copied, your dictionary is full')
    expect(fixHint('copied', 'failed')).toBe('copied, could not save')
    expect(fixHint('error', 'added')).toBe('saved, could not paste')
    expect(fixHint('error', 'full')).toBe('could not paste, dictionary is full')
    expect(fixHint('error', 'same')).toBe('could not fix the word')
    expect(fixHint('error', 'failed')).toBe('could not fix the word')
    for (const outcome of ['inserted', 'copied', 'error'] as const) {
      for (const taught of ['added', 'changed', 'same', 'full', 'failed'] as const) {
        const hint = fixHint(outcome, taught)
        expect(hint.length, hint).toBeLessThanOrEqual(36)
        // Never "saved" for a pair that was not.
        if (taught !== 'added' && taught !== 'changed') expect(hint).not.toMatch(/^saved|and saved/)
      }
    }
  })
})
