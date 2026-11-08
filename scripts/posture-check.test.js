// SPDX-License-Identifier: GPL-3.0-only
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { unhashedInlineScripts } from './posture-check.mjs'

const hash = (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`

describe('unhashedInlineScripts', () => {
  it('finds an inline script whose end tag carries spaces or junk, as browsers accept', () => {
    for (const end of ['</script>', '</script >', '</SCRIPT\t\n bar>']) {
      expect(unhashedInlineScripts(`<p>a</p><script>run()${end}<p>b</p>`, "script-src 'self'"), end).toEqual([hash('run()')])
    }
  })

  it('passes a script the policy lists, and skips data blocks and src scripts', () => {
    const html = '<script>ok()</script><script type="application/ld+json">{}</script><script src="/a.js"></script>'
    expect(unhashedInlineScripts(html, `script-src 'self' ${hash('ok()')}`)).toEqual([])
  })
})
