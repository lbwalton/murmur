// SPDX-License-Identifier: GPL-3.0-only
// Stable download names (US-063). Every release also carries fixed-name
// copies of its Mac dmg and its combined Windows installer, so GitHub's
// releases/latest/download/<name> link always serves the newest build.
// The versioned files stay untouched: the updater manifests point at
// them. Pure: the CLI in scripts/stable-assets.js does the IO.

const STABLE = { mac: 'murmur-mac.dmg', windows: 'murmur-windows.exe' }

/** The versioned file a stable copy is made from, or null when the
 *  release has none. A universal dmg wins once a release carries one
 *  (US-065); Windows always copies the combined installer, which picks
 *  x64 or arm64 itself. */
function sourceFor(platform, version, names) {
  const candidates =
    platform === 'mac'
      ? [`murmur-${version}-universal.dmg`, `murmur-${version}-arm64.dmg`]
      : [`murmur-${version}.exe`]
  return candidates.find((name) => names.includes(name)) ?? null
}

/** Problems with a release's stable copies, empty when all is well.
 *  Byte identity is judged by GitHub's own sha256 digests, and a copy
 *  whose digest is unknown never passes. */
function checkRelease(version, assets) {
  const names = assets.map((a) => a.name)
  const digest = (name) => assets.find((a) => a.name === name)?.digest ?? null
  const problems = []
  for (const [platform, stable] of Object.entries(STABLE)) {
    const source = sourceFor(platform, version, names)
    if (!source) {
      problems.push(`no ${platform === 'mac' ? 'Mac dmg' : 'Windows installer'} for ${version} to copy`)
      continue
    }
    if (!names.includes(stable)) {
      problems.push(`${stable} is missing (should copy ${source})`)
      continue
    }
    const want = digest(source)
    const have = digest(stable)
    if (!want || !have || want !== have) problems.push(`${stable} differs from ${source}`)
  }
  return problems
}

module.exports = { STABLE, sourceFor, checkRelease }
