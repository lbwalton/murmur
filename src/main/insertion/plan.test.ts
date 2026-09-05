// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { pasteCommand, planRestore } from './plan'

describe('planRestore', () => {
  it('restores the original text after a clean insertion', () => {
    const plan = planRestore({ text: 'their stuff', hasNonText: false }, 'dictated', 'dictated')
    expect(plan).toEqual({ restore: true, value: 'their stuff' })
  })

  it('restores an empty original clipboard too', () => {
    const plan = planRestore({ text: '', hasNonText: false }, 'dictated', 'dictated')
    expect(plan).toEqual({ restore: true, value: '' })
  })

  it('never touches a clipboard that held non-text content', () => {
    const plan = planRestore({ text: '', hasNonText: true }, 'dictated', 'dictated')
    expect(plan.restore).toBe(false)
  })

  it('yields to something the user copied mid-insertion', () => {
    const plan = planRestore({ text: 'old', hasNonText: false }, 'user copied this', 'dictated')
    expect(plan.restore).toBe(false)
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
