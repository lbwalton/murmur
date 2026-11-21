// SPDX-License-Identifier: GPL-3.0-only
// A field never grows past its row (US-179, issue #50): a select sizes
// itself to its longest option, and a Windows mic name can be long
// enough to push the Microphone list past the card.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8')

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`)
  expect(at, `${selector} has a rule`).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at))
}

describe('a field stays inside its row (US-179)', () => {
  it('caps every field in a row control at the control width', () => {
    expect(rule('.row-control .field')).toMatch(/max-width:\s*100%/)
  })

  it('cuts a long picked name with an ellipsis', () => {
    expect(rule('select.field')).toMatch(/text-overflow:\s*ellipsis/)
  })

  it('keeps the row control capped beside the label', () => {
    expect(rule('.row-control')).toMatch(/max-width:\s*300px/)
    expect(rule('.sec .row-control')).toMatch(/max-width:\s*62%/)
  })
})
