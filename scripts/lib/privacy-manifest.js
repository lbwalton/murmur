// SPDX-License-Identifier: GPL-3.0-only
// Apple's required reason APIs (Describing use of required reason API,
// checked 2026-10-12): each iPhone target's privacy manifest must declare
// every category its code uses, or App Store Connect rejects the upload.
const { withoutComments } = require('./keyboard-network')

/** Each category, and how its APIs look in Swift. */
const REQUIRED = {
  NSPrivacyAccessedAPICategoryUserDefaults: /\bUserDefaults\b/,
  NSPrivacyAccessedAPICategoryFileTimestamp: /\b(?:creationDate|contentModificationDate|modificationDate|contentAccessDate|attributeModificationDate|fileModificationDate)\w*\b|\bgetattrlist\b/,
  NSPrivacyAccessedAPICategorySystemBootTime: /\bsystemUptime\b|\bmach_absolute_time\b/,
  NSPrivacyAccessedAPICategoryDiskSpace: /\bvolume(?:Available|Total)Capacity\w*\b|\bsystem(?:Free)?Size\b|\bstatv?fs\b/,
  NSPrivacyAccessedAPICategoryActiveKeyboards: /\bactiveInputModes\b/
}

/** The categories a piece of Swift source uses. */
function categoriesUsed(source) {
  const code = withoutComments(source)
  return Object.keys(REQUIRED).filter((category) => REQUIRED[category].test(code))
}

/** Each category a privacy manifest declares, with its reasons. */
function declared(manifest) {
  const types = manifest.slice(manifest.indexOf('<key>NSPrivacyAccessedAPITypes</key>'))
  return Object.fromEntries(
    [...types.matchAll(/<string>(NSPrivacyAccessedAPICategory\w+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/<string>([^<]+)<\/string>/g)].map((r) => r[1])
    ])
  )
}

module.exports = { categoriesUsed, declared }
