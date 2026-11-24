// SPDX-License-Identifier: GPL-3.0-only
// Reading a network answer, or a file someone picked, without trusting
// its size (US-158, US-183).

/** A response body as text, or null once it passes max bytes: read as a
 *  stream, so an endless body is cut off instead of held in memory. */
export async function readCapped(response: Response, max: number): Promise<string | null> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** A file's bytes, or null once it passes max bytes. Read through a
 *  handle with 1 byte to spare, so a file that grows after it is picked
 *  is still never held whole. */
export async function readCappedFile(path: string, max: number): Promise<Buffer | null> {
  const { open } = await import('node:fs/promises')
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(max + 1)
    let size = 0
    for (;;) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null)
      if (bytesRead === 0) break
      size += bytesRead
      if (size > max) return null
    }
    return buffer.subarray(0, size)
  } finally {
    await handle.close()
  }
}
