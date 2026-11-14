// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readCapped } from './read-capped'

const streamOf = (parts: string[]): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const p of parts) controller.enqueue(new TextEncoder().encode(p))
        controller.close()
      }
    })
  )

describe('readCapped', () => {
  it('reads a body within the cap, across chunks and multi-byte letters', async () => {
    expect(await readCapped(streamOf(['{"data":', '["café"]}']), 100)).toBe('{"data":["café"]}')
  })

  it('stops at the cap instead of holding the whole body', async () => {
    expect(await readCapped(streamOf(['x'.repeat(60), 'x'.repeat(60)]), 100)).toBeNull()
  })
})
