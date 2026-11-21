// SPDX-License-Identifier: GPL-3.0-only
// Sizing a long note's parts, and reading what a provider says when it
// refuses one (US-180).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PART_TOKENS,
  MAX_PART_TOKENS,
  MIN_PART_TOKENS,
  SAID_WITHHELD,
  errorMessage,
  estimateTokens,
  itemsCapFor,
  nextPart,
  parseDuration,
  partBudget,
  providerLimit,
  providerSays,
  retryDelayMs,
  sentenceCosts,
  unitBoundaries
} from './sort-batches'
import { findSeams, splitUnits } from './sorter'

const headers = (values: Record<string, string>): { get(name: string): string | null } => ({
  get: (name) => values[name.toLowerCase()] ?? null
})

describe('partBudget', () => {
  it('uses the default until the provider states a limit', () => {
    expect(partBudget()).toBe(DEFAULT_PART_TOKENS)
    expect(partBudget(Number.NaN)).toBe(DEFAULT_PART_TOKENS)
  })

  it('takes a share of a stated limit, inside the floor and ceiling', () => {
    expect(partBudget(8000)).toBe(6000)
    expect(partBudget(6000)).toBe(4500)
    expect(partBudget(500)).toBe(MIN_PART_TOKENS)
    expect(partBudget(2_000_000)).toBe(MAX_PART_TOKENS)
  })
})

describe('sentenceCosts', () => {
  it('counts the seams, lead words, and word list a sentence adds', () => {
    const plain = 'Hi.'
    const run = 'I need to buy apples, rice, and coffee for the party tonight.'
    const [small, big] = sentenceCosts([plain, run], [findSeams(plain), findSeams(run)])
    expect(small).toBeLessThan(20)
    // The run appears as its line, twice per seam, and twice more as
    // numbered words.
    expect(big).toBeGreaterThan(run.length * 4)
  })

  it('makes a 4 KB dump too large for 1 request on an 8K budget', () => {
    const sentence = 'Remind me to buy apples, rice, coffee, and dish soap on the way home tonight.'
    const text = Array.from({ length: 52 }, () => sentence).join(' ')
    expect(text.length).toBeGreaterThan(4000)
    const units = splitUnits(text).sentences
    const total = sentenceCosts(units, units.map(findSeams)).reduce((n, c) => n + c, 0)
    expect(estimateTokens(total)).toBeGreaterThan(8000)
  })
})

describe('unitBoundaries', () => {
  it('reads a line break as a paragraph and a list under 1 heading as joined', () => {
    const text = 'Call the vet. Email Ann.\n\nFor the party:\n- chips\n- salsa\nPay rent.'
    const units = splitUnits(text)
    expect(units.sentences).toEqual(['Call the vet.', 'Email Ann.', '- chips', '- salsa', 'Pay rent.'])
    expect(unitBoundaries(text, units.sentences, units.leads)).toEqual([
      'paragraph',
      'plain',
      'paragraph',
      'joined',
      'paragraph'
    ])
  })

  it('reads the rest as plain once a unit cannot be found', () => {
    const text = 'See Dr.  Smith today. Then rest.\nMore.'
    const units = splitUnits(text)
    expect(unitBoundaries(text, units.sentences, units.leads).slice(1)).toEqual(['plain', 'plain'])
  })
})

describe('nextPart', () => {
  it('takes as many as fit, and at least 1', () => {
    expect(nextPart([10, 10, 10], ['paragraph', 'plain', 'plain'], 25)).toBe(2)
    expect(nextPart([50, 10], ['paragraph', 'plain'], 25)).toBe(1)
    expect(nextPart([10, 10], ['paragraph', 'plain'], 1000)).toBe(2)
  })

  it('cuts at a paragraph break in the later half', () => {
    const breaks = ['paragraph', 'plain', 'plain', 'paragraph', 'plain', 'plain'] as const
    expect(nextPart([10, 10, 10, 10, 10, 10], breaks, 45)).toBe(3)
  })

  it('never moves the cut back past half the part', () => {
    const breaks = ['paragraph', 'paragraph', 'plain', 'plain', 'plain', 'plain'] as const
    expect(nextPart([10, 10, 10, 10, 10, 10], breaks, 45)).toBe(4)
  })

  it('keeps a list under 1 heading together when it can', () => {
    // Units 2 to 4 are 1 list: the part ends before it.
    const breaks = ['paragraph', 'plain', 'plain', 'joined', 'joined'] as const
    expect(nextPart([10, 10, 10, 10, 10], breaks, 45)).toBe(2)
    // A list too long to keep whole is cut anyway.
    expect(nextPart([10, 10, 10, 10, 10], ['paragraph', 'joined', 'joined', 'joined', 'joined'], 35)).toBe(3)
  })
})

describe('itemsCapFor', () => {
  it('keeps every recent item when they fit their share, and fewer when not', () => {
    const tasks = Array.from({ length: 60 }, (_, i) => `- [ ] Call the vendor about order ${i} and follow up next week`).join('\n')
    expect(itemsCapFor('- [ ] Call the vet\n', '', 6000)).toBe(60)
    const cap = itemsCapFor(tasks, tasks, 6000)
    expect(cap).toBeLessThan(60)
    expect(cap).toBeGreaterThanOrEqual(10)
  })
})

describe('parseDuration', () => {
  it('reads the shapes providers send', () => {
    expect(parseDuration('7.66s')).toBe(7660)
    expect(parseDuration('2m59.56s')).toBe(179_560)
    expect(parseDuration('1h2m')).toBe(3_720_000)
    expect(parseDuration('450ms')).toBe(450)
    expect(parseDuration('3')).toBe(3000)
    expect(parseDuration('soon')).toBeNull()
    expect(parseDuration('5s later')).toBeNull()
  })
})

