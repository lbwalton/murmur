// SPDX-License-Identifier: GPL-3.0-only
// Provider and keys, rebuilt around profiles (US-154, carrying US-152):
// the strip says what runs, the cards name what each profile runs and
// mark the active one, the unsaved bar shows only after a change, the
// speech side has no cleanup model row (cleanup's own Model row takes
// it), Saved keys says what each key does, and picking OpenRouter for
// cleanup fills in Luna.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import catalogJson from '../../../shared/provider-catalog.json'
import { type ProviderCatalog, validateCatalog } from '../../shared/catalog'
import { snapshotProfile } from '../../shared/profiles'
import { DEFAULT_SETTINGS, type Settings, mergeSettings } from '../../shared/settings'
import { CleanupShares } from './CleanupShares'
import { ConnectionRows, VERDICT_CLASS, presetConnection, testVerdict } from './ConnectionRows'
import { Row } from './controls'
import { ProfileCards, RunningStrip, cardClick } from './ProfileCards'
import { SavedKeys } from './SavedKeys'

const catalog = validateCatalog(catalogJson) as ProviderCatalog
const GROQ = 'https://api.groq.com/openai/v1'
const OPENROUTER = 'https://openrouter.ai/api/v1'
const luna = mergeSettings(DEFAULT_SETTINGS, {
  polish: { enabled: true, baseUrl: OPENROUTER, llmModel: 'openai/gpt-6-luna' }
}) as Settings
const groqProfile = snapshotProfile(DEFAULT_SETTINGS, 'aaaa1111', 'Groq for everything')
const lunaProfile = snapshotProfile(luna, 'bbbb2222', 'Groq speech, Luna cleanup')
const withProfiles = (base: Settings, active: string): Settings =>
  mergeSettings(base, { provider: { profiles: [groqProfile, lunaProfile], activeProfile: active } }) as Settings
const keys = { ring: [GROQ, OPENROUTER], cleanupKey: true }

const cards = (settings: Settings, pro: boolean | null = true): string =>
  renderToStaticMarkup(
    <ProfileCards settings={settings} catalog={catalog} pro={pro} onSettings={() => undefined} onKeysChanged={() => undefined} />
  )

