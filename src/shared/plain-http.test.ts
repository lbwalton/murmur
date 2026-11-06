// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { blockedPlainHttp, isPrivateHost, plainHttpHost } from './plain-http'

describe('plainHttpHost', () => {
  it('never asks about https', () => {
    expect(plainHttpHost('https://api.groq.com/openai/v1')).toBeNull()
    expect(plainHttpHost('https://192.168.1.20:8000/v1')).toBeNull()
  })

  it('never asks about this machine', () => {
    for (const url of ['http://localhost:8000/v1', 'http://127.0.0.1:1234', 'http://[::1]:8000/v1', 'http://whisper.localhost/v1']) {
      expect(plainHttpHost(url), url).toBeNull()
    }
  })

  it('asks about a home network and the open internet', () => {
    expect(plainHttpHost('http://192.168.1.20:8000/v1')).toBe('192.168.1.20')
    expect(plainHttpHost('http://10.0.0.5/v1')).toBe('10.0.0.5')
    expect(plainHttpHost('http://api.groq.com/openai/v1')).toBe('api.groq.com')
    expect(plainHttpHost('HTTP://Example.COM/v1')).toBe('example.com')
  })

  it('leaves a bad URL to the checks that already handle it', () => {
    for (const url of ['', 'not a url', 'api.groq.com/v1', 'ftp://example.com']) {
      expect(plainHttpHost(url), url).toBeNull()
    }
  })

  it('is not fooled by a name that only starts like localhost', () => {
    expect(plainHttpHost('http://localhost.example.com/v1')).toBe('localhost.example.com')
    expect(plainHttpHost('http://127.0.0.1.example.com/v1')).toBe('127.0.0.1.example.com')
  })
})

describe('isPrivateHost', () => {
  it('knows a home network from the open internet', () => {
    for (const host of ['192.168.1.20', '10.0.0.5', '172.16.0.9', '172.31.255.1', 'nas.local', 'server', 'fd12:3456::1']) {
      expect(isPrivateHost(host), host).toBe(true)
    }
    for (const host of ['8.8.8.8', '172.32.0.1', '11.0.0.1', 'api.groq.com', '192.169.1.1']) {
      expect(isPrivateHost(host), host).toBe(false)
    }
  })
})

describe('blockedPlainHttp', () => {
  it('holds a request until its host is confirmed', () => {
    const url = 'http://192.168.1.20:8000/v1/chat/completions'
    expect(blockedPlainHttp(url, [])).toBe('192.168.1.20')
    expect(blockedPlainHttp(url, ['192.168.1.20'])).toBeNull()
    expect(blockedPlainHttp(url, ['192.168.1.21'])).toBe('192.168.1.20')
  })

  it('never holds https or this machine', () => {
    expect(blockedPlainHttp('https://api.groq.com/v1', [])).toBeNull()
    expect(blockedPlainHttp('http://localhost:8000/v1', [])).toBeNull()
  })
})
