// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Rgba, contrast, over, parseColor, stack } from './contrast'
import { CLEAR_BACKGROUND, SOLID_BACKGROUND, asLook, pageBackground, startsWithoutMaterial, windowLook, windowOptions, windowsBuild } from './look'

const src = (path: string): string => readFileSync(join(__dirname, '..', path), 'utf8')

describe('which look the window gets (US-150)', () => {
  const mac = { platform: 'darwin', systemVersion: '26.1.0', reducedTransparency: false }
  const win11 = { platform: 'win32', systemVersion: '10.0.22631', reducedTransparency: false }

  it('is glass on a Mac', () => {
    expect(windowLook(mac)).toBe('glass')
  })

  it('is solid on Windows until its glass has been seen working, whatever the version', () => {
    expect(windowLook(win11)).toBe('solid')
    expect(windowLook({ ...win11, windowsGlass: false })).toBe('solid')
  })

  it('with Windows glass switched on to try it, is glass on Windows 11 22H2 and up only', () => {
    const trying = { ...win11, windowsGlass: true }
    expect(windowLook(trying)).toBe('glass')
    expect(windowLook({ ...trying, systemVersion: '10.0.22621' })).toBe('glass')
    expect(windowLook({ ...trying, systemVersion: '10.0.19045' })).toBe('solid')
    expect(windowLook({ ...trying, systemVersion: '10.0.22000' })).toBe('solid')
    expect(windowLook({ ...trying, systemVersion: 'unknown' })).toBe('solid')
  })

  it('is solid anywhere else', () => {
    expect(windowLook({ ...mac, platform: 'linux' })).toBe('solid')
    expect(windowLook({ ...mac, platform: 'linux', windowsGlass: true })).toBe('solid')
  })

  it('is solid whenever the system asks for less transparency', () => {
    expect(windowLook({ ...mac, reducedTransparency: true })).toBe('solid')
    expect(windowLook({ ...win11, windowsGlass: true, reducedTransparency: true })).toBe('solid')
  })

  it('reads the Windows build number', () => {
    expect(windowsBuild('10.0.22631')).toBe(22631)
    expect(windowsBuild('26.1.0')).toBe(0)
    expect(windowsBuild('')).toBe(0)
  })

  it('uses the under-window material on a Mac and acrylic on Windows, over a clear background', () => {
    expect(windowOptions('glass', 'darwin')).toEqual({ backgroundColor: CLEAR_BACKGROUND, vibrancy: 'under-window', visualEffectState: 'active' })
    expect(windowOptions('glass', 'win32')).toEqual({ backgroundColor: CLEAR_BACKGROUND, backgroundMaterial: 'acrylic' })
  })

  it('makes a solid Mac window with the material too, then takes it off, so glass later stays active', () => {
    // visualEffectState can only be set as the window is made.
    expect(windowOptions('solid', 'darwin')).toEqual({ backgroundColor: SOLID_BACKGROUND, vibrancy: 'under-window', visualEffectState: 'active' })
    expect(startsWithoutMaterial('solid', 'darwin')).toBe(true)
    expect(startsWithoutMaterial('glass', 'darwin')).toBe(false)
    expect(startsWithoutMaterial('solid', 'win32')).toBe(false)
  })

  it('is solid ink otherwise, with no material', () => {
    expect(windowOptions('solid', 'win32')).toEqual({ backgroundColor: SOLID_BACKGROUND })
    expect(windowOptions('solid', 'linux')).toEqual({ backgroundColor: SOLID_BACKGROUND })
    expect(windowOptions('glass', 'linux')).toEqual({ backgroundColor: SOLID_BACKGROUND })
  })

  it('paints nothing behind a glass page and ink behind a solid one', () => {
    expect(pageBackground('glass', 'darwin')).toBe(CLEAR_BACKGROUND)
    expect(pageBackground('glass', 'win32')).toBe(CLEAR_BACKGROUND)
    expect(pageBackground('glass', 'linux')).toBe(SOLID_BACKGROUND)
    for (const platform of ['darwin', 'win32', 'linux']) expect(pageBackground('solid', platform)).toBe(SOLID_BACKGROUND)
  })

  it('trusts only the 2 real looks from an address or an environment variable', () => {
    expect(asLook('glass')).toBe('glass')
    expect(asLook('solid')).toBe('solid')
    for (const bad of ['', 'Glass', 'flat', null, undefined, 1, {}]) expect(asLook(bad)).toBeNull()
  })
})

