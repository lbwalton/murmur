// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Rgba, contrast, over, parseColor, stack } from './contrast'
import { CLEAR_BACKGROUND, SOLID_BACKGROUND, THEME_SOURCE, asLook, pageBackground, startsWithoutMaterial, windowLook, windowOptions, windowsBuild } from './look'

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

  it('uses the floating-panel material on a Mac and acrylic on Windows, over a clear background', () => {
    expect(windowOptions('glass', 'darwin')).toEqual({ backgroundColor: CLEAR_BACKGROUND, vibrancy: 'hud', visualEffectState: 'active' })
    expect(windowOptions('glass', 'win32')).toEqual({ backgroundColor: CLEAR_BACKGROUND, backgroundMaterial: 'acrylic' })
  })

  it('makes a solid Mac window with the material too, then takes it off, so glass later stays active', () => {
    // visualEffectState can only be set as the window is made.
    expect(windowOptions('solid', 'darwin')).toEqual({ backgroundColor: SOLID_BACKGROUND, vibrancy: 'hud', visualEffectState: 'active' })
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

  it('is always dark to the system, so a Mac in its light look never hands it the light material', () => {
    expect(THEME_SOURCE).toBe('dark')
    expect(src('main/index.ts')).toContain('nativeTheme.themeSource = THEME_SOURCE')
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
const black = parseColor('#000000')
/** What the Mac's dark floating-panel material (hud) shows of a white
 *  page behind the window: measured from a screenshot of the real
 *  window over a white browser page on macOS 26.6.2, 2026-11-12 (the
 *  window read 100, 101, 103 under the 50% sheet). The brightest ground
 *  the glass can have. */
const MATERIAL_OVER_WHITE = parseColor('#b9bcbd')

/** Every surface of the look over a ground, and the text that sits on
 *  each, as styles.css lays them. */
function pairs(t: Record<string, Rgba>, windowGround: Rgba, look: 'glass' | 'solid' = 'glass'): Array<[string, Rgba, Rgba]> {
  // 1 glass: the top bar, the sidebar and every card are the same pane
  // (--panel, which the solid look sets to its own 85%).
  const card = stack(windowGround, look === 'solid' ? t['glass-card-solid'] : t['glass-card'])
  const well = stack(card, t['glass-well'])
  const strongFrom = stack(card, t['tint-strong-from'])
  const strongTo = stack(card, t['tint-strong-to'])
  const threadFrom = stack(card, t['tint-thread-from'])
  const threadTo = stack(card, t['tint-thread-to'])
  // Under a look, red is the glass red (styles.css sets --red to it).
  const red = t['red-glass']
  return [
    ['bright text on the window', t.text, windowGround],
    ['helper text on the window', t['text-dim-window'], windowGround],
    ['a sidebar name', t.text, card],
    ['a gold sidebar label', t.brand, card],
    ['a count in the sidebar', t['text-dim-surface'], card],
    ['the sidebar line you are on, its strong corner', t.text, strongFrom],
    ['the sidebar line you are on, its faint corner', t.text, strongTo],
    ['a tab in the top bar', t.text, card],
    ['the tab you are on', t.brand, card],
    ['the red mark in the top bar', red, card],
    ['bright text on a card', t.text, card],
    ['grey text on a card', t['text-dim-surface'], card],
    ['a gold label on a card', t.brand, card],
    ['red text on a card', red, card],
    ['green text on a card', t.ok, card],
    ['bright text in a well', t.text, well],
    ['grey text in a well', t['text-dim-surface'], well],
    ['red text in a well', red, well],
    ['text on time back, its strong corner', t.text, strongFrom],
    ['text on time back, its faint corner', t.text, strongTo],
    ['today\'s header, its strong end', t.text, threadFrom],
    ['today\'s header, its faint end', t.text, threadTo],
    ['the to fix badge, on its solid chip', red, stack(t.ink, t['red-wash'])],
    ['the all set badge, on its solid chip', t.ok, t.ink]
  ]
}

describe('text stays readable on the look, computed from the tokens (US-150)', () => {
  const t = tokens()

  it('finds the tokens it needs', () => {
    for (const name of ['ink', 'text', 'brand', 'ok', 'red-glass', 'red-wash', 'text-dim-window', 'text-dim-surface', 'glass-window', 'glass-card', 'glass-card-solid', 'glass-well', 'tint-strong-from', 'tint-strong-to', 'tint-thread-from', 'tint-thread-to', 'glow-top', 'glow-mid']) {
      expect(t[name], name).toBeDefined()
    }
  })

  // The glow is strongest at the very top of the window, so that is the
  // ground every solid pair is held to.
  describe.each([['night studio', undefined], ['mist', 'mist']] as const)('in %s', (_name, theme) => {
    const th = tokens(theme)

    it('has its own panes, cut from its own ground', () => {
      const rgb = (c: Rgba): number[] => [c.r, c.g, c.b]
      expect(rgb(th['glass-window'])).toEqual(rgb(th.ink))
      expect(rgb(th['glass-card'])).toEqual(rgb(th.panel))
      expect(rgb(th['glass-card-solid'])).toEqual(rgb(th.panel))
      expect(rgb(th['ink-clear'])).toEqual(rgb(th.ink))
      // Helper text on the window is the theme's own cream.
      expect(th['text-dim-window']).toEqual(th.text)
      // Clear (LaBroi's pick, 2026-11-12): half sheet, cards at 62%.
      expect(th['glass-window'].a).toBe(0.5)
      expect(th['glass-card'].a).toBe(0.62)
      expect(th['glass-card-solid'].a).toBe(0.85)
    })

    it.each(pairs(th, stack(MATERIAL_OVER_WHITE, th['glass-window'])))('glass over a white page: %s keeps 4.5 to 1', (_pair, text, ground) => {
      expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
    })

    it.each(pairs(th, stack(black, th['glass-window'])))('glass over a black desktop: %s keeps 4.5 to 1', (_pair, text, ground) => {
      expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
    })

    it.each(pairs(th, stack(th.ink, th['glow-top']), 'solid'))('solid with the glow at its brightest: %s keeps 4.5 to 1', (_pair, text, ground) => {
      expect(contrast(text, ground)).toBeGreaterThanOrEqual(FLOOR)
    })
  })

  it('knows why the window carries no grey and no gold: over a white page neither keeps 4.5 to 1 on bare glass', () => {
    const ground = stack(MATERIAL_OVER_WHITE, t['glass-window'])
    expect(contrast(t['text-dim'], ground)).toBeLessThan(FLOOR)
    expect(contrast(t.brand, ground)).toBeLessThan(FLOOR)
    // So gold and grey always sit on a card, where both pass.
    const card = stack(ground, t['glass-card'])
    expect(contrast(t.brand, card)).toBeGreaterThanOrEqual(FLOOR)
    expect(contrast(t['text-dim-surface'], card)).toBeGreaterThanOrEqual(FLOOR)
  })

  it('needs the glass red: the plain red falls short on a glass card over a white page', () => {
    const card = stack(MATERIAL_OVER_WHITE, t['glass-window'], t['glass-card'])
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

  it('makes helper text on the window cream and puts grey back on every surface', () => {
    // Named twice, to outrank a theme's own tokens on the same element.
    expect(look).toMatch(/html\[data-look\]\[data-look\] \{\s*--panel: var\(--glass-card\);\s*--text-dim: var\(--text-dim-window\);\s*--red: var\(--red-glass\);/)
    expect(look).toMatch(/html\[data-look='solid'\]\[data-look='solid'\] \{\s*--panel: var\(--glass-card-solid\);/)
    // The bar and the sidebar are surfaces too.
    expect(look).toMatch(/:is\(\s*\.masthead,\s*\.rail,\s*\.panel,/)
    expect(src('renderer/tokens.css')).toContain(":root[data-theme='mist'] {")
    expect(look).toMatch(/\.loop-tile-wrap\s*\) \{\s*--text-dim: var\(--text-dim-surface\);/)
    expect(look).toContain("html[data-look='glass'] body::before {\n  background: var(--glass-window);")
  })

  it('is 1 glass: the top bar, the sidebar and your dictations are the card pane, with no faint gold wash', () => {
    expect(look).toMatch(/html\[data-look\] \.masthead \{\s*background: var\(--panel\);/)
    expect(look).toMatch(/html\[data-look\] \.rail \{[^}]*background: var\(--panel\);/)
    expect(look).toMatch(/html\[data-look\] \.history \{[^}]*background: var\(--panel\);/)
    // Only the 2 token rules name a pane; every surface takes --panel, so
    // the solid look's 85% reaches all of them.
    expect(look.match(/var\(--glass-card(-solid)?\)/g)).toHaveLength(2)
    expect(css).not.toContain('--tint-frame')
    expect(src('renderer/tokens.css')).not.toContain('--tint-frame')
  })

  it('keeps the page out from under the bar: it scrolls in its own box', () => {
    expect(css).toMatch(/\.page-scroll \{[^}]*overflow-y: auto;/)
    expect(css).toMatch(/\.masthead \{\s*position: relative;/)
    expect(css).not.toMatch(/\.masthead \{[^}]*position: sticky/)
    const app = src('renderer/settings/App.tsx')
    expect(app.match(/className="page-scroll" tabIndex=\{-1\}/g)).toHaveLength(2)
    // The box takes the keyboard on each page, so the scroll keys work.
    expect(app).toMatch(/pageScroller\(\)\?\.scrollTo\(0, 0\)\s*markScrollbars\(\)\s*focusPageScroller\(\)/)
    // A narrow window insets the page and the bar, never the shell.
    expect(css).not.toMatch(/\.shell \{\s*padding/)
  })

  it('puts gold where it says something: time back, the sidebar line you are on, today\'s header', () => {
    expect(look).toMatch(/html\[data-look\] \.home-timeback \{[^}]*var\(--tint-strong-from\), var\(--tint-strong-to\)\), var\(--panel\);/)
    expect(look).toMatch(/:is\(\.rail-item-on, \.rail-item-on:hover\) \{[^}]*color: var\(--text\);[^}]*var\(--tint-strong-from\), var\(--tint-strong-to\)\);/)
    expect(look).toMatch(/html\[data-look\] \.day-head-today \{[^}]*var\(--tint-thread-from\), var\(--tint-thread-to\)\);/)
    // Names are cream until picked; the tab you are on is gold.
    expect(look).toMatch(/html\[data-look\] :is\(\.nav-btn, \.rail-item\) \{\s*color: var\(--text\);/)
    expect(look).toMatch(/html\[data-look\] \.nav-btn\[aria-current='page'\] \{\s*color: var\(--brand\);/)
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
  })

  it('leaves the edges that say something (Finish setup, the profile in use), and a waiting take is a card with a red dot', () => {
    expect(look).toContain('html[data-look] :is(.panel, .group, .running-strip, .history) {')
    expect(look).not.toMatch(/:is\([^)]*\.(finish|profile-card)[^)]*\) \{\s*border-color/)
    expect(look).toMatch(/html\[data-look\] \.health-bad \{\s*background: linear-gradient\(var\(--red-wash\), var\(--red-wash\)\), var\(--ink\);/)
    expect(css).not.toMatch(/\.waiting-strip \{[^}]*border-color/)
    expect(src('renderer/settings/HomeView.tsx')).toMatch(/waiting to retry\s*<span className="rail-dot" aria-hidden="true" \/>/)
  })

  it('is made in main from the rules, switches live, and leaves the overlay pill alone', () => {
    const main = src('main/index.ts')
    expect(main).toContain('...windowOptions(shownLook, process.platform),')
    expect(main).toContain('if (startsWithoutMaterial(shownLook, process.platform)) win.setVibrancy(null)')
    // Ink behind the page until it has drawn itself, and during a reload.
    expect(main).toMatch(/'did-finish-load', \(\) => \{\s*if \(!win\.isDestroyed\(\)\) win\.setBackgroundColor\(pageBackground\(shownLook, process\.platform\)\)/)
    expect(main).toMatch(/'did-start-loading', \(\) => \{\s*if \(!win\.isDestroyed\(\)\) win\.setBackgroundColor\(SOLID_BACKGROUND\)/)
    expect(main).toContain('reducedTransparency: nativeTheme.prefersReducedTransparency')
    // Live: the theme's event, and on a Mac the system's own notice too,
    // since the window did not follow the switch through the theme alone.
    expect(main).toMatch(/const followLook = \(heard: string\): void => \{\s*const look = currentLook\(\)/)
    expect(main).toContain("nativeTheme.on('updated', () => followLook('theme'))")
    expect(main).toContain("subscribeWorkspaceNotification('NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification'")
    const overlay = src('main/overlay/index.ts')
    expect(overlay).toContain('focusable: false')
    expect(overlay).not.toMatch(/vibrancy|backgroundMaterial|shared\/look/)
    expect(src('preload/settings.ts')).toContain("ipcRenderer.invoke('look:get')")
  })
})
