// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { applyExpansions } from './expansions'

const entries = [
  { trigger: 'insert my email', text: 'lbwalton@gmail.com' },
  { trigger: 'sign off', text: 'Best,\nLaBroi' },
  { trigger: 'sign off formal', text: 'Sincerely,\nLaBroi Walton' }
]

describe('applyExpansions', () => {
  it('expands a trigger phrase, keeping surrounding punctuation', () => {
    expect(applyExpansions('Insert my email.', entries)).toBe('lbwalton@gmail.com.')
  })

  it('matches case-insensitively but inserts the snippet verbatim', () => {
    expect(applyExpansions('INSERT MY EMAIL now', entries)).toBe('lbwalton@gmail.com now')
  })

  it('longest trigger wins at the same position', () => {
    expect(applyExpansions('Sign off formal', entries)).toBe('Sincerely,\nLaBroi Walton')
  })

  it('expands multiple positions independently', () => {
    expect(applyExpansions('sign off and insert my email', entries)).toBe(
      'Best,\nLaBroi and lbwalton@gmail.com'
    )
  })

  it('never rescans snippet content (no recursive expansion)', () => {
    const selfish = [{ trigger: 'my address', text: 'my address is 1 Main St' }]
    expect(applyExpansions('My address.', selfish)).toBe('my address is 1 Main St.')
  })

  it('respects word boundaries', () => {
    expect(applyExpansions('the sign offline stays', entries)).toBe('the sign offline stays')
  })

  it('leaves text without triggers untouched', () => {
    const text = 'nothing to expand here'
    expect(applyExpansions(text, entries)).toBe(text)
  })

  it('skips wrong-typed entries instead of throwing', () => {
    const junk = [null, 9, { trigger: 3, text: 'x' }, { trigger: 'ok' }] as never[]
    expect(applyExpansions('everything ok', junk)).toBe('everything ok')
  })
})