describe('reading colors', () => {
  it('reads hex, rgb and rgba, and refuses the rest', () => {
    expect(parseColor('#0f0e11')).toEqual({ r: 15, g: 14, b: 17, a: 1 })
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('rgba(217, 164, 65, 0.06)')).toEqual({ r: 217, g: 164, b: 65, a: 0.06 })
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
    expect(() => parseColor('var(--ink)')).toThrow()
    expect(() => parseColor('gold')).toThrow()
  })

  it('computes the usual contrast ratios', () => {
    const white = parseColor('#ffffff')
    const black = parseColor('#000000')
    expect(contrast(white, black)).toBeCloseTo(21, 5)
    expect(contrast(black, white)).toBeCloseTo(21, 5)
    expect(contrast(parseColor('#767676'), white)).toBeCloseTo(4.54, 2)
    // See-through text is laid over its ground first.
    expect(contrast(parseColor('rgba(0, 0, 0, 0.5)'), white)).toBeCloseTo(contrast(parseColor('#808080'), white), 1)
    expect(over(parseColor('rgba(0, 0, 0, 0.5)'), white).r).toBeCloseTo(127.5, 5)
  })
})

/** tokens.css as name to value: the :root block, with a theme's own
 *  block laid over it when one is named. */
function tokens(theme?: string): Record<string, Rgba> {
  const css = src('renderer/tokens.css')
  const block = (start: string): string => {
    const from = css.indexOf(start)
    if (from < 0) throw new Error(`no ${start} in tokens.css`)
    return css.slice(from, css.indexOf('\n}\n', from))
  }
  const found: Record<string, Rgba> = {}
  for (const part of [block(':root {'), ...(theme ? [block(`:root[data-theme='${theme}'] {`)] : [])]) {
    for (const [, name, value] of part.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*;/g)) {
      found[name] = parseColor(value)
    }
  }
  return found
}

const FLOOR = 4.5
const white = parseColor('#ffffff')
const black = parseColor('#000000')

/** Every surface of the look over a ground, and the text that sits on
 *  each, as styles.css lays them. */
function pairs(t: Record<string, Rgba>, windowGround: Rgba, look: 'glass' | 'solid' = 'glass'): Array<[string, Rgba, Rgba]> {
  // The top bar is solid ink under the wash, whatever is behind the window.
  const bar = stack(t.ink, t['tint-frame'])
  // Over the glow the sidebar gets a darker pane.
  const rail = stack(windowGround, ...(look === 'solid' ? [t['glass-bar']] : []), t['tint-frame'])
  const card = stack(windowGround, t['glass-card'])
  const cardOnRail = stack(rail, t['glass-card'])
  const well = stack(card, t['glass-well'])
  const reading = stack(card, t['tint-frame'])
  const strongFrom = stack(card, t['tint-strong-from'])
  const strongTo = stack(card, t['tint-strong-to'])
  // Under a look, red is the glass red (styles.css sets --red to it).
  const red = t['red-glass']
  return [
    ['bright text on the window', t.text, windowGround],
    ['grey text on the window', t['text-dim-window'], windowGround],
    ['a gold label on the window', t.brand, windowGround],
    ['a sidebar name', t['text-dim-window'], rail],
    ['a gold sidebar label', t.brand, rail],
    ['the sidebar name you are on', t.brand, cardOnRail],
    ['a tab in the top bar', t['text-dim-window'], bar],
    ['the tab you are on', t.brand, bar],
    ['the red mark in the top bar', red, bar],
    ['bright text on a card', t.text, card],
    ['grey text on a card', t['text-dim-surface'], card],
    ['a gold label on a card', t.brand, card],
    ['red text on a card', red, card],
    ['green text on a card', t.ok, card],
    ['bright text in a well', t.text, well],
    ['grey text in a well', t['text-dim-surface'], well],
    ['red text in a well', red, well],
    ['grey text on a reading card', t['text-dim-surface'], reading],
    ['a gold label on a reading card', t.brand, reading],
    ['bright text on time back, its strong corner', t.text, strongFrom],
    ['soft text on time back, its strong corner', t['text-on-tint'], strongFrom],
    ['soft text on time back, its faint corner', t['text-on-tint'], strongTo],
    ['the to fix badge, on its solid chip', red, stack(t.ink, t['red-wash'])],
    ['the all set badge, on its solid chip', t.ok, t.ink]
  ]
}

