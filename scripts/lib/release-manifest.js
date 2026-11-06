// SPDX-License-Identifier: GPL-3.0-only
// What a release publishes so a download can be checked (US-142): sha256
// sums for every installer, and a parts list of what ships. Pure: the
// CLI in scripts/release-manifest.js does the IO.
const { STABLE, sourceFor } = require('./stable-assets')

// These are devDependencies only because the build bundles them into the
// app, so a production-only list would leave out most of what ships.
const BUNDLED = ['electron', 'react', 'react-dom', 'scheduler']

/** The files people download from a release. */
function installerNames(names) {
  return names.filter((name) => /\.(?:dmg|zip|exe)$/.test(name)).sort()
}

/** One line per file, the format shasum -c and sha256sum -c read. The
 *  stable names are copies, so they get their source's sum. */
function sumsFile(version, hashes) {
  const names = Object.keys(hashes)
  const lines = installerNames(names).map((name) => `${hashes[name]}  ${name}`)
  for (const [platform, stable] of Object.entries(STABLE)) {
    const source = sourceFor(platform, version, names)
    if (source) lines.push(`${hashes[source]}  ${stable}`)
  }
  return `${lines.join('\n')}\n`
}

/** A CycloneDX list cut down to the packages that ship: production
 *  dependencies and what the build bundles, each with what it needs. */
function shippedSbom(fullSbom, productionNames) {
  const refOf = new Map(fullSbom.components.map((c) => [c['bom-ref'], c]))
  const needs = new Map((fullSbom.dependencies ?? []).map((d) => [d.ref, d.dependsOn ?? []]))
  const keep = new Set()
  const walk = (ref) => {
    if (keep.has(ref) || !refOf.has(ref)) return
    keep.add(ref)
    for (const next of needs.get(ref) ?? []) walk(next)
  }
  const roots = new Set([...productionNames, ...BUNDLED])
  for (const component of fullSbom.components) {
    if (roots.has(component.name) && component.scope !== 'excluded') walk(component['bom-ref'])
  }
  return {
    ...fullSbom,
    components: fullSbom.components.filter((c) => keep.has(c['bom-ref'])),
    dependencies: (fullSbom.dependencies ?? []).filter((d) => keep.has(d.ref))
  }
}

module.exports = { BUNDLED, installerNames, shippedSbom, sumsFile }
