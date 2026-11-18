// SPDX-License-Identifier: GPL-3.0-only
// Every effect returns nothing or a cleanup function. An arrow written
// without braces returns whatever its call returns, and React keeps that
// as the cleanup: when the call answers with a Promise (scrollIntoView
// does since Chrome 152), React later calls it, throws, and unmounts the
// whole window. That blacked out Settings on 2026-11-10 (US-158), so an
// effect's arrow gets a block body, or returns a cleanup arrow directly.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname)

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

// useEffect(() => call(), ...) but not useEffect(() => { ... }) or
// useEffect(() => () => cleanup()).
const BARE = /use(?:Layout|Insertion)?Effect\(\s*\(\s*\)\s*(?::[^=]*)?=>(?!\s*\{|\s*\(\s*\)\s*(?::[^=]*)?=>)/g

/** Each effect in the source whose arrow returns a bare expression. */
export function bareEffects(source: string): number[] {
  return [...source.matchAll(BARE)].map((m) => source.slice(0, m.index).split('\n').length)
}

describe('effects', () => {
  it('finds an effect that returns a bare call, and passes the safe shapes', () => {
    expect(bareEffects('useEffect(() => el.scrollIntoView(), [a])')).toEqual([1])
    expect(bareEffects('\nuseLayoutEffect(() => go(), [])')).toEqual([2])
    expect(bareEffects('useEffect(() => {\n  el.scrollIntoView()\n}, [a])')).toEqual([])
    expect(bareEffects('useEffect(() => () => clearTimeout(t), [])')).toEqual([])
    expect(bareEffects('useEffect((): void => el.scrollIntoView(), [a])')).toEqual([1])
    expect(bareEffects('useEffect(( ) => go(), [])')).toEqual([1])
    expect(bareEffects('useEffect((): void => {\n  go()\n}, [])')).toEqual([])
    expect(bareEffects('useEffect(() => (): void => stop(), [])')).toEqual([])
  })

  it('no renderer effect returns a bare expression', () => {
    const found = sources(ROOT).flatMap((path) =>
      bareEffects(readFileSync(path, 'utf8')).map((line) => `${relative(ROOT, path)}:${line}`)
    )
    expect(found).toEqual([])
  })
})
