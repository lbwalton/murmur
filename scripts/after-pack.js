// SPDX-License-Identifier: GPL-3.0-only
// electron-builder afterPack hook (US-072, US-083). The Mac and Windows
// builds turn on the asar integrity and only-load-from-asar fuses, so
// code planted in the app folder cannot run as murmur with its Input
// Monitoring, Accessibility, and microphone grants: an edited app.asar
// fails its hash check, and app code is loaded from nowhere but that
// archive. (Checked 2026-10-01 on the Mac and 2026-10-02 on a PC: the
// shipped 0.1.8 ran an edited app.asar; this build refuses to start.)
//
// On Windows electron-builder embeds the asar hash as an INTEGRITY
// resource in murmur.exe before this hook runs. A universal Mac build
// packs each architecture first into a folder ending in -temp with fuses
// disabled; the fuses go on the merged app here, just before
// electron-builder flips the fuses in package.json and signs.
//
// It first checks that app.asar holds every module the app needs at run
// time (scripts/lib/packed-modules.js), so a build packed from an
// incomplete node_modules fails here instead of stopping at launch.
const { join } = require('node:path')
const { listPackage } = require('@electron/asar')
const { missingModules, runtimeModules } = require('./lib/packed-modules')

function checkPackedModules(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : join(context.appOutDir, 'resources')
  const missing = missingModules(runtimeModules(context.packager.projectDir), listPackage(join(resources, 'app.asar')))
  if (missing.length > 0) {
    throw new Error(`app.asar is missing ${missing.join(', ')}. Run npm ci in this folder, then build again.`)
  }
}

exports.default = async function afterPack(context) {
  if (!['darwin', 'win32'].includes(context.electronPlatformName)) return
  if (context.appOutDir.endsWith('-temp')) return
  checkPackedModules(context)
  const fuses = await context.packager.generateFuseConfig({
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true
  })
  await context.packager.addElectronFuses(context, fuses)
}
