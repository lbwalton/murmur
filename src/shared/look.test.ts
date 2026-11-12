// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Rgba, contrast, over, parseColor, stack } from './contrast'
import { CLEAR_BACKGROUND, SOLID_BACKGROUND, asLook, windowLook, windowOptions, windowsBuild } from './look'

const src = (path: string): string => readFileSync(join(__dirname, '..', path), 'utf8')

describe('which look the window gets (US-150)', () => {
  const mac = { platform: 'darwin', systemVersion: '26.1.0', reducedTransparency: false }
  const win11 = { platform: 'win32', systemVersion: '10.0.22631', reducedTransparency: false }

  it('is glass on a Mac and on Windows 11 22H2 and up', () => {
    expect(windowLook(mac)).toBe('glass')
    expect(windowLook(win11)).toBe('glass')
    expect(windowLook({ ...win11, systemVersion: '10.0.22621' })).toBe('glass')
  })

  it('is solid on Windows 10, an older Windows 11, and anything else', () => {
    expect(windowLook({ ...win11, systemVersion: '10.0.19045' })).toBe('solid')
    expect(windowLook({ ...win11, systemVersion: '10.0.22000' })).toBe('solid')
    expect(windowLook({ ...win11, systemVersion: 'unknown' })).toBe('solid')
    expect(windowLook({ ...mac, platform: 'linux' })).toBe('solid')
  })

  it('is solid whenever the system asks for less transparency', () => {
    expect(windowLook({ ...mac, reducedTransparency: true })).toBe('solid')
    expect(windowLook({ ...win11, reducedTransparency: true })).toBe('solid')
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

  it('is solid ink otherwise, with no material', () => {
    for (const platform of ['darwin', 'win32', 'linux']) {
      expect(windowOptions('solid', platform)).toEqual({ backgroundColor: SOLID_BACKGROUND })
    }
    expect(windowOptions('glass', 'linux')).toEqual({ backgroundColor: SOLID_BACKGROUND })
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

/** The first :root block of tokens.css, as name to value. */
function tokens(): Record<string, Rgba> {
  const css = src('renderer/tokens.css')
  const root = css.slice(css.indexOf(':root {'), css.indexOf("\n}\n"))
  const found: Record<string, Rgba> = {}
  for (const [, name, value] of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*;/g)) {
    found[name] = parseColor(value)
  }
  return found
}

describe('text stays readable on the look, computed from the tokens (US-150)', () => {
  const t = tokens()
  const FLOOR = 4.5
  const white = parseColor('#ffffff')
  const black = parseColor('#000000')

  /** Every surface of the look over a ground, and the text that sits on each. */
  const pairs = (windowGround: Rgba, look: 'glass' | 'solid' = 'glass'): Array<[string, Rgba, Rgba]> => {
    // The top bar is solid ink under the wash, whatever is behind the window.
    const bar = stack(t.ink, t['tint-frame'])
    // Over the glow the sidebar gets a darker pane (styles.css).
    const rail = stack(windowGround, ...(look === 'solid' ? [t['glass-bar']] : []), t['tint-frame'])
    const card = stack(windowGround, t['glass-card'])
    const cardOnRail = stack(rail, t['glass-card'])
    const well = stack(card, t['glass-well'])
    const reading = stack(card, t['tint-frame'])
    const strongFrom = stack(card, t['tint-strong-from'])
    const strongTo = stack(card, t['tint-strong-to'])
    return [
      ['bright text on the window', t.text, windowGround],
      ['grey text on the window', t['text-dim-window'], windowGround],
      ['a gold label on the window', t.brand, windowGround],
      ['a sidebar name', t['text-dim-window'], rail],
      ['a gold sidebar label', t.brand, rail],
      ['the sidebar name you are on', t.brand, cardOnRail],
      ['a tab in the top bar', t['text-dim-window'], bar],
      ['the tab you are on', t.brand, bar],
      ['bright text on a card', t.text, card],
      ['grey text on a card', t['text-dim-surface'], card],
      ['a gold label on a card', t.brand, card],
      ['bright text in a well', t.text, well],
      ['grey text in a well', t['text-dim-surface'], well],
      ['grey text on a reading card', t['text-dim-surface'], reading],
      ['a gold label on a reading card', t.brand, reading],
      ['bright text on time back, its strong corner', t.text, strongFrom],
      ['soft text on time back, its strong corner', t['text-on-tint'], strongFrom],
      ['soft text on time back, its faint corner', t['text-on-tint'], strongTo]
    ]
  }

  it('finds the tokens it needs', () => {
    for (const name of ['ink', 'text', 'brand', 'text-dim-window', 'text-dim-surface', 'text-on-tint', 'glass-window', 'glass-card', 'glass-well', 'glass-bar', 'tint-frame', 'tint-strong-from', 'tint-strong-to', 'glow-top', 'glow-mid']) {
      expect(t[name], name).toBeDefined()
    }
    // The surface grey is the grey the flat look has always used.
    expect(t['text-dim-surface']).toEqual(t['text-dim'])
  })

  it.each(pairs(stack(white, tokens()['glass-window'])))('glass over a pure white wallpaper: %s keeps 4.5 to 1', (_name, text, ground) => {
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
  })

  it.each(pairs(stack(black, tokens()['glass-window'])))('glass over a black wallpaper: %s keeps 4.5 to 1', (_name, text, ground) => {
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
  })

  // The glow is strongest at the very top of the window, so that is the
  // ground every solid pair is held to.
  it.each(pairs(stack(tokens().ink, tokens()['glow-top']), 'solid'))('solid with the glow at its brightest: %s keeps 4.5 to 1', (_name, text, ground) => {
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
  })

  it('shows 18% of the desktop, and that is the cap: 1 point more and a gold sidebar label fails', () => {
    expect(t['glass-window'].a).toBe(0.82)
    expect({ r: t['glass-window'].r, g: t['glass-window'].g, b: t['glass-window'].b }).toEqual({ r: t.ink.r, g: t.ink.g, b: t.ink.b })
    const railAt = (show: number): Rgba => stack(white, { ...t['glass-window'], a: 1 - show }, t['tint-frame'])
    expect(contrast(t.brand, railAt(0.18))).toBeGreaterThanOrEqual(FLOOR)
    expect(contrast(t.brand, railAt(0.19))).toBeLessThan(FLOOR)
    // The round 3 pick, 21%, with the flat look's grey: the reason for the fix.
    expect(contrast(t['text-dim'], railAt(0.21))).toBeLessThan(3.5)
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
    expect(look).toMatch(/html\[data-look\] \{\s*--panel: var\(--glass-card\);\s*--text-dim: var\(--text-dim-window\);/)
    expect(look).toMatch(/\.loop-tile-wrap\s*\) \{\s*--text-dim: var\(--text-dim-surface\);/)
    expect(look).toContain("html[data-look='glass'] body::before {\n  background: var(--glass-window);")
  })

  it('gives the solid look\'s sidebar a darker pane', () => {
    expect(look).toMatch(/html\[data-look='solid'\] \.rail \{\s*background: linear-gradient\(var\(--tint-frame\), var\(--tint-frame\)\), var\(--glass-bar\);/)
  })

  it('makes a well darker glass, not solid ink', () => {
    expect(look).toMatch(/html\[data-look\] :is\(\.well, \.group-rows\) \{\s*background: var\(--glass-well\);/)
  })

  it('blurs nothing: no row in a scrolling list, and not the top bar, which is solid ink under its wash', () => {
    expect(look).not.toMatch(/^\s*(-webkit-)?backdrop-filter:/m)
    expect(look).toMatch(/\.masthead::before \{[^}]*background: linear-gradient\(var\(--tint-frame\), var\(--tint-frame\)\), var\(--ink\);/)
    expect(css).not.toMatch(/\.log-entry[^{]*\{[^}]*backdrop-filter/)
    expect(css).not.toMatch(/\.row\b[^{]*\{[^}]*backdrop-filter/)
  })

  it('is made in main from the rules, switches live, and leaves the overlay pill alone', () => {
    const main = src('main/index.ts')
    expect(main).toContain('...windowOptions(shownLook, process.platform),')
    expect(main).toContain('reducedTransparency: nativeTheme.prefersReducedTransparency')
    expect(main).toMatch(/nativeTheme\.on\('updated', \(\) => \{\s*const look = currentLook\(\)/)
    const overlay = src('main/overlay/index.ts')
    expect(overlay).toContain('focusable: false')
    expect(overlay).not.toMatch(/vibrancy|backgroundMaterial|shared\/look/)
    expect(src('preload/settings.ts')).toContain("ipcRenderer.invoke('look:get')")
  })
})
