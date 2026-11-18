// SPDX-License-Identifier: GPL-3.0-only
// Colors the renderers read from CSS at run time (tokenColor, or
// getPropertyValue on a color token) go straight into canvas code, which
// parses only hex and rgb()/rgba(). Since US-151 some tokens are cut with
// relative color (rgb(from var(--ink) r g b / 0.5)); a renderer must never
// read one of those, in any theme or look (the US-151 review found
// --panel read for the painting a day, which falls back to night studio).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = __dirname

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

/** Every definition of every custom property across the stylesheets. */
function definitions(): Map<string, string[]> {
  const sheets = [join(RENDERER, 'tokens.css'), join(RENDERER, 'settings', 'styles.css'), join(RENDERER, 'overlay', 'styles.css')]
  const found = new Map<string, string[]>()
  for (const sheet of sheets) {
    const css = readFileSync(sheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*([^;{}]+);/g)) {
      found.set(name, [...(found.get(name) ?? []), value.trim()])
    }
  }
  return found
}

const NOT_COLORS = new Set(['font-body', 'font-mono', 'masthead-h'])

describe('colors renderers read at run time stay parseable (US-151 review)', () => {
  const read = new Set<string>()
  for (const file of sources(RENDERER)) {
    const text = readFileSync(file, 'utf8')
    for (const [, name] of text.matchAll(/(?:tokenColor|getPropertyValue)\(\s*'--([a-z0-9-]+)'/g)) {
      if (!NOT_COLORS.has(name)) read.add(name)
    }
  }
  const defs = definitions()

  it('finds the tokens the renderers read', () => {
    expect(read.size).toBeGreaterThan(8)
    expect(read.has('pane')).toBe(true)
    expect(read.has('panel')).toBe(false)
  })

  it.each([...read].sort())('--%s resolves to hex or rgb(a) in every theme and look', (name) => {
    const leaves = (token: string, depth = 0): string[] => {
      const values = defs.get(token)
      if (!values || depth > 8) return [`<undefined --${token}>`]
      return values.flatMap((value) => {
        const ref = /^var\(--([a-z0-9-]+)\)$/.exec(value)
        return ref ? leaves(ref[1], depth + 1) : [value]
      })
    }
    for (const value of leaves(name)) {
      expect(value, `--${name}`).toMatch(/^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/)
    }
  })
})
