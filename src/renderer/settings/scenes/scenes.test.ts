// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEMES } from '../../../shared/themes'
import { SCENE_H, SCENE_W, THEME_SCENES, coverFit, sceneRandom, sceneSeed } from './index'

const tokensCss = readFileSync(join(__dirname, '..', '..', 'tokens.css'), 'utf8')

/** A 2D context that records what it is asked to do and draws nothing. */
function fakeContext(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = []
  const gradient = { addColorStop: () => undefined }
  const recorder = new Proxy({ calls }, {
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
  })
  return recorder as unknown as CanvasRenderingContext2D & { calls: string[] }
}

describe('theme paintings (US-151)', () => {
  it('has a painting for every painted theme, and every color it paints with is a token of that theme', () => {
    for (const theme of THEMES.filter((t) => t.scene)) {
      const painting = THEME_SCENES[theme.scene ?? '']
      expect(painting, theme.id).toBeDefined()
      const from = tokensCss.indexOf(`:root[data-theme='${theme.id}']`)
      const block = tokensCss.slice(from, tokensCss.indexOf('\n}\n', from))
      for (const name of painting.colors) expect(block, `${theme.id} --${name}`).toContain(`--${name}:`)
    }
  })

  it('draws a still frame and a moving one without a single image', () => {
    for (const [id, painting] of Object.entries(THEME_SCENES)) {
      const state = painting.init(sceneRandom(id))
      const palette = Object.fromEntries(painting.colors.map((c) => [c, [10, 20, 30] as [number, number, number]]))
      const ctx = fakeContext()
      painting.draw(ctx, state, palette, 0, 0)
      painting.draw(ctx, state, palette, 5000, 1 / 60)
      expect(ctx.calls.length, id).toBeGreaterThan(20)
      expect(ctx.calls, id).not.toContain('drawImage')
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
