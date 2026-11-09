// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { report, suggestionProblems } from './model-watch'

const openrouter = {
  name: 'OpenRouter',
  llmModels: [{ id: 'openai/gpt-6-luna' }, { id: 'openai/gpt-oss-120b' }, { id: 'anthropic/claude-haiku-5.5' }]
}

describe('suggestionProblems', () => {
  it('names a suggestion that left the list and one with a retirement date', () => {
    const body = JSON.stringify({
      data: [
        { id: 'openai/gpt-6-luna', expiration_date: null },
        { id: 'anthropic/claude-haiku-5.5', expiration_date: '2026-12-31' }
      ]
    })
    expect(suggestionProblems(openrouter, body)).toEqual([
      'OpenRouter: `openai/gpt-oss-120b` is no longer in its model list',
      'OpenRouter: `anthropic/claude-haiku-5.5` retires on 2026-12-31'
    ])
  })

  it('is quiet when every suggestion is listed, and says so when the list is unreadable', () => {
    const body = JSON.stringify(openrouter.llmModels.map((m) => m.id))
    expect(suggestionProblems(openrouter, body)).toEqual([])
    expect(suggestionProblems(openrouter, 'not json')).toEqual(['OpenRouter: the model list could not be read'])
  })
})

describe('report', () => {
  it('lists the problems and the providers it could not check', () => {
    const body = report(['OpenRouter: `x` retires on 2026-12-31'], ['Groq'], '2026-11-09')
    expect(body).toContain('# Suggested models to update (2026-11-09)')
    expect(body).toContain('- OpenRouter: `x` retires on 2026-12-31')
    expect(body).toContain('- Groq')
  })
})
