// SPDX-License-Identifier: GPL-3.0-only
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RasterContext, parseColor } from './raster'
import { cleanEnsoScene, ensoGeometry, polylineDistance } from './enso'
import { render } from './draw'

const alphaSum = (ctx) => {
  let a = 0
  for (let i = 3; i < ctx.data.length; i += 4) a += ctx.data[i]
  return a
}

describe('the software canvas', () => {
  it('fills a shape with its area of coverage', () => {
    const ctx = new RasterContext(40, 40)
    ctx.fillStyle = 'rgba(255, 0, 0, 1)'
    ctx.beginPath()
    ctx.moveTo(10, 10)
    ctx.lineTo(30, 10)
    ctx.lineTo(30, 20)
    ctx.lineTo(10, 20)
    ctx.closePath()
    ctx.fill()
    expect(alphaSum(ctx)).toBeCloseTo(200, 0)
    const circle = new RasterContext(40, 40)
    circle.fillStyle = '#ffffff'
    circle.beginPath()
    circle.arc(20, 20, 10, 0, Math.PI * 2)
    circle.fill()
    expect(Math.abs(alphaSum(circle) - Math.PI * 100)).toBeLessThan(4)
  })

  it('strokes one path as one mask, so overlaps never double up', () => {
    const ctx = new RasterContext(40, 40)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(5, 20)
    ctx.lineTo(35, 20)
    ctx.moveTo(20, 5)
    ctx.lineTo(20, 35)
    ctx.stroke()
    const center = (20 * 40 + 20) * 4 + 3
    expect(ctx.data[center]).toBeCloseTo(0.5, 2)
  })

  it('draws a line thinner than a pixel at its true weight, with flat ends', () => {
    const thin = new RasterContext(20, 20)
    thin.strokeStyle = '#ffffff'
    thin.lineWidth = 0.5
    thin.lineCap = 'butt'
    thin.beginPath()
    thin.moveTo(4, 10.5)
    thin.lineTo(16, 10.5)
    thin.stroke()
    // About half a pixel's worth of white across twelve pixels of length.
    expect(alphaSum(thin)).toBeGreaterThan(4)
    expect(alphaSum(thin)).toBeLessThan(8)
    // Nothing past a flat end.
    expect(thin.data[(10 * 20 + 2) * 4 + 3]).toBe(0)
  })

  it('sweeps arcs the way a canvas does', () => {
    const full = new RasterContext(40, 40)
    full.fillStyle = '#ffffff'
    full.beginPath()
    full.arc(20, 20, 10, 0, Math.PI * 4)
    full.fill()
    expect(Math.abs(alphaSum(full) - Math.PI * 100)).toBeLessThan(4)
  })

  it('reads the colors the brush engine writes', () => {
    expect(parseColor('rgba(255,128,0,0.5)')).toEqual([1, 128 / 255, 0, 0.5])
    expect(parseColor('#ff0000')).toEqual([1, 0, 0, 1])
  })
})

describe('the ensō pill', () => {
  it('is an open loop with the dot inside', () => {
    const g = ensoGeometry(100)
    const [first, last] = [g.pts[0], g.pts.at(-1)]
    // The ends do not meet: the loop is left open at the bottom.
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeGreaterThan(10)
    expect(g.dot.x).toBeGreaterThan(14)
    expect(polylineDistance(g.pts, g.dot.x, g.dot.y)).toBeGreaterThan(g.dot.r * 2)
  })

  it('draws the clean mark: loop, dot, and the gap left empty', () => {
    const S = 64
    const scene = cleanEnsoScene(S, { loop: [1, 1, 1], dot: [2, 2, 2] })
    const g = ensoGeometry(S)
    expect(scene(g.dot.x, g.dot.y)).toEqual([2, 2, 2, 1])
    expect(scene(g.pts[10][0], g.pts[10][1])).toEqual([1, 1, 1, 1])
    // Midway across the opening at the bottom there is no paint.
    const gap = [(g.pts[0][0] + g.pts.at(-1)[0]) / 2, (g.pts[0][1] + g.pts.at(-1)[1]) / 2]
    expect(scene(gap[0], gap[1])[3]).toBe(0)
    expect(render(16, cleanEnsoScene(16, { loop: [0, 0, 0], dot: [0, 0, 0] }, { line: 0.11 })).length).toBe(16 * 16 * 4)
  })

  it('paints the brushed app icon the same way every time', () => {
    const script = `
      const { createHash } = require('node:crypto')
      const { loadBrush } = require('./scripts/lib/enso')
      const { appIconRgba } = require('./scripts/lib/icons')
      loadBrush().then((brush) => {
        if (!brush) { console.log('no-brush'); return }
        console.log(createHash('sha256').update(appIconRgba(128, brush)).digest('hex'))
      })`
    const run = () => execFileSync(process.execPath, ['--no-warnings', '-e', script], { cwd: join(__dirname, '..', '..'), encoding: 'utf8' }).trim()
    const first = run()
    expect(first).toMatch(/^[0-9a-f]{64}$|^no-brush$/)
    expect(run()).toBe(first)
  })
})