describe('text stays readable on the look, computed from the tokens (US-150)', () => {
  const t = tokens()

  it('finds the tokens it needs', () => {
    for (const name of ['ink', 'text', 'brand', 'ok', 'red-glass', 'red-wash', 'text-dim-window', 'text-dim-surface', 'text-on-tint', 'glass-window', 'glass-card', 'glass-well', 'glass-bar', 'tint-frame', 'tint-strong-from', 'tint-strong-to', 'glow-top', 'glow-mid']) {
      expect(t[name], name).toBeDefined()
    }
    // The surface grey is the grey the flat look has always used.
    expect(t['text-dim-surface']).toEqual(t['text-dim'])
  })

  // The glow is strongest at the very top of the window, so that is the
  // ground every solid pair is held to.
  describe.each([['night studio', undefined], ['mist', 'mist']] as const)('in %s', (_name, theme) => {
    const th = tokens(theme)

    it('has its own panes, cut from its own ground', () => {
      const rgb = (c: Rgba): number[] => [c.r, c.g, c.b]
      expect(rgb(th['glass-window'])).toEqual(rgb(th.ink))
      expect(rgb(th['glass-card'])).toEqual(rgb(th.panel))
      expect(rgb(th['ink-clear'])).toEqual(rgb(th.ink))
      expect(rgb(th['glass-bar'])).toEqual(rgb(th.ink))
      expect(th['text-dim-surface']).toEqual(th['text-dim'])
      // Never more desktop than night studio's cap.
      expect(th['glass-window'].a).toBeGreaterThanOrEqual(0.82)
    })

    it.each(pairs(th, stack(white, th['glass-window'])))('glass over a pure white wallpaper: %s keeps 4.5 to 1', (_pair, text, ground) => {
      expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
    })

    it.each(pairs(th, stack(black, th['glass-window'])))('glass over a black wallpaper: %s keeps 4.5 to 1', (_pair, text, ground) => {
      expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
    })

    it.each(pairs(th, stack(th.ink, th['glow-top']), 'solid'))('solid with the glow at its brightest: %s keeps 4.5 to 1', (_pair, text, ground) => {
      expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
    })
  })

  it('shows 18% of the desktop, and that is the cap: 1 point more and a gold sidebar label fails', () => {
    expect(t['glass-window'].a).toBe(0.82)
    const railAt = (show: number): Rgba => stack(white, { ...t['glass-window'], a: 1 - show }, t['tint-frame'])
    expect(contrast(t.brand, railAt(0.18))).toBeGreaterThanOrEqual(FLOOR)
    expect(contrast(t.brand, railAt(0.19))).toBeLessThan(FLOOR)
    // The round 3 pick, 21%, with the flat look's grey: the reason for the fix.
    expect(contrast(t['text-dim'], railAt(0.21))).toBeLessThan(3.5)
  })

  it('needs the glass red: the plain red falls short on a glass card over white', () => {
    const card = stack(white, t['glass-window'], t['glass-card'])
    expect(contrast(t.red, card)).toBeLessThan(FLOOR)
    expect(contrast(t['red-glass'], card)).toBeGreaterThanOrEqual(FLOOR)
  })

  it('keeps the brand gold below signal amber, so no label was brightened to pass', () => {
    const lum = (c: Rgba): number => contrast(c, black)
    expect(lum(t.brand)).toBeLessThan(lum(t.amber))
  })
})

