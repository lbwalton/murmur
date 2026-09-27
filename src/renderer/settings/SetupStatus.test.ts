// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { type CheckState, type SetupCheck, setupStatus } from './SetupStatus'

const check = (id: string, state: CheckState): SetupCheck => ({
  id,
  readyLabel: id,
  state,
  title: id,
  desc: ''
})

describe('setupStatus', () => {
  it('folds away only when every check is ok', () => {
    expect(setupStatus([check('key', 'ok'), check('conn', 'ok'), check('hotkey', 'ok')])).toBe('ok')
  })

  it('opens the card when any check fails', () => {
    expect(setupStatus([check('key', 'bad'), check('conn', 'waiting'), check('hotkey', 'ok')])).toBe('bad')
    expect(setupStatus([check('key', 'ok'), check('conn', 'pending'), check('input', 'bad')])).toBe('bad')
  })

  it('reads a check still being determined as checking, never as failing', () => {
    // The first connection test after launch: the card must not flash.
    expect(setupStatus([check('key', 'ok'), check('conn', 'pending'), check('hotkey', 'ok')])).toBe('pending')
  })
})
