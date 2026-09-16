// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { sectionFor } from './changelog'

const SAMPLE = [
  '# changelog',
  '',
  'Intro prose that never renders in the app.',
  '',
  '## 0.1.6 (unreleased)',
  '',
  '- Smart lists',
  '- Mixed providers',
  '',
  '## 0.1.5 (2026-09-10)',
  '',
  '- The microphone survives sleep'
].join('\n')

describe('sectionFor', () => {
  it('returns the matching section body without neighbors or intro', () => {
    expect(sectionFor(SAMPLE, '0.1.6')).toBe('- Smart lists\n- Mixed providers')
    expect(sectionFor(SAMPLE, '0.1.5')).toBe('- The microphone survives sleep')
  })

  it('returns null for unknown versions and empty sections', () => {
    expect(sectionFor(SAMPLE, '0.2.0')).toBeNull()
    expect(sectionFor('## 0.1.6\n\n## 0.1.5\n- x', '0.1.6')).toBeNull()
  })

  it('never matches a prose line that merely mentions a version', () => {
    const tricky = 'Talking about ## 0.1.6 here\n## 0.1.6\n- real'
    expect(sectionFor(tricky, '0.1.6')).toBe('- real')
  })

  it('never lets a longer version shadow a shorter prefix of itself', () => {
    const md = '## 0.1.10 (unreleased)\n- ten\n## 0.1.1 (2026-01-01)\n- one'
    expect(sectionFor(md, '0.1.1')).toBe('- one')
    expect(sectionFor(md, '0.1.10')).toBe('- ten')
  })
})
