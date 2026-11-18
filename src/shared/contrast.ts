// SPDX-License-Identifier: GPL-3.0-only
// Contrast between 2 colors, the WCAG way, with see-through colors laid
// over what is behind them. The look's floor (US-150) is computed with
// this from the tokens, so a token edit that breaks 4.5 to 1 fails a test.

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Reads #rgb, #rrggbb, rgb(...) and rgba(...). Throws on anything else,
 *  so a token this cannot read is noticed. */
export function parseColor(value: string): Rgba {
  const v = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(v)
  if (fn) {
    const parts = fn[1].split(',').map((part) => Number(part.trim()))
    if ((parts.length === 3 || parts.length === 4) && parts.every((n) => Number.isFinite(n))) {
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
    }
  }
  throw new Error(`not a color this can read: ${value}`)
}

/** A color laid over a solid one: what the eye gets. */
export function over(top: Rgba, under: Rgba): Rgba {
  const mix = (t: number, u: number): number => t * top.a + u * (1 - top.a)
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 }
}

/** Several layers, bottom first, flattened onto a solid ground. */
export function stack(ground: Rgba, ...layers: Rgba[]): Rgba {
  return layers.reduce((under, top) => over(top, under), { ...ground, a: 1 })
}

function luminance(color: Rgba): number {
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/** The contrast ratio of text on a solid ground; see-through text is
 *  laid over the ground first. */
export function contrast(text: Rgba, ground: Rgba): number {
  const a = luminance(over(text, ground))
  const b = luminance(ground)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
