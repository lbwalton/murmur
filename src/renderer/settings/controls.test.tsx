// SPDX-License-Identifier: GPL-3.0-only
// Choices you can tell apart (US-149): the picked option of a Segmented
// carries a check that shows without color, every option keeps the check's
// space and its bold width so picking never shifts the row, and the gold
// edge on the pick is strong enough to see against the ink track.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Segmented } from './controls'

const options = [
  { value: 'same', label: 'Same as speech' },
  { value: 'separate', label: 'Separate' }
] as const

const render = (value: 'same' | 'separate'): string =>
  renderToStaticMarkup(<Segmented label="Cleanup runs on" value={value} options={options} onChange={() => undefined} />)

describe('Segmented', () => {
  it('marks only the picked option as checked, and gives every option a check and a label', () => {
    const html = render('separate')
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?Separate<\/span>/)
    expect(html.match(/class="seg-check"/g)).toHaveLength(2)
    expect(html).toContain('data-label="Same as speech"')
    expect(html).toContain('data-label="Separate"')
  })

  it('keeps the check out of what a screen reader hears', () => {
    expect(render('same')).toMatch(/<svg class="seg-check"[^>]*aria-hidden="true"/)
  })
})

// sRGB relative luminance, the WCAG way.
const luminance = ([r, g, b]: number[]): number => {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a: number[], b: number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const hex = (value: string): number[] => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))

describe('the picked option reads at a glance', () => {
  const tokens = readFileSync(join(__dirname, '../tokens.css'), 'utf8')
  const token = (name: string): string => {
    const found = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))
    if (!found) throw new Error(`no --${name} token`)
    return found[1].trim()
  }

  it('edges the pick in gold at 3:1 or better against the ink track', () => {
    const ink = hex(token('ink'))
    const edge = token('brand-edge-strong').match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
    if (!edge) throw new Error('brand-edge-strong is not an rgba color')
    const alpha = Number(edge[4])
    const shown = [1, 2, 3].map((i, n) => Number(edge[i]) * alpha + ink[n] * (1 - alpha))
    expect(contrast(shown, ink)).toBeGreaterThanOrEqual(3)
  })

  it('keeps picked and unpicked labels at 4.5:1 or better', () => {
    expect(contrast(hex(token('text')), hex(token('panel-lift')))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex(token('text-dim')), hex(token('ink')))).toBeGreaterThanOrEqual(4.5)
  })
})
