// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { camel, colorSetJson, parseColor, parseRootTokens, toSwift } from './ios-tokens'

const SAMPLE = `/* SPDX-License-Identifier: GPL-3.0-only */
/* A comment: with colons, and a fake --token: #123456; inside. */
:root {
  /* ground: inside the block, with a fake --ghost: #123456; that must not count */
  --ink: #0f0e11;
  --short: #fff;
  --veil: #ffffff80;
  --panel-glass: rgba(23, 22, 27, 0.96);
  --plain: rgb(1, 2, 3);
  --font-body:
    'Inter',
    -apple-system,
    sans-serif;
  --cream-06: rgba(236, 233, 228, 0.06);
}

:root[data-theme='mist'] {
  --ink: #10131a;
}
`

describe('night studio for Swift', () => {
  it('reads every color form tokens.css can hold', () => {
    expect(parseColor('#0f0e11')).toEqual([15, 14, 17, 1])
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1])
    expect(parseColor('#ffffff80')).toEqual([255, 255, 255, 0.502])
    expect(parseColor('rgba(23, 22, 27, 0.96)')).toEqual([23, 22, 27, 0.96])
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1])
    expect(parseColor("'Inter', sans-serif")).toBeNull()
  })

  it('takes only the :root colors, in order, skipping fonts, comments, and themes', () => {
    expect(parseRootTokens(SAMPLE)).toEqual([
      { name: 'ink', rgba: [15, 14, 17, 1] },
      { name: 'short', rgba: [255, 255, 255, 1] },
      { name: 'veil', rgba: [255, 255, 255, 0.502] },
      { name: 'panel-glass', rgba: [23, 22, 27, 0.96] },
      { name: 'plain', rgba: [1, 2, 3, 1] },
      { name: 'cream-06', rgba: [236, 233, 228, 0.06] }
    ])
  })

  it('reads the real tokens.css', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'tokens.css'), 'utf8')
    const names = parseRootTokens(css).map((t) => t.name)
    for (const name of ['ink', 'panel', 'text', 'brand', 'amber', 'red', 'ok', 'founder-gold', 'smoke', 'rice', 'ember']) {
      expect(names).toContain(name)
    }
    expect(names).not.toContain('font-body')
    expect(names.filter((n) => n === 'ink')).toHaveLength(1)
  })

  it('names tokens the Swift way', () => {
    expect(camel('panel-lift')).toBe('panelLift')
    expect(camel('cream-06')).toBe('cream06')
    expect(camel('heat-invert-bg')).toBe('heatInvertBg')
  })

  it('writes a Swift enum with the license header and exact values', () => {
    const swift = toSwift(parseRootTokens(SAMPLE))
    expect(swift.startsWith('// SPDX-License-Identifier: GPL-3.0-only\n')).toBe(true)
    expect(swift).toContain('enum Tokens {')
    expect(swift).toContain('    static let ink = Color(.sRGB, red: 15.0 / 255, green: 14.0 / 255, blue: 17.0 / 255, opacity: 1.0)')
    expect(swift).toContain('    static let panelGlass = Color(.sRGB, red: 23.0 / 255, green: 22.0 / 255, blue: 27.0 / 255, opacity: 0.96)')
  })

  it('writes an asset catalog color set for the launch screen', () => {
    const set = JSON.parse(colorSetJson([15, 14, 17, 1]))
    expect(set.colors[0].color).toEqual({
      'color-space': 'srgb',
      components: { red: '0.059', green: '0.055', blue: '0.067', alpha: '1.000' }
    })
    expect(set.info).toEqual({ author: 'xcode', version: 1 })
  })
})
