// SPDX-License-Identifier: GPL-3.0-only
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clip, firstParagraph, renderDoc, slugify } from './markdown'

const keep = (href) => ({ href, external: /^https?:/.test(href) })

describe('slugify', () => {
  it("matches GitHub's anchors for the docs' questions", () => {
    expect(slugify('What does "Windows protected your PC" mean when I install murmur?')).toBe(
      'what-does-windows-protected-your-pc-mean-when-i-install-murmur'
    )
    expect(slugify('How does murmur update itself?')).toBe('how-does-murmur-update-itself')
    expect(slugify('Can I use `whisper-large-v3`, or **Groq**?')).toBe('can-i-use-whisper-large-v3-or-groq')
  })
})

describe('renderDoc', () => {
  it('takes the h1 as the title and gives every heading an id', () => {
    const doc = renderDoc('# Title here\n\nIntro.\n\n## A question?\n\nThe answer.\n\n### Detail\n\nMore.\n', keep)
    expect(doc.title).toBe('Title here')
    expect(doc.html).not.toContain('<h1')
    expect(doc.html).toContain('<h2 id="a-question">A question?</h2>')
    expect(doc.html).toContain('<h3 id="detail">Detail</h3>')
    expect(doc.sections).toEqual([{ id: 'a-question', question: 'A question?', answer: 'The answer. Detail More.' }])
  })

  it('escapes everything and never reads Markdown inside code', () => {
    const doc = renderDoc('Avoid `< > : " | ? *` and <script>alert(1)</script>.\n\n```\n- [ ] a ([1](x.md))\n<b>\n```\n', keep)
    expect(doc.html).toContain('<code>&lt; &gt; : &quot; | ? *</code>')
    expect(doc.html).toContain('&lt;script&gt;')
    expect(doc.html).not.toContain('<script>')
    expect(doc.html).toContain('<pre><code>- [ ] a ([1](x.md))\n&lt;b&gt;</code></pre>')
  })

  it('renders lists, tables, bold, and resolved links', () => {
    const resolve = (href) => (href.endsWith('.md') ? { href: '/docs/x/', external: false } : keep(href))
    const md = '1. Click **More info**.\n2. See [the docs](./x.md) or [Groq](https://groq.com).\n\n| A | B |\n| --- | --- |\n| `1` | two |\n'
    const doc = renderDoc(md, resolve)
    expect(doc.html).toContain('<ol><li>Click <strong>More info</strong>.</li>')
    expect(doc.html).toContain('<a href="/docs/x/">the docs</a>')
    expect(doc.html).toContain('<a href="https://groq.com" target="_blank" rel="noopener noreferrer">Groq</a>')
    expect(doc.html).toContain('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><code>1</code></td><td>two</td></tr></tbody></table>')
  })

  it('renders every real doc without leaving Markdown behind', () => {
    const dir = join(__dirname, '..', 'docs')
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const doc = renderDoc(readFileSync(join(dir, name), 'utf8'), keep)
      expect(doc.title, name).not.toBe('')
      // Outside code, no raw Markdown syntax survives.
      const prose = doc.html.replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '')
      expect(prose, name).not.toMatch(/\*\*|\]\(|^#{1,4} |^\| /m)
    }
  })
})

describe('firstParagraph and clip', () => {
  it('finds the summary and cuts it at a word', () => {
    expect(firstParagraph('# T\n\nFirst **bold** line\ncontinues.\n\n## Q\n')).toBe('First bold line continues.')
    expect(clip('the quick brown fox jumps over', 20)).toBe('the quick brown…')
    expect(clip('short', 12)).toBe('short')
  })
})
