// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Rgba, contrast, parseColor, stack } from '../../../shared/contrast'
import { THEMES } from '../../../shared/themes'
import { SCENE_H, SCENE_W, THEME_SCENES, coverFit, sceneRandom, sceneSeed } from './index'

const tokensCss = readFileSync(join(__dirname, '..', '..', 'tokens.css'), 'utf8')

/** A theme's own block in tokens.css, as token name to literal value. */
function themeBlock(id: string): Record<string, string> {
  const from = tokensCss.indexOf(`:root[data-theme='${id}']`)
  const body = tokensCss.slice(from, tokensCss.indexOf('\n}\n', from))
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const rootValue = (name: string): string => {
  const root = tokensCss.slice(tokensCss.indexOf(':root {'), tokensCss.indexOf('\n}\n'))
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1].trim() ?? ''
}

/** A 2D context that records what it is asked to do and draws nothing. */
function fakeContext(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = []
  const gradient = { addColorStop: () => undefined }
  const recorder = new Proxy(
    { calls },
    {
      get(target: { calls: string[] }, prop: string) {
        if (prop === 'calls') return target.calls
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient
        return () => {
          calls.push(prop)
        }
      },
      set() {
        return true
      }
    }
  )
  return recorder as unknown as CanvasRenderingContext2D & { calls: string[] }
}

const painted = THEMES.filter((t) => t.scene)
const black: Rgba = { r: 0, g: 0, b: 0, a: 1 }
const brightness = (c: Rgba): number => contrast(c, black)

describe('theme paintings (US-151)', () => {
  it('has a painting for every painted theme, and every color it paints with is a token of that theme', () => {
    for (const theme of painted) {
      const painting = THEME_SCENES[theme.scene ?? '']
      expect(painting, theme.id).toBeDefined()
      const block = themeBlock(theme.id)
      for (const name of painting.colors) expect(block[name], `${theme.id} --${name}`).toBeDefined()
    }
  })

  it('names the strongest alpha of every color it paints with', () => {
    for (const [id, painting] of Object.entries(THEME_SCENES)) {
      expect(Object.keys(painting.peaks).sort(), id).toEqual([...painting.colors].sort())
      for (const [name, alpha] of Object.entries(painting.peaks)) {
        expect(alpha, `${id} ${name}`).toBeGreaterThan(0)
        expect(alpha, `${id} ${name}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never paints brighter than its --scene-bright, each color at its peak over its lightest sky', () => {
    for (const theme of painted) {
      const painting = THEME_SCENES[theme.scene ?? '']
      const block = themeBlock(theme.id)
      const bright = parseColor(block['scene-bright'])
      const skies = Object.keys(block).filter((n) => n.startsWith('scene-sky'))
      expect(skies.length, theme.id).toBeGreaterThan(0)
      const lightestSky = skies.map((n) => parseColor(block[n])).sort((a, b) => brightness(b) - brightness(a))[0]
      for (const [name, alpha] of Object.entries(painting.peaks)) {
        const color = { ...parseColor(block[name]), a: alpha }
        const seen = stack(lightestSky, color)
        expect(brightness(seen), `${theme.id} --${name} at ${alpha}`).toBeLessThanOrEqual(brightness(bright) + 1e-9)
      }
    }
  })

  it('keeps every painting color well away from signal amber and the error reds', () => {
    // At least as far as the ember paint sits from the error red (about 26).
    const MIN_DISTANCE = 24
    const signals = ['amber', 'red', 'red-glass'].map((n) => ({ n, c: parseColor(rootValue(n)) }))
    const distance = (a: Rgba, b: Rgba): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
    for (const theme of painted) {
      const block = themeBlock(theme.id)
      for (const name of Object.keys(block).filter((n) => n.startsWith('scene-'))) {
        if (!/^(#|rgba?\()/.test(block[name])) continue
        for (const s of signals) {
          expect(distance(parseColor(block[name]), s.c), `${theme.id} --${name} vs --${s.n}`).toBeGreaterThanOrEqual(MIN_DISTANCE)
        }
      }
    }
  })

  it('draws a still layer and a moving one', () => {
    for (const [id, painting] of Object.entries(THEME_SCENES)) {
      const state = painting.init(sceneRandom(id))
      const palette = Object.fromEntries(painting.colors.map((c) => [c, [10, 20, 30] as [number, number, number]]))
      const still = fakeContext()
      painting.drawStill(still, state, palette)
      expect(still.calls.length, id).toBeGreaterThan(20)
      const moving = fakeContext()
      painting.drawMoving(moving, state, palette, 0, 0)
      painting.drawMoving(moving, state, palette, 5000, 1 / 30)
      expect(moving.calls.length, id).toBeGreaterThan(0)
    }
  })

  it('uses no image files: every painting is drawn in code', () => {
    for (const file of readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const source = readFileSync(join(__dirname, file), 'utf8')
      expect(source, file).not.toMatch(/new Image\(|\.(png|jpe?g|gif|webp|svg)['"`]|url\(|fetch\(/)
    }
  })

  it('is seeded per theme, so a painting is the same every time', () => {
    expect(sceneSeed('moonlit')).toBe(sceneSeed('moonlit'))
    expect(sceneSeed('moonlit')).not.toBe(sceneSeed('mist'))
    const a = sceneRandom('moonlit')
    const b = sceneRandom('moonlit')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('covers any window with the 560 by 380 painting, centered', () => {
    const wide = coverFit(1200, 400)
    expect(SCENE_W * wide.scale).toBeGreaterThanOrEqual(1200)
    expect(SCENE_H * wide.scale).toBeGreaterThanOrEqual(400)
    const tall = coverFit(480, 900)
    expect(SCENE_W * tall.scale).toBeGreaterThanOrEqual(480)
    expect(SCENE_H * tall.scale).toBeCloseTo(900, 5)
    expect(tall.x).toBeLessThanOrEqual(0)
  })
})
