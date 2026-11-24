// SPDX-License-Identifier: GPL-3.0-only
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readCapped, readCappedFile } from './read-capped'

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

describe('readCappedFile (US-183)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'murmur-read-capped-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const file = (name: string, bytes: number): string => {
    const path = join(dir, name)
    writeFileSync(path, Buffer.alloc(bytes, 0x61))
    return path
  }

  it('reads a file up to the cap, byte for byte', async () => {
    expect((await readCappedFile(file('at', 100), 100))?.length).toBe(100)
    expect((await readCappedFile(file('empty', 0), 100))?.length).toBe(0)
    writeFileSync(join(dir, 'words'), 'shivon,Siobhán')
    expect((await readCappedFile(join(dir, 'words'), 100))?.toString('utf8')).toBe('shivon,Siobhán')
  })

  it('refuses a file 1 byte past the cap', async () => {
    expect(await readCappedFile(file('over', 101), 100)).toBeNull()
  })

  it('throws for a folder or a missing file, for the caller to report', async () => {
    await expect(readCappedFile(dir, 100)).rejects.toThrow()
    await expect(readCappedFile(join(dir, 'missing'), 100)).rejects.toThrow()
  })
})