describe('retryDelayMs', () => {
  it('takes Retry-After first, in seconds or as a date', () => {
    expect(retryDelayMs(headers({ 'retry-after': '2', 'x-ratelimit-reset-tokens': '9s' }), '')).toBe(2000)
    const now = Date.parse('2026-11-21T10:00:00Z')
    expect(retryDelayMs(headers({ 'retry-after': 'Sat, 21 Nov 2026 10:00:30 GMT' }), '', now)).toBe(30_000)
  })

  it('falls back to the token reset, then to the message', () => {
    expect(retryDelayMs(headers({ 'x-ratelimit-reset-tokens': '7.66s', 'x-ratelimit-reset-requests': '2m59.56s' }), '')).toBe(7660)
    const said = 'Rate limit reached ... on tokens per minute (TPM): Limit 8000, Used 5912, Requested 4676. Please try again in 19.41s. Need more tokens?'
    expect(retryDelayMs(headers({}), said)).toBe(19_410)
    expect(retryDelayMs(null, 'try again in 1m2.5s')).toBe(62_500)
  })

  it('reads a Retry-After date in the past, or one it cannot parse, as no header', () => {
    const now = Date.parse('2026-11-21T10:00:00Z')
    expect(retryDelayMs(headers({ 'retry-after': '12 1' }), '', now)).toBeNull()
    expect(retryDelayMs(headers({ 'retry-after': 'soon', 'x-ratelimit-reset-tokens': '4s' }), '', now)).toBe(4000)
    expect(retryDelayMs(headers({ 'retry-after': 'Sat, 21 Nov 2026 09:00:00 GMT' }), 'try again in 3s', now)).toBe(3000)
  })

  it('never reads the per-day request reset, and says nothing when nothing is named', () => {
    expect(retryDelayMs(headers({ 'x-ratelimit-reset-requests': '2m59.56s' }), '')).toBeNull()
    expect(retryDelayMs(headers({}), 'Too many requests')).toBeNull()
  })
})

describe('providerLimit', () => {
  it('reads the header, then Limit N in a message about tokens per minute', () => {
    expect(providerLimit(headers({ 'x-ratelimit-limit-tokens': '8000' }), '')).toBe(8000)
    expect(providerLimit(headers({}), 'on tokens per minute (TPM): Limit 6000, Requested 12328')).toBe(6000)
    expect(providerLimit(null, 'Request too large')).toBeUndefined()
  })

  it('never reads a per-day limit as a per-minute one', () => {
    expect(providerLimit(null, 'Rate limit reached on tokens per day (TPD): Limit 200000, Used 199000')).toBeUndefined()
    expect(providerLimit(null, 'Rate limit reached on requests per day (RPD): Limit 1000, Used 1000')).toBeUndefined()
  })
})

describe('errorMessage', () => {
  it('reads the OpenAI shape and its plainer cousins', () => {
    expect(errorMessage('{"error":{"message":"Request too large","type":"tokens"}}')).toBe('Request too large')
    expect(errorMessage('{"error":"bad key"}')).toBe('bad key')
    expect(errorMessage('{"message":"slow down"}')).toBe('slow down')
    expect(errorMessage('<html>502</html>')).toBe('')
    expect(errorMessage('null')).toBe('')
  })
})

describe('providerSays', () => {
  const groq =
    'Request too large for model `openai/gpt-oss-120b` in organization `org_01abcdefghij` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 11240, please reduce your message size and try again.'

  it('keeps the numbers and drops what sits in backticks, the organization included', () => {
    const said = providerSays(groq, '1. Call the vet.')
    expect(said).toContain('on tokens per minute (TPM): Limit 8000, Requested 11240')
    expect(said).not.toContain('org_01abcdefghij')
    expect(said.length).toBeLessThanOrEqual(200)
  })

  it('takes an unquoted organization id out, either spelling', () => {
    expect(providerSays('Rate limit for org-AbCdEf123 on tokens per min (TPM): Limit 30000', '1. Hi.')).toBe(
      'Rate limit for org_… on tokens per min (TPM): Limit 30000'
    )
    expect(providerSays('Limit reached for org_XyZ987', '1. Hi.')).toBe('Limit reached for org_…')
  })

  it('takes out the key, anything shaped like one, and anything masked', () => {
    const key = 'gsk_live_1234567890abcdefghijkl'
    expect(providerSays(`Incorrect API key provided: ${key}. Fix it.`, '1. Hi.', key)).toBe(
      'Incorrect API key provided: [redacted]. Fix it.'
    )
    expect(providerSays('Bad key sk-proj-AbC123dEf456GhI789jKl012', '1. Hi.')).toBe('Bad key [redacted]')
    expect(providerSays('Incorrect API key provided: gsk_abcd****wxyz', '1. Hi.')).toBe('Incorrect API key provided: [redacted]')
  })

  it('drops any quoted text, however short', () => {
    const request = '1. Buy milk.\n2. Email Bob.'
    expect(providerSays("Invalid content near 'Buy milk.'", request)).toBe('Invalid content near …')
    expect(providerSays('Bad input "Email Bob." here', request)).toBe('Bad input … here')
    expect(providerSays("Don't send that again", request)).toBe("Don't send that again")
  })

  it('withholds a message that repeats the request outside quotes', () => {
    const request = '1. Call the dentist about the night guard.\n2. Email Bob.'
    expect(providerSays('Invalid content near Call the dentist about the night guard', request)).toBe(SAID_WITHHELD)
  })

  it('stays on 1 line, and is empty for nothing', () => {
    expect(providerSays('a\n b   c', 'x')).toBe('a b c')
    expect(providerSays('', 'x')).toBe('')
  })
})