describe('the profile cards', () => {
  it('name what each profile runs and mark the active one', () => {
    const html = cards(withProfiles(luna, 'bbbb2222'))
    expect(html).toContain('Groq for everything')
    expect(html).toContain('Cleanup: <b>same as speech · openai/gpt-oss-120b</b>')
    expect(html).toContain('Cleanup: <b>OpenRouter · openai/gpt-6-luna</b>')
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toMatch(/profile-card-on" aria-current="true"[^>]*>.*Groq speech, Luna cleanup/)
    expect(html).toContain('+ Save this setup as a profile')
  })

  it('give every card its own Delete, not just the active one', () => {
    const html = cards(withProfiles(luna, ''))
    expect(html.match(/>Delete<\/button>/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Delete profile Groq for everything"')
    expect(html).toContain('aria-label="Delete profile Groq speech, Luna cleanup"')
  })

  it('put Rename beside Delete on every card, and say a double-click renames (US-157)', () => {
    const html = cards(withProfiles(luna, 'bbbb2222'))
    expect(html.match(/>Rename<\/button>/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Rename profile Groq for everything"')
    expect(html).toMatch(/aria-label="Rename profile Groq for everything"[^]*?aria-label="Delete profile Groq for everything"/)
    expect(html.match(/aria-description="Double-click to rename"/g)).toHaveLength(2)
  })

  it('switch at once from the keyboard, wait out a first click, and leave the second to the rename (US-157)', () => {
    expect(cardClick(0)).toBe('now')
    expect(cardClick(1)).toBe('wait')
    expect(cardClick(2)).toBe('ignore')
    expect(cardClick(3)).toBe('ignore')
  })

  it('show the unsaved bar only once the setup moves away from the active profile', () => {
    expect(cards(withProfiles(luna, 'bbbb2222'))).not.toContain('profile-bar')
    const moved = mergeSettings(withProfiles(luna, 'bbbb2222'), { polish: { llmModel: 'openai/gpt-oss-120b' } }) as Settings
    const html = cards(moved)
    expect(html).toContain('profile-bar')
    expect(html).toContain('You changed <b>Groq speech, Luna cleanup</b>')
    for (const label of ['Save', 'Save as new', 'Undo']) expect(html).toContain(`>${label}</button>`)
    expect(html).toContain('>changed</span>')
  })

  it('show an old speech only profile as speech only', () => {
    const old = { id: 'cccc3333', name: 'Old setup', baseUrl: GROQ, sttModel: 'whisper-large-v3', llmModel: 'x' }
    const html = cards(mergeSettings(DEFAULT_SETTINGS, { provider: { profiles: [old] } }) as Settings)
    expect(html).toContain('Cleanup: <b>not saved yet</b>')
    expect(html).toContain('Save it again to keep it.')
  })

  it('offer Pro without a license, and show nothing while the license loads', () => {
    const html = cards(withProfiles(luna, 'bbbb2222'), false)
    expect(html).toContain('id="row-profiles"')
    expect(html).not.toContain('profile-card')
    expect(cards(DEFAULT_SETTINGS, null)).toBe('')
  })
})

describe('the running now strip (US-152)', () => {
  it('says what runs speech and what runs cleanup, by provider and model', () => {
    const strip = (s: Settings, k = keys): string =>
      renderToStaticMarkup(<RunningStrip settings={s} catalog={catalog} keys={k} />)
    expect(strip(DEFAULT_SETTINGS)).toContain('Cleanup: <b>Groq · openai/gpt-oss-120b</b>')
    expect(strip(luna)).toContain('Cleanup: <b>OpenRouter · openai/gpt-6-luna</b>')
    expect(strip(luna)).toContain('Speech: <b>Groq · whisper-large-v3-turbo</b>')
    // No OpenRouter key yet: cleanup really runs on Groq, and the strip says so.
    expect(strip(luna, { ring: [GROQ], cleanupKey: false })).toContain('runs on speech until then')
  })
})

describe('the cleanup group', () => {
  const rows = (s: Settings, api: object = {}): string =>
    renderToStaticMarkup(
      <ConnectionRows
        value={s.polish}
        catalog={catalog}
        keyStatus={{ present: true, masked: 'sk-o…1234' }}
        onKeyStatus={() => undefined}
        onChange={async () => undefined}
        labels={{
          connection: 'Runs on',
          connectionDesc: '',
          sameOption: 'Same as speech',
          separateOption: 'Its own provider',
          ariaName: 'Cleanup',
          provider: 'Provider',
          baseUrl: 'Base URL',
          model: 'Model',
          key: 'Key',
          keyDesc: '',
          sharedDesc: ''
        }}
        sharedWith={[s.provider.baseUrl]}
        anchor="row-cleanup-connection"
        api={api as never}
        whenSame={
          <Row label="Model" anchor="row-cleanup-model">
            same model
          </Row>
        }
      />
    )

  it('sets the Key row in under its label, buttons on the right, Test last in fog (US-157)', () => {
    const own = rows(luna)
    expect(own).toMatch(/class="row row-block row-indent" id="row-cleanup-connection-key"/)
    const key = own.slice(own.indexOf('id="row-cleanup-connection-key"'))
    expect(key).toMatch(/class="field key-field"[^]*class="key-btns"[^]*>Save<[^]*>Remove<[^]*class="btn btn-test"[^]*>Test</)
    expect(key).toContain('aria-busy="false"')
    // The answer's place is always there for a screen reader, hidden
    // until a test runs.
    expect(key).toContain('class="test-verdict visually-hidden" role="status"')
  })

  it("makes Model a searchable list of the provider's models when it can read them (US-158)", () => {
    const listed = rows(luna, { models: async () => ({ ok: true, ids: [] }) })
    const model = listed.slice(listed.indexOf('id="row-cleanup-connection-model"'))
    expect(model).toMatch(/^[^]*?role="combobox"[^]*?aria-label="Cleanup model"/)
    expect(rows(luna)).not.toContain('role="combobox"')
  })

  it('replaces the separate rows with 1 Model row while it runs on speech', () => {
    const same = rows(DEFAULT_SETTINGS)
    expect(same).toContain('id="row-cleanup-model"')
    expect(same).not.toContain('id="row-cleanup-connection-provider"')
    expect(same).toContain('Its own provider')
  })

  it('gives its own rows ids and names that never clash with Speech', () => {
    const own = rows(luna)
    expect(own).not.toContain('id="row-cleanup-model"')
    for (const id of ['provider', 'base-url', 'model', 'key']) expect(own).toContain(`id="row-cleanup-connection-${id}"`)
    expect(own).not.toContain('id="row-key"')
    expect(own).toContain('aria-label="Cleanup provider"')
    expect(own).toContain('aria-label="Cleanup key"')
  })

  it('fills in a picked provider and its suggested model, and never keeps a model from another provider', () => {
    const openrouter = catalog.providers.find((p) => p.id === 'openrouter')
    const cerebras = catalog.providers.find((p) => p.id === 'cerebras')
    if (!openrouter || !cerebras) throw new Error('catalog presets missing')
    expect(openrouter.llmModels[0]?.id).toBe('openai/gpt-6-luna')
    expect(openrouter.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(presetConnection(openrouter, { enabled: true, baseUrl: GROQ, llmModel: 'openai/gpt-oss-20b' })).toEqual({
      enabled: true,
      baseUrl: OPENROUTER,
      llmModel: 'openai/gpt-6-luna'
    })
    expect(presetConnection(cerebras, { enabled: true, baseUrl: GROQ, llmModel: 'openai/gpt-oss-20b' }).llmModel).toBe('')
  })
})

describe('what Test says', () => {
  it('names the provider and the model that answered, and catches a model the provider does not offer', () => {
    expect(testVerdict({ ok: true, detail: 'connected', listed: true, model: 'openai/gpt-6-luna' }, 'OpenRouter')).toEqual({
      message: 'OpenRouter answered and offers openai/gpt-6-luna',
      tone: 'ok'
    })
    // A model the provider does not list is a soft warning, never red.
    expect(testVerdict({ ok: true, detail: 'connected', listed: false, model: 'openai/gpt-6-lun' }, 'OpenRouter').tone).toBe('warn')
    expect(testVerdict({ ok: true, detail: 'connected', listed: null }, 'Groq').message).toBe('Groq answered')
    // The speech test also checks the cleanup model while cleanup runs on speech.
    const both = [
      { id: 'whisper-large-v3-turbo', listed: true },
      { id: 'openai/gpt-oss-120b', listed: true }
    ]
    expect(testVerdict({ ok: true, detail: 'connected', listed: true, models: both }, 'Groq').message).toBe(
      'Groq answered and offers whisper-large-v3-turbo and openai/gpt-oss-120b'
    )
    const typo = [both[0], { id: 'openai/gpt-oss-12b', listed: false }]
    expect(testVerdict({ ok: true, detail: 'connected', listed: true, models: typo }, 'Groq')).toEqual({
      message: 'Groq answered, but does not list openai/gpt-oss-12b. Check the model id.',
      tone: 'warn'
    })
    expect(testVerdict({ ok: false, detail: 'key rejected (http 401)' }, 'Groq')).toEqual({
      message: 'key rejected (http 401)',
      tone: 'bad'
    })
    expect(VERDICT_CLASS).toEqual({ ok: 'status-ok', warn: 'status-warn', bad: 'status-bad' })
  })
})

describe('saved keys', () => {
  it('lists each key by provider name with what it does now', () => {
    const html = renderToStaticMarkup(
      <SavedKeys
        list={[
          { baseUrl: GROQ, masked: 'gsk_…abcd' },
          { baseUrl: OPENROUTER, masked: 'sk-o…1234' },
          { baseUrl: 'https://llm.example.net/v1', masked: 'abcd…wxyz' }
        ]}
        settings={luna}
        catalog={catalog}
        keys={{ ring: [GROQ, OPENROUTER, 'https://llm.example.net/v1'], cleanupKey: true }}
        onReplace={async () => undefined}
        onRemove={() => undefined}
      />
    )
    expect(html).toMatch(/Groq<\/div><div class="row-desc">Used for speech\./)
    expect(html).toMatch(/OpenRouter<\/div><div class="row-desc">Used for cleanup\./)
    expect(html).toMatch(/llm\.example\.net<\/div><div class="row-desc">Saved, not used by this setup\./)
    expect(html.match(/>Replace<\/button>/g)).toHaveLength(3)
    expect(html.match(/>Remove<\/button>/g)).toHaveLength(3)
    expect(html).not.toMatch(/gsk_[a-z0-9]{5,}/i)
  })
})

describe('the line under Cleanup', () => {
  const line = (s: Settings, k = keys): string =>
    renderToStaticMarkup(<CleanupShares settings={s} catalog={catalog} keys={k} />)
  const busy = mergeSettings(luna, { notes: { sort: true }, transform: { binding: 'Alt+Shift+T' } }) as Settings

  it('says notes sorting and Transform ride cleanup, with links to where to change it', () => {
    const html = line(busy)
    expect(html).toContain('Notes sorting and Transform use this connection too.')
    expect(html).toContain('>Notes</button>')
    expect(html).toContain('>Transform</button>')
  })

  it('names a slot that really runs on its own', () => {
    const own = mergeSettings(busy, {
      transform: { connection: { enabled: true, baseUrl: 'https://api.deepseek.com', llmModel: 'deepseek-flash' } }
    }) as Settings
    const html = line(own, { ...keys, ring: [...keys.ring, 'https://api.deepseek.com'] })
    expect(html).toContain('Notes sorting uses this connection too.')
    expect(html).toContain('Transform runs on its own, DeepSeek · deepseek-flash')
  })

  it('never says a slot has its own connection while it really rides cleanup', () => {
    // Separate on, but no key and no model: the pipeline uses cleanup.
    const half = mergeSettings(busy, {
      transform: { connection: { enabled: true, baseUrl: 'https://api.cerebras.ai/v1', llmModel: '' } }
    }) as Settings
    const html = line(half)
    expect(html).not.toContain('runs on its own')
    expect(html).toContain('Notes sorting and Transform use this connection too.')
    expect(html).toContain('Transform is set to its own connection')
    expect(html).toContain('needs a base URL, a model, and a key first')
  })

  it('says nothing about slots that are off', () => {
    expect(line(luna)).toBe('')
    expect(line(mergeSettings(luna, { notes: { sort: true } }) as Settings)).not.toContain('Transform')
  })
})

describe('the Speech group', () => {
  it('has no cleanup model row: cleanup has its own Model row (US-152)', () => {
    const app = readFileSync(join(__dirname, 'App.tsx'), 'utf8')
    const start = app.indexOf('<Group id="speech"')
    const end = app.indexOf('</Group>', start)
    expect(start).toBeGreaterThan(-1)
    const speech = app.slice(start, end)
    // Picking a speech preset still sets the model cleanup uses on Same
    // as speech, but no control in Speech shows or edits it.
    expect(speech).not.toMatch(/value=\{settings\.provider\.llmModel\}|Cleanup model|row-cleanup/)
    expect(app.slice(end)).toContain('anchor="row-cleanup-model"')
  })
})
