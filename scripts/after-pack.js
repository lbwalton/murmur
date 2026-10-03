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
exports.default = async function afterPack(context) {
  if (!['darwin', 'win32'].includes(context.electronPlatformName)) return
  if (context.appOutDir.endsWith('-temp')) return
  const fuses = await context.packager.generateFuseConfig({
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true
  })
  await context.packager.addElectronFuses(context, fuses)
}
