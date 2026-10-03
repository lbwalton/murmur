#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Local preview of site/dist with the same headers Cloudflare Pages
// sends (headers.js), on the port claimed for it in the port registry.
// Static files only, no dependencies; for checking, never for hosting.
const { createServer } = require('node:http')
const { createReadStream, existsSync, statSync } = require('node:fs')
const { extname, join, normalize, sep } = require('node:path')
const { HEADERS } = require('./headers')

const root = join(__dirname, 'dist')
const port = Number(process.env.PORT || 4870)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let path
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400).end('bad path')
    return
  }
  let file = normalize(join(root, path))
  if (!file.startsWith(root + sep) && file !== root) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404).end('not found')
    return
  }
  const size = statSync(file).size
  const headers = Object.fromEntries(HEADERS)
  headers['Content-Type'] = TYPES[extname(file)] || 'application/octet-stream'
  headers['Accept-Ranges'] = 'bytes'
  // Video needs ranges to seek.
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
  if (range && (range[1] || range[2])) {
    // bytes=-N asks for the last N bytes.
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end()
      return
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': size })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`site: previewing site/dist at http://localhost:${port}`))
