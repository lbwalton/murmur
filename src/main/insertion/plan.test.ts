// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { pasteCommand, planRestore } from './plan'

describe('planRestore', () => {
  it('prefers wholesale item restore after a clean insertion', () => {
    expect(planRestore({ text: 'their stuff', itemCount: 1 }, 'dictated', 'dictated')).toBe('items')
  })

  it('restores rich content even when it had no text flavor (a screenshot)', () => {
    expect(planRestore({ text: '', itemCount: 1 }, 'dictated', 'dictated')).toBe('items')
  })

  it('falls back to text when item capture failed', () => {
    expect(planRestore({ text: 'their stuff', itemCount: 0 }, 'dictated', 'dictated')).toBe('text')
  })

  it('leaves a truly empty clipboard alone', () => {
    expect(planRestore({ text: '', itemCount: 0 }, 'dictated', 'dictated')).toBe('none')
  })

  it('yields to something the user copied mid-insertion', () => {
    expect(planRestore({ text: 'old', itemCount: 2 }, 'user copied this', 'dictated')).toBe('none')
  })
})

describe('pasteCommand', () => {
  it('uses osascript cmd+v on macOS', () => {
    const cmd = pasteCommand('darwin')
    expect(cmd?.file).toBe('osascript')
    expect(cmd?.args.join(' ')).toContain('keystroke "v" using command down')
  })

  it('uses powershell SendKeys on Windows', () => {
    const cmd = pasteCommand('win32')
    expect(cmd?.file).toBe('powershell.exe')
    expect(cmd?.args.join(' ')).toContain('SendKeys("^v")')
  })

  it('returns null on unsupported platforms', () => {
    expect(pasteCommand('linux')).toBeNull()
  })
})
