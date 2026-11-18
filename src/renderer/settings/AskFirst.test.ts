// SPDX-License-Identifier: GPL-3.0-only
// While the ask-first box is open, the rest of its section dims and the
// box and the path to it never do (US-157). No DOM in these tests, so a
// small stand-in tree carries the parts of Element that dimAround uses.
import { describe, expect, it } from 'vitest'
import { dimAround } from './AskFirst'

class Node {
  parentElement: Node | null = null
  children: Node[] = []
  attrs = new Map<string, string>()
  constructor(
    readonly name: string,
    readonly tag = 'div',
    readonly classes: string[] = []
  ) {}
  add(...kids: Node[]): this {
    for (const kid of kids) {
      kid.parentElement = this
      this.children.push(kid)
    }
    return this
  }
  closest(selector: string): Node | null {
    for (let n: Node | null = this; n; n = n.parentElement) if (n.tag === selector) return n
    return null
  }
  get classList(): { contains: (c: string) => boolean } {
    return { contains: (c) => this.classes.includes(c) }
  }
  hasAttribute(a: string): boolean {
    return this.attrs.has(a)
  }
  getAttribute(a: string): string | null {
    return this.attrs.get(a) ?? null
  }
  setAttribute(a: string, v: string): void {
    this.attrs.set(a, v)
  }
  removeAttribute(a: string): void {
    this.attrs.delete(a)
  }
}

describe('dimAround', () => {
  it('dims the rest of the section, never the box or its path, and undoes it', () => {
    const box = new Node('box', 'div', ['ask-first'])
    const cards = new Node('cards')
    const control = new Node('control').add(cards, box)
    const label = new Node('label')
    const row = new Node('row').add(label, control)
    const title = new Node('title', 'h2')
    const other = new Node('other row')
    const section = new Node('section', 'section').add(title, row, other)
    const outside = new Node('next section', 'section')
    new Node('page').add(section, outside)

    const undo = dimAround(box as unknown as HTMLElement)
    const dim = (n: Node): boolean => n.hasAttribute('data-ask-dim')
    expect([cards, label, title, other].every(dim)).toBe(true)
    expect([box, control, row, section, outside].some(dim)).toBe(false)
    undo()
    expect([cards, label, title, other].some(dim)).toBe(false)
  })

  it('never dims another open question, and keeps the rest dim until both boxes close', () => {
    const first = new Node('first', 'div', ['ask-first'])
    const second = new Node('second', 'div', ['ask-first'])
    const cards = new Node('cards')
    new Node('section', 'section').add(cards, first, second)
    const undoFirst = dimAround(first as unknown as HTMLElement)
    const undoSecond = dimAround(second as unknown as HTMLElement)
    expect(first.hasAttribute('data-ask-dim') || second.hasAttribute('data-ask-dim')).toBe(false)
    undoFirst()
    expect(cards.hasAttribute('data-ask-dim')).toBe(true)
    undoSecond()
    expect(cards.hasAttribute('data-ask-dim')).toBe(false)
  })
})
