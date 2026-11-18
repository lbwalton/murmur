// SPDX-License-Identifier: GPL-3.0-only
// Reading a network answer without trusting its size (US-158).

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
