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
import { describe, expect, it, vi } from 'vitest'
import catalogJson from '../../../shared/provider-catalog.json'
import { type ProviderCatalog, validateCatalog } from '../../shared/catalog'
import { snapshotProfile } from '../../shared/profiles'
import { DEFAULT_SETTINGS, type Settings, mergeSettings } from '../../shared/settings'
import { CleanupShares } from './CleanupShares'
import { pasteHint } from './ApiKeys'
import {
  ConnectionRows,
  SHEEN_MS,
  VERDICT_CLASS,
  afterOnePass,
  keyLanded,
  keyMark,
  presetConnection,
  testVerdict
} from './ConnectionRows'
import { Row } from './controls'
import {
  ProfileCards,
  RunningStrip,
  arcCount,
  arcSlot,
  arcTurn,
  cardClick,
  fadeEdges,
  profilesView,
  rovingIndex,
  switchPlan,
  wheelScroll
} from './ProfileCards'
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

const cards = (settings: Settings, pro: boolean | null = true, initialShowAll = false): string =>
  renderToStaticMarkup(
    <ProfileCards
      settings={settings}
      catalog={catalog}
      pro={pro}
      onSettings={() => undefined}
      onKeysChanged={() => undefined}
      initialShowAll={initialShowAll}
    />
  )
const allCards = (settings: Settings): string => cards(settings, true, true)
const asArc = (settings: Settings): Settings =>
  mergeSettings(settings, { provider: { profilesView: 'arc' } }) as Settings

