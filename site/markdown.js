// SPDX-License-Identifier: GPL-3.0-only
// The docs in docs/ as site pages: a small Markdown renderer for exactly
// what the docs use (headings, paragraphs, fenced code, lists, pipe
// tables, code spans, bold, italic, links), with no dependencies. Heading
// ids follow GitHub's rule, so a link to a doc's question works on
// GitHub and on the site alike. Everything is escaped; nothing in a doc
// can inject markup.

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** GitHub's heading anchor (github-slugger): the heading's words,
 *  lowercased, with everything but letters, marks, numbers, connector
 *  punctuation, spaces, and hyphens dropped, then each space a hyphen. */
function slugify(text) {
  return plainInline(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-')
}

/** A heading's words without Markdown: code ticks, emphasis, and link targets go. */
function plainInline(text) {
  return String(text)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1$2')
}

/**
 * Inline Markdown to HTML. Code spans are cut out first so nothing inside
 * them is read as a link or emphasis; every piece of text is escaped.
 * resolve(href) rewrites a link target (a doc to its page); it returns
 * { href, external }.
 */
function inline(text, resolve) {
  const parts = String(text).split(/(`[^`]*`)/)
  return parts
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) return `<code>${escapeHtml(part.slice(1, -1))}</code>`
      let html = ''
      let rest = part
      const link = /\[([^\]]+)\]\(([^)\s]+)\)/
      let m
      while ((m = link.exec(rest))) {
        html += emphasis(escapeHtml(rest.slice(0, m.index)))
        const target = resolve(m[2])
        const extra = target.external ? ' target="_blank" rel="noopener noreferrer"' : ''
        html += `<a href="${escapeHtml(target.href)}"${extra}>${emphasis(escapeHtml(m[1]))}</a>`
        rest = rest.slice(m.index + m[0].length)
      }
      return html + emphasis(escapeHtml(rest))
    })
    .join('')
}

function emphasis(html) {
  return html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

const isRule = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)
const listItem = (line) => /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line)

/**
 * Render a doc. Returns { title, html, sections } where title is the
 * first h1's text, html is the body without that h1, and sections lists
 * every h2 with its id, its question, and its answer as plain text (for
 * the page's FAQ structured data and the docs index).
 */
function renderDoc(markdown, resolve) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out = []
  const sections = []
  const used = new Map()
  let title = ''
  let current = null
  const text = (s) => {
    if (current) current.text.push(s)
  }
  const uniqueId = (base) => {
    const n = used.get(base) || 0
    used.set(base, n + 1)
    return n === 0 ? base : `${base}-${n}`
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    // Fenced code: kept verbatim and escaped.
    const fence = /^```(.*)$/.exec(line)
    if (fence) {
      const body = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++])
      i++
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`)
      text(body.join('\n'))
      continue
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const words = heading[2]
      if (level === 1 && !title) {
        title = plainInline(words)
        slugify(words) && used.set(slugify(words), 1)
        i++
        continue
      }
      const id = uniqueId(slugify(words))
      out.push(`<h${level} id="${escapeHtml(id)}">${inline(words, resolve)}</h${level}>`)
      if (level === 2) {
        current = { id, question: plainInline(words), text: [] }
        sections.push(current)
      } else {
        text(plainInline(words))
      }
      i++
      continue
    }
    // A pipe table: a header row, a rule, then rows.
    if (line.trim().startsWith('|') && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, resolve)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c, resolve)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      )
      text([head.join(', '), ...rows.map((r) => r.join(', '))].join('. '))
      continue
    }
    const item = listItem(line)
    if (item) {
      const ordered = /\d/.test(item[2])
      const start = ordered ? Number(item[2].slice(0, -1)) : 1
      const items = []
      while (i < lines.length) {
        const m = listItem(lines[i])
        if (!m || /\d/.test(m[2]) !== ordered) break
        let body = m[3]
        i++
        // Lazy continuation: an indented line that is not a new item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !listItem(lines[i])) body += ` ${lines[i++].trim()}`
        items.push(body)
      }
      const tag = ordered ? 'ol' : 'ul'
      const startAttr = ordered && start !== 1 ? ` start="${start}"` : ''
      out.push(`<${tag}${startAttr}>${items.map((b) => `<li>${inline(b, resolve)}</li>`).join('')}</${tag}>`)
      text(items.map(plainInline).join('. '))
      continue
    }
    // A paragraph runs until a blank line or the start of another block.
    const para = [line.trim()]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !listItem(lines[i]) &&
      !(lines[i].trim().startsWith('|') && i + 1 < lines.length && isRule(lines[i + 1]))
    ) {
      para.push(lines[i++].trim())
    }
    out.push(`<p>${inline(para.join(' '), resolve)}</p>`)
    text(plainInline(para.join(' ')))
  }
  return {
    title,
    html: out.join('\n'),
    sections: sections.map((s) => ({ id: s.id, question: s.question, answer: s.text.join(' ').replace(/\s+/g, ' ').trim() }))
  }
}

/** The first paragraph of a doc as plain text: its summary. */
function firstParagraph(markdown) {
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n\s*\n/)
  for (const block of blocks) {
    const t = block.trim()
    if (!t || t.startsWith('#') || t.startsWith('```') || t.startsWith('|') || listItem(t)) continue
    return plainInline(t.replace(/\s*\n\s*/g, ' '))
  }
  return ''
}

/** Cut text to at most max characters at a word, with an ellipsis. */
function clip(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`
}

module.exports = { renderDoc, firstParagraph, slugify, clip, escapeHtml }
