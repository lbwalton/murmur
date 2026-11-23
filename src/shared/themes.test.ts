// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ranks from '../../shared/ranks.json'
import { DEFAULT_THEME, THEMES, motionSpeed, needsPro, sceneMoves, themeById, wornLook } from './themes'

const tokensCss = readFileSync(join(__dirname, '..', 'renderer', 'tokens.css'), 'utf8')
const rankIds = new Set((ranks as unknown as { ranks: Array<{ id: string }> }).ranks.map((r) => r.id))

describe('the themes list (shared/themes.json, US-151)', () => {
  it('has unique ids, night studio first and free', () => {
    const ids = THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe(DEFAULT_THEME)
    expect(themeById(DEFAULT_THEME)?.unlock).toBeNull()
  })

  it('unlocks each theme by a real belt, by murmur Pro, or for everyone', () => {
    for (const theme of THEMES) {
      const rule = theme.unlock
      if (rule === null) continue
      if (rule.pro) expect(rule.rank, theme.id).toBeUndefined()
      else expect(rankIds.has(rule.rank ?? ''), `${theme.id}: ${rule.rank}`).toBe(true)
    }
  })

  it('gives every theme but night studio its own block in tokens.css', () => {
    for (const theme of THEMES.filter((t) => t.id !== DEFAULT_THEME)) {
      expect(tokensCss, theme.id).toContain(`:root[data-theme='${theme.id}'],\n[data-theme-preview='${theme.id}'] {`)
    }
    expect(tokensCss).toContain("[data-theme-preview='ember'] {")
  })

  it('gives every painted theme its sheet and its brightest color', () => {
    for (const theme of THEMES.filter((t) => t.scene)) {
      const from = tokensCss.indexOf(`:root[data-theme='${theme.id}']`)
      const body = tokensCss.slice(from, tokensCss.indexOf('\n}\n', from))
      expect(body, theme.id).toMatch(/--scene-sheet: rgba\(/)
      // The window's ground until the painting's first frame (styles.css).
      expect(body, theme.id).toMatch(/--scene-sky-mid: #/)
      // A dark painting names its brightest color, a light one (rice
      // paper) its darkest: the extreme window text is held to.
      expect(/--scene-bright: #/.test(body) !== /--scene-dark: #/.test(body), theme.id).toBe(true)
    }
  })

  it('makes only a light painting solid, and lets every other painting move', () => {
    for (const theme of THEMES.filter((t) => t.scene)) {
      const from = tokensCss.indexOf(`:root[data-theme='${theme.id}']`)
      const light = /--scene-dark: #/.test(tokensCss.slice(from, tokensCss.indexOf('\n}\n', from)))
      expect(theme.solid === true, theme.id).toBe(light)
      if (!theme.solid) expect(theme.motion, theme.id).toBeTruthy()
    }
  })
})

describe('what the window wears', () => {
  const choices = { uiTheme: 'moonlit', ground: 'scene', glass: 'clearest', motion: 'normal' } as const

  it('wears an earned theme with its painting', () => {
    expect(wornLook(choices, ['ember', 'mist', 'moonlit'], true)).toEqual({
      theme: 'moonlit',
      scene: 'moonlit',
      glass: 'clearest',
      motion: 'normal'
    })
  })

  it('wears the desktop instead of the painting when that is the pick', () => {
    expect(wornLook({ ...choices, ground: 'desktop' }, ['moonlit'], true).scene).toBeNull()
  })

  it('wears night studio for a theme not earned, and no painting', () => {
    expect(wornLook(choices, ['ember'], true)).toMatchObject({ theme: 'ember', scene: null })
  })

  it('trusts the saved pick until the belt is known (the first paint)', () => {
    expect(wornLook(choices, null, true).theme).toBe('moonlit')
  })

  it('keeps the glass at Clear without murmur Pro', () => {
    expect(wornLook(choices, ['moonlit'], false).glass).toBe('clear')
  })

  it('always wears rice paper on its paper, at Clear, still (US-174)', () => {
    const paper = { uiTheme: 'rice', ground: 'desktop', glass: 'clearest', motion: 'lively' } as const
    expect(themeById('rice')?.solid).toBe(true)
    expect(wornLook(paper, ['ember', 'rice'], true)).toEqual({ theme: 'rice', scene: 'rice', glass: 'clear', motion: 'off' })
    expect(sceneMoves({ visible: true, focused: true, motion: wornLook(paper, null, true).motion, reducedMotion: false })).toBe(false)
  })

  it('wears each belt theme from its own belt, Pro or not (US-174)', () => {
    const at = (id: string): string | undefined => themeById(id)?.unlock?.rank
    expect([at('rice'), at('moonlit'), at('wave'), at('fire'), at('storm')]).toEqual(['white', 'blue', 'purple', 'brown', 'black'])
    for (const id of ['rice', 'moonlit', 'wave', 'fire', 'storm']) {
      const theme = themeById(id)
      expect(theme && needsPro(theme), id).toBe(false)
      expect(wornLook({ ...choices, uiTheme: id, glass: 'clear' }, [id], false).theme, id).toBe(id)
    }
  })

  it('wears night studio for a Pro theme without murmur Pro', () => {
    const proTheme = { ...THEMES[0], id: 'pro-test', unlock: { pro: true as const } }
    expect(needsPro(proTheme)).toBe(true)
    expect(wornLook({ ...choices, uiTheme: 'gone' }, null, false).theme).toBe('ember')
  })
})

describe('how a painting moves', () => {
  it('runs at half, normal, and 1.7 times speed, and stands still when off', () => {
    expect(motionSpeed('off')).toBe(0)
    expect(motionSpeed('slow')).toBe(0.5)
    expect(motionSpeed('normal')).toBe(1)
    expect(motionSpeed('lively')).toBe(1.7)
  })

  it('moves only while showing, in front, with motion on, and without Reduce motion', () => {
    const live = { visible: true, focused: true, motion: 'normal', reducedMotion: false } as const
    expect(sceneMoves(live)).toBe(true)
    expect(sceneMoves({ ...live, visible: false })).toBe(false)
    expect(sceneMoves({ ...live, focused: false })).toBe(false)
    expect(sceneMoves({ ...live, motion: 'off' })).toBe(false)
    expect(sceneMoves({ ...live, reducedMotion: true })).toBe(false)
  })
})
