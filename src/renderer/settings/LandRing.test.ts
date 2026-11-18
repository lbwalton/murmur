// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAND_RING_MS, ringPoints } from './LandRing'

describe('the brush loop where Hide words lands', () => {
  it('is an open loop inside its box, the same every time', () => {
    const pts = ringPoints(140, 42)
    expect(ringPoints(140, 42)).toEqual(pts)
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(140)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(42)
    }
    // Open, like the mark: the end stops short of the start.
    const [x0, y0] = pts[0]
    const [x1, y1] = pts[pts.length - 1]
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeGreaterThan(8)
    // It goes around: points land in all 4 corners of the box.
    const corner = (left: boolean, top: boolean): boolean => pts.some(([x, y]) => x < 70 === left && y < 21 === top)
    expect(corner(true, true) && corner(false, true) && corner(true, false) && corner(false, false)).toBe(true)
  })

  it('lifts after the loop has been seen, and holds still for reduced motion', () => {
    const css = readFileSync(join(__dirname, 'styles.css'), 'utf8')
    expect(css).toMatch(/\.land-ring \{[^}]*pointer-events: none;[^}]*animation: land-ring-lift 0\.45s ease-in 1\.6s forwards;/)
    // The caller takes it away once the lift is over.
    expect(LAND_RING_MS).toBeGreaterThanOrEqual(1600 + 450)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.land-ring,\s*\.home-head-hide-landing > :not\(\.land-ring\) \{\s*animation: none;/)
  })
})
