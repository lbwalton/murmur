#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Puts the display face where the app's renderer serves it, for the share
// card (US-078): src/renderer/public/fonts, which git ignores and the
// build copies into out/renderer. Runs after install and before a build;
// a whole face already there is kept, a broken one is fetched again.
// Offline (MURMUR_OFFLINE=1), or on any failure, it says so and carries
// on: the share card then sets its rank in the system face. --require
// (release builds) fails instead, so a release never ships without it.
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { DISPLAY_FACE_FILE, fetchDisplayFace, isWholeWoff2 } = require('./lib/display-face')

const dir = join(__dirname, '..', 'src', 'renderer', 'public', 'fonts')
const target = join(dir, DISPLAY_FACE_FILE)
const license = join(dir, 'OFL.txt')
const required = process.argv.includes('--require')

/** A whole face and its license are already in place. */
function present() {
  try {
    return isWholeWoff2(readFileSync(target)) && /SIL OPEN FONT LICENSE/i.test(readFileSync(license, 'utf8'))
  } catch {
    return false
  }
}

/** Writes beside the target, then renames, so an interrupted write never
 *  leaves half a file that looks like a face. */
function writeWhole(file, data) {
  writeFileSync(`${file}.part`, data)
  renameSync(`${file}.part`, file)
}

async function main() {
  if (present()) return
  if (process.env.MURMUR_OFFLINE) {
    console.log('display face: skipped (offline); the share card uses the system face')
  } else {
    try {
      const face = await fetchDisplayFace()
      mkdirSync(dir, { recursive: true })
      writeWhole(license, face.license)
      writeWhole(target, face.font)
      console.log(`display face: fetched (${Math.round(face.font.length / 1024)} KB, SIL OFL 1.1)`)
    } catch (error) {
      console.warn(`display face: not fetched (${error.message}); the share card uses the system face`)
    }
  }
  if (required && !present()) {
    console.error('display face: a release build needs it (src/renderer/public/fonts); connect and run again')
    process.exitCode = 1
  }
}

main()
