// SPDX-License-Identifier: GPL-3.0-only
// Each iPhone target's privacy manifest declares every required reason API
// its code uses (ios/prd.json IOS-001 conventions; IOS-009 review): this
// fails before App Store Connect would.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { categoriesUsed, collectionProblems, declared } from './privacy-manifest'

const ios = join(__dirname, '..', '..', 'ios')

function swiftFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return swiftFiles(path)
    return entry.name.endsWith('.swift') ? [path] : []
  })
}

/** The categories used anywhere in these folders and files. */
function used(...paths) {
  const files = paths.flatMap((path) => (path.endsWith('.swift') ? [join(ios, path)] : swiftFiles(join(ios, path))))
  return [...new Set(files.flatMap((file) => categoriesUsed(readFileSync(file, 'utf8'))))].sort()
}

describe('the privacy manifests declare what the code uses', () => {
  it('finds required reason APIs in code, not in comments', () => {
    expect(categoriesUsed('let defaults = UserDefaults.standard')).toEqual(['NSPrivacyAccessedAPICategoryUserDefaults'])
    expect(categoriesUsed('let up = ProcessInfo.processInfo.systemUptime')).toEqual(['NSPrivacyAccessedAPICategorySystemBootTime'])
    expect(categoriesUsed('let keys: [URLResourceKey] = [.contentModificationDateKey]')).toEqual(['NSPrivacyAccessedAPICategoryFileTimestamp'])
    expect(categoriesUsed('// UserDefaults is for settings\nlet x = 1')).toEqual([])
  })

  it('reads the declared categories and reasons', () => {
    const manifest = '<key>NSPrivacyAccessedAPITypes</key><array><dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array></dict></array>'
    expect(declared(manifest)).toEqual({ NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'] })
    expect(declared('<key>NSPrivacyAccessedAPITypes</key><array/>')).toEqual({})
  })

  // The App Store privacy label says murmur collects nothing (IOS-026), so
  // no target's manifest may say otherwise.
  it('finds tracking, tracking domains, and collected data in a manifest', () => {
    // Windows checks text out with \r\n line ends, which the edits below
    // would not find.
    const clean = readFileSync(join(ios, 'App', 'PrivacyInfo.xcprivacy'), 'utf8').replace(/\r\n/g, '\n')
    expect(collectionProblems(clean)).toEqual([])
    const tracking = clean.replace('<key>NSPrivacyTracking</key>\n\t<false/>', '<key>NSPrivacyTracking</key>\n\t<true/>')
    expect(collectionProblems(tracking)).toEqual(['NSPrivacyTracking is true'])
    const domains = clean.replace('<key>NSPrivacyTrackingDomains</key>\n\t<array/>', '<key>NSPrivacyTrackingDomains</key>\n\t<array><string>ads.example.com</string></array>')
    expect(collectionProblems(domains)).toEqual(['NSPrivacyTrackingDomains lists ads.example.com'])
    const collected = clean.replace(
      '<key>NSPrivacyCollectedDataTypes</key>\n\t<array/>',
      '<key>NSPrivacyCollectedDataTypes</key>\n\t<array><dict><key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeAudioData</string></dict></array>'
    )
    expect(collectionProblems(collected)).toEqual(['NSPrivacyCollectedDataTypes lists NSPrivacyCollectedDataTypeAudioData'])
  })

  for (const target of ['App', 'Keyboard', 'Widgets']) {
    it(`the ${target} target collects nothing and tracks nothing`, () => {
      expect(collectionProblems(readFileSync(join(ios, target, 'PrivacyInfo.xcprivacy'), 'utf8'))).toEqual([])
    })
  }

  // Each target's sources, as ios/project.yml lists them.
  for (const [target, sources] of [
    ['App', ['App', 'Shared', 'Live', 'MurmurCore/Sources']],
    ['Keyboard', ['Keyboard', 'Shared', 'MurmurCore/Sources']],
    ['Widgets', ['Widgets', 'Live', 'Shared/Pill.swift', 'Shared/AppGroup.swift']]
  ]) {
    it(`declares every category the ${target} target uses, for its own defaults only`, () => {
      const manifest = declared(readFileSync(join(ios, target, 'PrivacyInfo.xcprivacy'), 'utf8'))
      expect(Object.keys(manifest).sort()).toEqual(used(...sources))
      // A target that uses defaults reads and writes only its own (CA92.1);
      // the app group holds files, never shared defaults.
      expect(manifest.NSPrivacyAccessedAPICategoryUserDefaults ?? ['CA92.1']).toEqual(['CA92.1'])
    })
  }
})
