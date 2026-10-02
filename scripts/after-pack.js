// SPDX-License-Identifier: GPL-3.0-only
// electron-builder afterPack hook (US-072). The Mac build also turns on
// the asar integrity and only-load-from-asar fuses, so code planted in
// the app bundle cannot run as signed murmur with its Input Monitoring,
// Accessibility, and microphone grants: an edited app.asar fails its
// hash check, and app code is loaded from nowhere but that archive.
// (Checked 2026-10-01: the shipped 0.1.8 ran an edited app.asar; this
// build stops at "ASAR Integrity Violation".)
//
// Mac only for now: US-067 left Windows out until it can be proven on a
// PC, because a Windows build that fails to launch cannot update itself
// out of the failure. A universal build packs each architecture first
// into a folder ending in -temp with fuses disabled; the fuses go on the
// merged app here, just before electron-builder flips the fuses in
// package.json and signs.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (context.appOutDir.endsWith('-temp')) return
  const fuses = await context.packager.generateFuseConfig({
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true
  })
  await context.packager.addElectronFuses(context, fuses)
}
