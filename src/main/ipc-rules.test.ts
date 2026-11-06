// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIO_SENDS, boundedText, channelAllowed, pageRole } from './ipc-rules'

const bases = { rendererRoot: 'file:///Applications/murmur.app/Contents/Resources/app.asar/out/renderer' }
const page = (name: string): string => `${bases.rendererRoot}/${name}/index.html`

describe('pageRole', () => {
  it('knows murmur\'s 3 pages', () => {
    expect(pageRole(page('settings'), bases)).toBe('settings')
    expect(pageRole(page('audio'), bases)).toBe('audio')
    expect(pageRole(page('overlay'), bases)).toBe('overlay')
  })

  it('accepts the query the audio page loads with', () => {
    expect(pageRole(`${page('audio')}?mic=1`, bases)).toBe('audio')
  })

  it('refuses everything else', () => {
    for (const url of [
      '',
      'not a url',
      'data:text/html,<p>probe</p>',
      'about:blank',
      'https://example.com/settings/index.html',
      'file:///tmp/settings/index.html',
      `${bases.rendererRoot}/settings/other.html`,
      `${bases.rendererRoot}-evil/settings/index.html`,
      `${bases.rendererRoot}/settings/../../../evil/index.html`
    ]) {
      expect(pageRole(url, bases), url).toBeNull()
    }
  })

  it('takes the dev server only in development', () => {
    const url = 'http://localhost:5173/settings/index.html'
    expect(pageRole(url, bases)).toBeNull()
    expect(pageRole(url, { ...bases, devServer: 'http://localhost:5173/' })).toBe('settings')
    expect(pageRole('http://localhost:9999/settings/index.html', { ...bases, devServer: 'http://localhost:5173' })).toBeNull()
  })

  it('reads a Windows path whatever the case of the drive letter', () => {
    const windows = { rendererRoot: 'file:///C:/Program%20Files/murmur/resources/app.asar/out/renderer' }
    expect(pageRole('file:///c:/Program%20Files/murmur/resources/app.asar/out/renderer/settings/index.html', windows)).toBe('settings')
  })
})

describe('channelAllowed', () => {
  it('keeps each window to its own channels', () => {
    expect(channelAllowed('settings', 'settings:get')).toBe(true)
    expect(channelAllowed('settings', 'audio:result')).toBe(false)
    expect(channelAllowed('audio', 'audio:result')).toBe(true)
    expect(channelAllowed('audio', 'apikey:set')).toBe(false)
    expect(channelAllowed('overlay', 'settings:get')).toBe(false)
  })
})

describe('the preloads', () => {
  const root = join(__dirname, '..')
  const sends = (file: string): string[] => [
    ...new Set(
      [...readFileSync(join(root, 'preload', file), 'utf8').matchAll(/ipcRenderer\.(?:invoke|send|sendSync)\('([^']+)'/g)].map(
        (match) => match[1]
      )
    )
  ]

  it('match the list of what the audio window may send', () => {
    expect(sends('audio.ts').sort()).toEqual([...AUDIO_SENDS].sort())
  })

  it('never send an audio channel from settings, and nothing from the overlay', () => {
    expect(sends('settings.ts').filter((channel) => AUDIO_SENDS.includes(channel))).toEqual([])
    expect(sends('overlay.ts')).toEqual([])
  })
})

describe('every handler', () => {
  const root = join(__dirname, '..')
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) return sources(full)
      return /\.ts$/.test(entry) && !/\.(?:test|probe)\.ts$/.test(entry) ? [full] : []
    })

  it('goes through the 1 wrapper', () => {
    const offenders = sources(join(root, 'main'))
      .filter((file) => relative(root, file) !== join('main', 'ipc.ts'))
      .filter((file) => /\bipcMain\.(?:handle|handleOnce|on|once|addListener)\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file))
    expect(offenders).toEqual([])
  })
})

describe('boundedText', () => {
  it('takes a string within the limit and nothing else', () => {
    expect(boundedText('abc', 3)).toBe('abc')
    expect(boundedText('abcd', 3)).toBeNull()
    expect(boundedText(3, 3)).toBeNull()
    expect(boundedText(undefined, 3)).toBeNull()
  })
})