describe('where the look is applied', () => {
  const css = src('renderer/settings/styles.css')
  const look = css.slice(css.indexOf('/* Glass over your desktop (US-150'))

  it('is all under data-look, so no look at all is the flat night studio', () => {
    expect(look.length).toBeGreaterThan(1000)
    const selectors = [...look.matchAll(/^([^\s@/}][^{]*)\{/gm)].map((m) => m[1].trim())
    expect(selectors.length).toBeGreaterThan(10)
    for (const selector of selectors) expect(selector.startsWith('html[data-look')).toBe(true)
  })

  it('brightens grey on the window and puts the usual grey back on every surface', () => {
    // Named twice, to outrank a theme's own tokens on the same element.
    expect(look).toMatch(/html\[data-look\]\[data-look\] \{\s*--panel: var\(--glass-card\);\s*--text-dim: var\(--text-dim-window\);\s*--red: var\(--red-glass\);/)
    expect(src('renderer/tokens.css')).toContain(":root[data-theme='mist'] {")
    expect(look).toMatch(/\.loop-tile-wrap\s*\) \{\s*--text-dim: var\(--text-dim-surface\);/)
    expect(look).toContain("html[data-look='glass'] body::before {\n  background: var(--glass-window);")
  })

  it('gives the solid look\'s sidebar a darker pane', () => {
    expect(look).toMatch(/html\[data-look='solid'\] \.rail \{\s*background: linear-gradient\(var\(--tint-frame\), var\(--tint-frame\)\), var\(--glass-bar\);/)
  })

  it('makes a well darker glass, not solid ink', () => {
    expect(look).toMatch(/html\[data-look\] :is\(\.well, \.group-rows\) \{\s*background: var\(--glass-well\);/)
  })

  it('blurs nothing under a look: none added, and the flat look\'s 2 switched off', () => {
    expect(look).not.toMatch(/backdrop-filter:\s*blur/)
    expect(look).toMatch(/html\[data-look\] :is\(\.ask-first, \.btn\.btn-test\) \{\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;/)
    // Every blur in the stylesheet belongs to one of those 2.
    const before = css.slice(0, css.indexOf('/* Glass over your desktop (US-150'))
    const blurred = [...before.matchAll(/^([^\s@/}][^{]*)\{[^}]*?\bbackdrop-filter:\s*blur/gm)].map((m) => m[1].trim())
    expect(blurred.sort()).toEqual(['.ask-first', '.btn.btn-test'])
    expect(look).toMatch(/\.masthead::before \{[^}]*background: linear-gradient\(var\(--tint-frame\), var\(--tint-frame\)\), var\(--ink\);/)
  })

  it('leaves the edges that say something: a waiting take, Finish setup, the profile in use', () => {
    expect(look).toContain('html[data-look] :is(.panel:not(.waiting-strip), .group, .running-strip, .history) {')
    expect(look).not.toMatch(/:is\([^)]*\.(finish|profile-card)[^)]*\) \{\s*border-color/)
    expect(look).toMatch(/html\[data-look\] \.health-bad \{\s*background: linear-gradient\(var\(--red-wash\), var\(--red-wash\)\), var\(--ink\);/)
  })

  it('is made in main from the rules, switches live, and leaves the overlay pill alone', () => {
    const main = src('main/index.ts')
    expect(main).toContain('...windowOptions(shownLook, process.platform),')
    expect(main).toContain('if (startsWithoutMaterial(shownLook, process.platform)) win.setVibrancy(null)')
    // Ink behind the page until it has drawn itself, and during a reload.
    expect(main).toMatch(/'did-finish-load', \(\) => \{\s*if \(!win\.isDestroyed\(\)\) win\.setBackgroundColor\(pageBackground\(shownLook, process\.platform\)\)/)
    expect(main).toMatch(/'did-start-loading', \(\) => \{\s*if \(!win\.isDestroyed\(\)\) win\.setBackgroundColor\(SOLID_BACKGROUND\)/)
    expect(main).toContain('reducedTransparency: nativeTheme.prefersReducedTransparency')
    expect(main).toMatch(/nativeTheme\.on\('updated', \(\) => \{\s*const look = currentLook\(\)/)
    const overlay = src('main/overlay/index.ts')
    expect(overlay).toContain('focusable: false')
    expect(overlay).not.toMatch(/vibrancy|backgroundMaterial|shared\/look/)
    expect(src('preload/settings.ts')).toContain("ipcRenderer.invoke('look:get')")
  })
})
