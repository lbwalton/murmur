// SPDX-License-Identifier: GPL-3.0-only
// murmur's iPhone app icon (ios/prd.json IOS-001): the ensō pill from the
// same geometry and brush as every other icon (scripts/lib/icons.js),
// full bleed on ink because iOS rounds the corners itself, plus the dark
// and tinted versions iOS asks for. Nothing here is committed: npm run
// ios:generate writes it into ios/Generated.
const { encodePng, render } = require('./draw')
const { RasterContext } = require('./raster')
const { cleanEnsoScene, paintBrushedEnso } = require('./enso')
const { markOnInkRgba, RICE, AMBER, EMBER } = require('./icons')

/** The mark alone on transparency: iOS lays its own dark ground under it. */
function markRgba(brush, size) {
  if (!brush) return render(size, cleanEnsoScene(size, { loop: RICE, dot: AMBER }))
  const ctx = new RasterContext(size, size)
  paintBrushedEnso(brush, ctx, size, { loop: RICE, dot: AMBER, splat: EMBER })
  return ctx.toRgba()
}

/** One gray per pixel with alpha kept; iOS tints it with the person's color. */
function grayscale(rgba) {
  const out = Buffer.from(rgba)
  for (let i = 0; i < out.length; i += 4) {
    const y = Math.round(0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2])
    out[i] = y
    out[i + 1] = y
    out[i + 2] = y
  }
  return out
}

const image = (filename, appearance) => ({
  ...(appearance ? { appearances: [{ appearance: 'luminosity', value: appearance }] } : {}),
  filename,
  idiom: 'universal',
  platform: 'ios',
  size: '1024x1024'
})

/** Every file of AppIcon.appiconset, by name. size is 1024 except in tests. */
function iosIconSet(brush, size = 1024) {
  const mark = markRgba(brush, size)
  const contents = {
    images: [image('icon-1024.png'), image('icon-1024-dark.png', 'dark'), image('icon-1024-tinted.png', 'tinted')],
    info: { author: 'xcode', version: 1 }
  }
  return {
    'icon-1024.png': encodePng(size, size, markOnInkRgba(size, size, size, brush), { alpha: false }),
    'icon-1024-dark.png': encodePng(size, size, mark),
    'icon-1024-tinted.png': encodePng(size, size, grayscale(mark)),
    'Contents.json': JSON.stringify(contents, null, 2) + '\n'
  }
}

module.exports = { iosIconSet, grayscale }