describe('the profile cards', () => {
  it('name what each profile runs and mark the active one, under Show all', () => {
    const html = allCards(withProfiles(luna, 'bbbb2222'))
    expect(html).toContain('Groq for everything')
    expect(html).toContain('Cleanup: <b>same as speech · openai/gpt-oss-120b</b>')
    expect(html).toContain('Cleanup: <b>OpenRouter · openai/gpt-6-luna</b>')
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toMatch(/profile-card-on" aria-current="true"[^>]*>.*Groq speech, Luna cleanup/)
    expect(html).toContain('+ Save this setup as a profile')
  })

  it('give every card its own Delete under Show all, not just the active one', () => {
    const html = allCards(withProfiles(luna, ''))
    expect(html.match(/>Delete<\/button>/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Delete profile Groq for everything"')
    expect(html).toContain('aria-label="Delete profile Groq speech, Luna cleanup"')
  })

  it('put Rename beside Delete on every card, and say a double-click renames (US-157)', () => {
    const html = allCards(withProfiles(luna, 'bbbb2222'))
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
    const html = cards(mergeSettings(DEFAULT_SETTINGS, { provider: { profiles: [old], activeProfile: 'cccc3333' } }) as Settings)
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

describe('the row of names (US-160)', () => {
  const three = (active: string): Settings => {
    const third = snapshotProfile(DEFAULT_SETTINGS, 'dddd4444', 'Local at night')
    return mergeSettings(luna, {
      provider: { profiles: [groqProfile, lunaProfile, third], activeProfile: active }
    }) as Settings
  }

  it('shows the profile in use as its card, then 1 row of every name in saved order, + New last', () => {
    const html = cards(three('bbbb2222'))
    // Only the card in use is drawn whole.
    expect(html.match(/class="profile-card[ "]/g)).toHaveLength(1)
    expect(html).toContain('Cleanup: <b>OpenRouter · openai/gpt-6-luna</b>')
    expect(html).not.toContain('Cleanup: <b>same as speech')
    expect(html).toMatch(/profile-card-on" aria-current="true"[^>]*>[^]*?Groq speech, Luna cleanup[^]*?>in use</)
    const row = html.slice(html.indexOf('role="toolbar"'))
    expect(html).toContain('role="toolbar" aria-label="Switch profile"')
    expect(row).toMatch(/>Groq for everything<\/button>[^]*Groq speech, Luna cleanup[^]*>Local at night<\/button>[^]*>\+ New<\/button>/)
    expect(row).toMatch(/class="profile-chip profile-chip-on" aria-current="true"[^>]*>[^]*?Groq speech, Luna cleanup<span class="visually-hidden">, in use<\/span>/)
    expect(html).toContain('>Show all 3</button>')
    // Rename and Delete stay with the card in use.
    expect(html).toContain('aria-label="Rename profile Groq speech, Luna cleanup"')
    expect(html).toContain('aria-label="Delete profile Groq speech, Luna cleanup"')
    expect(html).not.toContain('aria-label="Delete profile Groq for everything"')
  })

  it('switches from a name or a card at once, asks first over unsaved changes, and leaves the one in use alone', () => {
    expect(switchPlan('aaaa1111', 'bbbb2222', false)).toBe('switch')
    expect(switchPlan('aaaa1111', 'bbbb2222', true)).toBe('ask')
    expect(switchPlan('bbbb2222', 'bbbb2222', true)).toBe('none')
    expect(switchPlan('aaaa1111', null, false)).toBe('switch')
  })

  it('is 1 Tab stop, on the name in use', () => {
    const row = cards(three('bbbb2222')).split('role="toolbar"')[1]
    const stops = [...row.matchAll(/<button[^>]*tabindex="(-?\d)"/g)].map((m) => m[1])
    expect(stops).toEqual(['-1', '0', '-1', '-1'])
  })

  it('says no profile is in use when none is, and starts the Tab stop on the first name', () => {
    const html = cards(three(''))
    expect(html).toContain('No profile in use')
    const stops = [...html.split('role="toolbar"')[1].matchAll(/<button[^>]*tabindex="(-?\d)"/g)].map((m) => m[1])
    expect(stops[0]).toBe('0')
  })

  it('moves along the row with the arrows, Home and End, and never wraps or takes Up and Down', () => {
    expect(rovingIndex('ArrowRight', 0, 4)).toBe(1)
    expect(rovingIndex('ArrowRight', 3, 4)).toBe(3)
    expect(rovingIndex('ArrowLeft', 0, 4)).toBe(0)
    expect(rovingIndex('ArrowLeft', 2, 4)).toBe(1)
    expect(rovingIndex('Home', 3, 4)).toBe(0)
    expect(rovingIndex('End', 0, 4)).toBe(3)
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'a']) expect(rovingIndex(key, 1, 4)).toBeNull()
    expect(rovingIndex('ArrowRight', 0, 0)).toBeNull()
  })

  it('keeps + New outside the scrolling names, so it never scrolls away', () => {
    const html = cards(three('bbbb2222'))
    expect(html).toMatch(/class="profile-chips">(<button[^>]*>[^]*?<\/button>){3}<\/div><button class="profile-chip profile-chip-new"/)
  })

  it('lets an up-and-down wheel scroll the row sideways, and gives it back to the page at the ends', () => {
    expect(wheelScroll(0, 300, 0, 40)).toBe(40)
    expect(wheelScroll(280, 300, 0, 40)).toBe(300)
    expect(wheelScroll(300, 300, 0, 40)).toBeNull()
    expect(wheelScroll(0, 300, 0, -40)).toBeNull()
    expect(wheelScroll(100, 300, 0, -40)).toBe(60)
    // A sideways swipe is the row's own scroll; a row that fits leaves it all.
    expect(wheelScroll(100, 300, 30, 10)).toBeNull()
    expect(wheelScroll(0, 0, 0, 40)).toBeNull()
  })

  it('fades only an end with more names past it', () => {
    expect(fadeEdges(0, 400, 400)).toEqual({ start: false, end: false })
    expect(fadeEdges(0, 400, 401)).toEqual({ start: false, end: false })
    expect(fadeEdges(0, 400, 700)).toEqual({ start: false, end: true })
    expect(fadeEdges(150, 400, 700)).toEqual({ start: true, end: true })
    expect(fadeEdges(300, 400, 700)).toEqual({ start: true, end: false })
  })

  it('opens every card under Show all, with Fold away to come back', () => {
    const html = allCards(three('bbbb2222'))
    expect(html).not.toContain('role="toolbar"')
    expect(html.match(/class="profile-card[ "]/g)).toHaveLength(4)
    expect(html).toContain('id="profiles-fold"')
    expect(html).toContain('>Fold away</button>')
  })

  it('offers the view only once there are 2 profiles, Row by default', () => {
    expect(cards(three('bbbb2222'))).toMatch(/role="radiogroup" aria-label="Show profiles as"[^]*aria-checked="true"[^>]*>[^]*?Row/)
    const one = mergeSettings(luna, { provider: { profiles: [lunaProfile], activeProfile: 'bbbb2222' } }) as Settings
    expect(cards(one)).not.toContain('Show profiles as')
  })

  it('shows only the + card with no profiles yet', () => {
    const html = cards(luna)
    expect(html).toContain('+ Save this setup as a profile')
    expect(html).not.toContain('role="toolbar"')
    expect(html).not.toContain('Show profiles as')
  })

  it('reads any stored view but arc as the row', () => {
    expect(profilesView(DEFAULT_SETTINGS)).toBe('row')
    expect(profilesView(asArc(DEFAULT_SETTINGS))).toBe('arc')
    const odd = mergeSettings(DEFAULT_SETTINGS, { provider: { profilesView: 'spiral' } }) as Settings
    expect(profilesView(odd)).toBe('row')
  })

  it('fades the row with a mask and lets it scroll sideways without a bar', () => {
    const css = readFileSync(join(__dirname, 'styles.css'), 'utf8')
    const rule = (sel: string): string => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)))
    expect(rule('.profile-chips')).toContain('overflow-x: auto')
    expect(rule('.profile-chips')).toContain('scrollbar-width: none')
    expect(rule('.profile-chips.fade-end')).toContain('mask-image')
    expect(rule('.profile-chips.fade-start')).toContain('mask-image')
  })
})

describe('profiles on an arc (US-161)', () => {
  const three = (active: string): Settings => {
    const third = snapshotProfile(DEFAULT_SETTINGS, 'dddd4444', 'Local at night')
    return asArc(
      mergeSettings(luna, {
        provider: { profiles: [groqProfile, lunaProfile, third], activeProfile: active }
      }) as Settings
    )
  }

  it('is a carousel of every profile and a + card, the one in use in front', () => {
    const html = cards(three('bbbb2222'))
    expect(html).toContain('id="profiles-arc"')
    expect(html).toContain('role="region" aria-roledescription="carousel"')
    expect(html.match(/class="arc-slot[ "]/g)).toHaveLength(4)
    expect(html.match(/class="arc-slot" style="[^"]*" aria-hidden="true"/g)).toHaveLength(3)
    const front = html.slice(html.indexOf('arc-slot arc-front'))
    expect(front).toMatch(/^[^]*?Groq speech, Luna cleanup[^]*?>in use</)
    expect(front).not.toContain('Use this profile')
    expect(html).toContain('>02 / 04</span>')
    expect(html).toContain('2 of 4: Groq speech, Luna cleanup, in use')
    expect(html).not.toContain('role="toolbar"')
  })

  it('keeps the Row and Arc choice while Arc is picked, even down to 1 profile', () => {
    const one = asArc(mergeSettings(luna, { provider: { profiles: [lunaProfile], activeProfile: 'bbbb2222' } }) as Settings)
    expect(cards(one)).toContain('aria-label="Show profiles as"')
  })

  it('has 1 dot per card, the one in use gold, and arrows that stop at the ends', () => {
    const html = cards(three('aaaa1111'))
    expect(html.match(/class="arc-dot[ "]/g)).toHaveLength(4)
    // The dots are for the mouse; the arrows and the carousel's keys turn it.
    expect(html.match(/class="arc-dot[^"]*"[^>]*tabindex="-1"/g)).toHaveLength(4)
    expect(html).toContain('class="arc-dot arc-dot-front arc-dot-inuse" aria-label="Groq for everything, in use"')
    expect(html).toContain('aria-label="New profile"')
    expect(html).toMatch(/aria-label="Previous profile" disabled=""/)
    expect(html).not.toMatch(/aria-label="Next profile" disabled=""/)
  })

  it('offers Use this profile on a front card that is not in use, with Rename and Delete under it', () => {
    const html = cards(three(''))
    const front = html.slice(html.indexOf('arc-slot arc-front'))
    expect(front).toMatch(/^[^]*?Groq for everything[^]*?>Use this profile</)
    expect(front).toContain('aria-label="Rename profile Groq for everything"')
    expect(front).toContain('aria-label="Delete profile Groq for everything"')
  })

  it('places the cards along a curve: the front upright and full, the rest smaller, dimmer, and gone past 2', () => {
    expect(arcSlot(0)).toMatchObject({ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, dim: 1 })
    const left = arcSlot(-1)
    const right = arcSlot(1)
    expect(left.x).toBe(-right.x)
    expect(left.y).toBe(right.y)
    expect(right.y).toBeGreaterThan(0)
    expect(right.scale).toBeLessThan(1)
    expect(right.dim).toBeLessThan(1)
    expect(arcSlot(2).opacity).toBeGreaterThan(0)
    expect(arcSlot(3).opacity).toBe(0)
    expect(arcSlot(0).z).toBeGreaterThan(arcSlot(1).z)
  })

  it('turns with the keys, stopping at the ends, and never switches', () => {
    expect(arcTurn('ArrowRight', 0, 4)).toBe(1)
    expect(arcTurn('ArrowRight', 3, 4)).toBe(3)
    expect(arcTurn('ArrowLeft', 0, 4)).toBe(0)
    expect(arcTurn('Home', 2, 4)).toBe(0)
    expect(arcTurn('End', 0, 4)).toBe(3)
    expect(arcTurn('Enter', 1, 4)).toBeNull()
    expect(arcCount(1, 5)).toBe('02 / 05')
    expect(arcCount(10, 12)).toBe('11 / 12')
  })

  it('eases each turn in about 300 ms with no overshoot, and holds still with reduced motion', () => {
    const css = readFileSync(join(__dirname, 'styles.css'), 'utf8')
    const slot = css.slice(css.indexOf('.arc-slot {'), css.indexOf('}', css.indexOf('.arc-slot {')))
    expect(slot).toMatch(/transition: transform 300ms cubic-bezier\(0\.2, 0, 0, 1\)/)
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .arc-slot'))
    expect(reduced).toMatch(/^@media \(prefers-reduced-motion: reduce\) \{\s*\.arc-slot \{\s*transition: none;/)
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
  const rows = (s: Settings, api: object = {}, keyStatus: { present: boolean; masked: string | null } = { present: true, masked: 'sk-o…1234' }): string =>
    renderToStaticMarkup(
      <ConnectionRows
        value={s.polish}
        catalog={catalog}
        keyStatus={keyStatus}
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
          keyDesc: "Paste this provider's key. Until it is saved, cleanup runs on speech.",
          sharedDesc: 'The same provider as speech, so it uses the speech key.'
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

  it('sets the Key row in under its label, Test last in fog (US-157)', () => {
    const own = rows(luna)
    expect(own).toMatch(/class="row row-block row-indent" id="row-cleanup-connection-key"/)
    const key = own.slice(own.indexOf('id="row-cleanup-connection-key"'))
    expect(key).toMatch(/class="well"[^]*class="key-line key-line-end"[^]*class="btn btn-test"[^]*>Test</)
    expect(key).toContain('aria-busy="false"')
    // The answer's place is always there for a screen reader, hidden
    // until a test runs.
    expect(key).toContain('class="test-verdict visually-hidden" role="status"')
  })

  it("shows a saved key in Speech's row: provider, last characters, in use, Replace, Remove (US-162)", () => {
    const key = rows(luna).slice(rows(luna).indexOf('id="row-cleanup-connection-key"'))
    expect(key).toMatch(
      /class="well-name">OpenRouter<[^]*class="well-meta">sk-o…1234<[^]*class="badge-ok">in use<[^]*aria-label="Replace cleanup key"[^]*>Replace<[^]*aria-label="Remove cleanup key"[^]*>Remove</
    )
    expect(key).toContain(
      'Encrypted on this computer and sent only to OpenRouter. Test checks it, and the model, with OpenRouter.'
    )
    expect(key).not.toContain('Saved and encrypted')
    expect(key).not.toContain('type="password"')
  })

  it('asks for a key in the same row before one is saved, saying where to get it (US-162)', () => {
    const empty = rows(luna, {}, { present: false, masked: null })
    const key = empty.slice(empty.indexOf('id="row-cleanup-connection-key"'))
    expect(key).toMatch(/class="well-name">OpenRouter<[^]*type="password"[^]*aria-label="Cleanup key"[^]*>Save</)
    expect(key).toContain('placeholder="paste an OpenRouter key"')
    expect(key).toMatch(/Get one at openrouter\.ai\/[^ ]*\. It stays encrypted here and is sent only to\s+this provider\./)
    expect(key).toContain('Until it is saved, cleanup runs on speech.')
    expect(key).not.toContain('>in use<')
    // Test waits for a key.
    expect(key).toMatch(/class="btn btn-test"[^>]*disabled=""/)
  })

  it('asks for a base URL first when there is none, even with an old key around (US-162)', () => {
    const noUrl = mergeSettings(DEFAULT_SETTINGS, { polish: { enabled: true, baseUrl: '', llmModel: '' } }) as Settings
    const key = rows(noUrl).slice(rows(noUrl).indexOf('id="row-cleanup-connection-key"'))
    expect(key).toContain('Pick a preset or base URL first; the key files under it.')
    expect(key).not.toContain('sent only to no provider set')
  })

  it('keeps what was pasted unless the key landed under a base URL (US-162)', () => {
    expect(keyLanded(OPENROUTER, { present: true, masked: 'sk-o…1234' })).toBe(true)
    expect(keyLanded('', { present: true, masked: 'sk-o…1234' })).toBe(false)
    expect(keyLanded(OPENROUTER, { present: false, masked: null })).toBe(false)
  })

  it('drops a Test verdict once its key is replaced or removed, here or in Saved keys (US-162)', () => {
    const saved = keyMark({ present: true, masked: 'sk-o…07d5' })
    expect(keyMark({ present: true, masked: 'sk-o…07d5' })).toBe(saved)
    expect(keyMark({ present: true, masked: 'sk-o…99zz' })).not.toBe(saved)
    expect(keyMark({ present: false, masked: null })).not.toBe(saved)
    const source = readFileSync(join(__dirname, 'ConnectionRows.tsx'), 'utf8')
    expect(source).toMatch(/if \(mark !== prevMark\.current\) forget\(\)/)
  })

  it('says a or an before the provider in the key hint', () => {
    expect(pasteHint('OpenRouter')).toBe('paste an OpenRouter key')
    expect(pasteHint('OpenAI')).toBe('paste an OpenAI key')
    expect(pasteHint('Groq')).toBe('paste a Groq key')
  })

  it('still says shared when cleanup names the speech provider (US-162)', () => {
    const sameUrl = mergeSettings(DEFAULT_SETTINGS, { polish: { enabled: true, baseUrl: GROQ, llmModel: 'x' } }) as Settings
    const key = rows(sameUrl).slice(rows(sameUrl).indexOf('id="row-cleanup-connection-key"'))
    expect(key).toContain('>shared<')
    expect(key).not.toContain('class="well"')
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
    expect(own).toContain('aria-label="Remove cleanup key"')
    expect(own).not.toContain('aria-label="Remove OpenRouter key"')
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

describe('Test sheen (US-157)', () => {
  it('holds a fast answer for one whole pass, and not with reduced motion', async () => {
    vi.useFakeTimers()
    try {
      let landed = false
      const held = afterOnePass(Promise.resolve('ok'), false).then((r) => {
        landed = true
        return r
      })
      await vi.advanceTimersByTimeAsync(SHEEN_MS - 1)
      expect(landed).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await held).toBe('ok')
      // An answer that lands in the 2nd pass waits for its end.
      let late = false
      const second = afterOnePass(new Promise((resolve) => setTimeout(() => resolve('late'), 1200)), false).then((r) => {
        late = true
        return r
      })
      await vi.advanceTimersByTimeAsync(2 * SHEEN_MS - 1)
      expect(late).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await second).toBe('late')
      const quick = afterOnePass(Promise.resolve('now'), true)
      await vi.advanceTimersByTimeAsync(0)
      expect(await quick).toBe('now')
    } finally {
      vi.useRealTimers()
    }
  })

  it('hover only changes the color, so it never wipes the sheen', () => {
    const css = readFileSync(join(__dirname, 'styles.css'), 'utf8')
    const hover = css.match(/\.btn\.btn-test:hover:not\(:disabled\)\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(hover).toContain('background-color')
    expect(hover).not.toMatch(/background\s*:/)
    expect(css).toMatch(new RegExp(`animation: test-sheen ${SHEEN_MS}ms`))
  })
})
