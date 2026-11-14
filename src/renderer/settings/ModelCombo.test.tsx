// SPDX-License-Identifier: GPL-3.0-only
// The Model list (US-158): suggestions on top, retired ones left out
// once the provider's list is in, everything else A to Z below, a
// search narrowing both, and a cap on how many draw at once.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MAX_SHOWN, ModelCombo, comboOptions } from './ModelCombo'

const suggestions = ['openai/gpt-6-luna', 'openai/gpt-oss-120b', 'anthropic/claude-haiku-5.5']
const live = { ok: true as const, ids: ['anthropic/claude-haiku-5.5', 'google/gemini-x', 'openai/gpt-6-luna', 'qwen/qwen-9'] }

describe('comboOptions', () => {
  it('shows every suggestion until the list is in, or when it fails', () => {
    expect(comboOptions(suggestions, null, '')).toEqual({ suggested: suggestions, rest: [], more: 0 })
    expect(comboOptions(suggestions, { ok: false, detail: 'timed out' }, '').suggested).toEqual(suggestions)
  })

  it('leaves out a suggestion the provider no longer lists, and lists the rest below', () => {
    const shown = comboOptions(suggestions, live, '')
    expect(shown.suggested).toEqual(['openai/gpt-6-luna', 'anthropic/claude-haiku-5.5'])
    expect(shown.rest).toEqual(['google/gemini-x', 'qwen/qwen-9'])
  })

  it('narrows both groups by what was typed, in any case', () => {
    expect(comboOptions(suggestions, live, 'QWEN')).toEqual({ suggested: [], rest: ['qwen/qwen-9'], more: 0 })
    expect(comboOptions(suggestions, live, 'luna').suggested).toEqual(['openai/gpt-6-luna'])
  })

  it('draws at most MAX_SHOWN below the suggestions and counts the rest', () => {
    const ids = Array.from({ length: MAX_SHOWN + 42 }, (_, i) => `m/${String(i).padStart(3, '0')}`)
    const shown = comboOptions([], { ok: true, ids }, '')
    expect(shown.rest).toHaveLength(MAX_SHOWN)
    expect(shown.more).toBe(42)
  })
})

describe('ModelCombo', () => {
  it('is a combobox holding the saved id, closed until opened', () => {
    const html = renderToStaticMarkup(
      <ModelCombo
        value="openai/gpt-6-luna"
        suggestions={suggestions}
        label="Cleanup model"
        providerName="OpenRouter"
        source="https://openrouter.ai/api/v1"
        load={async () => live}
        onCommit={() => undefined}
      />
    )
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-label="Cleanup model"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('value="openai/gpt-6-luna"')
    expect(html).not.toContain('role="listbox"')
  })
})
