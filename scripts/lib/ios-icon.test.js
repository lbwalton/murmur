// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { encodePng } from './draw'
import { grayscale, iosIconSet } from './ios-icon'

// A PNG's color type sits at byte 25: the 8-byte signature, the IHDR
// chunk's length and type (8), then width, height, and bit depth (9).
const colorType = (png) => png[25]
const width = (png) => png.readUInt32BE(16)

describe('the iPhone app icon', () => {
  it('can write a PNG without an alpha channel', () => {
    const rgba = Buffer.from([10, 20, 30, 255, 40, 50, 60, 255])
    expect(colorType(encodePng(2, 1, rgba))).toBe(6)
    expect(colorType(encodePng(2, 1, rgba, { alpha: false }))).toBe(2)
  })

  it('makes the default icon opaque RGB, which App Store Connect requires', () => {
    const set = iosIconSet(null, 64)
    expect(colorType(set['icon-1024.png'])).toBe(2)
    expect(width(set['icon-1024.png'])).toBe(64)
  })

  it('keeps transparency for the dark and tinted versions iOS grounds itself', () => {
    const set = iosIconSet(null, 64)
    expect(colorType(set['icon-1024-dark.png'])).toBe(6)
    expect(colorType(set['icon-1024-tinted.png'])).toBe(6)
  })

  it('turns the tinted version gray and keeps its alpha', () => {
    const out = grayscale(Buffer.from([240, 164, 75, 200]))
    expect(out[0]).toBe(out[1])
    expect(out[1]).toBe(out[2])
    expect(out[3]).toBe(200)
  })

  it('lists all three in the icon set with the right appearances', () => {
    const contents = JSON.parse(iosIconSet(null, 64)['Contents.json'])
    expect(contents.images.map((i) => i.filename)).toEqual(['icon-1024.png', 'icon-1024-dark.png', 'icon-1024-tinted.png'])
    expect(contents.images.every((i) => i.idiom === 'universal' && i.platform === 'ios' && i.size === '1024x1024')).toBe(true)
    expect(contents.images[1].appearances).toEqual([{ appearance: 'luminosity', value: 'dark' }])
    expect(contents.images[2].appearances).toEqual([{ appearance: 'luminosity', value: 'tinted' }])
  })
})
