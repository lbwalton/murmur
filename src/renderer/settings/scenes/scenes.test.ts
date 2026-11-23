// SPDX-License-Identifier: GPL-3.0-only
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Rgba, contrast, parseColor, stack } from '../../../shared/contrast'
import { WEAR_STEPS } from '../../../shared/paperWear'
import { THEMES } from '../../../shared/themes'
import { SCENE_H, SCENE_W, THEME_SCENES, coverFit, sceneRandom, sceneSeed } from './index'
import { riceLightest } from './rice'

const tokensCss = readFileSync(join(__dirname, '..', '..', 'tokens.css'), 'utf8')

/** A theme's own block in tokens.css, as token name to literal value,
 *  with a paper theme's wear step laid over it (US-186). */
function themeBlock(id: string, wear = 0): Record<string, string> {
  const read = (start: string): Record<string, string> => {
    const from = tokensCss.indexOf(start)
    if (from < 0) throw new Error(`no ${start} in tokens.css`)
    const body = tokensCss.slice(from, tokensCss.indexOf('\n}\n', from))
    return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  }
  const base = read(`:root[data-theme='${id}']`)
  return wear > 0 ? { ...base, ...read(`:root[data-theme='${id}']:where([data-wear='${wear}'])`) } : base
}

/** The wear steps tokens.css gives a theme, in order. */
const wearBlocks = (id: string): number[] =>
  [...tokensCss.matchAll(new RegExp(`:root\\[data-theme='${id}'\\]:where\\(\\[data-wear='(\\d+)'\\]\\)`, 'g'))].map((m) => Number(m[1]))

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

  /** What a painting can show at its extreme: each color at its peak,
   *  and each declared stack, laid over its lightest ground (its darkest,
   *  for a light painting). The grounds are its skies and any opaque
   *  fills it names (a sea under its foam). */
  function extremes(themeId: string, light: boolean, wear = 0): Array<[string, Rgba]> {
    const theme = THEMES.find((t) => t.id === themeId)
    const painting = THEME_SCENES[theme?.scene ?? '']
    const block = themeBlock(themeId, wear)
    const at0 = wear / WEAR_STEPS
    const peaks = painting.worn && wear ? painting.worn.peaks(at0) : painting.peaks
    const stacks = painting.worn && wear ? painting.worn.stacks(at0) : painting.stacks
    const skies = Object.keys(block).filter((n) => n.startsWith('scene-sky'))
    expect(skies.length, themeId).toBeGreaterThan(0)
    const names = [...skies, ...(painting.grounds ?? [])]
    for (const name of painting.grounds ?? []) expect(peaks[name], `${themeId} ground --${name} is opaque`).toBe(1)
    const grounds = names.map((n) => parseColor(block[n])).sort((a, b) => brightness(a) - brightness(b))
    const ground = light ? grounds[0] : grounds[grounds.length - 1]
    const at = (name: string, alpha: number): Rgba => ({ ...parseColor(block[name]), a: alpha })
    return [
      ...Object.entries(peaks).map(([name, alpha]): [string, Rgba] => [`--${name} at ${alpha}`, stack(ground, at(name, alpha))]),
      ...(stacks ?? []).map((layers): [string, Rgba] => [
        layers.map(([name, alpha]) => `--${name} at ${alpha}`).join(' under '),
        stack(ground, ...layers.map(([name, alpha]) => at(name, alpha)))
      ])
    ]
  }

  it('never paints brighter than its --scene-bright: each color at its peak, and each stack, over its lightest ground', () => {
    for (const theme of painted.filter((t) => themeBlock(t.id)['scene-bright'])) {
      const bright = parseColor(themeBlock(theme.id)['scene-bright'])
      for (const [what, seen] of extremes(theme.id, false)) {
        expect(brightness(seen), `${theme.id} ${what}`).toBeLessThanOrEqual(brightness(bright) + 1e-9)
      }
    }
  })

  it('never paints a light painting darker than its --scene-dark: each color at its peak, and each stack, over its darkest paper, at every wear step', () => {
    const light = painted.filter((t) => themeBlock(t.id)['scene-dark'])
    expect(light.map((t) => t.id)).toEqual(['rice'])
    for (const theme of light) {
      for (const wear of [0, ...wearBlocks(theme.id)]) {
        const dark = parseColor(themeBlock(theme.id, wear)['scene-dark'])
        for (const [what, seen] of extremes(theme.id, true, wear)) {
          expect(brightness(seen), `${theme.id} step ${wear} ${what}`).toBeGreaterThanOrEqual(brightness(dark) - 1e-9)
        }
      }
    }
  })

  it('wears only a painting that says it wears (rice paper, US-186), in every step, on the window alone', () => {
    for (const theme of painted) {
      const painting = THEME_SCENES[theme.scene ?? '']
      expect(wearBlocks(theme.id), theme.id).toEqual(painting.worn ? Array.from({ length: WEAR_STEPS }, (_, i) => i + 1) : [])
    }
    expect(painted.filter((t) => THEME_SCENES[t.scene ?? ''].worn).map((t) => t.id)).toEqual(['rice'])
    // themes.json says so too, for main, which puts the step in the address.
    for (const theme of painted) expect(theme.wears === true, theme.id).toBe(Boolean(THEME_SCENES[theme.scene ?? ''].worn))
    // Each step sits in :where(), no stronger than the theme's own block,
    // so the look's glass card (html[data-look][data-look]) still makes
    // --panel the see-through pane, and the grain shows through the cards.
    expect(tokensCss.match(/data-wear/g)?.length).toBe(WEAR_STEPS)
    expect(tokensCss.match(/:root\[data-theme='rice'\]:where\(\[data-wear='\d'\]\) \{/g)?.length).toBe(WEAR_STEPS)
    // A tile shows a theme fresh: no wear block names a tile.
    expect(tokensCss).not.toMatch(/data-wear[^{]*data-theme-preview|data-theme-preview[^{]*data-wear/)
    // Fresh is the painting's own peaks and stacks.
    expect(THEME_SCENES.rice.worn?.peaks(0)).toEqual(THEME_SCENES.rice.peaks)
    expect(THEME_SCENES.rice.worn?.stacks(0)).toEqual(THEME_SCENES.rice.stacks)
  })

  it('keeps a card lighter than the lightest paper behind it at every wear step, and the gap only grows through the day (US-186)', () => {
    // The lightest paper is the lit middle, with the fold lips crossing
    // over it once it folds, under the paper sheet; a card is the pane, at
    // its glass and its solid strength, laid over it.
    let gap = 0
    for (const wear of [0, ...wearBlocks('rice')]) {
      const block = themeBlock('rice', wear)
      const centre = stack(
        parseColor(block['scene-sky-top']),
        ...riceLightest(wear / WEAR_STEPS).map(([name, alpha]) => ({ ...parseColor(block[name]), a: alpha })),
        parseColor(block['scene-sheet'])
      )
      for (const alpha of [Number(block['glass-card-a']), 0.85]) {
        const card = stack(centre, { ...parseColor(block.pane), a: alpha })
        expect(brightness(card), `step ${wear} at ${alpha}`).toBeGreaterThan(brightness(centre))
      }
      const now = contrast(stack(centre, { ...parseColor(block.pane), a: Number(block['glass-card-a']) }), centre)
      expect(now, `step ${wear}`).toBeGreaterThanOrEqual(gap)
      gap = now
    }
    // By the day's end the gap is clearly wider than on fresh paper.
    expect(gap).toBeGreaterThan(1.025)
  })

  /** Everything a painting asks its canvas to do, with the numbers. */
  function drawLog(id: string, wear?: number): string[] {
    const log: string[] = []
    // A gradient set as a fill reads g.
    const say = (v: unknown): string => (typeof v === 'number' ? v.toFixed(3) : typeof v === 'string' ? v : 'g')
    const gradient = { addColorStop: (o: number, c: string) => log.push(`stop ${say(o)} ${c}`) }
    const ctx = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return (...a: number[]) => {
              log.push(`${prop} ${a.map(say).join(' ')}`)
              return gradient
            }
          }
          return (...a: unknown[]) => {
            log.push(`${prop} ${a.map(say).join(' ')}`)
          }
        },
        set(_t, prop: string, v) {
          log.push(`${prop}=${say(v)}`)
          return true
        }
      }
    ) as CanvasRenderingContext2D
    const painting = THEME_SCENES[id]
    const palette = Object.fromEntries(painting.colors.map((c, i) => [c, [10 + i, 20 + i, 30 + i] as [number, number, number]]))
    painting.drawStill(ctx, painting.init(sceneRandom(id)), palette, wear)
    return log
  }

  it('draws fresh rice paper exactly as LB passed it (US-174), and each wear step adds to it (US-186)', () => {
    const fresh = drawLog('rice')
    // The fingerprint of the painting passed live on 2026-11-22.
    expect(fresh.length).toBe(558)
    expect(createHash('sha256').update(fresh.join('\n')).digest('hex')).toBe('68810f34e2d6dfbbf3645b2f9e0a1452b8553421c42fa752d8e850bdf69083ae')
    expect(drawLog('rice', 0)).toEqual(fresh)
    let before = fresh.length
    for (let step = 1; step <= WEAR_STEPS; step++) {
      const worn = drawLog('rice', step / WEAR_STEPS)
      expect(worn.length, `step ${step}`).toBeGreaterThan(before)
      before = worn.length
    }
  })

  it('names stacks and grounds only from its own colors', () => {
    for (const [id, painting] of Object.entries(THEME_SCENES)) {
      for (const name of painting.grounds ?? []) expect(painting.colors, `${id} ground`).toContain(name)
      for (const layers of painting.stacks ?? []) for (const [name] of layers) expect(painting.colors, `${id} stack`).toContain(name)
    }
  })

  it('keeps every painting color well away from signal amber and the error reds', () => {
    // At least as far as the ember paint sits from the error red (about 26).
    const MIN_DISTANCE = 24
    const rootSignals = ['amber', 'red', 'red-glass'].map((n) => ({ n, c: parseColor(rootValue(n)) }))
    const distance = (a: Rgba, b: Rgba): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)
    for (const [theme, wear] of painted.flatMap((t) => [0, ...wearBlocks(t.id)].map((w) => [t, w] as const))) {
      const block = themeBlock(theme.id, wear)
      // A theme that brings its own amber or error red (rice paper's are
      // darker, to read on paper) is held to those too.
      const own = ['amber', 'red-glass'].filter((n) => block[n]).map((n) => ({ n: `${n} (its own)`, c: parseColor(block[n]) }))
      const signals = [...rootSignals, ...own]
      // Every color the painting paints with; the sheet and the extremes
      // (--scene-bright, --scene-dark) measure it and are never painted.
      const measures = ['scene-sheet', 'scene-bright', 'scene-dark']
      for (const name of Object.keys(block).filter((n) => n.startsWith('scene-') && !measures.includes(n))) {
        if (!/^(#|rgba?\()/.test(block[name])) continue
        for (const s of signals) {
          expect(distance(parseColor(block[name]), s.c), `${theme.id} --${name} vs --${s.n}`).toBeGreaterThanOrEqual(MIN_DISTANCE)
        }
      }
    }
  })

  it('draws a still layer and a moving one, and a still painting draws nothing that moves', () => {
    for (const [id, painting] of Object.entries(THEME_SCENES)) {
      const theme = painted.find((t) => t.scene === id)
      expect(theme, id).toBeDefined()
      const state = painting.init(sceneRandom(id))
      const palette = Object.fromEntries(painting.colors.map((c) => [c, [10, 20, 30] as [number, number, number]]))
      const still = fakeContext()
      painting.drawStill(still, state, palette)
      expect(still.calls.length, id).toBeGreaterThan(20)
      const moving = fakeContext()
      painting.drawMoving(moving, state, palette, 0, 0)
      painting.drawMoving(moving, state, palette, 5000, 1 / 30)
      if (theme?.motion) expect(moving.calls.length, id).toBeGreaterThan(0)
      else expect(moving.calls, id).toEqual([])
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
